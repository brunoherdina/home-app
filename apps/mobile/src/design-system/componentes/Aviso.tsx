import { StyleSheet, Text, View } from 'react-native'
import { cores, espacos, raios, textos } from '../tokens'

type Props = {
  mensagem: string
  /** `erro` é falha da request; `nota` é informação neutra. */
  tom?: 'erro' | 'nota'
}

/**
 * Falha que NÃO pertence a um campo: e-mail já em uso, credencial recusada,
 * servidor fora do ar. Erro de campo mora no `Campo`; misturar os dois faria a
 * mensagem de rede aparecer pendurada num input que está correto.
 *
 * `accessibilityLiveRegion` para o leitor de tela anunciar sem que a pessoa
 * precise navegar até aqui — a mensagem surge depois do toque no botão, longe
 * do foco.
 */
export function Aviso({ mensagem, tom = 'erro' }: Props) {
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[estilos.caixa, tom === 'erro' ? estilos.erro : estilos.nota]}
    >
      <Text style={[estilos.texto, tom === 'erro' ? estilos.textoErro : estilos.textoNota]}>
        {mensagem}
      </Text>
    </View>
  )
}

const estilos = StyleSheet.create({
  caixa: { padding: espacos.md, borderRadius: raios.sm, borderWidth: 1 },
  erro: { borderColor: cores.coral },
  nota: { borderColor: cores.cinza },
  texto: { ...textos.corpo },
  textoErro: { color: cores.coral },
  textoNota: { color: cores.cinza },
})
