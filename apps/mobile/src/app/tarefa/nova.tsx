import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { ActivityIndicator, StyleSheet, View } from 'react-native'
import { FormularioDeTarefa, TAREFA_EM_BRANCO } from '../../componentes/tarefa/FormularioDeTarefa'
import { Botao } from '../../design-system/componentes/Botao'
import { cores } from '../../design-system/tokens'
import { buscaCasa, chaveDaCasa } from '../../lib/api/casa'
import { criaTarefa, depoisDeMudarTarefas } from '../../lib/api/tarefas'
import { mensagemDoErro } from '../../lib/erros'

/**
 * Nova tarefa — o destino do botão "+" da aba Tarefas (story 11).
 *
 * Nasce com os defaults do contrato: aberta, médio, sem dono. É o mesmo
 * ponto de partida do template, e o único que não afirma nada sobre quem faz.
 */
export default function NovaTarefa() {
  const cache = useQueryClient()
  const casaQuery = useQuery({ queryKey: chaveDaCasa, queryFn: buscaCasa })

  const criacao = useMutation({
    mutationFn: criaTarefa,
    onSuccess: async () => {
      await depoisDeMudarTarefas(cache)
      router.back()
    },
  })

  // A casa já está em cache vindo da aba; o giro só aparece se não estiver.
  if (!casaQuery.data) {
    return (
      <View style={estilos.centro}>
        <ActivityIndicator color={cores.moss} />
      </View>
    )
  }

  return (
    <FormularioDeTarefa
      titulo="O que precisa ser feito?"
      valoresIniciais={TAREFA_EM_BRANCO}
      moradores={casaQuery.data.moradores}
      euId={casaQuery.data.euId}
      rotuloDoEnvio="Criar tarefa"
      aoEnviar={(dados) => criacao.mutate(dados)}
      enviando={criacao.isPending}
      erro={criacao.isError ? mensagemDoErro(criacao.error) : undefined}
      rodapeExtra={<Botao titulo="Cancelar" variante="texto" aoTocar={() => router.back()} />}
    />
  )
}

const estilos = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: cores.papel },
})
