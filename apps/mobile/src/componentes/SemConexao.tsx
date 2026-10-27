import { StyleSheet, Text, View } from 'react-native'
import { Botao } from '../design-system/componentes/Botao'
import { cores, espacos, textos } from '../design-system/tokens'

type Props = {
  aoTentarDeNovo: () => void
  ocupado?: boolean
}

/**
 * O terceiro destino do boot, e o motivo de `restauraSessao` distinguir
 * "negado" de "não deu para tentar agora" (ADR-0008).
 *
 * Sem esta tela, a queda de rede cairia no login — e quem tem sessão válida
 * seria mandado digitar a senha por causa de um túnel de metrô. A credencial
 * continua no cofre; o que falta é o servidor.
 */
export function SemConexao({ aoTentarDeNovo, ocupado }: Props) {
  return (
    <View style={estilos.tela}>
      <Text style={estilos.titulo}>Sem conexão</Text>
      <Text style={estilos.corpo}>
        Não foi possível falar com o servidor. Sua sessão continua aqui — é só tentar de novo.
      </Text>
      <Botao titulo="Tentar de novo" aoTocar={aoTentarDeNovo} ocupado={ocupado} />
    </View>
  )
}

const estilos = StyleSheet.create({
  tela: {
    flex: 1,
    justifyContent: 'center',
    gap: espacos.md,
    padding: espacos.lg,
    backgroundColor: cores.papel,
  },
  titulo: { ...textos.titulo, color: cores.moss },
  corpo: { ...textos.corpo, color: cores.cinza },
})
