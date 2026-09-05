import type { ReactNode } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native'
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
 * Moldura de toda tela de formulário da Fase 0.
 *
 * Existe para o teclado não ser um problema resolvido de três jeitos
 * diferentes: em iOS o `padding` empurra o conteúdo, em Android o
 * `windowSoftInputMode` já redimensiona a janela e um segundo ajuste
 * duplicaria o deslocamento. Com uma moldura só, o comportamento é decidido
 * aqui e as telas não repetem a decisão.
 *
 * O rodapé fica FORA do ScrollView de propósito: a ação principal da Fase 0
 * não pode depender de a pessoa rolar até o fim para descobrir que existe.
 */
export function Tela({ titulo, legenda, children, rodape }: Props) {
  return (
    <KeyboardAvoidingView
      style={estilos.raiz}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={estilos.conteudo}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <Text style={estilos.titulo}>{titulo}</Text>
        {legenda ? <Text style={estilos.legenda}>{legenda}</Text> : null}
        <View style={estilos.corpo}>{children}</View>
      </ScrollView>
      {rodape ? <View style={estilos.rodape}>{rodape}</View> : null}
    </KeyboardAvoidingView>
  )
}

const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: cores.papel },
  conteudo: { padding: espacos.lg, gap: espacos.xs, flexGrow: 1 },
  titulo: { ...textos.titulo, color: cores.moss },
  legenda: { ...textos.legenda, color: cores.cinza },
  corpo: { marginTop: espacos.lg, gap: espacos.md },
  rodape: {
    padding: espacos.lg,
    paddingTop: espacos.sm,
    gap: espacos.sm,
    backgroundColor: cores.papel,
  },
})
