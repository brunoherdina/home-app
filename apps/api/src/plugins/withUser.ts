import fp from 'fastify-plugin'
import type { FastifyRequest } from 'fastify'
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { pool } from '../db/pool.js'
import * as schema from '../db/schema.js'
import { ErroHttp } from '../erros.js'

export type CasaDb = NodePgDatabase<typeof schema>

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Identidade autenticada. Preenchida pelo hook de auth do Épico 1 (ADR-0003)
     * a partir do `sub` do JWT. Nula enquanto não houver auth.
     */
    usuarioId: string | null
    /**
     * Único caminho de acesso ao banco a partir de um handler.
     *
     * Abre transação, assume o role `casa_app` e injeta a identidade antes de
     * qualquer query. Handler que pega o pool cru fura a RLS sem quebrar teste
     * nenhum — é a guarda de camada mais importante do projeto (ADR-0002).
     */
    withUser<T>(fn: (db: CasaDb) => Promise<T>): Promise<T>
  }
}

export class SemIdentidadeError extends ErroHttp {
  constructor() {
    super(401, 'SEM_IDENTIDADE', 'Request sem identidade autenticada — withUser exige usuarioId.')
  }
}

export const withUserPlugin = fp(
  async (app) => {
    app.decorateRequest('usuarioId', null)

    app.decorateRequest(
      'withUser',
      async function <T>(this: FastifyRequest, fn: (db: CasaDb) => Promise<T>): Promise<T> {
        const usuarioId = this.usuarioId

        // Sem identidade a policy não nega: ela devolve zero linha para tudo, o
        // que numa rota de escrita vira um erro obscuro. Falhar aqui é mais claro.
        if (!usuarioId) throw new SemIdentidadeError()

        const client = await pool.connect()
        try {
          await client.query('BEGIN')

          // O pool já conecta como casa_app. O SET LOCAL ROLE é redundante hoje e
          // deliberado: se algum dia a credencial do pool mudar, a transação
          // continua rodando com o role sem BYPASSRLS.
          await client.query('SET LOCAL ROLE casa_app')

          // set_config e não `SET LOCAL app.current_user_id = $1`: SET não aceita
          // bind parameter. Com o terceiro argumento `true`, o efeito é local à
          // transação — a identidade não vaza para a próxima request do pool.
          await client.query("select set_config('app.current_user_id', $1, true)", [usuarioId])

          const db = drizzle(client, { schema })
          const resultado = await fn(db)

          await client.query('COMMIT')
          return resultado
        } catch (erro) {
          await client.query('ROLLBACK').catch(() => {
            // conexão já morta: o release abaixo a descarta
          })
          throw erro
        } finally {
          client.release()
        }
      },
    )
  },
  { name: 'withUser' },
)
