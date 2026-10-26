import { QueryClient } from '@tanstack/react-query'
import { describe, expect, it } from 'vitest'
import { chaveDaCasa, chaveDasTarefas, chaveDosPontos, depoisDeMudarTarefas } from '../chaves'

/**
 * A regra de invalidação do Épico 2 (story 9): mudar uma tarefa deixa velhas
 * as três leituras que a mostram ou dependem dela. O teste é o que impede a
 * próxima mutação de "esquecer os pontos" — a tela continuaria funcionando,
 * só mostrando a soma de antes até o staleTime vencer.
 */
function cacheComTudo() {
  const cache = new QueryClient()
  cache.setQueryData(chaveDasTarefas, [])
  cache.setQueryData(chaveDaCasa, null)
  cache.setQueryData(chaveDosPontos, { suaParte: 0, total: 0 })
  cache.setQueryData(['sessao'], true)
  return cache
}

function invalidada(cache: QueryClient, chave: readonly unknown[]): boolean {
  return cache.getQueryState(chave)?.isInvalidated ?? false
}

describe('depois de mudar tarefas', () => {
  it('tarefas, casa e pontos ficam velhos — concluir soma e apagar tira conclusões do total', async () => {
    const cache = cacheComTudo()

    await depoisDeMudarTarefas(cache)

    expect(invalidada(cache, chaveDasTarefas)).toBe(true)
    expect(invalidada(cache, chaveDaCasa)).toBe(true)
    expect(invalidada(cache, chaveDosPontos)).toBe(true)
  })

  it('a sessão não é tocada: invalidá-la refaria o refresh e gastaria um token (ADR-0008)', async () => {
    const cache = cacheComTudo()

    await depoisDeMudarTarefas(cache)

    expect(invalidada(cache, ['sessao'])).toBe(false)
  })
})
