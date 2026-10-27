import { describe, expect, it } from 'vitest'
import { decodeJwt } from 'jose'
import { criaTokens } from './tokens.js'
import { SessaoInvalidaError } from '../erros.js'

const MORADOR = '6a3f3b3c-0d1e-4f2a-9b8c-7d6e5f4a3b2c'
const SEGREDO = 'segredo-de-teste-com-mais-de-32-caracteres'

const tokens = criaTokens({ segredo: SEGREDO, ttlAcessoSegundos: 900, ttlRefreshDias: 60 })

describe('refresh', () => {
  it('devolve quem é e qual linha de sessoes ele é', async () => {
    const assinado = await tokens.assinaRefresh(MORADOR)
    const cracha = await tokens.verificaRefresh(assinado.token)

    expect(cracha.moradorId).toBe(MORADOR)
    // O jti é a chave da linha em `sessoes` — sem ele o servidor não tem o que
    // consumir na rotação.
    expect(cracha.jti).toBe(assinado.jti)
  })

  it('recusa um access token — o `tipo` é o que separa os dois', async () => {
    // O ataque que isto fecha: o access viaja em todo header Authorization e
    // aparece em log de proxy, enquanto o refresh só sai do SecureStore. Sem o
    // claim `tipo`, os dois são JWT do mesmo segredo e o access de um log
    // vazado abriria uma família de sessões nova em /api/auth/refresh.
    const acesso = await tokens.assinaAcesso(MORADOR)

    await expect(tokens.verificaRefresh(acesso.token)).rejects.toBeInstanceOf(SessaoInvalidaError)
  })

  it('recusa token assinado com outro segredo', async () => {
    const outro = criaTokens({
      segredo: 'outro-segredo-igualmente-longo-para-hs256',
      ttlAcessoSegundos: 900,
      ttlRefreshDias: 60,
    })
    const alheio = await outro.assinaRefresh(MORADOR)

    await expect(tokens.verificaRefresh(alheio.token)).rejects.toBeInstanceOf(SessaoInvalidaError)
  })

  it('recusa token expirado', async () => {
    // TTL negativo: quem valida o valor é o zod do `config`, não a fábrica —
    // por isso o teste consegue produzir um token nascido vencido em vez de
    // esperar 60 dias.
    const vencido = criaTokens({ segredo: SEGREDO, ttlAcessoSegundos: 900, ttlRefreshDias: -1 })
    const assinado = await vencido.assinaRefresh(MORADOR)

    await expect(tokens.verificaRefresh(assinado.token)).rejects.toBeInstanceOf(SessaoInvalidaError)
  })

  it('recusa payload adulterado', async () => {
    const assinado = await tokens.assinaRefresh(MORADOR)
    const [cabecalho, , assinatura] = assinado.token.split('.')
    const outroSub = Buffer.from(
      JSON.stringify({ sub: '00000000-0000-4000-8000-000000000000', tipo: 'refresh', jti: 'x' }),
    ).toString('base64url')

    await expect(
      tokens.verificaRefresh(`${cabecalho}.${outroSub}.${assinatura}`),
    ).rejects.toBeInstanceOf(SessaoInvalidaError)
  })

  it('faz o exp do token bater com o expiraEm gravado em sessoes', async () => {
    // Os dois prazos vivem em lugares diferentes — JWT e coluna — e quem os
    // desalinha cria uma janela em que um lado aceita e o outro não.
    const assinado = await tokens.assinaRefresh(MORADOR)
    const { exp } = decodeJwt(assinado.token)

    expect(exp).toBe(Math.floor(assinado.expiraEm.getTime() / 1000))
  })
})

describe('access', () => {
  it('anuncia a própria vida em segundos, para o cliente renovar antes do 401', async () => {
    const acesso = await tokens.assinaAcesso(MORADOR)
    const { exp, iat } = decodeJwt(acesso.token)

    expect(acesso.expiraEmSegundos).toBe(900)
    expect(exp! - iat!).toBe(900)
  })

  it('dá um jti novo a cada assinatura — é a chave da blocklist do logout', async () => {
    const [a, b] = await Promise.all([tokens.assinaAcesso(MORADOR), tokens.assinaAcesso(MORADOR)])

    expect(a.jti).not.toBe(b.jti)
  })
})
