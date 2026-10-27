import type { QueryClient } from '@tanstack/react-query'

/**
 * Chaves do cache do TanStack Query (ADR-0006) — num módulo sem `expo-*`, para
 * a regra de invalidação rodar em vitest, em Node.
 *
 * Cada recurso tem UMA chave, e a tela e o boot leem a mesma entrada.
 */
export const chaveDaCasa = ['casa'] as const
export const chaveDasTarefas = ['tarefas'] as const
export const chaveDosPontos = ['pontos'] as const

/**
 * O que fica velho quando uma tarefa muda — e é a MESMA resposta para criar,
 * editar, apagar e concluir, de propósito:
 *
 * - `tarefas`: a lista, óbvio — inclusive o responsável que o rodízio passou
 *   adiante numa conclusão;
 * - `casa`: `GET /api/casa` também carrega as tarefas (é o contrato da Fase 0),
 *   e deixá-la velha mostraria tarefa apagada em quem lê por ela;
 * - `pontos`: concluir soma, e apagar também mexe — as conclusões da tarefa
 *   saem por cascade (migration 0007), e o total da casa encolhe junto.
 *
 * Uma regra só, e não uma por mutação: quatro listas quase iguais são onde a
 * próxima mutação esquece uma chave e a tela passa a mentir até o staleTime.
 */
export function depoisDeMudarTarefas(cache: QueryClient): Promise<void> {
  return Promise.all([
    cache.invalidateQueries({ queryKey: chaveDasTarefas }),
    cache.invalidateQueries({ queryKey: chaveDaCasa }),
    cache.invalidateQueries({ queryKey: chaveDosPontos }),
  ]).then(() => undefined)
}
