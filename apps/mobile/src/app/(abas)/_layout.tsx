import { Tabs } from 'expo-router/js-tabs'
import { cores, textos } from '../../design-system/tokens'

/**
 * As abas da casa (Épico 2, decisão de escopo 6): Tarefas e Casa.
 *
 * Duas, e não as quatro do manifesto §5: Início (anel Energia) é o Épico 3 e
 * Objetivos é o Épico 4. Aba vazia esperando conteúdo é a tabela fantasma
 * desenhada — a pessoa toca, não acha nada, e aprende que o app tem cantos
 * mortos. Cada aba entra junto com o épico que a enche.
 *
 * Sem ícone, por ora: o pacote de ícones seria dependência nova para dois
 * rótulos, e o `tokens.json` do Figma — que decide a iconografia — ainda não
 * chegou. O rótulo em texto maior faz o papel do alvo de toque.
 */
export default function Abas() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: cores.papel },
        headerTintColor: cores.tinta,
        headerShadowVisible: false,
        sceneStyle: { backgroundColor: cores.papel },
        tabBarStyle: { backgroundColor: cores.papel },
        tabBarActiveTintColor: cores.moss,
        tabBarInactiveTintColor: cores.cinza,
        tabBarIconStyle: { display: 'none' },
        tabBarLabelStyle: { ...textos.corpo, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="tarefas" options={{ title: 'Tarefas' }} />
      <Tabs.Screen name="casa" options={{ title: 'Casa' }} />
    </Tabs>
  )
}
