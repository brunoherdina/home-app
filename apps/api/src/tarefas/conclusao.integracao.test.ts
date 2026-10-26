import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import type { CriarTarefa } from '@casa/contracts'
import * as schema from '../db/schema.js'
import type { CasaDb } from '../plugins/withUser.js'
import { criaCasa } from '../casa/servico.js'
import { concluiTarefa } from './conclusao.js'
import { criaTarefa } from './servico.js'

/**
 * Concluir tarefa contra o Postgres de verdade (story 6).
 *
 * O que se prova aqui é a REGRA, não o SQL: pontos calculados no servidor, a
 * vez do rodízio andando a partir do responsável (e não de quem concluiu), e
 * o `FOR UPDATE` segurando duas conclusões simultâneas — sem ele as duas
 * leriam o mesmo responsável e a fila andaria uma casa só.
 */
const URL_APP = process.env.DATABASE_URL
if (!URL_APP) {
  throw new Error(
    'DATABASE_URL ausente. Os testes de integração precisam de infra/.env e do banco de pé (npm run db:up).',
  )
}

const pool = new pg.Pool({ connectionString: URL_APP, max: 6 })

/** Superusuário: FORCE RLS sujeita até o dono às policies. Só semeia, confere e limpa. */
const admin = new pg.Pool({
  host: 'localhost',
  port: Number(process.env.POSTGRES_PORT ?? 5433),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_SUPERUSER,
  password: process.env.POSTGRES_SUPERUSER_PASSWORD,
  max: 2,
})

const DOMINIO = '@conclusoes.casa.test'

let contador = 0

async function novaConta(apelido: string): Promise<string> {
  const { rows } = await admin.query<{ id: string }>(
    `insert into moradores (apelido, cor, email) values ($1, 'moss', $2) returning id`,
    [apelido, `c${Date.now()}-${contador++}${DOMINIO}`],
  )
  return rows[0]!.id
}

/** Espelha o `withUser` (ADR-0002): mesmo role, mesma injeção de identidade. */
async function comoApp<T>(moradorId: string, fn: (db: CasaDb) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SET LOCAL ROLE casa_app')
    await client.query("select set_config('app.current_user_id', $1, true)", [moradorId])
    const resultado = await fn(drizzle(client, { schema }))
    await client.query('COMMIT')
    return resultado
  } catch (erro) {
    await client.query('ROLLBACK').catch(() => {})
    throw erro
  } finally {
    client.release()
  }
}

/** Como `comoApp`, mas quem decide a hora do COMMIT é o teste. */
async function transacaoAberta(moradorId: string) {
  const client = await pool.connect()
  let solto = false
  await client.query('BEGIN')
  await client.query('SET LOCAL ROLE casa_app')
  await client.query("select set_config('app.current_user_id', $1, true)", [moradorId])
  return {
    db: drizzle(client, { schema }) as CasaDb,
    commit: () => client.query('COMMIT'),
    /** Idempotente: se o teste falhou antes do commit, desfaz e devolve a conexão. */
    solta() {
      if (solto) return
      solto = true
      void client.query('ROLLBACK').catch(() => {}).finally(() => client.release())
    },
  }
}

/** Espera até alguma transação deste banco estar parada esperando um lock. */
async function esperaAlguemEsperandoLock() {
  for (let tentativa = 0; tentativa < 200; tentativa++) {
    const { rows } = await admin.query<{ n: string }>(
      `select count(*) as n from pg_stat_activity
        where wait_event_type = 'Lock' and datname = current_database()`,
    )
    if (Number(rows[0]!.n) > 0) return
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  throw new Error('a segunda conclusão nunca esperou pela primeira')
}

/**
 * Três pessoas, nesta ordem de entrada — é a ordem da fila do rodízio. Os
 * dois últimos entram por UPDATE direto: convite é assunto de outra suíte.
 */
async function casaComTres() {
  const ana = await novaConta('Ana')
  const bia = await novaConta('Bia')
  const caio = await novaConta('Caio')
  const casa = await comoApp(ana, (db) => criaCasa(db, { nome: 'Casa do rodízio', tipo: 'republica' }))
  await admin.query(`update moradores set casa_id = $1 where id = any($2::uuid[])`, [casa.id, [bia, caio]])
  return { ana, bia, caio, casa }
}

function tarefa(campos: Partial<CriarTarefa>): CriarTarefa {
  return { titulo: 'Banheiro', peso: 'medio', modo: 'aberta', responsavelId: null, bonusDetestada: false, ...campos }
}

async function responsavelDe(tarefaId: string): Promise<string | null> {
  const { rows } = await admin.query<{ responsavel_id: string | null }>(
    `select responsavel_id from tarefas where id = $1`,
    [tarefaId],
  )
  return rows[0]!.responsavel_id
}

/**
 * Quantas conclusões a tarefa tem — de todo mundo, ou de UMA pessoa.
 *
 * O morador entra no WHERE e nunca sai no SELECT, mesmo aqui: a guarda da
 * story 8 vale para o teste também, e "quantas são da Bia" prova a autoria
 * sem montar a lista "quem fez o quê".
 */
async function conclusoesDe(tarefaId: string, moradorId?: string): Promise<number> {
  const { rows } = await admin.query<{ n: string }>(
    moradorId
      ? `select count(*) as n from conclusoes where tarefa_id = $1 and morador_id = $2`
      : `select count(*) as n from conclusoes where tarefa_id = $1`,
    moradorId ? [tarefaId, moradorId] : [tarefaId],
  )
  return Number(rows[0]!.n)
}

/** Casas primeiro (tarefas e conclusões vão por cascade), depois os moradores. */
async function limpa() {
  const { rows } = await admin.query<{ casa_id: string }>(
    `select distinct casa_id from moradores where email like $1 and casa_id is not null`,
    [`%${DOMINIO}`],
  )
  await admin.query(`update moradores set casa_id = null where email like $1`, [`%${DOMINIO}`])
  if (rows.length > 0) {
    await admin.query(`delete from casas where id = any($1::uuid[])`, [rows.map((r) => r.casa_id)])
  }
  await admin.query(`delete from moradores where email like $1`, [`%${DOMINIO}`])
}

beforeAll(limpa)
afterAll(async () => {
  await limpa()
  await Promise.all([pool.end(), admin.end()])
})

describe('concluir — rodízio', () => {
  it('a vez anda a partir do RESPONSÁVEL, circular — mesmo quando quem conclui é outra pessoa', async () => {
    const { ana, bia, caio } = await casaComTres()
    const louca = await comoApp(ana, (db) => criaTarefa(db, tarefa({ titulo: 'Louça', modo: 'rodizio', responsavelId: ana })))

    // Bia cobre a vez da Ana: a vez passa para quem vem DEPOIS DA ANA (Bia),
    // e não para quem vem depois de quem concluiu.
    await comoApp(bia, (db) => concluiTarefa(db, louca.id))
    expect(await responsavelDe(louca.id)).toBe(bia)

    // Caio cobre a vez da Bia: a vez vai para o Caio.
    await comoApp(caio, (db) => concluiTarefa(db, louca.id))
    expect(await responsavelDe(louca.id)).toBe(caio)

    // Do último volta ao primeiro.
    await comoApp(caio, (db) => concluiTarefa(db, louca.id))
    expect(await responsavelDe(louca.id)).toBe(ana)

    // Os pontos foram para quem FEZ, cada vez — nenhum para a Ana, que só
    // estava da vez.
    expect(await conclusoesDe(louca.id, bia)).toBe(1)
    expect(await conclusoesDe(louca.id, caio)).toBe(2)
    expect(await conclusoesDe(louca.id, ana)).toBe(0)
  })

  it('sem ninguém da vez, a fila começa do primeiro morador', async () => {
    const { ana, caio } = await casaComTres()
    const lixo = await comoApp(caio, (db) => criaTarefa(db, tarefa({ titulo: 'Lixo', modo: 'rodizio' })))

    await comoApp(caio, (db) => concluiTarefa(db, lixo.id))

    expect(await responsavelDe(lixo.id)).toBe(ana)
  })

  it('duas conclusões ao mesmo tempo andam a fila DUAS casas — o FOR UPDATE serializa', async () => {
    const { ana, bia, caio } = await casaComTres()
    const roupa = await comoApp(ana, (db) => criaTarefa(db, tarefa({ titulo: 'Roupa', modo: 'rodizio', responsavelId: ana })))

    // A intercalação é forçada, não sorteada: a Ana conclui e SEGURA a
    // transação; a Bia conclui em paralelo e só então a Ana commita. Sem o
    // lock, a Bia leria "vez da Ana" antes do commit e a fila pararia na Bia.
    const primeira = await transacaoAberta(ana)
    try {
      await concluiTarefa(primeira.db, roupa.id)
      const segunda = comoApp(bia, (db) => concluiTarefa(db, roupa.id))
      await esperaAlguemEsperandoLock()
      await primeira.commit()
      await segunda
    } finally {
      primeira.solta()
    }

    expect(await responsavelDe(roupa.id)).toBe(caio)
    expect(await conclusoesDe(roupa.id)).toBe(2)
  })
})

describe('concluir — fixo e aberta', () => {
  it('fixo continua com o dono e aberta continua de ninguém, depois de concluídas', async () => {
    const { ana, bia } = await casaComTres()
    const plantas = await comoApp(ana, (db) => criaTarefa(db, tarefa({ titulo: 'Plantas', modo: 'fixo', responsavelId: ana })))
    const mercado = await comoApp(ana, (db) => criaTarefa(db, tarefa({ titulo: 'Mercado', modo: 'aberta' })))

    await comoApp(bia, (db) => concluiTarefa(db, plantas.id))
    await comoApp(bia, (db) => concluiTarefa(db, mercado.id))

    expect(await responsavelDe(plantas.id)).toBe(ana)
    expect(await responsavelDe(mercado.id)).toBeNull()
  })
})

describe('concluir — pontos', () => {
  it('são calculados no servidor: peso, mais o bônus da detestada só em rodízio', async () => {
    const { ana } = await casaComTres()
    const banheiro = await comoApp(ana, (db) =>
      criaTarefa(db, tarefa({ peso: 'pesado', modo: 'rodizio', responsavelId: ana, bonusDetestada: true })),
    )
    const quintal = await comoApp(ana, (db) => criaTarefa(db, tarefa({ titulo: 'Quintal', peso: 'pesado', modo: 'fixo', responsavelId: ana })))
    const cama = await comoApp(ana, (db) => criaTarefa(db, tarefa({ titulo: 'Cama', peso: 'leve' })))

    expect((await comoApp(ana, (db) => concluiTarefa(db, banheiro.id))).pontos).toBe(3 + 2)
    expect((await comoApp(ana, (db) => concluiTarefa(db, quintal.id))).pontos).toBe(3)
    expect((await comoApp(ana, (db) => concluiTarefa(db, cama.id))).pontos).toBe(1)
  })

  it('a conclusão volta sem autor: quem a recebe é quem a fez', async () => {
    const { ana } = await casaComTres()
    const cama = await comoApp(ana, (db) => criaTarefa(db, tarefa({ titulo: 'Cama', peso: 'leve' })))

    const conclusao = await comoApp(ana, (db) => concluiTarefa(db, cama.id))

    expect(Object.keys(conclusao).sort()).toEqual(['concluidaEm', 'id', 'pontos', 'tarefaId'])
    expect(new Date(conclusao.concluidaEm).toISOString()).toBe(conclusao.concluidaEm)
    expect(await conclusoesDe(cama.id, ana)).toBe(1)
  })

  it('é evento, não estado: a mesma tarefa concluída duas vezes são duas conclusões', async () => {
    const { ana } = await casaComTres()
    const louca = await comoApp(ana, (db) => criaTarefa(db, tarefa({ titulo: 'Louça' })))

    await comoApp(ana, (db) => concluiTarefa(db, louca.id))
    await comoApp(ana, (db) => concluiTarefa(db, louca.id))

    expect(await conclusoesDe(louca.id)).toBe(2)
  })
})

describe('concluir — escopo', () => {
  it('tarefa de outra casa é 404: nada gravado, e a vez de lá não anda', async () => {
    const minha = await casaComTres()
    const outra = await casaComTres()
    const deLa = await comoApp(outra.ana, (db) =>
      criaTarefa(db, tarefa({ titulo: 'Louça de lá', modo: 'rodizio', responsavelId: outra.ana })),
    )

    await expect(comoApp(minha.ana, (db) => concluiTarefa(db, deLa.id))).rejects.toMatchObject({
      status: 404,
      codigo: 'TAREFA_NAO_ENCONTRADA',
    })

    expect(await conclusoesDe(deLa.id)).toBe(0)
    expect(await responsavelDe(deLa.id)).toBe(outra.ana)
  })
})
