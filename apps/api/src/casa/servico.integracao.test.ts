import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from '../db/schema.js'
import type { CasaDb } from '../plugins/withUser.js'
import { criaCasa, leCasaPovoada } from './servico.js'
import { TEMPLATES } from './templates.js'

/**
 * Criar casa e ler a casa povoada contra o Postgres de verdade (Épico 1,
 * story 6).
 *
 * Conecta como `casa_app` e injeta identidade exatamente como o `withUser`: o
 * que este arquivo prova de diferente do `smoke-rls.sh` é o CAMINHO DA API —
 * que `cria_casa()`, o seed do template e a leitura escopada compõem, na mesma
 * transação, sem nenhum `where casa_id = ...` escrito à mão.
 */
const URL_APP = process.env.DATABASE_URL
if (!URL_APP) {
  throw new Error(
    'DATABASE_URL ausente. Os testes de integração precisam de infra/.env e do banco de pé (npm run db:up).',
  )
}

const pool = new pg.Pool({ connectionString: URL_APP, max: 4 })

/**
 * Pool de fixture e limpeza. Superusuário porque `FORCE RLS` sujeita até o dono
 * às policies — e `moradores` não tem policy de INSERT para ninguém: criar
 * conta é assunto do `casa_auth`, e aqui a conta é só o palco.
 */
const admin = new pg.Pool({
  host: 'localhost',
  port: Number(process.env.POSTGRES_PORT ?? 5433),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_SUPERUSER,
  password: process.env.POSTGRES_SUPERUSER_PASSWORD,
  max: 1,
})

const DOMINIO = '@casa-integracao.casa.test'

let contador = 0

/** Cria uma conta SEM casa — o estado de quem acabou de se registrar. */
async function criaMorador(): Promise<string> {
  const email = `c${Date.now()}-${contador++}${DOMINIO}`
  const { rows } = await admin.query<{ id: string }>(
    `insert into moradores (apelido, cor, email) values ($1, 'moss', $2) returning id`,
    [`Morador ${contador}`, email],
  )
  return rows[0]!.id
}

/**
 * Transação revertida no fim, com identidade injetada — o espelho exato do
 * `withUser`. Reverter mantém os testes independentes sem precisar caçar as
 * casas que cada um criou.
 */
async function comoMorador<T>(moradorId: string, fn: (db: CasaDb) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SET LOCAL ROLE casa_app')
    await client.query("select set_config('app.current_user_id', $1, true)", [moradorId])
    return await fn(drizzle(client, { schema }))
  } finally {
    await client.query('ROLLBACK').catch(() => {})
    client.release()
  }
}

async function limpa() {
  // moradores antes de casas (FK); tarefas saem por cascade.
  await admin.query(`delete from moradores where email like $1`, [`%${DOMINIO}`])
  await admin.query(
    `delete from casas where id not in (select casa_id from moradores where casa_id is not null)
       and nome like 'Casa de teste%'`,
  )
}

beforeAll(limpa)
afterAll(async () => {
  await limpa()
  await Promise.all([pool.end(), admin.end()])
})

describe('criar casa e cair nela povoada', () => {
  it('cria a casa, vincula quem pediu e semeia o template do tipo', async () => {
    const morador = await criaMorador()

    const povoada = await comoMorador(morador, async (db) => {
      const casa = await criaCasa(db, { nome: 'Casa de teste', tipo: 'casal' })
      expect(casa.nome).toBe('Casa de teste')
      expect(casa.tipo).toBe('casal')
      return leCasaPovoada(db)
    })

    expect(povoada).not.toBeNull()
    // O critério de aceite da Fase 0 em uma linha: a casa não nasce vazia.
    expect(povoada!.tarefas.map((t) => t.titulo)).toEqual([...TEMPLATES.casal])
    expect(povoada!.moradores).toHaveLength(1)
    expect(povoada!.moradores[0]!.id).toBe(morador)
  })

  it('cada tipo semeia o próprio template', async () => {
    const morador = await criaMorador()

    const povoada = await comoMorador(morador, async (db) => {
      await criaCasa(db, { nome: 'Casa de teste república', tipo: 'republica' })
      return leCasaPovoada(db)
    })

    expect(povoada!.tarefas.map((t) => t.titulo)).toEqual([...TEMPLATES.republica])
    // Se os três templates fossem iguais, o teste acima passaria por acidente.
    expect(povoada!.tarefas.map((t) => t.titulo)).not.toEqual([...TEMPLATES.casal])
  })

  it('quem ainda não tem casa lê null, e não erro', async () => {
    const morador = await criaMorador()
    const povoada = await comoMorador(morador, (db) => leCasaPovoada(db))
    expect(povoada).toBeNull()
  })

  it('a segunda casa da mesma conta é recusada com 409 (ADR-0012)', async () => {
    const morador = await criaMorador()

    await comoMorador(morador, async (db) => {
      await criaCasa(db, { nome: 'Casa de teste primeira', tipo: 'casal' })
      await expect(criaCasa(db, { nome: 'Casa de teste segunda', tipo: 'familia' })).rejects.toThrow(
        /já mora numa casa/,
      )
    })
  })

  /**
   * A negação cruzada já é provada em `smoke-rls.sh`, no SQL. Aqui ela é
   * provada pelo CAMINHO DA API: `leCasaPovoada` não escreve nenhum filtro por
   * casa, então este teste falha se a policy parar de negar — que é a única
   * forma de o "escopo por RLS" do ADR-0002 continuar valendo depois que
   * alguém "otimizar" a consulta.
   */
  it('a casa de um não aparece para o outro', async () => {
    const ana = await criaMorador()
    const bruno = await criaMorador()

    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SET LOCAL ROLE casa_app')
      await client.query("select set_config('app.current_user_id', $1, true)", [ana])
      const db = drizzle(client, { schema })
      await criaCasa(db, { nome: 'Casa de teste da Ana', tipo: 'casal' })

      // Mesma transação, outra identidade: o `SET LOCAL` é por transação, e
      // trocar o GUC é exatamente o que o pool faz entre duas requests.
      await client.query("select set_config('app.current_user_id', $1, true)", [bruno])
      expect(await leCasaPovoada(db)).toBeNull()
    } finally {
      await client.query('ROLLBACK').catch(() => {})
      client.release()
    }
  })
})
