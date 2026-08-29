import { describe, expect, it } from 'vitest'
import { criaSessao, type ArmazenamentoRefresh } from '../../sessao/sessao'
import { criaRequisita, ErroDaApi } from '../nucleo'

const BASE = 'http://api.teste'

function criaArmazenamentoFalso(inicial: string | null = null) {
  const cofre: ArmazenamentoRefresh & { token: string | null } = {
    token: inicial,
    async le() {
      return cofre.token
    },
    async grava(token) {
      cofre.token = token
    },
    async apaga() {
      cofre.token = null
    },
  }
  return cofre
}

function respostaJson(status: number, corpo: unknown): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * Palco padrão dos cenários: sessão viva com access já vencido no servidor.
 * `respondeRefresh` e `respondeRecurso` parametrizam cada teste; os contadores
 * são o que prova a intenção (uma chamada de refresh, um retry só).
 */
async function montaCenario(opcoes: {
  respondeRefresh: (chamada: number) => Response | Promise<Response>
  respondeRecurso: (accessToken: string | null, chamada: number) => Response | Promise<Response>
}) {
  const cofre = criaArmazenamentoFalso()
  const sessao = criaSessao(cofre)
  await sessao.guardaTokens({ accessToken: 'access-vencido', refreshToken: 'refresh-antigo' })

  let expirou = 0
  sessao.aoExpirar(() => {
    expirou += 1
  })

  const contadores = { refresh: 0, recurso: 0 }

  const fetchFalso: typeof fetch = async (entrada, init) => {
    const url = String(entrada)
    if (url === `${BASE}/api/auth/refresh`) {
      contadores.refresh += 1
      return opcoes.respondeRefresh(contadores.refresh)
    }
    contadores.recurso += 1
    const auth = new Headers(init?.headers).get('authorization')
    const accessToken = auth?.startsWith('Bearer ') ? auth.slice('Bearer '.length) : null
    return opcoes.respondeRecurso(accessToken, contadores.recurso)
  }

  const requisita = criaRequisita({ baseUrl: BASE, sessao, fetchFn: fetchFalso })
  return { requisita, sessao, cofre, contadores, expirouVezes: () => expirou }
}

const valida = (dado: unknown) => dado as { ok: boolean }

describe('interceptor de sessão do cliente', () => {
  it('401 → refresh → repete a request UMA vez com o access rotacionado', async () => {
    const cenario = await montaCenario({
      respondeRefresh: () =>
        respostaJson(200, { accessToken: 'access-novo', refreshToken: 'refresh-novo' }),
      respondeRecurso: (accessToken) =>
        accessToken === 'access-novo'
          ? respostaJson(200, { ok: true })
          : respostaJson(401, { codigo: 'TOKEN_VENCIDO', mensagem: 'access expirou' }),
    })

    const resultado = await cenario.requisita('/api/recurso', { valida })

    expect(resultado).toEqual({ ok: true })
    expect(cenario.contadores.refresh).toBe(1)
    // original (401) + retry (200): nada além de UMA repetição.
    expect(cenario.contadores.recurso).toBe(2)
    // Rotação completa: par novo em memória e no cofre, nenhum evento emitido.
    expect(cenario.sessao.leAccessToken()).toBe('access-novo')
    expect(cenario.cofre.token).toBe('refresh-novo')
    expect(cenario.expirouVezes()).toBe(0)
  })

  it('refresh que falha limpa a sessão, emite o evento e não re-tenta', async () => {
    const cenario = await montaCenario({
      // Refresh revogado/reusado: o servidor nega (ADR-0008).
      respondeRefresh: () => respostaJson(401, { codigo: 'REFRESH_INVALIDO', mensagem: 'revogado' }),
      respondeRecurso: () => respostaJson(401, { codigo: 'TOKEN_VENCIDO', mensagem: 'expirou' }),
    })

    await expect(cenario.requisita('/api/recurso', { valida })).rejects.toMatchObject({
      status: 401,
      codigo: 'SESSAO_EXPIRADA',
    })

    expect(cenario.expirouVezes()).toBe(1)
    expect(cenario.sessao.leAccessToken()).toBeNull()
    expect(cenario.cofre.token).toBeNull()
    // Sem loop: uma tentativa de refresh, uma request original, zero retry.
    expect(cenario.contadores.refresh).toBe(1)
    expect(cenario.contadores.recurso).toBe(1)
  })

  it('segundo 401 mesmo após refresh derruba a sessão em vez de entrar em loop', async () => {
    const cenario = await montaCenario({
      respondeRefresh: () =>
        respostaJson(200, { accessToken: 'access-novo', refreshToken: 'refresh-novo' }),
      // O recurso nega sempre: o problema não é expiração de token.
      respondeRecurso: () => respostaJson(401, { codigo: 'SEM_ACESSO', mensagem: 'negado' }),
    })

    await expect(cenario.requisita('/api/recurso', { valida })).rejects.toBeInstanceOf(ErroDaApi)

    expect(cenario.expirouVezes()).toBe(1)
    expect(cenario.contadores.refresh).toBe(1)
    // original + exatamente UMA repetição — e para.
    expect(cenario.contadores.recurso).toBe(2)
  })

  it('três requests paralelas com 401 compartilham UMA única chamada de refresh', async () => {
    // O refresh só responde depois que as TRÊS requests originais tomaram 401,
    // garantindo que a corrida que o single-flight resolve de fato aconteceu.
    let liberaRefresh!: () => void
    const todasTomaram401 = new Promise<void>((resolve) => {
      liberaRefresh = resolve
    })
    let negadas = 0

    const cenario = await montaCenario({
      respondeRefresh: async () => {
        await todasTomaram401
        return respostaJson(200, { accessToken: 'access-novo', refreshToken: 'refresh-novo' })
      },
      respondeRecurso: (accessToken) => {
        if (accessToken === 'access-novo') return respostaJson(200, { ok: true })
        negadas += 1
        if (negadas === 3) liberaRefresh()
        return respostaJson(401, { codigo: 'TOKEN_VENCIDO', mensagem: 'expirou' })
      },
    })

    const resultados = await Promise.all([
      cenario.requisita('/api/recurso', { valida }),
      cenario.requisita('/api/recurso', { valida }),
      cenario.requisita('/api/recurso', { valida }),
    ])

    expect(resultados).toEqual([{ ok: true }, { ok: true }, { ok: true }])
    // O ponto da story: N corridas, UM refresh (contraparte da janela de
    // graça do ADR-0008 — dois refreshes paralelos seriam lidos como reuso).
    expect(cenario.contadores.refresh).toBe(1)
    // 3 originais (401) + 3 repetições (200).
    expect(cenario.contadores.recurso).toBe(6)
    expect(cenario.expirouVezes()).toBe(0)
  })
})
