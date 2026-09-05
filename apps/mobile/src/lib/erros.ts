import { ErroDaApi } from './api/nucleo'

/**
 * O texto que a pessoa lê quando uma ação falha.
 *
 * As mensagens do `erroSchema` já vêm prontas para humano e em português — o
 * app as repassa em vez de manter um dicionário paralelo de `codigo` → texto,
 * que envelheceria toda vez que a API ganhasse um código novo. A tela decide
 * pelo `codigo` só quando o texto não basta (e-mail em uso vira erro DE CAMPO,
 * não faixa no topo).
 *
 * O que não é `ErroDaApi` — bug de parse, contrato quebrado, exceção do
 * runtime — não é repassado: `error.message` de exceção interna não é
 * mensagem de produto e pode carregar detalhe que não deve aparecer na tela.
 */
export function mensagemDoErro(erro: unknown): string {
  if (erro instanceof ErroDaApi) return erro.message
  return 'Algo deu errado por aqui. Tente de novo.'
}
