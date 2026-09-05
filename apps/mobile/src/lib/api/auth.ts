import { parDeTokensSchema, type Login, type Registro } from '@casa/contracts'
import { sessao } from '../sessao'
import { requisita } from './cliente'

/**
 * "A sessão está viva?" no cache — respondida no boot por `restauraSessao` e
 * escrita à mão por `registra`/`entra`, que acabaram de criar uma.
 *
 * Sem essa escrita, voltar ao boot depois do login faria a restauração rodar
 * sobre um refresh recém-emitido: gasto de token à toa e, pior, um segundo
 * refresh em voo — o padrão que o ADR-0008 lê como reuso.
 */
export const chaveDaSessao = ['sessao'] as const

/**
 * As duas portas de entrada da Fase 0.
 *
 * Nenhuma das duas DEVOLVE o par de tokens, de propósito: quem guarda
 * credencial é a sessão (ADR-0008 — access em memória, refresh no secure
 * store), e uma tela que recebesse o par na mão acabaria guardando uma cópia em
 * estado de componente. O retorno é `void` porque o efeito é a sessão existir.
 *
 * O corpo enviado é a SAÍDA do schema compartilhado — o resolver do React Hook
 * Form já normalizou (e-mail em minúsculas, apelido sem espaço nas pontas)
 * antes de chegar aqui, e a API valida o mesmo schema de novo (ADR-0009).
 */
export async function registra(dados: Registro): Promise<void> {
  const par = await requisita('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(dados),
    valida: (dado) => parDeTokensSchema.parse(dado),
  })
  await sessao.guardaTokens(par)
}

export async function entra(dados: Login): Promise<void> {
  const par = await requisita('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(dados),
    valida: (dado) => parDeTokensSchema.parse(dado),
  })
  await sessao.guardaTokens(par)
}
