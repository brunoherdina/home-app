import type { ReactNode } from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { cores, espacos, raios, textos } from '../design-system/tokens'
import { Convite } from './Convite'

type Props = {
  /** Quantas pessoas moram na casa — inclusive quem está olhando. */
  moradores: number
  /** "Sua parte" de `GET /api/casa/pontos`. */
  suaParte: number
}

/**
 * A Fase 1 do onboarding (story 12): convidar um morador → concluir uma tarefa.
 *
 * Um cartão no topo da aba Tarefas, e não uma tela no caminho: o princípio 3
 * do roadmap pede nudge, não portão. Nada aqui é gravado — o estado de cada
 * passo é DERIVADO do que já existe (quantos moram na casa, se a sua parte
 * passou de zero), e o cartão some sozinho quando os dois estão feitos. Quem
 * entrou por convite já chega com o primeiro passo cumprido.
 *
 * "Concluir" olha a SUA parte, e não o total: o passo é a pessoa fazer o
 * primeiro gesto do loop, não a casa ter pontos.
 */
export function PrimeirosPassos({ moradores, suaParte }: Props) {
  const convidou = moradores >= 2
  const concluiu = suaParte > 0
  if (convidou && concluiu) return null

  return (
    <View style={estilos.cartao}>
      <Text style={estilos.titulo}>Primeiros passos</Text>
      <Passo numero={1} feito={convidou} titulo="Chame quem mora com você">
        {convidou ? null : <Convite />}
      </Passo>
      <Passo numero={2} feito={concluiu} titulo="Conclua uma tarefa">
        {concluiu ? null : (
          <Text style={estilos.dica}>
            Toque em Concluir em qualquer tarefa abaixo. Os pontos entram na sua parte e na da casa.
          </Text>
        )}
      </Passo>
    </View>
  )
}

function Passo({
  numero,
  feito,
  titulo,
  children,
}: {
  numero: number
  feito: boolean
  titulo: string
  children?: ReactNode
}) {
  return (
    <View style={estilos.passo} accessibilityLabel={`${titulo}${feito ? ', feito' : ''}`}>
      <View style={estilos.linha}>
        <View style={[estilos.marca, feito && estilos.marcaFeita]}>
          <Text style={[estilos.numero, feito && estilos.numeroFeito]}>{feito ? '✓' : numero}</Text>
        </View>
        <Text style={[estilos.tituloDoPasso, feito && estilos.tituloFeito]}>{titulo}</Text>
      </View>
      {children}
    </View>
  )
}

const estilos = StyleSheet.create({
  cartao: {
    gap: espacos.md,
    padding: espacos.md,
    borderRadius: raios.md,
    borderWidth: 1,
    borderColor: cores.moss,
  },
  titulo: { ...textos.corpo, color: cores.moss, fontWeight: '600' },
  passo: { gap: espacos.xs },
  linha: { flexDirection: 'row', alignItems: 'center', gap: espacos.sm },
  marca: {
    width: 28,
    height: 28,
    borderRadius: raios.pilula,
    borderWidth: 1,
    borderColor: cores.moss,
    alignItems: 'center',
    justifyContent: 'center',
  },
  marcaFeita: { backgroundColor: cores.lime, borderColor: cores.lime },
  numero: { ...textos.legenda, color: cores.moss, fontWeight: '600' },
  numeroFeito: { color: cores.papel },
  tituloDoPasso: { ...textos.corpo, color: cores.tinta, flexShrink: 1 },
  tituloFeito: { color: cores.cinza, textDecorationLine: 'line-through' },
  dica: { ...textos.legenda, color: cores.cinza },
})
