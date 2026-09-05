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
 * Par que a API devolve de verdade em `/api/auth/refresh` — os três campos de
 * `parDeTokensSchema`, `expiraEmSegundos` inclusive. O núcleo valida a resposta
 * com o schema compartilhado (ADR-0009), então um fixture com dois campos
 * passaria no teste e quebraria contra a API real.
 */
const PAR_NOVO = {
  accessToken: 'access-novo',
  refreshToken: 'refresh-novo',
  expiraEmSegundos: 900,
}

/**
 * Palco padrão dos cenários: sessão viva com access já vencido no servidor.
 * `respondeRefresh` e `respondeRecurso` parametrizam cada teste; os contadores
 * são o que prova a intenção (uma chamada de refresh, um retry só).
 */
async function montaCenario(opcoes: {
  respondeRefresh: (chamada: number) => Response | Promise<Response>
  respondeRecurso: (accessToken: string | null, chamada: number) => Response | Promise<Response>
  /** Cofre alternativo, para os cenários em que a leitura do secure store falha. */
  cofre?: ArmazenamentoRefresh & { token: string | null }
}) {
  const cofre = opcoes.cofre ?? criaArmazenamentoFalso()
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
        respostaJson(200, PAR_NOVO),
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
        respostaJson(200, PAR_NOVO),
      // O recurso nega sempre: o problema não é expiração de token.
      respondeRecurso: () => respostaJson(401, { codigo: 'SEM_ACESSO', mensagem: 'negado' }),
    })

    await expect(cenario.requisita('/api/recurso', { valida })).rejects.toBeInstanceOf(ErroDaApi)

    expect(cenario.expirouVezes()).toBe(1)
    expect(cenario.contadores.refresh).toBe(1)
    // original + exatamente UMA repetição — e para.
    expect(cenario.contadores.recurso).toBe(2)
  })

  /**
   * Falha do refresh que NÃO é negação não pode custar a credencial.
   * `sessao.expira()` chama `SecureStore.deleteItemAsync`: apagou, acabou —
   * a pessoa digita a senha de novo. Um 502 do Caddy ou o metrô sem sinal
   * viraria o logout que o ADR-0008 foi escrito para eliminar, e por queda
   * de rede em vez dos 7 dias que a ADR ataca.
   */
  describe('falha transitória do refresh preserva a credencial', () => {
    it('API fora do ar (503): a sessão sobrevive e o próximo 401 tenta de novo', async () => {
      const cenario = await montaCenario({
        respondeRefresh: (chamada) =>
          chamada === 1
            ? respostaJson(503, {})
            : respostaJson(200, PAR_NOVO),
        respondeRecurso: (accessToken) =>
          accessToken === 'access-novo'
            ? respostaJson(200, { ok: true })
            : respostaJson(401, { codigo: 'TOKEN_VENCIDO', mensagem: 'expirou' }),
      })

      // A request falha — mas com "tente de novo", não com "entre de novo".
      await expect(cenario.requisita('/api/recurso', { valida })).rejects.toMatchObject({
        status: 503,
        codigo: 'SEM_CONEXAO',
      })

      expect(cenario.cofre.token).toBe('refresh-antigo')
      expect(cenario.sessao.leAccessToken()).toBe('access-vencido')
      expect(cenario.expirouVezes()).toBe(0)
      expect(cenario.contadores.recurso).toBe(1)

      // O cofre intacto tem que valer alguma coisa: com a API de volta, a
      // mesma sessão renova sozinha, sem passar pela tela de login.
      await expect(cenario.requisita('/api/recurso', { valida })).resolves.toEqual({ ok: true })
      expect(cenario.contadores.refresh).toBe(2)
      expect(cenario.cofre.token).toBe('refresh-novo')
      expect(cenario.expirouVezes()).toBe(0)
    })

    it('rede caída: o cofre continua lá', async () => {
      const cenario = await montaCenario({
        respondeRefresh: () => Promise.reject(new TypeError('Network request failed')),
        respondeRecurso: () => respostaJson(401, { codigo: 'TOKEN_VENCIDO', mensagem: 'expirou' }),
      })

      // status 0: a request nem chegou a ter resposta — ninguém negou nada.
      await expect(cenario.requisita('/api/recurso', { valida })).rejects.toMatchObject({
        status: 0,
        codigo: 'SEM_CONEXAO',
      })

      expect(cenario.cofre.token).toBe('refresh-antigo')
      expect(cenario.expirouVezes()).toBe(0)
      expect(cenario.contadores.refresh).toBe(1)
    })
  })

  /**
   * A mesma regra uma camada abaixo: quem não pôde LER o cofre também não pode
   * declarar a credencial morta.
   *
   * O Keychain nasce `WHEN_UNLOCKED`: com o device bloqueado `getItemAsync`
   * lança, mas `deleteItemAsync` funciona. Se "não consegui ler" virar `null`,
   * o núcleo lê ausência, chama `expira()` e o refresh de 30–90 dias que ainda
   * valia é apagado — em silêncio, por uma condição que passa sozinha.
   */
  it('cofre ilegível não é cofre vazio: o refresh sobrevive e vale ao desbloquear', async () => {
    const cofre = criaArmazenamentoFalso()
    let bloqueado = true
    cofre.le = async () => {
      // O erro real do expo-secure-store quando o item existe mas não pode ser
      // decifrado agora (device bloqueado no iOS, restore de backup no Android).
      if (bloqueado) throw new Error('ERR_SECURESTORE_DECRYPT_ERROR')
      return cofre.token
    }

    const cenario = await montaCenario({
      cofre,
      respondeRefresh: () =>
        respostaJson(200, PAR_NOVO),
      respondeRecurso: (accessToken) =>
        accessToken === 'access-novo'
          ? respostaJson(200, { ok: true })
          : respostaJson(401, { codigo: 'TOKEN_VENCIDO', mensagem: 'expirou' }),
    })

    // Tela apagada, TanStack Query refazendo a query ao reconectar: a request
    // falha com "tente de novo", não com "entre de novo".
    await expect(cenario.requisita('/api/recurso', { valida })).rejects.toMatchObject({
      status: 0,
      codigo: 'SEM_CONEXAO',
    })

    expect(cenario.cofre.token).toBe('refresh-antigo')
    expect(cenario.expirouVezes()).toBe(0)
    // Nem chegou a apresentar o refresh: não havia o que apresentar.
    expect(cenario.contadores.refresh).toBe(0)

    // O que prova a intenção não é o erro certo — é o token continuar SERVINDO.
    // Device desbloqueado, a mesma sessão renova sozinha e a pessoa nunca viu
    // a tela de login (ADR-0008).
    bloqueado = false
    await expect(cenario.requisita('/api/recurso', { valida })).resolves.toEqual({ ok: true })
    expect(cenario.contadores.refresh).toBe(1)
    expect(cenario.cofre.token).toBe('refresh-novo')
    expect(cenario.expirouVezes()).toBe(0)
  })

  /**
   * `requisita` é o único ponto de saída HTTP do app (a guarda de camada
   * proíbe `fetch` fora de `lib/api`), então login e register passam por
   * aqui obrigatoriamente — e o 401 de `/api/auth/login` é credencial
   * inválida DE PROPÓSITO, não sessão vencida.
   */
  it.each(['/api/auth/login', '/api/auth/register'])(
    '401 em %s não renova, não repete o POST e não apaga o cofre',
    async (caminho) => {
      const cenario = await montaCenario({
        respondeRefresh: () =>
          respostaJson(200, PAR_NOVO),
        respondeRecurso: () =>
          respostaJson(401, {
            codigo: 'CREDENCIAL_INVALIDA',
            mensagem: 'E-mail ou senha não conferem.',
          }),
      })

      // O código real da API chega à tela — não trocado por SESSAO_EXPIRADA.
      await expect(cenario.requisita(caminho, { method: 'POST', valida })).rejects.toMatchObject({
        status: 401,
        codigo: 'CREDENCIAL_INVALIDA',
      })

      expect(cenario.contadores.refresh).toBe(0)
      // UMA tentativa: repetir queimaria o rate limit de /api/auth/login.
      expect(cenario.contadores.recurso).toBe(1)
      // Errar a senha com sessão viva (trocar de conta) não desloga ninguém.
      expect(cenario.expirouVezes()).toBe(0)
      expect(cenario.cofre.token).toBe('refresh-antigo')
    },
  )

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
        return respostaJson(200, PAR_NOVO)
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
