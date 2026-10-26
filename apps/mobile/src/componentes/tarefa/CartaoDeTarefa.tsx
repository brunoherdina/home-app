import { BONUS_DA_TAREFA_DETESTADA, pontosDaTarefa, type MoradorPublico, type Tarefa } from '@casa/contracts'
import { Pressable, StyleSheet, Text, View } from 'react-native'
import { Botao } from '../../design-system/componentes/Botao'
import { cores, espacos, raios, textos, type Cor } from '../../design-system/tokens'
import { NOMES_DE_MODO, NOMES_DE_PESO, pontosPorExtenso } from './rotulos'

type Props = {
  tarefa: Tarefa
  /** Os moradores da casa por id — vem de `GET /api/casa`, já em cache. */
  moradores: ReadonlyMap<string, MoradorPublico>
  euId: string
  aoAbrir: () => void
  aoConcluir: () => void
  concluindo: boolean
}

/**
 * Uma tarefa na lista: o que é, quanto vale, de quem é a vez.
 *
 * O que o cartão NÃO mostra é deliberado: quantas vezes foi feita, quem fez
 * por último, pontos de alguém. O contrato não traz nada disso (ADR-0010), e
 * a tela não tem como inventar.
 *
 * O valor em pontos é calculado aqui com `pontosDaTarefa` — a mesma função
 * que o servidor usa ao gravar. Mostrar é permitido; o que vale é o que o
 * servidor devolve na conclusão.
 */
export function CartaoDeTarefa({ tarefa, moradores, euId, aoAbrir, aoConcluir, concluindo }: Props) {
  const comBonus = tarefa.modo === 'rodizio' && tarefa.bonusDetestada
  const vale = pontosPorExtenso(pontosDaTarefa(tarefa))

  return (
    <View style={estilos.cartao}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Editar ${tarefa.titulo}`}
        onPress={aoAbrir}
        style={({ pressed }) => [estilos.corpo, pressed && estilos.pressionado]}
      >
        <Text style={estilos.titulo}>{tarefa.titulo}</Text>
        <Text style={estilos.detalhe}>
          {NOMES_DE_MODO[tarefa.modo]} · {NOMES_DE_PESO[tarefa.peso]} · {vale}
        </Text>
        {comBonus ? (
          <Text style={estilos.bonus}>
            Todo mundo detesta: +{BONUS_DA_TAREFA_DETESTADA} de bônus para quem fizer
          </Text>
        ) : null}
        <DeQuemE tarefa={tarefa} moradores={moradores} euId={euId} />
      </Pressable>
      <Botao titulo="Concluir" variante="texto" aoTocar={aoConcluir} ocupado={concluindo} />
    </View>
  )
}

/**
 * "De quem é" dito do jeito de cada modo: rodízio tem VEZ, fixo tem DONO,
 * aberta não tem ninguém. Responsável nulo em rodízio/fixo é estado legítimo
 * (conta apagada, rodízio que ainda não começou) e não erro.
 */
function DeQuemE({ tarefa, moradores, euId }: Pick<Props, 'tarefa' | 'moradores' | 'euId'>) {
  if (tarefa.modo === 'aberta') return <Text style={estilos.quem}>Livre — qualquer um pega</Text>

  const morador = tarefa.responsavelId ? moradores.get(tarefa.responsavelId) : undefined
  if (!morador) {
    return (
      <Text style={estilos.quem}>
        {tarefa.modo === 'rodizio' ? 'O rodízio começa na próxima vez' : 'Sem ninguém ainda'}
      </Text>
    )
  }

  const souEu = morador.id === euId
  const texto =
    tarefa.modo === 'rodizio'
      ? souEu
        ? 'Sua vez'
        : `Vez de ${morador.apelido}`
      : souEu
        ? 'Com você'
        : `Com ${morador.apelido}`

  return (
    <View style={estilos.linhaQuem}>
      <View style={[estilos.bolinha, { backgroundColor: cores[morador.cor as Cor] ?? cores.cinza }]} />
      <Text style={[estilos.quem, souEu && estilos.quemEu]}>{texto}</Text>
    </View>
  )
}

const estilos = StyleSheet.create({
  cartao: {
    borderRadius: raios.md,
    borderWidth: 1,
    borderColor: cores.cinza,
    paddingBottom: espacos.xs,
  },
  corpo: { padding: espacos.md, paddingBottom: espacos.xs, gap: espacos.xs },
  pressionado: { opacity: 0.7 },
  titulo: { ...textos.corpo, color: cores.tinta, fontWeight: '600' },
  detalhe: { ...textos.legenda, color: cores.cinza },
  bonus: { ...textos.legenda, color: cores.amber, fontWeight: '600' },
  linhaQuem: { flexDirection: 'row', alignItems: 'center', gap: espacos.sm },
  bolinha: { width: 10, height: 10, borderRadius: raios.pilula },
  quem: { ...textos.legenda, color: cores.tinta },
  quemEu: { color: cores.moss, fontWeight: '600' },
})
