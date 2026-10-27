import { Pressable, StyleSheet, Text, View } from 'react-native'
import { cores, espacos, raios, textos } from '../tokens'

type Props<T extends string> = {
  /** Lido pelo leitor de tela; não aparece — o contexto já diz o que se filtra. */
  rotulo: string
  opcoes: readonly { valor: T; rotulo: string }[]
  valor: T
  aoEscolher: (valor: T) => void
}

/**
 * Escolha única em linha, para FILTRO — o primo do `Chips`, que é para
 * formulário. A diferença é o que não tem: rótulo visível e linha de erro.
 * Filtro não tem valor inválido, e reservar 18 pt para um erro que nunca
 * aparece empurraria a lista para baixo à toa.
 */
export function Segmentos<T extends string>({ rotulo, opcoes, valor, aoEscolher }: Props<T>) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={rotulo} style={estilos.linha}>
      {opcoes.map((opcao) => {
        const escolhida = opcao.valor === valor
        return (
          <Pressable
            key={opcao.valor}
            accessibilityRole="radio"
            accessibilityState={{ selected: escolhida }}
            onPress={() => aoEscolher(opcao.valor)}
            style={[estilos.segmento, escolhida && estilos.escolhido]}
          >
            <Text style={[estilos.texto, escolhida && estilos.textoEscolhido]}>{opcao.rotulo}</Text>
          </Pressable>
        )
      })}
    </View>
  )
}

const estilos = StyleSheet.create({
  linha: { flexDirection: 'row', gap: espacos.sm },
  segmento: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: espacos.md,
    borderRadius: raios.pilula,
    borderWidth: 1,
    borderColor: cores.cinza,
  },
  escolhido: { backgroundColor: cores.moss, borderColor: cores.moss },
  texto: { ...textos.corpo, color: cores.tinta },
  textoEscolhido: { color: cores.papel, fontWeight: '600' },
})
