import { Pressable, StyleSheet, Text, View } from 'react-native'
import { cores, espacos, raios, textos } from '../tokens'

export type Opcao<T extends string> = {
  valor: T
  rotulo: string
  /** Cor de preenchimento — só a escolha de cor do morador usa. */
  amostra?: string
}

type Props<T extends string> = {
  rotulo: string
  opcoes: readonly Opcao<T>[]
  valor: T | undefined
  aoEscolher: (valor: T) => void
  erro?: string
}

/**
 * Escolha única em pílulas. Substitui o `Picker` nativo de propósito: na Fase 0
 * o custo de abrir um seletor modal para escolher entre três ou quatro opções é
 * maior que o de mostrá-las todas — o orçamento da fase é um minuto.
 *
 * `accessibilityRole="radio"` e não "button": o leitor de tela precisa anunciar
 * que são alternativas de um grupo, e quantas.
 */
export function Chips<T extends string>({ rotulo, opcoes, valor, aoEscolher, erro }: Props<T>) {
  return (
    <View style={estilos.grupo}>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <View accessibilityRole="radiogroup" style={estilos.linha}>
        {opcoes.map((opcao) => {
          const escolhida = opcao.valor === valor
          return (
            <Pressable
              key={opcao.valor}
              accessibilityRole="radio"
              accessibilityState={{ selected: escolhida }}
              accessibilityLabel={opcao.rotulo}
              onPress={() => aoEscolher(opcao.valor)}
              style={[estilos.chip, escolhida && estilos.chipEscolhido]}
            >
              {opcao.amostra ? (
                <View style={[estilos.amostra, { backgroundColor: opcao.amostra }]} />
              ) : null}
              <Text style={[estilos.texto, escolhida && estilos.textoEscolhido]}>
                {opcao.rotulo}
              </Text>
            </Pressable>
          )
        })}
      </View>
      <Text style={estilos.erro} numberOfLines={2}>
        {erro ?? ' '}
      </Text>
    </View>
  )
}

const estilos = StyleSheet.create({
  grupo: { gap: espacos.xs },
  rotulo: { ...textos.legenda, color: cores.cinza },
  linha: { flexDirection: 'row', flexWrap: 'wrap', gap: espacos.sm },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacos.sm,
    minHeight: 44,
    paddingHorizontal: espacos.md,
    borderRadius: raios.pilula,
    borderWidth: 1,
    borderColor: cores.cinza,
  },
  chipEscolhido: { borderColor: cores.moss, borderWidth: 2, backgroundColor: cores.papel },
  amostra: { width: 18, height: 18, borderRadius: raios.pilula },
  texto: { ...textos.corpo, color: cores.tinta },
  textoEscolhido: { color: cores.moss, fontWeight: '600' },
  erro: { ...textos.legenda, color: cores.coral, minHeight: 18 },
})
