import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router, useLocalSearchParams } from 'expo-router'
import { ActivityIndicator, Alert, StyleSheet, View } from 'react-native'
import { FormularioDeTarefa } from '../../componentes/tarefa/FormularioDeTarefa'
import { Aviso } from '../../design-system/componentes/Aviso'
import { Botao } from '../../design-system/componentes/Botao'
import { cores, espacos } from '../../design-system/tokens'
import { buscaCasa, chaveDaCasa } from '../../lib/api/casa'
import {
  apagaTarefa,
  buscaTarefas,
  chaveDasTarefas,
  depoisDeMudarTarefas,
  editaTarefa,
} from '../../lib/api/tarefas'
import { mensagemDoErro } from '../../lib/erros'

/**
 * Editar ou apagar uma tarefa — o toque no cartão da aba Tarefas (story 11).
 *
 * A tarefa vem da lista em cache, não de um `GET` próprio: não existe rota de
 * uma tarefa só, e a lista já está na mão de quem chegou até aqui. Se ela
 * sumiu (outra pessoa apagou), a tela diz isso em vez de abrir um formulário
 * vazio.
 */
export default function EditarTarefa() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const cache = useQueryClient()
  const casaQuery = useQuery({ queryKey: chaveDaCasa, queryFn: buscaCasa })
  const tarefasQuery = useQuery({ queryKey: chaveDasTarefas, queryFn: buscaTarefas })

  const aoTerminar = async () => {
    await depoisDeMudarTarefas(cache)
    router.back()
  }

  const edicao = useMutation({
    mutationFn: (dados: Parameters<typeof editaTarefa>[1]) => editaTarefa(id, dados),
    onSuccess: aoTerminar,
  })

  // Ao contrário de salvar, apagar volta ANTES de invalidar: esperando o
  // refetch, esta tela re-renderizaria sem a tarefa e piscaria "não existe
  // mais" no caminho de volta.
  const remocao = useMutation({
    mutationFn: () => apagaTarefa(id),
    onSuccess: () => {
      router.back()
      void depoisDeMudarTarefas(cache)
    },
  })

  if (!casaQuery.data || !tarefasQuery.data) {
    return (
      <View style={estilos.centro}>
        <ActivityIndicator color={cores.moss} />
      </View>
    )
  }

  const tarefa = tarefasQuery.data.find((candidata) => candidata.id === id)

  if (!tarefa) {
    return (
      <View style={estilos.sumiu}>
        <Aviso tom="nota" mensagem="Essa tarefa não existe mais." />
        <Botao titulo="Voltar" aoTocar={() => router.back()} />
      </View>
    )
  }

  /**
   * Apagar leva as conclusões junto (cascade, migration 0007) — e com elas os
   * pontos que a tarefa já rendeu, na parte de quem fez e no total da casa. A
   * confirmação diz isso, porque é a única ação do app que DIMINUI pontos.
   */
  function confirmaRemocao() {
    Alert.alert(
      `Apagar "${tarefa!.titulo}"?`,
      'Os pontos que ela já rendeu saem do total da casa e da parte de quem a fez.',
      [
        { text: 'Manter', style: 'cancel' },
        { text: 'Apagar', style: 'destructive', onPress: () => remocao.mutate() },
      ],
    )
  }

  const falha = edicao.error ?? remocao.error

  return (
    <FormularioDeTarefa
      titulo="Ajustar a tarefa"
      valoresIniciais={{
        titulo: tarefa.titulo,
        peso: tarefa.peso,
        modo: tarefa.modo,
        responsavelId: tarefa.responsavelId,
        bonusDetestada: tarefa.bonusDetestada,
      }}
      moradores={casaQuery.data.moradores}
      euId={casaQuery.data.euId}
      rotuloDoEnvio="Salvar"
      aoEnviar={(dados) => edicao.mutate(dados)}
      enviando={edicao.isPending}
      erro={falha ? mensagemDoErro(falha) : undefined}
      rodapeExtra={
        <Botao
          titulo="Apagar tarefa"
          variante="texto"
          aoTocar={confirmaRemocao}
          ocupado={remocao.isPending}
        />
      }
    />
  )
}

const estilos = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: cores.papel },
  sumiu: { flex: 1, padding: espacos.lg, gap: espacos.md, backgroundColor: cores.papel },
})
