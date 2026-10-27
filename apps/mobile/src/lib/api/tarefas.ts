import {
  conclusaoSchema,
  listaDeTarefasSchema,
  pontosDaCasaSchema,
  tarefaSchema,
  type Conclusao,
  type CriarTarefa,
  type EditarTarefa,
  type PontosDaCasa,
  type Tarefa,
} from '@casa/contracts'
import { requisita } from './cliente'

export { chaveDasTarefas, chaveDosPontos, depoisDeMudarTarefas } from './chaves'

/**
 * Todas as tarefas da casa. Os filtros Todas / Minhas / Livres são recortes
 * desta lista no app — ver `listaDeTarefasSchema`.
 */
export function buscaTarefas(): Promise<Tarefa[]> {
  return requisita('/api/tarefas', { valida: (dado) => listaDeTarefasSchema.parse(dado) })
}

/** O corpo é a SAÍDA do resolver — o mesmo schema que a API roda de novo (ADR-0009). */
export function criaTarefa(dados: CriarTarefa): Promise<Tarefa> {
  return requisita('/api/tarefas', {
    method: 'POST',
    body: JSON.stringify(dados),
    valida: (dado) => tarefaSchema.parse(dado),
  })
}

/** O formulário inteiro, não um diff — ver `editarTarefaSchema`. */
export function editaTarefa(id: string, dados: EditarTarefa): Promise<Tarefa> {
  return requisita(`/api/tarefas/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(dados),
    valida: (dado) => tarefaSchema.parse(dado),
  })
}

/** 204 sem corpo: `requisita` entrega `null`, e não há contrato a checar. */
export async function apagaTarefa(id: string): Promise<void> {
  await requisita(`/api/tarefas/${id}`, { method: 'DELETE', valida: () => undefined })
}

/**
 * Concluir manda `{}` e nada além: quem é está na sessão, qual tarefa está na
 * URL, e os pontos são do servidor. O que volta é a conclusão com os pontos
 * que ela valeu — para a tela dizer "+3" na hora, não para somar no app.
 */
export function concluiTarefa(id: string): Promise<Conclusao> {
  return requisita(`/api/tarefas/${id}/conclusoes`, {
    method: 'POST',
    body: '{}',
    valida: (dado) => conclusaoSchema.parse(dado),
  })
}

/**
 * "Sua parte" e o total da casa. O `strictObject` do contrato reprova a
 * resposta inteira se ela trouxer qualquer campo a mais — um breakdown por
 * pessoa não chega a entrar no cache (ADR-0010).
 */
export function buscaPontos(): Promise<PontosDaCasa> {
  return requisita('/api/casa/pontos', { valida: (dado) => pontosDaCasaSchema.parse(dado) })
}
