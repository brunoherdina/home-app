import { randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import type { Login, ParDeTokens, Registro } from '@casa/contracts'
import type { CasaDb } from '../plugins/withUser.js'
import { moradores, sessoes } from '../db/schema.js'
import { CredencialInvalidaError, ErroHttp, SessaoInvalidaError } from '../erros.js'
import { conferaSenha, geraHash } from './senha.js'
import type { Tokens } from './tokens.js'

/**
 * O domínio de auth. Recebe o `db` da transação (`semIdentidade`) em vez de
 * importar o pool: é o que mantém a rota fora do pool cru e o serviço testável.
 */
export function criaServicoDeAuth(tokens: Tokens) {
  /**
   * Abre uma família de sessões e devolve o primeiro par (ADR-0008).
   *
   * A "sessão" do ponto de vista de quem usa o app é a FAMÍLIA, não a linha:
   * cada refresh gasto emite um sucessor que herda `familia_id`, e é a família
   * inteira que morre quando um vazamento é detectado (story 5).
   */
  async function abreFamilia(db: CasaDb, moradorId: string): Promise<ParDeTokens> {
    const refresh = await tokens.assinaRefresh(moradorId)

    await db.insert(sessoes).values({
      jti: refresh.jti,
      moradorId,
      familiaId: randomUUID(),
      expiraEm: refresh.expiraEm,
    })

    const acesso = await tokens.assinaAcesso(moradorId)
    return {
      accessToken: acesso.token,
      refreshToken: refresh.token,
      expiraEmSegundos: acesso.expiraEmSegundos,
    }
  }

  /**
   * `POST /api/auth/register` — a conta nasce SEM casa.
   *
   * `casa_id` fica nulo de propósito (ADR-0012): na Fase 0 a pessoa se cadastra
   * e só então cria a casa, e são dois passos de UI distintos. Quem preenche a
   * coluna é o fluxo de criar casa (story 6).
   */
  async function registra(db: CasaDb, dados: Registro): Promise<ParDeTokens> {
    const hashSenha = await geraHash(dados.senha)

    let moradorId: string
    try {
      // SQL explícito, e não `db.insert(moradores).values(...)`: o construtor do
      // drizzle escreve a lista de colunas COMPLETA, preenchendo com `default` o
      // que não foi informado — e o Postgres exige privilégio de INSERT em toda
      // coluna listada, mesmo naquelas cujo valor é `default`. Com a lista
      // completa, o register só funcionaria se `casa_auth` pudesse inserir
      // `casa_id`, `google_sub` e `email_verificado_em` também. Preferimos o
      // GRANT estreito (migration 0002) à conveniência do construtor: quem
      // define o raio do auth é o privilégio, não o gerador de query.
      const { rows } = await db.execute<{ id: string }>(sql`
        insert into ${moradores} ("apelido", "cor", "email", "hash_senha")
        values (${dados.apelido}, ${dados.cor}, ${dados.email}, ${hashSenha})
        returning "id"
      `)

      const criado = rows[0]
      if (!criado) throw new Error('insert de morador não devolveu id')
      moradorId = criado.id
    } catch (erro) {
      // Quem decide se o e-mail já existe é o índice único, não um SELECT
      // prévio: entre a checagem e o insert cabe outro registro, e a corrida
      // devolveria 500 em vez de conflito. O contracts (ADR-0009) valida FORMA;
      // unicidade é do banco.
      //
      // Assumido: responder 409 confirma que aquele e-mail tem conta aqui. O
      // silêncio ("enviamos um e-mail se a conta não existir") é mais discreto
      // e exige transporte de e-mail, que só chega no Épico 0b — até lá seria
      // um cadastro que trava sem explicar por quê. O rate limit da rota é o
      // que impede enumerar a lista inteira.
      if (ehViolacaoDeUnicidade(erro)) {
        throw new ErroHttp(409, 'EMAIL_EM_USO', 'Esse e-mail já tem conta no Casa.')
      }
      // Não repassa o erro do driver: a mensagem do drizzle embute os `params`
      // da query, e neste insert um deles é o hash argon2 da senha. Isso iria
      // parar no log da API — credencial em log, ainda que derivada, é
      // exatamente o que a redação do logger existe para evitar. `code` e
      // `constraint` bastam para diagnosticar.
      const { code, constraint } = (erro ?? {}) as { code?: string; constraint?: string }
      throw new Error(`falha ao inserir morador (code=${code ?? '?'} constraint=${constraint ?? '?'})`)
    }

    return abreFamilia(db, moradorId)
  }

  /** `POST /api/auth/login`. */
  async function autentica(db: CasaDb, dados: Login): Promise<ParDeTokens> {
    // Projeção explícita, e não `select()`: o `casa_auth` só tem GRANT nas
    // colunas de credencial, e um select de tabela inteira quebraria em
    // permissão — o grant por coluna da migration 0001 é o que impede o auth de
    // ler apelido, cor e casa dos moradores.
    const [morador] = await db
      .select({ id: moradores.id, hashSenha: moradores.hashSenha })
      .from(moradores)
      .where(eq(moradores.email, dados.email))
      .limit(1)

    // `conferaSenha` gasta um argon2 mesmo com hash nulo (e-mail inexistente ou
    // conta social): sem isso, o tempo de resposta diz quem tem conta.
    const confere = await conferaSenha(dados.senha, morador?.hashSenha ?? null)
    if (!morador || !confere) throw new CredencialInvalidaError()

    return abreFamilia(db, morador.id)
  }

  /**
   * `POST /api/auth/refresh` — rotação simples.
   *
   * Story 4 entrega a rotação; **detecção de reuso e janela de graça são a
   * story 5**. Hoje um refresh já consumido é recusado direto, o que é seguro
   * porém rude: dois requests paralelos do app com o mesmo refresh derrubam a
   * sessão. É exatamente esse buraco que a janela de graça fecha — o
   * single-flight do cliente (`lib/api/nucleo.ts`) reduz a chance, mas não é
   * garantia, e servidor não terceiriza invariante para cliente.
   */
  async function renova(db: CasaDb, refreshToken: string): Promise<ParDeTokens> {
    const cracha = await tokens.verificaRefresh(refreshToken)

    // FOR UPDATE serializa duas rotações concorrentes do MESMO refresh: sem o
    // lock, as duas leem `consumida_em` nulo e ambas rotacionam, e a família
    // ganha dois ramos vivos — um deles invisível para a detecção de reuso.
    const [sessao] = await db
      .select({
        jti: sessoes.jti,
        moradorId: sessoes.moradorId,
        familiaId: sessoes.familiaId,
        consumidaEm: sessoes.consumidaEm,
        revogadaEm: sessoes.revogadaEm,
        expiraEm: sessoes.expiraEm,
      })
      .from(sessoes)
      .where(and(eq(sessoes.jti, cracha.jti), eq(sessoes.moradorId, cracha.moradorId)))
      .limit(1)
      .for('update')

    const agora = new Date()
    if (!sessao) throw new SessaoInvalidaError()
    if (sessao.revogadaEm !== null) throw new SessaoInvalidaError()
    if (sessao.expiraEm <= agora) throw new SessaoInvalidaError()
    // TODO(story 5): aqui entram a detecção de reuso (revogar a família) e a
    // janela de graça (~30 s devolvendo o par sucessor por `substituida_por`).
    if (sessao.consumidaEm !== null) throw new SessaoInvalidaError()

    const sucessor = await tokens.assinaRefresh(sessao.moradorId)

    // Sucessor primeiro: `substituida_por` referencia `sessoes.jti`, então a
    // linha nova precisa existir antes de a antiga apontar para ela.
    await db.insert(sessoes).values({
      jti: sucessor.jti,
      moradorId: sessao.moradorId,
      familiaId: sessao.familiaId,
      expiraEm: sucessor.expiraEm,
    })

    await db
      .update(sessoes)
      .set({ consumidaEm: agora, substituidaPor: sucessor.jti })
      .where(eq(sessoes.jti, sessao.jti))

    const acesso = await tokens.assinaAcesso(sessao.moradorId)
    return {
      accessToken: acesso.token,
      refreshToken: sucessor.token,
      expiraEmSegundos: acesso.expiraEmSegundos,
    }
  }

  return { registra, autentica, renova }
}

export type ServicoDeAuth = ReturnType<typeof criaServicoDeAuth>

/**
 * `23505` = unique_violation. O drizzle pode entregar o erro do pg cru ou
 * embrulhado, por isso os dois níveis.
 */
function ehViolacaoDeUnicidade(erro: unknown): boolean {
  const codigo = (erro as { code?: unknown })?.code
  if (codigo === '23505') return true
  const causa = (erro as { cause?: { code?: unknown } })?.cause
  return causa?.code === '23505'
}
