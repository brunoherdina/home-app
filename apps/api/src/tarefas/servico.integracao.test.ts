import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from '../db/schema.js'
import { tarefas } from '../db/schema.js'
import type { CasaDb } from '../plugins/withUser.js'
import { codigoPg } from '../db/erros.js'
import { criaCasa, leCasaPovoada } from '../casa/servico.js'
import { apagaTarefa, criaTarefa, editaTarefa } from './servico.js'

/**
 * CRUD de tarefas contra o Postgres de verdade (migrations 0006/0007).
 *
 * Tudo como `casa_app`, com identidade injetada — igual ao `withUser`. O que
 * está sendo provado não é o SQL do serviço: é que a policy de `tarefas` é
 * quem escopa (criar cai na casa da identidade, editar/apagar não alcançam
 * casa alheia) e que o `WITH CHECK` de 0006 recusa responsável de fora sem
 * nenhum `if` no serviço.
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

const DOMINIO = '@tarefas.casa.test'

/** Válido como uuid, mas não é morador de casa nenhuma. */
const UUID_DE_NINGUEM = '00000000-0000-4000-8000-000000000000'

let contador = 0

async function novaConta(apelido: string): Promise<string> {
  const { rows } = await admin.query<{ id: string }>(
    `insert into moradores (apelido, cor, email) values ($1, 'moss', $2) returning id`,
    [apelido, `t${Date.now()}-${contador++}${DOMINIO}`],
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

/**
 * Uma casa com duas pessoas — o mínimo para "responsável" significar alguma
 * coisa. O par entra por UPDATE direto: convite é assunto de outra suíte.
 */
async function casaComDois() {
  const dono = await novaConta('Dono')
  const par = await novaConta('Par')
  const casa = await comoApp(dono, (db) => criaCasa(db, { nome: 'Casa das tarefas', tipo: 'casal' }))
  await admin.query(`update moradores set casa_id = $1 where id = $2`, [casa.id, par])
  return { dono, par, casa }
}

function sqlstate(erro: unknown): string | null {
  return codigoPg(erro)
}

/** Mesma ordem do convite: anotar as casas, soltar os moradores, apagar as casas (tarefas por cascade). */
async function limpa() {
  const { rows } = await admin.query<{ casa_id: string }>(
    `select distinct casa_id from moradores where email like $1 and casa_id is not null`,
    [`%${DOMINIO}`],
  )
  await admin.query(`delete from moradores where email like $1`, [`%${DOMINIO}`])
  if (rows.length > 0) {
    await admin.query(`delete from casas where id = any($1::uuid[])`, [rows.map((r) => r.casa_id)])
  }
}

beforeAll(limpa)
afterAll(async () => {
  await limpa()
  await Promise.all([pool.end(), admin.end()])
})

describe('criar tarefa', () => {
  it('cai na casa de quem cria, com os defaults do formulário, e aparece na casa povoada', async () => {
    const { dono } = await casaComDois()

    const tarefa = await comoApp(dono, (db) =>
      criaTarefa(db, { titulo: 'Louça', peso: 'medio', modo: 'aberta', responsavelId: null, bonusDetestada: false }),
    )

    expect(tarefa).toMatchObject({
      titulo: 'Louça',
      peso: 'medio',
      modo: 'aberta',
      responsavelId: null,
      bonusDetestada: false,
    })

    const povoada = await comoApp(dono, (db) => leCasaPovoada(db))
    expect(povoada?.tarefas.map((t) => t.id)).toContain(tarefa.id)
  })

  it('atribui ao par da mesma casa — rodízio pesado com bônus', async () => {
    const { dono, par } = await casaComDois()

    const tarefa = await comoApp(dono, (db) =>
      criaTarefa(db, { titulo: 'Banheiro', peso: 'pesado', modo: 'rodizio', responsavelId: par, bonusDetestada: true }),
    )

    expect(tarefa).toMatchObject({ modo: 'rodizio', responsavelId: par, bonusDetestada: true })
  })

  it('responsável de OUTRA casa é recusado pela policy, não por um if — e nada é gravado', async () => {
    const minha = await casaComDois()
    const outra = await casaComDois()

    await expect(
      comoApp(minha.dono, (db) =>
        criaTarefa(db, { titulo: 'Louça', peso: 'medio', modo: 'fixo', responsavelId: outra.par, bonusDetestada: false }),
      ),
    ).rejects.toMatchObject({ status: 422, codigo: 'RESPONSAVEL_INVALIDO' })

    // O INSERT cru, sem o serviço no meio: é o WITH CHECK de 0006 quem recusa (42501).
    let erro: unknown
    await comoApp(minha.dono, async (db) => {
      try {
        await db.insert(tarefas).values({ casaId: minha.casa.id, titulo: 'Louça', modo: 'fixo', responsavelId: outra.par })
      } catch (e) {
        erro = e
      }
    }).catch(() => {})
    expect(sqlstate(erro)).toBe('42501')

    const { rows } = await admin.query<{ n: string }>(
      `select count(*) as n from tarefas where casa_id = $1 and responsavel_id = $2`,
      [minha.casa.id, outra.par],
    )
    expect(rows[0]!.n).toBe('0')
  })

  it('uuid que não é de ninguém dá a MESMA resposta de "outra casa" — sem oráculo de quem existe', async () => {
    const { dono } = await casaComDois()

    await expect(
      comoApp(dono, (db) =>
        criaTarefa(db, { titulo: 'Louça', peso: 'leve', modo: 'fixo', responsavelId: UUID_DE_NINGUEM, bonusDetestada: false }),
      ),
    ).rejects.toMatchObject({ status: 422, codigo: 'RESPONSAVEL_INVALIDO' })
  })

  it('sem casa não há onde criar', async () => {
    const solto = await novaConta('Solto')

    await expect(
      comoApp(solto, (db) =>
        criaTarefa(db, { titulo: 'Louça', peso: 'medio', modo: 'aberta', responsavelId: null, bonusDetestada: false }),
      ),
    ).rejects.toMatchObject({ status: 409, codigo: 'SEM_CASA' })
  })
})

describe('editar tarefa', () => {
  it('é o formulário inteiro: aberta vira rodízio com dono e bônus, e volta', async () => {
    const { dono, par } = await casaComDois()
    const criada = await comoApp(dono, (db) =>
      criaTarefa(db, { titulo: 'Louça', peso: 'medio', modo: 'aberta', responsavelId: null, bonusDetestada: false }),
    )

    const editada = await comoApp(par, (db) =>
      editaTarefa(db, criada.id, {
        titulo: 'Louça do jantar',
        peso: 'pesado',
        modo: 'rodizio',
        responsavelId: par,
        bonusDetestada: true,
      }),
    )
    expect(editada).toEqual({
      id: criada.id,
      titulo: 'Louça do jantar',
      peso: 'pesado',
      modo: 'rodizio',
      responsavelId: par,
      bonusDetestada: true,
    })

    const devolta = await comoApp(dono, (db) =>
      editaTarefa(db, criada.id, {
        titulo: 'Louça',
        peso: 'leve',
        modo: 'aberta',
        responsavelId: null,
        bonusDetestada: false,
      }),
    )
    expect(devolta).toMatchObject({ modo: 'aberta', responsavelId: null, bonusDetestada: false })
  })

  it('tarefa de outra casa é 404 — a policy esconde, o serviço nem sabe que existe', async () => {
    const minha = await casaComDois()
    const outra = await casaComDois()
    const alheia = await comoApp(outra.dono, (db) =>
      criaTarefa(db, { titulo: 'Lixo', peso: 'leve', modo: 'aberta', responsavelId: null, bonusDetestada: false }),
    )

    await expect(
      comoApp(minha.dono, (db) =>
        editaTarefa(db, alheia.id, { titulo: 'Invadida', peso: 'pesado', modo: 'aberta', responsavelId: null, bonusDetestada: false }),
      ),
    ).rejects.toMatchObject({ status: 404, codigo: 'TAREFA_NAO_ENCONTRADA' })

    const { rows } = await admin.query<{ titulo: string; peso: string }>(
      `select titulo, peso from tarefas where id = $1`,
      [alheia.id],
    )
    expect(rows[0]).toEqual({ titulo: 'Lixo', peso: 'leve' })
  })

  it('responsável de fora numa tarefa MINHA é 422, e a linha fica como estava', async () => {
    const minha = await casaComDois()
    const outra = await casaComDois()
    const tarefa = await comoApp(minha.dono, (db) =>
      criaTarefa(db, { titulo: 'Louça', peso: 'medio', modo: 'aberta', responsavelId: null, bonusDetestada: false }),
    )

    await expect(
      comoApp(minha.dono, (db) =>
        editaTarefa(db, tarefa.id, { titulo: 'Louça', peso: 'medio', modo: 'fixo', responsavelId: outra.par, bonusDetestada: false }),
      ),
    ).rejects.toMatchObject({ status: 422, codigo: 'RESPONSAVEL_INVALIDO' })

    const { rows } = await admin.query<{ modo: string; responsavel_id: string | null }>(
      `select modo, responsavel_id from tarefas where id = $1`,
      [tarefa.id],
    )
    expect(rows[0]).toEqual({ modo: 'aberta', responsavel_id: null })
  })

  it('id que não existe é 404', async () => {
    const { dono } = await casaComDois()

    await expect(
      comoApp(dono, (db) =>
        editaTarefa(db, UUID_DE_NINGUEM, { titulo: 'Nada', peso: 'leve', modo: 'aberta', responsavelId: null, bonusDetestada: false }),
      ),
    ).rejects.toMatchObject({ status: 404, codigo: 'TAREFA_NAO_ENCONTRADA' })
  })
})

describe('apagar tarefa', () => {
  it('qualquer um da casa apaga; some da casa povoada; apagar de novo é 404', async () => {
    const { dono, par } = await casaComDois()
    const tarefa = await comoApp(dono, (db) =>
      criaTarefa(db, { titulo: 'Louça', peso: 'medio', modo: 'aberta', responsavelId: null, bonusDetestada: false }),
    )

    await comoApp(par, (db) => apagaTarefa(db, tarefa.id))

    const povoada = await comoApp(dono, (db) => leCasaPovoada(db))
    expect(povoada?.tarefas.map((t) => t.id)).not.toContain(tarefa.id)

    await expect(comoApp(par, (db) => apagaTarefa(db, tarefa.id))).rejects.toMatchObject({
      status: 404,
      codigo: 'TAREFA_NAO_ENCONTRADA',
    })
  })

  it('tarefa de outra casa é 404 e continua lá', async () => {
    const minha = await casaComDois()
    const outra = await casaComDois()
    const alheia = await comoApp(outra.dono, (db) =>
      criaTarefa(db, { titulo: 'Lixo', peso: 'leve', modo: 'aberta', responsavelId: null, bonusDetestada: false }),
    )

    await expect(comoApp(minha.dono, (db) => apagaTarefa(db, alheia.id))).rejects.toMatchObject({
      status: 404,
      codigo: 'TAREFA_NAO_ENCONTRADA',
    })

    const { rows } = await admin.query<{ n: string }>(`select count(*) as n from tarefas where id = $1`, [alheia.id])
    expect(rows[0]!.n).toBe('1')
  })
})
