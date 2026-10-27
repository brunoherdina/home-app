import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { config } from '../config.js'
import * as schema from './schema.js'

/**
 * Pool único do processo. Ninguém fora deste módulo o importa: rota que abre
 * conexão própria fura o `SET LOCAL` do ADR-0002 sem quebrar nenhum teste.
 * A guarda `scripts/guards/` reprova import de `db/pool` em `routes/`.
 */
export const pool = new pg.Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

/**
 * Pool das rotas SEM identidade — register/login/refresh (ADR-0013).
 *
 * Credencial e conexões próprias, não um `SET ROLE` sobre o pool de cima: se
 * `casa_app` pudesse virar `casa_auth` sozinho, qualquer handler escalaria e o
 * limite viraria convenção. Menor que o outro de propósito — três rotas, e o
 * argon2 do login já é o gargalo antes da conexão.
 */
export const poolAuth = new pg.Pool({
  connectionString: config.AUTH_DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
})

export const db = drizzle(pool, { schema })

/**
 * Contrato do ADR-0002 checado no boot, não só por script de infra.
 *
 * Um pool conectado como superusuário ou com BYPASSRLS passa em toda a suíte de
 * endpoints e deixa a RLS decorativa. A única hora barata de descobrir isso é
 * antes de a API aceitar a primeira request — por isso este erro é fatal.
 *
 * Roda para os DOIS pools (ADR-0013). O `rolEsperado` é o que impede o acidente
 * silencioso do ADR-0013: um `.env` com a mesma URL nas duas variáveis passaria
 * em todas as asserções de privilégio — as duas conexões seriam `casa_app`,
 * legítimas — e o segundo role viraria decoração sem nenhum teste reclamar.
 */
export async function afirmaContratoDeRls(alvo: pg.Pool, rolEsperado: string): Promise<void> {
  const { rows } = await alvo.query<{
    role: string
    superusuario: boolean
    bypassrls: boolean
    tabelas_proprias: number
  }>(`
    select current_user                                   as role,
           r.rolsuper                                     as superusuario,
           r.rolbypassrls                                 as bypassrls,
           (select count(*)::int
              from pg_tables
             where schemaname = 'public'
               and tableowner = current_user)             as tabelas_proprias
      from pg_roles r
     where r.rolname = current_user
  `)

  const estado = rows[0]
  if (!estado) throw new Error('Não foi possível ler o role da conexão')

  const violacoes: string[] = []
  if (estado.role !== rolEsperado) violacoes.push(`conectou como "${estado.role}"`)
  if (estado.superusuario) violacoes.push('a conexão é superusuário')
  if (estado.bypassrls) violacoes.push('a conexão tem BYPASSRLS')
  if (estado.tabelas_proprias > 0) {
    violacoes.push(`a conexão é dona de ${estado.tabelas_proprias} tabela(s) — com FORCE RLS o dono ainda é dono`)
  }

  if (violacoes.length > 0) {
    throw new Error(
      `ADR-0002 violado pelo pool de "${rolEsperado}": ${violacoes.join('; ')}. ` +
        'Rode infra/scripts/check-roles.sh.',
    )
  }
}
