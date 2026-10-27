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

/**
 * Sair da conta neste aparelho.
 *
 * Duas coisas, e só a primeira pode falhar: avisar o servidor (que revoga a
 * família do refresh — ADR-0008) e apagar o cofre local. A ordem importa: o
 * servidor precisa do refresh que só existe enquanto o cofre não foi limpo.
 *
 * O `finally` é o desenho, não descuido. Quem pediu para sair sai — sempre. Se
 * a revogação não acontecer (sem rede, API fora, cofre ilegível), o refresh
 * segue válido no servidor até vencer, e isso é o menos ruim dos dois: recusar
 * o logout por falta de sinal deixa a pessoa presa numa conta no aparelho, e a
 * saída dela vira desinstalar o app — que não revoga nada também.
 *
 * O erro é engolido porque não há o que a tela faça com ele. Uma faixa
 * "não deu para sair" depois de a sessão local já ter sumido só contradiz o que
 * a pessoa está vendo.
 */
export async function sai(): Promise<void> {
  try {
    const refreshToken = await sessao.leRefreshToken()
    if (refreshToken) {
      await requisita('/api/auth/logout', {
        method: 'POST',
        body: JSON.stringify({ refreshToken }),
        // 204 sem corpo: `requisita` entrega `null` e não há contrato a checar.
        valida: () => undefined,
      })
    }
  } catch {
    // Revogação é melhor-esforço; a limpeza local não é.
  } finally {
    // `encerra` e não `expira`: ninguém precisa ser avisado de que a sessão
    // morreu — foi a própria pessoa que pediu, e quem chamou já vai navegar.
    await sessao.encerra()
  }
}
