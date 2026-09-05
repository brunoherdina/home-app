import { randomUUID } from 'node:crypto'
import { and, eq, isNull, sql } from 'drizzle-orm'
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
export type OpcoesDeAuth = {
  /**
   * Tolerância para reuso de refresh recém-consumido (ADR-0008).
   *
   * Parâmetro e não constante porque é o eixo do trade-off desta story: janela
   * curta demais desloga quem tem rede ruim, longa demais dá ao ladrão um
   * intervalo em que o roubo passa por concorrência. Sendo argumento, o teste
   * consegue exercitar os dois lados sem relógio falso.
   */
  gracaSegundos: number
}

export function criaServicoDeAuth(tokens: Tokens, opcoes: OpcoesDeAuth) {
  const gracaMs = opcoes.gracaSegundos * 1000

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
   * Três desfechos para um refresh JÁ consumido, e a diferença entre eles é o
   * tempo desde o consumo (ADR-0008):
   *
   *   * dentro da graça, com sucessor usável → devolve o MESMO sucessor. É o
   *     caso benigno: dois requests do app dispararam com o mesmo refresh, e
   *     derrubar a sessão por isso seria punir a pessoa pela concorrência do
   *     próprio cliente. O single-flight de `lib/api/nucleo.ts` reduz a chance
   *     mas não é garantia — e servidor não terceiriza invariante para cliente.
   *   * fora da graça → é sinal de vazamento: o token legítimo já rodou faz
   *     tempo, então quem chega agora com ele tem uma cópia. Revoga a FAMÍLIA
   *     inteira e força login. Revogar só esta linha não adiantaria: o ladrão
   *     que rotacionou primeiro seguiria com o sucessor dele.
   *   * dentro da graça, sem sucessor usável → 401 sem revogar nada. A cadeia
   *     já andou além do sucessor; não dá para distinguir retentativa lenta de
   *     ataque, e a janela de graça é justamente a zona em que o servidor se
   *     recusa a decidir. Não premia (nada de token novo) nem pune (família
   *     intacta).
   *
   * Devolve `null` na recusa em vez de lançar, e isso é a correção de um bug
   * real: a revogação da família é um UPDATE dentro da MESMA transação do
   * `semIdentidade`, e uma exceção faz o plugin dar `ROLLBACK`. Lançando daqui,
   * o servidor detectava o vazamento, respondia 401 e desfazia a revogação —
   * o token roubado seguia valendo, e nem o teste de integração via, porque
   * lia a família antes do rollback. Recusar sem lançar deixa a transação
   * fechar em COMMIT; quem transforma `null` em 401 é a rota.
   */
  async function renova(db: CasaDb, refreshToken: string): Promise<ParDeTokens | null> {
    let cracha
    try {
      cracha = await tokens.verificaRefresh(refreshToken)
    } catch {
      // Assinatura, prazo ou `tipo` errados: nada foi escrito, e a recusa segue
      // o mesmo caminho das outras para a rota não ter dois contratos.
      return null
    }

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
        substituidaPor: sessoes.substituidaPor,
      })
      .from(sessoes)
      .where(and(eq(sessoes.jti, cracha.jti), eq(sessoes.moradorId, cracha.moradorId)))
      .limit(1)
      .for('update')

    const agora = new Date()
    if (!sessao) return null
    if (sessao.revogadaEm !== null) return null
    if (sessao.expiraEm <= agora) return null

    if (sessao.consumidaEm !== null) {
      const desdeOConsumo = agora.getTime() - sessao.consumidaEm.getTime()

      if (desdeOConsumo > gracaMs) {
        await revogaFamilia(db, sessao.familiaId, agora)
        return null
      }

      return sessao.substituidaPor
        ? await devolveSucessor(db, sessao.substituidaPor, agora)
        : null
    }

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

  /**
   * Mata a família inteira numa query só — é para isso que `familia_id` existe
   * em vez de uma cadeia caminhada elo a elo.
   *
   * Os access tokens já emitidos NÃO vão para `revoked_tokens`: o servidor não
   * sabe quais `jti` estão em circulação, e eles morrem sozinhos em ~15 min. A
   * blocklist do ADR-0003 serve ao logout, onde o `jti` chega no request.
   * Encurtar essa janela é o próprio motivo de o access ser curto.
   */
  async function revogaFamilia(db: CasaDb, familiaId: string, agora: Date): Promise<void> {
    await db
      .update(sessoes)
      .set({ revogadaEm: agora })
      .where(and(eq(sessoes.familiaId, familiaId), isNull(sessoes.revogadaEm)))
  }

  /**
   * Reemite o par do sucessor para o request que chegou dentro da janela de
   * graça. Devolve `null` quando o sucessor não serve mais — quem decide o que
   * fazer com isso é `renova`.
   *
   * Sem `FOR UPDATE` aqui de propósito: a linha antiga já está travada, e é por
   * ela que passa qualquer outra rotação desta cadeia. Travar a segunda abriria
   * espaço para dois locks em ordens diferentes, que é como nasce deadlock.
   */
  async function devolveSucessor(
    db: CasaDb,
    jtiSucessor: string,
    agora: Date,
  ): Promise<ParDeTokens | null> {
    const [sucessor] = await db
      .select({
        jti: sessoes.jti,
        moradorId: sessoes.moradorId,
        expiraEm: sessoes.expiraEm,
        consumidaEm: sessoes.consumidaEm,
        revogadaEm: sessoes.revogadaEm,
      })
      .from(sessoes)
      .where(eq(sessoes.jti, jtiSucessor))
      .limit(1)

    if (!sucessor) return null
    if (sucessor.revogadaEm !== null) return null
    if (sucessor.expiraEm <= agora) return null
    // Sucessor já gasto: a cadeia andou mais de um passo. Devolvê-lo seria
    // entregar um token morto, e devolver o sucessor DELE seria transformar a
    // graça numa escada que qualquer réplica sobe.
    if (sucessor.consumidaEm !== null) return null

    const refresh = await tokens.assinaRefreshDe(
      sucessor.moradorId,
      sucessor.jti,
      sucessor.expiraEm,
    )
    const acesso = await tokens.assinaAcesso(sucessor.moradorId)

    return {
      accessToken: acesso.token,
      refreshToken: refresh.token,
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
