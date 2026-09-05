/**
 * Núcleo do cliente HTTP — lógica pura, sem nenhum import de expo-*.
 *
 * A separação existe para o interceptor de sessão rodar em teste Node
 * (vitest) sem mock pesado de Expo: baseUrl, fetch e sessão chegam injetados.
 * cliente.ts é o fio fino que liga isto ao runtime do app.
 */
import { parDeTokensSchema } from '@casa/contracts'
import type { SessaoDoCliente } from '../sessao/sessao'

export class ErroDaApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
  ) {
    super(mensagem)
  }
}

/**
 * Falha que NÃO é o servidor negando a credencial: rede fora, timeout, 5xx.
 * Ganha código próprio porque a UI (story 9) decide coisas opostas a partir
 * dele — "tente de novo" aqui, "entre de novo" no SESSAO_EXPIRADA.
 * `status: 0` = a request nem chegou a ter resposta.
 */
function erroTransitorio(status: number) {
  return new ErroDaApi(
    status,
    'SEM_CONEXAO',
    'Não foi possível falar com o servidor agora. Tente de novo.',
  )
}

/**
 * Rotas públicas de auth, isentas do interceptor: 401 nelas é **resposta**,
 * não sessão vencida.
 *
 * `/api/auth/login` devolve 401 de propósito para credencial inválida — sem a
 * isenção, errar a senha renovaria a sessão à toa e, se ela estivesse viva
 * (trocar de conta, criar conta já logado), o POST seria REPETIDO contra o
 * rate limit do próprio login. `refresh` é o endpoint da renovação: renovar
 * para renovar seria recursão.
 */
const SEM_RENOVACAO = /^\/api\/auth\/(login|register|refresh)\b/

export type OpcoesDoNucleo = {
  baseUrl: string
  sessao: SessaoDoCliente
  /** Injetável para teste; no app é o fetch global do React Native. */
  fetchFn?: typeof fetch
}

export type Requisita = <T>(
  caminho: string,
  opcoes: RequestInit & { valida: (dado: unknown) => T },
) => Promise<T>

export function criaRequisita({ baseUrl, sessao, fetchFn = fetch }: OpcoesDoNucleo): Requisita {
  let refreshEmVoo: Promise<boolean> | null = null

  /** Toda request sai com o access da memória — se houver um (ADR-0008). */
  function executa(caminho: string, init: RequestInit): Promise<Response> {
    const accessToken = sessao.leAccessToken()
    return fetchFn(`${baseUrl}${caminho}`, {
      ...init,
      headers: {
        'content-type': 'application/json',
        ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
        ...init.headers,
      },
    })
  }

  /**
   * Single-flight: N requests paralelas que tomaram 401 compartilham UMA
   * chamada de refresh. É a contraparte cliente da janela de graça do
   * ADR-0008 — com rotação a cada uso e detecção de reuso no servidor, dois
   * refreshes concorrentes com o mesmo token pareceriam vazamento e
   * revogariam a família inteira de tokens. O cliente evita provocar essa
   * corrida em vez de depender só da tolerância do servidor.
   */
  function renovaSessao(): Promise<boolean> {
    refreshEmVoo ??= executaRefresh().finally(() => {
      refreshEmVoo = null
    })
    return refreshEmVoo
  }

  /**
   * Devolve `true` se renovou, `false` se o servidor NEGOU a credencial —
   * e **lança** quando a renovação apenas não pôde acontecer agora — seja
   * porque a rede não foi, seja porque o cofre não pôde ser lido.
   *
   * A distinção é a regra central deste arquivo: `sessao.expira()` apaga o
   * refresh do secure store, e credencial apagada não volta. Só o servidor
   * pode declarar a credencial morta; rede ruim e API reiniciando, não. Sem
   * isso, o metrô sem sinal ou um 502 de 20 s do Caddy produziriam
   * exatamente o logout que o ADR-0008 existe para eliminar — e por queda de
   * rede, não pelos 7 dias que a ADR ataca.
   */
  async function executaRefresh(): Promise<boolean> {
    let refreshToken: string | null
    try {
      refreshToken = await sessao.leRefreshToken()
    } catch {
      // Cofre ilegível não é cofre vazio. O secure store falha por condição
      // passageira — Keychain `WHEN_UNLOCKED` com o device bloqueado, restore
      // de backup no Android — e nesses casos o refresh continua lá, válido.
      // Cair no ramo de ausência abaixo chamaria `expira()` →
      // `deleteItemAsync`, que funciona com o device bloqueado: a credencial
      // boa morreria por não ter sido lida, e não volta.
      throw erroTransitorio(0)
    }

    if (!refreshToken) {
      // Sem refresh guardado não há o que renovar — a sessão, se existia, acabou.
      await sessao.expira()
      return false
    }

    let resposta: Response
    try {
      resposta = await fetchFn(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })
    } catch {
      // Rede fora, DNS, timeout: ninguém negou nada. O cofre fica; o próximo
      // 401 tenta de novo.
      throw erroTransitorio(0)
    }

    // Negação explícita (refresh revogado, reusado ou expirado — ADR-0008):
    // é aqui, e só aqui, que a credencial é destruída.
    if (resposta.status === 401 || resposta.status === 403) {
      await sessao.expira()
      return false
    }

    // 500/502/503: a API está fora do ar, o refresh continua válido.
    if (!resposta.ok) throw erroTransitorio(resposta.status)

    // Rotação (ADR-0008): o par novo substitui o antigo imediatamente —
    // reapresentar o refresh consumido dispararia a detecção de reuso.
    // Corpo fora do contrato também não é negação: o erro sobe (como em
    // `valida` no fim de `requisita`) sem levar o cofre junto.
    await sessao.guardaTokens(parDeTokensSchema.parse(await resposta.json()))
    return true
  }

  return async function requisita<T>(
    caminho: string,
    opcoes: RequestInit & { valida: (dado: unknown) => T },
  ): Promise<T> {
    const { valida, ...init } = opcoes
    let resposta = await executa(caminho, init)

    // A isenção precisa vir antes do bloco: `requisita` é o único ponto de
    // saída HTTP do app, então login e register da story 9 passam por aqui
    // obrigatoriamente — e o 401 deles é a resposta esperada.
    if (resposta.status === 401 && !SEM_RENOVACAO.test(caminho)) {
      if (!(await renovaSessao())) {
        // renovaSessao já limpou a sessão e emitiu o evento de expiração.
        throw new ErroDaApi(401, 'SESSAO_EXPIRADA', 'A sessão expirou. Entre de novo.')
      }
      // Repete UMA única vez, com o access recém-rotacionado. Um segundo 401
      // significa que o problema não é expiração — desistir evita loop de refresh.
      resposta = await executa(caminho, init)
      if (resposta.status === 401) {
        await sessao.expira()
        throw new ErroDaApi(401, 'SESSAO_EXPIRADA', 'A sessão expirou. Entre de novo.')
      }
    }

    const corpo: unknown = await resposta.json().catch(() => null)

    if (!resposta.ok) {
      const erro = corpo as { codigo?: string; mensagem?: string } | null
      throw new ErroDaApi(
        resposta.status,
        erro?.codigo ?? 'ERRO_DESCONHECIDO',
        erro?.mensagem ?? 'A API respondeu com erro.',
      )
    }

    // Valida a resposta com o mesmo schema zod que a API usou para produzi-la
    // (ADR-0009). Contrato quebrado aparece aqui, não três telas adiante.
    return valida(corpo)
  }
}
