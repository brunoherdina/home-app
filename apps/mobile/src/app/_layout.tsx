import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Stack, router } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { StatusBar } from 'expo-status-bar'
import { useEffect } from 'react'
import { KeyboardProvider } from 'react-native-keyboard-controller'
import { cores } from '../design-system/tokens'
import { ErroDaApi } from '../lib/api/cliente'
import { sessao } from '../lib/sessao'

/**
 * Segura o splash até o boot decidir para onde ir (`src/app/index.tsx`).
 *
 * Fora do componente de propósito: precisa rodar na avaliação do módulo, antes
 * do primeiro render — dentro de um efeito, o Expo já teria escondido o splash
 * sozinho e quem tinha sessão veria a tela de entrar piscar antes da casa.
 */
void SplashScreen.preventAutoHideAsync()

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
        tentativas < 1 &&
        // `status: 0` é rede fora (SEM_CONEXAO) — vale a re-tentativa.
        !(erro instanceof ErroDaApi && erro.status >= 400 && erro.status < 500),
      staleTime: 30_000,
    },
  },
})

export default function RootLayout() {
  /**
   * A sessão morreu sem a pessoa pedir (refresh revogado, reusado ou expirado
   * — ADR-0008). Mora no layout raiz, e não numa tela, porque pode acontecer em
   * qualquer uma delas: o evento nasce dentro do interceptor de `lib/api`.
   *
   * `clear()` antes de navegar: o cache guarda a casa da conta que acabou de
   * cair, e a próxima pessoa a entrar neste device não pode vê-la piscar.
   */
  useEffect(() => sessao.aoExpirar(() => {
    queryClient.clear()
    router.replace('/entrar')
  }), [])

  return (
    // O provider do teclado escuta o IME para toda a árvore; quem o usa é a
    // `Tela` (design-system/componentes/Tela.tsx), que explica por quê.
    <KeyboardProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="dark" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: cores.papel },
            headerTintColor: cores.tinta,
            headerShadowVisible: false,
            contentStyle: { backgroundColor: cores.papel },
          }}
        >
          {/* O boot é invisível: fica atrás do splash e só redireciona. */}
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="entrar" options={{ headerShown: false }} />
          <Stack.Screen name="criar-conta" options={{ title: 'Criar conta' }} />
          {/* Sem voltar: a conta já existe, e voltar cairia num formulário de
              cadastro que só daria 409. A casa é o próximo passo obrigatório. */}
          <Stack.Screen name="nova-casa" options={{ headerShown: false, gestureEnabled: false }} />
          {/* COM voltar, ao contrário da de cima: quem chegou aqui escolheu o
              ramo do convite e pode ter escolhido errado — voltar cai em
              nova-casa, que é um destino legítimo. */}
          <Stack.Screen name="entrar-na-casa" options={{ title: 'Entrar numa casa' }} />
          {/* As abas (Tarefas, Casa) têm o próprio cabeçalho. Sem gesto de voltar
              pelo mesmo motivo de antes: atrás delas só há o fluxo da Fase 0. */}
          <Stack.Screen name="(abas)" options={{ headerShown: false, gestureEnabled: false }} />
          {/* Criar e editar tarefa abrem POR CIMA das abas e voltam para elas. */}
          <Stack.Screen name="tarefa/nova" options={{ title: 'Nova tarefa', presentation: 'modal' }} />
          <Stack.Screen name="tarefa/[id]" options={{ title: 'Tarefa', presentation: 'modal' }} />
        </Stack>
      </QueryClientProvider>
    </KeyboardProvider>
  )
}
