import { config } from '../config.js'
import { criaServicoDeAuth } from './servico.js'
import { criaTokens } from './tokens.js'

/**
 * As instâncias que o processo inteiro compartilha.
 *
 * `criaTokens` é fábrica para o teste conseguir assinar com segredo de
 * brinquedo (ver `tokens.ts`), mas em runtime existe UMA — e ela precisa ser a
 * mesma nas rotas de `/api/auth` e no hook que valida o access token das rotas
 * autenticadas. Duas instâncias com o mesmo segredo funcionariam por acidente;
 * o dia em que o segredo virar rotação de chaves, não.
 */
export const tokens = criaTokens({
  segredo: config.JWT_SECRET,
  ttlAcessoSegundos: config.ACCESS_TTL_SEGUNDOS,
  ttlRefreshDias: config.REFRESH_TTL_DIAS,
})

export const auth = criaServicoDeAuth(tokens, {
  gracaSegundos: config.REFRESH_GRACA_SEGUNDOS,
})
