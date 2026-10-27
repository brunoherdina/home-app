import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { eq, sql } from 'drizzle-orm'
import { ALFABETO_DO_CODIGO, TAMANHO_DO_CODIGO } from '@casa/contracts'
import * as schema from '../db/schema.js'
import { convites } from '../db/schema.js'
import type { CasaDb } from '../plugins/withUser.js'
import { ErroHttp } from '../erros.js'
import { criaConvite, entraComConvite, geraCodigo } from './convite.js'
import { criaCasa, leCasaDaIdentidade } from './servico.js'

/**
 * Convite curto contra o Postgres de verdade (migration 0005).
 *
 * Tudo como `casa_app`, com identidade injetada — igual ao `withUser`. O que
 * está sendo provado não é o SQL do serviço: é que `entra_na_casa()` é a única
 * porta, que ela consome o convite uma vez só, e que ninguém entra em casa
 * alheia sem código.
 */
const URL_APP = process.env.DATABASE_URL
if (!URL_APP) {
  throw new Error(
    'DATABASE_URL ausente. Os testes de integração precisam de infra/.env e do banco de pé (npm run db:up).',
  )
}

const pool = new pg.Pool({ connectionString: URL_APP, max: 6 })

/** Superusuário: FORCE RLS sujeita até o dono às policies. Só semeia e limpa. */
const admin = new pg.Pool({
  host: 'localhost',
  port: Number(process.env.POSTGRES_PORT ?? 5433),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_SUPERUSER,
  password: process.env.POSTGRES_SUPERUSER_PASSWORD,
  max: 2,
})

const DOMINIO = '@convite.casa.test'

let contador = 0

/**
 * Cria uma conta SEM casa direto no banco — o register é assunto do `casa_auth`
 * e não desta suíte. Devolve o id, que é o que vira `app.current_user_id`.
 */
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

/**
 * Transação aberta À MÃO, com o commit sob controle do teste.
 *
 * Existe porque `Promise.all` de duas chamadas de `comoApp` NÃO produz corrida:
 * a primeira pega a conexão já ociosa do pool e a segunda paga o handshake, e
 * quando a segunda começa a primeira já commitou. Foi verificado — o teste de
 * corrida passava com o `FOR UPDATE` removido da função, ou seja, passava sem
 * testar nada. Abrindo as duas transações ANTES do trecho paralelo, a
 * sobreposição cai onde importa: entre o SELECT de uma e o COMMIT da outra.
 */
async function abreTransacao(moradorId: string) {
  const client = await pool.connect()
  await client.query('BEGIN')
  await client.query('SET LOCAL ROLE casa_app')
  await client.query("select set_config('app.current_user_id', $1, true)", [moradorId])

  let encerrada = false
  const encerra = async (comando: 'COMMIT' | 'ROLLBACK') => {
    if (encerrada) return
    encerrada = true
    await client.query(comando).catch(() => {})
    client.release()
  }

  return {
    db: drizzle(client, { schema }) as CasaDb,
    commit: () => encerra('COMMIT'),
    descarta: () => encerra('ROLLBACK'),
  }
}

/** Uma casa pronta e o morador dela — o ponto de partida de quase todo teste. */
async function casaComDono() {
  const dono = await novaConta('Dono')
  const casa = await comoApp(dono, (db) => criaCasa(db, { nome: 'Casa do teste', tipo: 'casal' }))
  return { dono, casa }
}

/**
 * Três passos, e a ordem é a FK: `moradores.casa_id` NÃO é cascade (entrar em
 * casa é decisão, não vínculo descartável), então as casas precisam ficar sem
 * morador antes de sair — e os ids delas só são encontráveis ENQUANTO os
 * moradores existem. Por isso se anota primeiro e se apaga depois.
 *
 * Tarefas e convites saem por cascade da casa; convites também por cascade de
 * quem os criou.
 */
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

describe('gerador de código', () => {
  it('só emite símbolos do alfabeto compartilhado, no tamanho combinado', () => {
    // 200 sorteios: o suficiente para um símbolo fora do alfabeto aparecer se o
    // gerador e o contrato discordarem, e barato o bastante para rodar sempre.
    for (let i = 0; i < 200; i++) {
      const codigo = geraCodigo()
      expect(codigo).toHaveLength(TAMANHO_DO_CODIGO)
      for (const simbolo of codigo) expect(ALFABETO_DO_CODIGO).toContain(simbolo)
    }
  })
})

describe('convite', () => {
  it('quem tem casa convida; quem recebe o código entra na MESMA casa', async () => {
    const { dono, casa } = await casaComDono()
    const convidado = await novaConta('Convidado')

    const { codigo } = await comoApp(dono, (db) => criaConvite(db))
    const entrou = await comoApp(convidado, (db) => entraComConvite(db, codigo))

    expect(entrou.id).toBe(casa.id)

    // A prova que importa para as duas pessoas: cada um, com a própria
    // identidade, enxerga a mesma casa e os dois moradores.
    const doDono = await comoApp(dono, (db) => leCasaDaIdentidade(db))
    const doConvidado = await comoApp(convidado, (db) => leCasaDaIdentidade(db))
    expect(doDono?.id).toBe(casa.id)
    expect(doConvidado?.id).toBe(casa.id)

    const { rows } = await admin.query<{ n: string }>(
      'select count(*) as n from moradores where casa_id = $1',
      [casa.id],
    )
    expect(rows[0]!.n).toBe('2')
  })

  it('o convite é de uso único — o segundo a chegar é recusado', async () => {
    const { dono } = await casaComDono()
    const primeiro = await novaConta('Primeiro')
    const segundo = await novaConta('Segundo')

    const { codigo } = await comoApp(dono, (db) => criaConvite(db))
    await comoApp(primeiro, (db) => entraComConvite(db, codigo))

    await expect(comoApp(segundo, (db) => entraComConvite(db, codigo))).rejects.toMatchObject({
      status: 404,
      codigo: 'CONVITE_INVALIDO',
    })

    const semCasa = await comoApp(segundo, (db) => leCasaDaIdentidade(db))
    expect(semCasa).toBeNull()
  })

  it('duas pessoas com o MESMO código ao mesmo tempo: uma entra, a outra não', async () => {
    const { dono, casa } = await casaComDono()
    const a = await novaConta('A')
    const b = await novaConta('B')
    const { codigo } = await comoApp(dono, (db) => criaConvite(db))

    // As duas transações abertas ANTES do paralelo — ver `abreTransacao`.
    // Sem o FOR UPDATE da função, as duas leem `usado_em` nulo, as duas
    // atualizam e as duas entram: é assim que convite de uso único vira uso
    // ilimitado. Com ele, a segunda espera o COMMIT da primeira, reavalia o
    // WHERE, não acha mais a linha e recusa.
    const ta = await abreTransacao(a)
    const tb = await abreTransacao(b)

    const tenta = async (t: Awaited<ReturnType<typeof abreTransacao>>) => {
      try {
        const casa = await entraComConvite(t.db, codigo)
        await t.commit()
        return casa
      } catch (erro) {
        await t.descarta()
        throw erro
      }
    }

    const resultados = await Promise.allSettled([tenta(ta), tenta(tb)])

    expect(resultados.filter((r) => r.status === 'fulfilled')).toHaveLength(1)
    expect(resultados.filter((r) => r.status === 'rejected')).toHaveLength(1)

    // A asserção que fecha: a casa tem o dono e UMA pessoa nova, não duas.
    const { rows } = await admin.query<{ n: string }>(
      'select count(*) as n from moradores where casa_id = $1',
      [casa.id],
    )
    expect(rows[0]!.n).toBe('2')
  })

  it('código expirado é recusado, e sem dizer que existiu', async () => {
    const { dono } = await casaComDono()
    const convidado = await novaConta('Atrasado')
    const { codigo } = await comoApp(dono, (db) => criaConvite(db))

    await admin.query(`update convites set expira_em = now() - interval '1 minute' where codigo = $1`, [
      codigo,
    ])

    const erro = await comoApp(convidado, (db) => entraComConvite(db, codigo)).catch(
      (e: unknown) => e,
    )
    expect(erro).toBeInstanceOf(ErroHttp)
    // A MESMA resposta de um código que nunca existiu: distinguir os dois diria
    // a quem adivinha que ele acertou o sorteio e chegou tarde.
    expect((erro as ErroHttp).codigo).toBe('CONVITE_INVALIDO')
    const inexistente = await comoApp(convidado, (db) => entraComConvite(db, 'ZZZZZZ')).catch(
      (e: unknown) => e,
    )
    expect((inexistente as ErroHttp).codigo).toBe('CONVITE_INVALIDO')
    expect((inexistente as ErroHttp).message).toBe((erro as ErroHttp).message)
  })

  it('quem já tem casa não entra em outra — nem com código válido', async () => {
    const primeira = await casaComDono()
    const segunda = await casaComDono()

    const { codigo } = await comoApp(segunda.dono, (db) => criaConvite(db))

    await expect(
      comoApp(primeira.dono, (db) => entraComConvite(db, codigo)),
    ).rejects.toMatchObject({ status: 409, codigo: 'JA_TEM_CASA' })

    const aindaNaPrimeira = await comoApp(primeira.dono, (db) => leCasaDaIdentidade(db))
    expect(aindaNaPrimeira?.id).toBe(primeira.casa.id)
  })

  it('quem ainda não tem casa não consegue convidar', async () => {
    const semCasa = await novaConta('Sem casa')

    await expect(comoApp(semCasa, (db) => criaConvite(db))).rejects.toMatchObject({
      status: 409,
      codigo: 'SEM_CASA',
    })
  })

  it('o convite de uma casa é invisível para quem é de outra — inclusive pelo código', async () => {
    const alvo = await casaComDono()
    const intruso = await casaComDono()
    const { codigo } = await comoApp(alvo.dono, (db) => criaConvite(db))

    // A policy de SELECT é `casa_id = casa_atual()`: nem contando, nem
    // procurando pelo código exato, o convite da outra casa aparece.
    const vistos = await comoApp(intruso.dono, (db) =>
      db.select({ codigo: convites.codigo }).from(convites).where(eq(convites.codigo, codigo)),
    )
    expect(vistos).toHaveLength(0)

    // E o dono vê o próprio — senão a asserção acima passaria por a tabela
    // estar vazia, não por a policy negar.
    const proprios = await comoApp(alvo.dono, (db) =>
      db.select({ codigo: convites.codigo }).from(convites),
    )
    expect(proprios.map((c) => c.codigo)).toContain(codigo)
  })

  it('casa_app não consome convite por fora da função — falta o privilégio', async () => {
    const { dono } = await casaComDono()
    const { codigo } = await comoApp(dono, (db) => criaConvite(db))

    // Sem UPDATE em `convites`, nem quem é da casa marca um convite como usado
    // (ou o desmarca) sem passar por `entra_na_casa()`.
    const erro = await comoApp(dono, (db) =>
      db.update(convites).set({ usadoEm: new Date() }).where(eq(convites.codigo, codigo)),
    ).catch((e: unknown) => e)
    expect((erro as { code?: string; cause?: { code?: string } }).cause?.code ?? '').toBe('42501')
  })

  it('entrar em casa continua sendo função — o UPDATE direto é negado', async () => {
    const alvo = await casaComDono()
    const forasteiro = await novaConta('Forasteiro')

    // O ataque que `cria_casa()`/`entra_na_casa()` existem para fechar: com o
    // uuid da casa em mãos, entrar seria um UPDATE na própria linha, autorizado
    // pela policy "atualiza a si mesmo". Quem barra é a ausência do GRANT.
    const erro = await comoApp(forasteiro, (db) =>
      db.execute(sql`update moradores set casa_id = ${alvo.casa.id} where id = ${forasteiro}`),
    ).catch((e: unknown) => e)
    expect((erro as { cause?: { code?: string } }).cause?.code ?? '').toBe('42501')

    expect(await comoApp(forasteiro, (db) => leCasaDaIdentidade(db))).toBeNull()
  })
})
