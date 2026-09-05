import fp from 'fastify-plugin'
import type { FastifyRequest } from 'fastify'
import { drizzle } from 'drizzle-orm/node-postgres'
import { poolAuth } from '../db/pool.js'
import * as schema from '../db/schema.js'
import type { CasaDb } from './withUser.js'

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Acesso ao banco a partir de um handler que ainda NÃO tem identidade —
     * `register`, `login` e `refresh` (ADR-0013).
     *
     * Existe porque a alternativa real, no primeiro dia do Épico 1, é o handler
     * pegar o pool cru: `withUser` exige `usuarioId`, e essas três rotas
     * acontecem antes de existir um. Pool cru é exatamente o furo que o
     * ADR-0002 existe para impedir — então a exceção ganha um caminho nomeado,
     * com role próprio e `GRANT` mínimo, em vez de virar exceção de fato.
     *
     * O que este caminho alcança é decidido pelo `GRANT`, não por policy: as
     * policies do `casa_auth` são `USING (true)` porque no login não existe
     * `casa_id` ainda para escopar. O raio dele são três tabelas — e o
     * `check-roles.sh` reprova qualquer migration que o alargue.
     */
    semIdentidade<T>(fn: (db: CasaDb) => Promise<T>): Promise<T>
  }
}

export const semIdentidadePlugin = fp(
  async (app) => {
    app.decorateRequest(
      'semIdentidade',
      async function <T>(this: FastifyRequest, fn: (db: CasaDb) => Promise<T>): Promise<T> {
        const client = await poolAuth.connect()
        try {
          await client.query('BEGIN')

          // Mesmo motivo do withUser: o pool já conecta como casa_auth, e o SET
          // LOCAL ROLE garante que continue assim se a credencial do pool mudar.
          await client.query('SET LOCAL ROLE casa_auth')

          // Nenhum set_config de identidade aqui — não há identidade. Se um dia
          // aparecer um `app.current_user_id` neste caminho, é sinal de que uma
          // rota autenticada entrou pela porta errada.

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
  { name: 'semIdentidade' },
)
