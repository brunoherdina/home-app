import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Stack } from 'expo-router'
import { StatusBar } from 'expo-status-bar'
import { cores } from '../design-system/tokens'
import { ErroDaApi } from '../lib/api/cliente'

/**
 * Defaults conservadores do TanStack Query (ADR-0006):
 *
 * - retry: no máximo UMA re-tentativa, e nunca para erro 4xx — erro de cliente
 *   não se resolve repetindo, e o 401 já passou pelo interceptor de refresh
 *   dentro de lib/api; insistir aqui só adiaria a tela de login.
 * - staleTime 30s: dado do lar muda em ritmo humano; segurar o cache por 30s
 *   corta o refetch em cascata a cada navegação sem deixar a tela mentir por
 *   muito tempo. Quando algo muda de verdade, o WebSocket do ADR-0004 invalida
 *   a query — o realtime empurra, o cache não precisa adivinhar.
 */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (tentativas, erro) =>
        tentativas < 1 && !(erro instanceof ErroDaApi && erro.status < 500),
      staleTime: 30_000,
    },
  },
})

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <StatusBar style="dark" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: cores.papel },
          headerTintColor: cores.tinta,
          contentStyle: { backgroundColor: cores.papel },
        }}
      />
    </QueryClientProvider>
  )
}
