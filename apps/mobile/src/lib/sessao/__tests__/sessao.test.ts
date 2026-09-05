import { describe, expect, it } from 'vitest'
import { criaSessao, type ArmazenamentoRefresh } from '../sessao'

/** Cofre em memória: o suficiente para provar a lógica sem tocar em Expo. */
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

describe('sessão', () => {
  it('guarda o access em memória e o refresh no cofre (ADR-0008)', async () => {
    const cofre = criaArmazenamentoFalso()
    const sessao = criaSessao(cofre)

    await sessao.guardaTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' })

    expect(sessao.leAccessToken()).toBe('access-1')
    expect(cofre.token).toBe('refresh-1')
    expect(await sessao.leRefreshToken()).toBe('refresh-1')
  })

  it('encerrar (logout deliberado) limpa tudo sem emitir o evento', async () => {
    const sessao = criaSessao(criaArmazenamentoFalso('refresh-1'))
    let avisos = 0
    sessao.aoExpirar(() => {
      avisos += 1
    })

    await sessao.guardaTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' })
    await sessao.encerra()

    expect(sessao.leAccessToken()).toBeNull()
    expect(await sessao.leRefreshToken()).toBeNull()
    expect(avisos).toBe(0)
  })

  it('expirar limpa tudo e avisa os assinantes; cancelar a assinatura para os avisos', async () => {
    const sessao = criaSessao(criaArmazenamentoFalso('refresh-1'))
    let avisos = 0
    const cancela = sessao.aoExpirar(() => {
      avisos += 1
    })

    await sessao.guardaTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' })
    await sessao.expira()

    expect(sessao.leAccessToken()).toBeNull()
    expect(await sessao.leRefreshToken()).toBeNull()
    expect(avisos).toBe(1)

    cancela()
    await sessao.expira()
    expect(avisos).toBe(1)
  })
})
