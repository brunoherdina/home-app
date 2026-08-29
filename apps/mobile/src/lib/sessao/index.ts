/**
 * Instância única da sessão do app, já ligada ao secure store.
 *
 * O app importa daqui; os testes importam ./sessao direto — a lógica pura não
 * conhece Expo, então roda em Node sem mock.
 */
import { armazenamentoSeguro } from './armazenamento-expo'
import { criaSessao } from './sessao'

export const sessao = criaSessao(armazenamentoSeguro)
export type { ParDeTokens, Sessao } from './sessao'
