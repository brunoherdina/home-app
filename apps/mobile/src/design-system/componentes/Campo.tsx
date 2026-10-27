import { forwardRef } from 'react'
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native'
import { cores, espacos, raios, textos } from '../tokens'

type Props = TextInputProps & {
  rotulo: string
  /** Mensagem do zod compartilhado (ADR-0009) — a tela não reescreve a regra. */
  erro?: string
  /**
   * Orientação antes do erro (ex.: o tamanho mínimo da senha). Ocupa a mesma
   * linha reservada do erro e cede o lugar a ele quando há um — como caixa
   * separada, parecia um segundo campo vazio.
   */
  dica?: string
}

/**
 * Campo de texto puramente apresentacional: não conhece React Hook Form.
 *
 * A ligação com o formulário mora em `src/componentes/CampoDeTexto.tsx`. A
 * separação é a mesma de `lib/api/nucleo.ts` × `cliente.ts` — trocar de
 * biblioteca de formulário não deveria tocar no design system.
 */
export const Campo = forwardRef<TextInput, Props>(function Campo(
  { rotulo, erro, dica, style, ...resto },
  ref,
) {
  return (
    <View style={estilos.grupo}>
      <Text style={estilos.rotulo}>{rotulo}</Text>
      <TextInput
        ref={ref}
        // Sem isto o campo vira um retângulo mudo para leitor de tela: o
        // rótulo é um <Text> irmão, e nada os associa sozinho.
        accessibilityLabel={rotulo}
        placeholderTextColor={cores.cinza}
        style={[estilos.entrada, erro ? estilos.entradaComErro : null, style]}
        {...resto}
      />
      {/* Espaço reservado para o erro: sem ele, a mensagem aparecendo empurra
          o resto do formulário para baixo e o dedo erra o campo seguinte. */}
      <Text style={erro ? estilos.erro : estilos.dica} numberOfLines={2}>
        {erro ?? dica ?? ' '}
      </Text>
    </View>
  )
})

const estilos = StyleSheet.create({
  grupo: { gap: espacos.xs },
  rotulo: { ...textos.legenda, color: cores.cinza },
  entrada: {
    ...textos.corpo,
    minHeight: 52,
    color: cores.tinta,
    borderWidth: 1,
    borderColor: cores.cinza,
    borderRadius: raios.md,
    paddingHorizontal: espacos.md,
  },
  entradaComErro: { borderColor: cores.coral },
  erro: { ...textos.legenda, color: cores.coral, minHeight: 18 },
  dica: { ...textos.legenda, color: cores.cinza, minHeight: 18 },
})
