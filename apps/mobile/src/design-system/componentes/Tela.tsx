import { useState, type ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { KeyboardAwareScrollView, KeyboardStickyView } from 'react-native-keyboard-controller'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { cores, espacos, textos } from '../tokens'

type Props = {
  titulo: string
  /** Uma linha curta de contexto. Ausente quando o título já basta. */
  legenda?: string
  children: ReactNode
  /** Fica colado embaixo (botão de ação), fora da rolagem. */
  rodape?: ReactNode
}

/**
 * Folga entre o rodapé e o campo focado. Cobre a linha de erro reservada que
 * cada `Campo` tem abaixo do input — sem ela, o erro do campo focado ficaria
 * escondido atrás do botão.
 */
const FOLGA_ACIMA_DO_RODAPE = espacos.xl

/**
 * Moldura de toda tela de formulário.
 *
 * Existe para o teclado ser resolvido num lugar só. O Android não resolve
 * sozinho: o RN 0.86 desenha de borda a borda (edge-to-edge), e nesse modo o
 * `adjustResize` do `windowSoftInputMode` não encolhe mais a janela — o teclado
 * passa POR CIMA do formulário. Quem compensa é o react-native-keyboard-controller,
 * que lê o teclado igual nas duas plataformas:
 *
 * - `KeyboardAwareScrollView` rola até o campo focado ficar acima do teclado E
 *   do rodapé (`bottomOffset` = a parte do rodapé que fica visível + folga);
 * - `KeyboardStickyView` sobe o rodapé junto com o teclado.
 *
 * O rodapé fica FORA da rolagem de propósito: a ação principal não pode
 * depender de a pessoa rolar até o fim para descobrir que existe. Pelo mesmo
 * desenho de borda a borda, a barra de navegação do sistema cobre o fundo da
 * tela — daí o recuo `insets.bottom` no rodapé. Com o teclado aberto esse recuo
 * fica atrás do teclado (`offset.opened`), senão o botão flutuaria longe dele.
 */
export function Tela({ titulo, legenda, children, rodape }: Props) {
  const insets = useSafeAreaInsets()
  const [alturaDoRodape, setAlturaDoRodape] = useState(0)

  return (
    <View style={estilos.raiz}>
      <KeyboardAwareScrollView
        bottomOffset={Math.max(alturaDoRodape - insets.bottom, 0) + FOLGA_ACIMA_DO_RODAPE}
        contentContainerStyle={[
          estilos.conteudo,
          rodape ? null : { paddingBottom: espacos.lg + insets.bottom },
        ]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={estilos.titulo}>{titulo}</Text>
        {legenda ? <Text style={estilos.legenda}>{legenda}</Text> : null}
        <View style={estilos.corpo}>{children}</View>
      </KeyboardAwareScrollView>
      {rodape ? (
        <KeyboardStickyView offset={{ closed: 0, opened: insets.bottom }}>
          <View
            onLayout={(evento) => setAlturaDoRodape(evento.nativeEvent.layout.height)}
            style={[estilos.rodape, { paddingBottom: espacos.lg + insets.bottom }]}
          >
            {rodape}
          </View>
        </KeyboardStickyView>
      ) : null}
    </View>
  )
}

const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: cores.papel },
  conteudo: { padding: espacos.lg, gap: espacos.xs, flexGrow: 1 },
  titulo: { ...textos.titulo, color: cores.moss },
  legenda: { ...textos.legenda, color: cores.cinza },
  corpo: { marginTop: espacos.lg, gap: espacos.md },
  rodape: {
    paddingHorizontal: espacos.lg,
    paddingTop: espacos.sm,
    gap: espacos.sm,
    backgroundColor: cores.papel,
  },
})
