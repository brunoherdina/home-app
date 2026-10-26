import { useMutation, useQueryClient, useQuery } from '@tanstack/react-query'
import type { MoradorPublico } from '@casa/contracts'
import { Redirect, useRouter } from 'expo-router'
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native'
import { Convite } from '../../componentes/Convite'
import { SemConexao } from '../../componentes/SemConexao'
import { Botao } from '../../design-system/componentes/Botao'
import { cores, espacos, raios, textos, type Cor } from '../../design-system/tokens'
import { sai } from '../../lib/api/auth'
import { buscaCasa, chaveDaCasa } from '../../lib/api/casa'
import { ErroDaApi } from '../../lib/api/cliente'

/**
 * A aba Casa — quem mora aqui, convidar e sair.
 *
 * Até o Épico 2 era aqui que a casa povoada listava as tarefas; com as abas
 * (decisão de escopo 6) a lista mora na aba Tarefas, e esta fica com o que é
 * da casa. O conteúdo de verdade dela — nível, ofensiva, meta coletiva — é o
 * Épico 3.
 *
 * O que esta tela NÃO mostra é tão deliberado quanto o que mostra: nenhum
 * morador tem contador nem pontos ao lado, e a lista não é ordenada por nada
 * que se pareça com desempenho (manifesto §2 — sem pódio, sem ranking). A
 * ordem vem do servidor, que a devolve por data de entrada.
 */
export default function Casa() {
  const casaQuery = useQuery({ queryKey: chaveDaCasa, queryFn: buscaCasa })
  const cache = useQueryClient()
  const router = useRouter()

  /**
   * `cache.clear()` não é higiene, é correção: sem ele a casa e os moradores de
   * quem saiu ficam no cache, e a próxima pessoa a entrar NESTE aparelho vê a
   * tela da anterior no intervalo entre o login e a primeira resposta. Num app
   * de duas pessoas na mesma casa isso passa despercebido; em qualquer outro
   * caso é vazamento de dado entre contas.
   *
   * `sai()` nunca rejeita (lib/api/auth.ts) — não há `onError` a escrever.
   */
  const saida = useMutation({
    mutationFn: sai,
    onSuccess: () => {
      cache.clear()
      router.replace('/entrar')
    },
  })

  function confirmaSaida() {
    Alert.alert('Sair da conta?', 'Para voltar, é só entrar de novo com e-mail e senha.', [
      { text: 'Ficar', style: 'cancel' },
      { text: 'Sair', style: 'destructive', onPress: () => saida.mutate() },
    ])
  }

  if (casaQuery.isPending) {
    return (
      <View style={estilos.centro}>
        <ActivityIndicator color={cores.moss} />
      </View>
    )
  }

  if (casaQuery.isError) {
    if (casaQuery.error instanceof ErroDaApi && casaQuery.error.status === 401) {
      return <Redirect href="/entrar" />
    }
    return (
      <SemConexao aoTentarDeNovo={() => void casaQuery.refetch()} ocupado={casaQuery.isFetching} />
    )
  }

  // A casa sumiu entre o boot e aqui (conta sem casa, cache limpo). Devolve ao
  // ramo do criador em vez de desenhar uma casa vazia que não existe.
  if (!casaQuery.data) return <Redirect href="/nova-casa" />

  const { casa, euId, moradores } = casaQuery.data

  return (
    <ScrollView contentContainerStyle={estilos.conteudo}>
      <Text style={estilos.titulo}>{casa.nome}</Text>

      <View style={estilos.secao}>
        <Text style={estilos.rotulo}>Quem mora aqui</Text>
        <View style={estilos.moradores}>
          {moradores.map((morador) => (
            <ChipDeMorador key={morador.id} morador={morador} ehVoce={morador.id === euId} />
          ))}
        </View>
      </View>

      <View style={estilos.secao}>
        <Text style={estilos.rotulo}>Convidar</Text>
        <Convite />
      </View>

      {/* Variante `texto` e no fim da rolagem de propósito: sair é a ação mais
          rara desta tela e a única que custa digitar a senha de volta. */}
      <Botao
        titulo="Sair da conta"
        variante="texto"
        aoTocar={confirmaSaida}
        ocupado={saida.isPending}
      />
    </ScrollView>
  )
}

/**
 * Apelido e cor, e nada além disso — é o `moradorPublicoSchema` desenhado.
 *
 * A cor chega como NOME de token (contracts/morador.ts). Um token
 * desconhecido — cor gravada antes de a paleta encolher, por exemplo — cai no
 * cinza em vez de derrubar a tela: leitura não deve morrer por dado legado.
 */
function ChipDeMorador({ morador, ehVoce }: { morador: MoradorPublico; ehVoce: boolean }) {
  const cor = cores[morador.cor as Cor] ?? cores.cinza
  return (
    <View style={estilos.morador}>
      <View style={[estilos.bolinha, { backgroundColor: cor }]} />
      <Text style={estilos.apelido}>{ehVoce ? `${morador.apelido} (você)` : morador.apelido}</Text>
    </View>
  )
}

const estilos = StyleSheet.create({
  centro: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: cores.papel },
  conteudo: { padding: espacos.lg, gap: espacos.xl, backgroundColor: cores.papel, flexGrow: 1 },
  titulo: { ...textos.titulo, color: cores.moss },
  secao: { gap: espacos.sm },
  rotulo: { ...textos.legenda, color: cores.cinza, textTransform: 'uppercase' },
  moradores: { flexDirection: 'row', flexWrap: 'wrap', gap: espacos.sm },
  morador: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacos.sm,
    paddingVertical: espacos.sm,
    paddingHorizontal: espacos.md,
    borderRadius: raios.pilula,
    borderWidth: 1,
    borderColor: cores.cinza,
  },
  bolinha: { width: 14, height: 14, borderRadius: raios.pilula },
  apelido: { ...textos.corpo, color: cores.tinta },
})
