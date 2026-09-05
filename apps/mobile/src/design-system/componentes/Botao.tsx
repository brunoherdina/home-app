import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native'
import { cores, espacos, raios, textos } from '../tokens'

type Props = {
  titulo: string
  aoTocar: () => void
  /** Ação em curso: trava o toque e mostra o giro, sem trocar a altura do botão. */
  ocupado?: boolean
  desabilitado?: boolean
  variante?: 'primario' | 'texto'
}

/**
 * Alvo de toque de 52 pt de altura — acima do mínimo de 44 das duas
 * plataformas, porque a Fase 0 é preenchida com o polegar e com pressa.
 *
 * `ocupado` e `desabilitado` são estados distintos: o primeiro é a request em
 * voo (o texto continua legível, só o giro entra), o segundo é o formulário
 * ainda inválido. Colapsar os dois faria o botão parecer travado quando na
 * verdade está trabalhando.
 */
export function Botao({ titulo, aoTocar, ocupado, desabilitado, variante = 'primario' }: Props) {
  const inerte = ocupado || desabilitado
  const texto = variante === 'primario' ? estilos.textoPrimario : estilos.textoLink

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(inerte), busy: Boolean(ocupado) }}
      onPress={aoTocar}
      disabled={inerte}
      style={({ pressed }) => [
        estilos.base,
        variante === 'primario' ? estilos.primario : estilos.link,
        pressed && estilos.pressionado,
        inerte && estilos.inerte,
      ]}
    >
      {ocupado ? <ActivityIndicator color={cores.papel} /> : <Text style={texto}>{titulo}</Text>}
    </Pressable>
  )
}

const estilos = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: raios.md,
    paddingHorizontal: espacos.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primario: { backgroundColor: cores.moss },
  link: { backgroundColor: 'transparent' },
  pressionado: { opacity: 0.85 },
  inerte: { opacity: 0.5 },
  textoPrimario: { ...textos.corpo, color: cores.papel, fontWeight: '600' },
  textoLink: { ...textos.corpo, color: cores.moss, fontWeight: '600' },
})
