import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { decodeJwt } from 'jose'
import { eq } from 'drizzle-orm'
import * as schema from '../db/schema.js'
import { sessoes } from '../db/schema.js'
import type { CasaDb } from '../plugins/withUser.js'
import { codigoPg } from '../db/erros.js'
import { criaTokens } from './tokens.js'
import { criaServicoDeAuth } from './servico.js'

/**
 * Logout contra o Postgres de verdade (Épico 1 — migration 0004).
 *
 * Dois pools porque a rota usa dois roles, e é essa fronteira que o teste
 * existe para provar: quem cria a sessão é `casa_auth` (register), quem a
 * revoga é `casa_app` sob RLS (logout). Um pool só passaria em tudo e não
 * cobriria nem o GRANT por coluna nem a policy — que são a story inteira.
 */
const URL_AUTH = process.env.AUTH_DATABASE_URL
const URL_APP = process.env.DATABASE_URL
if (!URL_AUTH || !URL_APP) {
  throw new Error(
    'AUTH_DATABASE_URL/DATABASE_URL ausentes. Os testes de integração precisam de infra/.env e do banco de pé (npm run db:up).',
  )
}

const poolAuth = new pg.Pool({ connectionString: URL_AUTH, max: 4 })
const poolApp = new pg.Pool({ connectionString: URL_APP, max: 4 })

/** Pool de limpeza. Superusuário porque `FORCE RLS` sujeita até o dono às policies. */
const admin = new pg.Pool({
  host: 'localhost',
  port: Number(process.env.POSTGRES_PORT ?? 5433),
  database: process.env.POSTGRES_DB,
  user: process.env.POSTGRES_SUPERUSER,
  password: process.env.POSTGRES_SUPERUSER_PASSWORD,
  max: 1,
})

const tokens = criaTokens({
  segredo: 'segredo-de-integracao-com-mais-de-32-chars',
  ttlAcessoSegundos: 900,
  ttlRefreshDias: 60,
})

const auth = criaServicoDeAuth(tokens, { gracaSegundos: 30 })

const DOMINIO = '@logout.casa.test'
const SENHA = 'senha-de-integracao-longa'

let contador = 0
const registro = () => ({
  apelido: 'Teste',
  cor: 'verde-musgo',
  email: `t${Date.now()}-${contador++}${DOMINIO}`,
  senha: SENHA,
})

/**
 * Commita, ao contrário do teste de rotação: aqui as escritas precisam ser
 * vistas por OUTRA conexão, com outro role. O `limpa()` do final é que devolve
 * o banco ao estado anterior.
 */
async function comoAuth<T>(fn: (db: CasaDb) => Promise<T>): Promise<T> {
  const client = await poolAuth.connect()
  try {
    await client.query('BEGIN')
    await client.query('SET LOCAL ROLE casa_auth')
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
 * Espelha o `withUser` (ADR-0002): mesmo `SET LOCAL ROLE`, mesma injeção de
 * identidade. Se um GRANT ou uma policy faltar, quebra aqui — não em produção.
 */
async function comoApp<T>(moradorId: string, fn: (db: CasaDb) => Promise<T>): Promise<T> {
  const client = await poolApp.connect()
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

const jtiDe = (refreshToken: string) => decodeJwt(refreshToken).jti as string
const moradorDe = (accessToken: string) => decodeJwt(accessToken).sub as string

/** Lê a família pelo admin: o teste não deve depender do que os roles enxergam. */
async function familiaDe(jti: string) {
  const { rows } = await admin.query<{ jti: string; revogada_em: Date | null }>(
    `select jti, revogada_em from sessoes
      where familia_id = (select familia_id from sessoes where jti = $1)
      order by criado_em`,
    [jti],
  )
  return rows
}

/**
 * `42501` = insufficient_privilege. Pelo SQLSTATE e não pela mensagem: o
 * drizzle embrulha o erro do `pg` num "Failed query: ..." e o texto do Postgres
 * ainda muda com o locale do servidor. O código não muda.
 */
async function negaPorPrivilegio(promessa: Promise<unknown>): Promise<void> {
  const erro = await promessa.then(
    () => null,
    (e: unknown) => e,
  )
  if (erro === null) throw new Error('a query deveria ter sido negada, e passou')
  expect(codigoPg(erro)).toBe('42501')
}

async function limpa() {
  await admin.query(`delete from moradores where email like $1`, [`%${DOMINIO}`])
}

beforeAll(limpa)
afterAll(async () => {
  await limpa()
  await Promise.all([poolAuth.end(), poolApp.end(), admin.end()])
})

describe('logout', () => {
  it('revoga a família inteira, e o refresh que sobrou no aparelho para de valer', async () => {
    const par = await comoAuth((db) => auth.registra(db, registro()))
    const moradorId = moradorDe(par.accessToken)

    // Uma rotação antes de sair: a família tem dois elos, e o logout precisa
    // matar os DOIS. Revogar só a linha apresentada deixaria o sucessor vivo.
    const rodado = await comoAuth((db) => auth.renova(db, par.refreshToken))
    expect(rodado).not.toBeNull()

    await comoApp(moradorId, (db) => auth.encerra(db, rodado!.refreshToken))

    const linhas = await familiaDe(jtiDe(par.refreshToken))
    expect(linhas).toHaveLength(2)
    expect(linhas.every((l) => l.revogada_em !== null)).toBe(true)

    // A prova que importa para quem usa o app: o token que ficou no cofre do
    // aparelho antes de sair não abre sessão nova.
    const depois = await comoAuth((db) => auth.renova(db, rodado!.refreshToken))
    expect(depois).toBeNull()
  })

  it('sair com o refresh ALHEIO não derruba a sessão de ninguém — a policy nega', async () => {
    const daVitima = await comoAuth((db) => auth.registra(db, registro()))
    const doLadrao = await comoAuth((db) => auth.registra(db, registro()))

    // O serviço NÃO filtra por morador_id no WHERE de propósito (servico.ts).
    // Este é o teste que garante que a omissão é segura: quem nega é a RLS.
    await comoApp(moradorDe(doLadrao.accessToken), (db) =>
      auth.encerra(db, daVitima.refreshToken),
    )

    const linhas = await familiaDe(jtiDe(daVitima.refreshToken))
    expect(linhas).toHaveLength(1)
    expect(linhas[0]!.revogada_em).toBeNull()

    // E a vítima continua conseguindo renovar, que é o efeito visível.
    expect(await comoAuth((db) => auth.renova(db, daVitima.refreshToken))).not.toBeNull()
  })

  it('refresh ilegível não lança — logout não tem porque falhar para quem já saiu', async () => {
    const par = await comoAuth((db) => auth.registra(db, registro()))
    const moradorId = moradorDe(par.accessToken)

    await expect(
      comoApp(moradorId, (db) => auth.encerra(db, 'isto.nao.e-um-jwt')),
    ).resolves.toBeUndefined()

    // Access token no lugar do refresh: `tipo` errado, mesma recusa silenciosa.
    await expect(
      comoApp(moradorId, (db) => auth.encerra(db, par.accessToken)),
    ).resolves.toBeUndefined()

    const linhas = await familiaDe(jtiDe(par.refreshToken))
    expect(linhas[0]!.revogada_em).toBeNull()
  })

  it('sair duas vezes é inofensivo', async () => {
    const par = await comoAuth((db) => auth.registra(db, registro()))
    const moradorId = moradorDe(par.accessToken)

    await comoApp(moradorId, (db) => auth.encerra(db, par.refreshToken))
    await expect(
      comoApp(moradorId, (db) => auth.encerra(db, par.refreshToken)),
    ).resolves.toBeUndefined()

    expect((await familiaDe(jtiDe(par.refreshToken)))[0]!.revogada_em).not.toBeNull()
  })

  it('casa_app não consegue ressuscitar um refresh gasto — o GRANT é de uma coluna só', async () => {
    const par = await comoAuth((db) => auth.registra(db, registro()))
    const moradorId = moradorDe(par.accessToken)
    const jti = jtiDe(par.refreshToken)

    await comoAuth((db) => auth.renova(db, par.refreshToken))

    // `consumida_em` fora do GRANT (migration 0004) é o que impede uma rota
    // autenticada de desfazer a rotação e revalidar um token já usado.
    await negaPorPrivilegio(
      comoApp(moradorId, (db) =>
        db.update(sessoes).set({ consumidaEm: null }).where(eq(sessoes.jti, jti)),
      ),
    )

    // E ler o estado da rotação também não: sem SELECT em substituida_por, um
    // bug em rota autenticada não mapeia a cadeia de sucessores da família.
    await negaPorPrivilegio(
      comoApp(moradorId, (db) =>
        db.select({ s: sessoes.substituidaPor }).from(sessoes).where(eq(sessoes.jti, jti)),
      ),
    )
  })
})
