import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { pontosDaTarefa, type Tarefa } from '@casa/contracts'
import { Redirect, useRouter } from 'expo-router'
import { useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Alert, FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native'
import { PrimeirosPassos } from '../../componentes/PrimeirosPassos'
import { SemConexao } from '../../componentes/SemConexao'
import { CartaoDeTarefa } from '../../componentes/tarefa/CartaoDeTarefa'
import { pontosPorExtenso } from '../../componentes/tarefa/rotulos'
import { Aviso } from '../../design-system/componentes/Aviso'
import { BotaoFlutuante } from '../../design-system/componentes/BotaoFlutuante'
import { Segmentos } from '../../design-system/componentes/Segmentos'
import { cores, espacos, raios, textos } from '../../design-system/tokens'
import { buscaCasa, chaveDaCasa } from '../../lib/api/casa'
import { ErroDaApi } from '../../lib/api/cliente'
import {
  buscaPontos,
  buscaTarefas,
  chaveDasTarefas,
  chaveDosPontos,
  concluiTarefa,
  depoisDeMudarTarefas,
} from '../../lib/api/tarefas'
import { mensagemDoErro } from '../../lib/erros'

type Filtro = 'todas' | 'minhas' | 'livres'

const FILTROS: readonly { valor: Filtro; rotulo: string }[] = [
  { valor: 'todas', rotulo: 'Todas' },
  { valor: 'minhas', rotulo: 'Minhas' },
  { valor: 'livres', rotulo: 'Livres' },
]

/**
 * Os três recortes da MESMA lista (story 10). Livres = só modo Aberta; Minhas
 * = só as que estão com a pessoa (dona no Fixo, da vez no Rodízio).
 */
function filtra(tarefas: readonly Tarefa[], filtro: Filtro, euId: string): Tarefa[] {
  if (filtro === 'livres') return tarefas.filter((tarefa) => tarefa.modo === 'aberta')
  if (filtro === 'minhas') return tarefas.filter((tarefa) => tarefa.responsavelId === euId)
  return [...tarefas]
}

const VAZIO: Record<Filtro, string> = {
  todas: 'Nenhuma tarefa por aqui ainda. Toque em + para criar a primeira.',
  minhas: 'Nada com você agora.',
  livres: 'Nenhuma tarefa livre — todas têm alguém.',
}

/** Quanto tempo o "+3 pontos" fica na tela depois de concluir. */
const MS_DO_RECADO = 4000

/**
 * A aba Tarefas — o loop central do Épico 2: ver o que tem, concluir.
 *
 * Três leituras do cache: a casa (moradores e quem é você), as tarefas e os
 * pontos. Concluir invalida as três (`depoisDeMudarTarefas`), e a lista
 * reflete a vez que o rodízio passou adiante sem a tela recarregar.
 *
 * Os pontos aparecem aqui, uma vez, e em nenhum outro lugar: a SUA parte e a
 * da casa. Não há número ao lado de morador nenhum (ADR-0010).
 */
export default function Tarefas() {
  const router = useRouter()
  const cache = useQueryClient()
  const casaQuery = useQuery({ queryKey: chaveDaCasa, queryFn: buscaCasa })
  const tarefasQuery = useQuery({ queryKey: chaveDasTarefas, queryFn: buscaTarefas })
  const pontosQuery = useQuery({ queryKey: chaveDosPontos, queryFn: buscaPontos })
  const [filtro, setFiltro] = useState<Filtro>('todas')
  const [recado, setRecado] = useState<string | null>(null)

  useEffect(() => {
    if (!recado) return
    const relogio = setTimeout(() => setRecado(null), MS_DO_RECADO)
    return () => clearTimeout(relogio)
  }, [recado])

  const conclusao = useMutation({
    mutationFn: (tarefa: Tarefa) => concluiTarefa(tarefa.id),
    onSuccess: async (feita, tarefa) => {
      // O número vem da RESPOSTA, não do cálculo local: é o que foi gravado.
      setRecado(`${tarefa.titulo}: feito! +${pontosPorExtenso(feita.pontos)} na sua parte.`)
      await depoisDeMudarTarefas(cache)
    },
  })

  const moradores = useMemo(
    () => new Map((casaQuery.data?.moradores ?? []).map((morador) => [morador.id, morador])),
    [casaQuery.data],
  )

  /**
   * Confirma antes, porque conclusão não se desfaz: é evento append-only, e
   * "desfazer" ainda não existe (migration 0007). Um toque errado seria ponto
   * para sempre na sua parte.
   */
  function confirmaConclusao(tarefa: Tarefa) {
    Alert.alert(
      `Concluir "${tarefa.titulo}"?`,
      `Vale ${pontosPorExtenso(pontosDaTarefa(tarefa))} para a sua parte.`,
      [
        { text: 'Agora não', style: 'cancel' },
        { text: 'Concluir', onPress: () => conclusao.mutate(tarefa) },
      ],
    )
  }

  const consultas = [casaQuery, tarefasQuery, pontosQuery]
  const comErro = consultas.find((consulta) => consulta.isError)

  if (comErro?.error instanceof ErroDaApi && comErro.error.status === 401) {
    return <Redirect href="/entrar" />
  }
  if (comErro) {
    return (
      <SemConexao
        aoTentarDeNovo={() => consultas.forEach((consulta) => void consulta.refetch())}
        ocupado={consultas.some((consulta) => consulta.isFetching)}
      />
    )
  }
  if (casaQuery.isPending || !tarefasQuery.data || !pontosQuery.data) {
    return (
      <View style={estilos.centro}>
        <ActivityIndicator color={cores.moss} />
      </View>
    )
  }
  // A casa sumiu entre o boot e aqui: volta ao ramo do criador.
  if (!casaQuery.data) return <Redirect href="/nova-casa" />

  const { euId } = casaQuery.data
  const pontos = pontosQuery.data
  const lista = filtra(tarefasQuery.data, filtro, euId)

  return (
    <View style={estilos.raiz}>
      <FlatList
        data={lista}
        keyExtractor={(tarefa) => tarefa.id}
        contentContainerStyle={estilos.conteudo}
        refreshControl={
          <RefreshControl
            refreshing={consultas.some((consulta) => consulta.isRefetching)}
            onRefresh={() => consultas.forEach((consulta) => void consulta.refetch())}
            colors={[cores.moss]}
            tintColor={cores.moss}
          />
        }
        ListHeaderComponent={
          <View style={estilos.cabecalho}>
            <View style={estilos.pontos} accessibilityRole="summary">
              <Text style={estilos.pontosItem}>
                Sua parte <Text style={estilos.pontosNumero}>{pontosPorExtenso(pontos.suaParte)}</Text>
              </Text>
              <Text style={estilos.pontosItem}>
                A casa <Text style={estilos.pontosNumero}>{pontosPorExtenso(pontos.total)}</Text>
              </Text>
            </View>
            {recado ? <Aviso tom="nota" mensagem={recado} /> : null}
            <PrimeirosPassos moradores={casaQuery.data.moradores.length} suaParte={pontos.suaParte} />
            {conclusao.isError ? <Aviso mensagem={mensagemDoErro(conclusao.error)} /> : null}
            <Segmentos rotulo="Mostrar" opcoes={FILTROS} valor={filtro} aoEscolher={setFiltro} />
          </View>
        }
        ListEmptyComponent={<Aviso tom="nota" mensagem={VAZIO[filtro]} />}
        renderItem={({ item }) => (
          <CartaoDeTarefa
            tarefa={item}
            moradores={moradores}
            euId={euId}
            aoAbrir={() => router.push(`/tarefa/${item.id}`)}
            aoConcluir={() => confirmaConclusao(item)}
            concluindo={conclusao.isPending && conclusao.variables?.id === item.id}
          />
        )}
      />
      <BotaoFlutuante rotulo="Nova tarefa" aoTocar={() => router.push('/tarefa/nova')} />
    </View>
  )
}

const estilos = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: cores.papel },
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: cores.papel },
  conteudo: { padding: espacos.lg, gap: espacos.sm, paddingBottom: espacos.xl * 3 },
  cabecalho: { gap: espacos.md, marginBottom: espacos.sm },
  pontos: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: espacos.md,
    borderRadius: raios.md,
    borderWidth: 1,
    borderColor: cores.amber,
  },
  pontosItem: { ...textos.legenda, color: cores.cinza },
  pontosNumero: { ...textos.corpo, color: cores.tinta, fontWeight: '600' },
})
