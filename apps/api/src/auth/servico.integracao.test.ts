import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { decodeJwt } from 'jose'
import { eq } from 'drizzle-orm'
import * as schema from '../db/schema.js'
import { sessoes } from '../db/schema.js'
import type { CasaDb } from '../plugins/withUser.js'
import type { ParDeTokens } from '@casa/contracts'
import { criaTokens } from './tokens.js'
import { criaServicoDeAuth } from './servico.js'

/**
 * Rotação, detecção de reuso e janela de graça contra o Postgres de verdade
 * (Épico 1, story 5 — ADR-0008).
 *
 * Conecta como `casa_auth`, exatamente como o plugin `semIdentidade`: se um
 * GRANT faltar, é aqui que aparece, e não em produção.
 */
const URL_AUTH = process.env.AUTH_DATABASE_URL
if (!URL_AUTH) {
  throw new Error(
    'AUTH_DATABASE_URL ausente. Os testes de integração precisam de infra/.env e do banco de pé (npm run db:up).',
  )
}

const pool = new pg.Pool({ connectionString: URL_AUTH, max: 6 })

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

/** Graça larga: o caminho benigno não pode depender de o teste rodar rápido. */
const comGraca = criaServicoDeAuth(tokens, { gracaSegundos: 300 })

/** A janela real do `.env`, para os testes que exercitam o LIMITE dela. */
const comGracaPadrao = criaServicoDeAuth(tokens, { gracaSegundos: 30 })

const DOMINIO = '@integracao.casa.test'
const SENHA = 'senha-de-integracao-longa'

let contador = 0
const registro = () => ({
  apelido: 'Teste',
  cor: 'verde-musgo',
  email: `t${Date.now()}-${contador++}${DOMINIO}`,
  senha: SENHA,
})

/**
 * Transação revertida no fim: o teste escreve à vontade e o banco volta ao que
 * era. Espelha o `semIdentidade` — mesmo `SET LOCAL ROLE`, mesmo escopo.
 */
async function emTransacao<T>(fn: (db: CasaDb) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SET LOCAL ROLE casa_auth')
    return await fn(drizzle(client, { schema }))
  } finally {
    await client.query('ROLLBACK').catch(() => {})
    client.release()
  }
}

/** Commita: só para o teste de concorrência, em que duas conexões precisam se enxergar. */
async function emTransacaoCommitada<T>(fn: (db: CasaDb) => Promise<T>): Promise<T> {
  const t = await abreTransacao()
  try {
    const resultado = await fn(t.db)
    await t.commit()
    return resultado
  } catch (erro) {
    await t.descarta()
    throw erro
  }
}

/**
 * Transação aberta À MÃO, com o commit sob controle do teste.
 *
 * Existe porque `Promise.all` de duas transações completas NÃO produz corrida:
 * a primeira pega a conexão já ociosa do pool e a segunda paga um handshake
 * TCP, então a primeira termina antes de a segunda sequer ler. O teste passava
 * com o `FOR UPDATE` comentado — passava sem testar nada. Abrindo as duas
 * transações ANTES do trecho paralelo, a sobreposição fica onde importa: entre
 * o SELECT de uma e o COMMIT da outra.
 */
async function abreTransacao() {
  const client = await pool.connect()
  await client.query('BEGIN')
  await client.query('SET LOCAL ROLE casa_auth')

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

const jtiDe = (refreshToken: string) => decodeJwt(refreshToken).jti

async function familia(db: CasaDb, jti: string) {
  const [linha] = await db
    .select({ familiaId: sessoes.familiaId })
    .from(sessoes)
    .where(eq(sessoes.jti, jti))
    .limit(1)
  if (!linha) throw new Error(`sessão ${jti} não encontrada`)

  return db
    .select({
      jti: sessoes.jti,
      consumidaEm: sessoes.consumidaEm,
      revogadaEm: sessoes.revogadaEm,
      substituidaPor: sessoes.substituidaPor,
    })
    .from(sessoes)
    .where(eq(sessoes.familiaId, linha.familiaId))
}

async function limpa() {
  await admin.query(`delete from moradores where email like $1`, [`%${DOMINIO}`])
}

beforeAll(limpa)
afterAll(async () => {
  await limpa()
  await Promise.all([pool.end(), admin.end()])
})

/** `renova` devolve `null` na recusa; nos testes do caminho feliz isso é falha. */
function exigePar(par: ParDeTokens | null): ParDeTokens {
  expect(par).not.toBeNull()
  return par as ParDeTokens
}

describe('rotação', () => {
  it('emite um sucessor na mesma família e marca o anterior como consumido', async () => {
    await emTransacao(async (db) => {
      const inicial = await comGraca.registra(db, registro())
      const rodado = exigePar(await comGraca.renova(db, inicial.refreshToken))

      expect(rodado.refreshToken).not.toBe(inicial.refreshToken)

      const linhas = await familia(db, jtiDe(inicial.refreshToken) as string)
      expect(linhas).toHaveLength(2)

      const anterior = linhas.find((l) => l.jti === jtiDe(inicial.refreshToken))
      expect(anterior?.consumidaEm).not.toBeNull()
      expect(anterior?.substituidaPor).toBe(jtiDe(rodado.refreshToken))
    })
  })
})

describe('janela de graça', () => {
  it('devolve o MESMO sucessor quando o refresh volta dentro da janela', async () => {
    await emTransacao(async (db) => {
      const inicial = await comGraca.registra(db, registro())
      const primeiro = exigePar(await comGraca.renova(db, inicial.refreshToken))

      // O caso benigno: o app disparou dois requests com o mesmo refresh.
      const segundo = exigePar(await comGraca.renova(db, inicial.refreshToken))

      // Mesma sessão, não uma bifurcação: o `jti` é o que identifica a linha.
      // Os JWT diferem byte a byte porque o `iat` é outro — e isso não importa.
      expect(jtiDe(segundo.refreshToken)).toBe(jtiDe(primeiro.refreshToken))

      const linhas = await familia(db, jtiDe(inicial.refreshToken) as string)
      expect(linhas).toHaveLength(2)
      expect(linhas.every((l) => l.revogadaEm === null)).toBe(true)
    })
  })

  it('não revoga nada quando a cadeia já andou além do sucessor', async () => {
    await emTransacao(async (db) => {
      const inicial = await comGraca.registra(db, registro())
      const primeiro = exigePar(await comGraca.renova(db, inicial.refreshToken))
      await comGraca.renova(db, primeiro.refreshToken)

      // Dentro da graça, mas o sucessor já foi gasto: o servidor se recusa a
      // decidir — não devolve token e não mata a família.
      await expect(comGraca.renova(db, inicial.refreshToken)).resolves.toBeNull()

      const linhas = await familia(db, jtiDe(inicial.refreshToken) as string)
      expect(linhas.every((l) => l.revogadaEm === null)).toBe(true)
    })
  })
})

describe('detecção de reuso', () => {
  /**
   * Commitado, e não em transação revertida, por causa de um bug que a versão
   * anterior deste teste não via: a revogação da família é um UPDATE na MESMA
   * transação do request, e enquanto `renova` LANÇAVA a recusa, o plugin dava
   * ROLLBACK e desfazia a revogação. O teste lia a família antes do rollback e
   * passava; o token roubado seguia valendo em produção. Ler num request NOVO
   * é o que torna a revogação cobrável.
   */
  async function envelheceOConsumo(jti: string, segundos: number) {
    await emTransacaoCommitada((db) =>
      db
        .update(sessoes)
        // Relógio do Node, não `now()` do Postgres: dentro de uma transação
        // `now()` devolve o início dela, e o serviço compara contra `new Date()`.
        // Misturar as fontes mediria a duração da transação, não a janela.
        .set({ consumidaEm: new Date(Date.now() - segundos * 1000) })
        .where(eq(sessoes.jti, jti)),
    )
  }

  it('revoga a família inteira, e a revogação sobrevive ao request', async () => {
    const inicial = await emTransacaoCommitada((db) => comGracaPadrao.registra(db, registro()))
    const jtiInicial = jtiDe(inicial.refreshToken) as string
    const rodado = exigePar(
      await emTransacaoCommitada((db) => comGracaPadrao.renova(db, inicial.refreshToken)),
    )

    await envelheceOConsumo(jtiInicial, 60)

    await expect(
      emTransacaoCommitada((db) => comGracaPadrao.renova(db, inicial.refreshToken)),
    ).resolves.toBeNull()

    // Request novo: se a revogação tivesse sido desfeita, apareceria aqui.
    await emTransacaoCommitada(async (db) => {
      const linhas = await familia(db, jtiInicial)
      expect(linhas).toHaveLength(2)
      // A família inteira, não só a linha reusada: revogar só ela deixaria o
      // ladrão que rotacionou primeiro seguindo com o sucessor dele.
      expect(linhas.every((l) => l.revogadaEm !== null)).toBe(true)
    })

    // E o sucessor legítimo morre junto — é o "força login" do ADR-0008.
    await expect(
      emTransacaoCommitada((db) => comGracaPadrao.renova(db, rodado.refreshToken)),
    ).resolves.toBeNull()
  })

  it('respeita a janela configurada — com graça zero, qualquer reuso é vazamento', async () => {
    const semGraca = criaServicoDeAuth(tokens, { gracaSegundos: 0 })

    const inicial = await emTransacaoCommitada((db) => semGraca.registra(db, registro()))
    const jtiInicial = jtiDe(inicial.refreshToken) as string
    await emTransacaoCommitada((db) => semGraca.renova(db, inicial.refreshToken))

    await envelheceOConsumo(jtiInicial, 1)

    await expect(
      emTransacaoCommitada((db) => semGraca.renova(db, inicial.refreshToken)),
    ).resolves.toBeNull()

    await emTransacaoCommitada(async (db) => {
      const linhas = await familia(db, jtiInicial)
      expect(linhas.every((l) => l.revogadaEm !== null)).toBe(true)
    })
  })
})

describe('concorrência', () => {
  it('dois requests paralelos com o mesmo refresh não deslogam ninguém', async () => {
    // DoD do Épico 1. Precisa de commit e de duas conexões de verdade: dentro
    // de uma transação só, o `FOR UPDATE` concederia o lock a si mesmo e a
    // corrida não existiria.
    const inicial = await emTransacaoCommitada((db) => comGraca.registra(db, registro()))

    const t1 = await abreTransacao()
    const t2 = await abreTransacao()

    let a: ParDeTokens | null = null
    let b: ParDeTokens | null = null
    try {
      ;[a, b] = await Promise.all([
        comGraca.renova(t1.db, inicial.refreshToken).then(async (par) => {
          await t1.commit()
          return par
        }),
        comGraca.renova(t2.db, inicial.refreshToken).then(async (par) => {
          await t2.commit()
          return par
        }),
      ])
    } finally {
      await t1.descarta()
      await t2.descarta()
    }

    // Um rotacionou e o outro caiu na graça: o mesmo sucessor para os dois.
    // Sem o `FOR UPDATE`, ambos leriam `consumida_em` nulo, ambos rotacionariam
    // e esta igualdade cairia — é a asserção que torna o lock cobrável.
    expect(jtiDe(exigePar(a).refreshToken)).toBe(jtiDe(exigePar(b).refreshToken))

    await emTransacaoCommitada(async (db) => {
      const linhas = await familia(db, jtiDe(inicial.refreshToken) as string)
      expect(linhas).toHaveLength(2)
      expect(linhas.every((l) => l.revogadaEm === null)).toBe(true)

      // E a sessão continua viva depois da corrida.
      await expect(comGraca.renova(db, exigePar(a).refreshToken)).resolves.not.toBeNull()
    })
  })
})
