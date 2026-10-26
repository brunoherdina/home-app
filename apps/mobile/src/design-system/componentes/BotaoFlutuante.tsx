import { Pressable, StyleSheet, Text } from 'react-native'
import { cores, espacos, raios } from '../tokens'

type Props = {
  /** Obrigatório: o "+" sozinho não diz nada ao leitor de tela. */
  rotulo: string
  aoTocar: () => void
}

/**
 * O FAB do manifesto §5 — a ação de criar, sempre ao alcance do polegar, no
 * canto de baixo. 56 pt: o tamanho padrão do Material, acima dos 44 mínimos.
 */
export function BotaoFlutuante({ rotulo, aoTocar }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={rotulo}
      onPress={aoTocar}
      style={({ pressed }) => [estilos.botao, pressed && estilos.pressionado]}
    >
      <Text style={estilos.mais}>+</Text>
    </Pressable>
  )
}

const estilos = StyleSheet.create({
  botao: {
    position: 'absolute',
    right: espacos.lg,
    bottom: espacos.lg,
    width: 56,
    height: 56,
    borderRadius: raios.pilula,
    backgroundColor: cores.moss,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  pressionado: { opacity: 0.85 },
  mais: { fontSize: 32, lineHeight: 36, color: cores.papel },
})
