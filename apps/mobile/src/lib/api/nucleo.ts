/**
 * Núcleo do cliente HTTP — lógica pura, sem nenhum import de expo-*.
 *
 * A separação existe para o interceptor de sessão rodar em teste Node
 * (vitest) sem mock pesado de Expo: baseUrl, fetch e sessão chegam injetados.
 * cliente.ts é o fio fino que liga isto ao runtime do app.
 */
import type { SessaoDoCliente } from '../sessao/sessao'
import { validaRespostaRefresh } from './contratos-auth'

export class ErroDaApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
  ) {
    super(mensagem)
  }
}

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

  async function executaRefresh(): Promise<boolean> {
    const refreshToken = await sessao.leRefreshToken()
    if (!refreshToken) {
      // Sem refresh guardado não há o que renovar — a sessão, se existia, acabou.
      await sessao.expira()
      return false
    }
    try {
      const resposta = await fetchFn(`${baseUrl}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      })
      if (!resposta.ok) {
        await sessao.expira()
        return false
      }
      // Rotação (ADR-0008): o par novo substitui o antigo imediatamente —
      // reapresentar o refresh consumido dispararia a detecção de reuso.
      await sessao.guardaTokens(validaRespostaRefresh(await resposta.json()))
      return true
    } catch {
      // Rede ou corpo fora do contrato: derruba a sessão em vez de re-tentar
      // aqui — a story 9 decide na UI o que oferecer (novo login, retry).
      await sessao.expira()
      return false
    }
  }

  return async function requisita<T>(
    caminho: string,
    opcoes: RequestInit & { valida: (dado: unknown) => T },
  ): Promise<T> {
    const { valida, ...init } = opcoes
    let resposta = await executa(caminho, init)

    if (resposta.status === 401) {
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
