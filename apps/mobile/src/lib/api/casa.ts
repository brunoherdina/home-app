import {
  casaPovoadaSchema,
  casaSchema,
  type Casa,
  type CasaPovoada,
  type CriarCasa,
} from '@casa/contracts'
import { ErroDaApi, requisita } from './cliente'

/** Chave única da casa no cache — a tela e o boot leem a MESMA entrada. */
export { chaveDaCasa } from './chaves'

/**
 * `null` = a conta existe e ainda não tem casa.
 *
 * Na rede isso é `404 SEM_CASA`, e está certo assim: o recurso não existe. No
 * cliente vira `null` porque, para o app, "ainda não criou a casa" é um ESTADO
 * esperado do boot — o ramo do criador da Fase 0 — e não uma falha. Deixá-lo
 * chegar como erro faria a tela ter de destrinchar `codigo` para saber se
 * mostra "tente de novo" ou o formulário de criar casa.
 *
 * Só o `SEM_CASA` é traduzido. Qualquer outro erro sobe: 401 é sessão, 500 é
 * servidor, e nenhum dos dois significa casa inexistente.
 */
export async function buscaCasa(): Promise<CasaPovoada | null> {
  try {
    return await requisita('/api/casa', {
      valida: (dado) => casaPovoadaSchema.parse(dado),
    })
  } catch (erro) {
    if (erro instanceof ErroDaApi && erro.codigo === 'SEM_CASA') return null
    throw erro
  }
}

/**
 * Devolve só a casa recém-criada, não a casa povoada: quem semeia o template é
 * o backend (story 6), e o app relê `GET /api/casa` para descobrir o que
 * nasceu. Montar a lista aqui a partir do que o app "sabe" que o template tem
 * seria duplicar conteúdo de produto no cliente.
 */
export function criaCasa(dados: CriarCasa): Promise<Casa> {
  return requisita('/api/casas', {
    method: 'POST',
    body: JSON.stringify(dados),
    valida: (dado) => casaSchema.parse(dado),
  })
}
