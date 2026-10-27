import { useQuery } from '@tanstack/react-query'
import { Redirect } from 'expo-router'
import * as SplashScreen from 'expo-splash-screen'
import { useEffect } from 'react'
import { SemConexao } from '../componentes/SemConexao'
import { buscaCasa, chaveDaCasa } from '../lib/api/casa'
import { ErroDaApi, restauraSessao } from '../lib/api/cliente'

/**
 * O boot da Fase 0: decide, ainda debaixo do splash, para qual das três telas a
 * pessoa vai.
 *
 *   sem sessão            → /entrar
 *   sessão, sem casa      → /nova-casa   (ramo do criador)
 *   sessão, com casa      → /tarefas     (a aba do loop central)
 *
 * As duas perguntas são feitas em SEQUÊNCIA e o splash só sai depois das duas.
 * É o que o roadmap chama de "sessão restaurada antes do splash sair", levado
 * até o fim: esconder o splash assim que a sessão volta faria a casa de quem já
 * mora numa aparecer por um instante como formulário de criar casa.
 *
 * Esta tela não desenha nada — ou está atrás do splash, ou já redirecionou.
 */
export default function Boot() {
  const sessaoQuery = useQuery({
    queryKey: ['sessao'],
    queryFn: restauraSessao,
    // Sem re-tentativa e sem envelhecer: a restauração ROTACIONA o refresh
    // (ADR-0008), então repeti-la sozinha gastaria um token por tentativa e um
    // refetch em foco reapresentaria um token já consumido — que é exatamente
    // o sinal de vazamento que revoga a família.
    retry: false,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
  })

  const temSessao = sessaoQuery.data === true

  const casaQuery = useQuery({
    queryKey: chaveDaCasa,
    queryFn: buscaCasa,
    enabled: temSessao,
  })

  // Só há o que decidir quando a pergunta da vez respondeu — de erro ou não.
  const decidido =
    sessaoQuery.isError || sessaoQuery.data === false || (temSessao && !casaQuery.isPending)

  useEffect(() => {
    if (decidido) void SplashScreen.hideAsync()
  }, [decidido])

  if (!decidido) return null

  if (sessaoQuery.isError) {
    return (
      <SemConexao
        aoTentarDeNovo={() => void sessaoQuery.refetch()}
        ocupado={sessaoQuery.isFetching}
      />
    )
  }

  if (!temSessao) return <Redirect href="/entrar" />

  if (casaQuery.isError) {
    // 401 aqui significa que o interceptor tentou renovar e o servidor negou:
    // a sessão acabou de fato, e o cofre já foi limpo. Só o que não é negação
    // vira "sem conexão".
    if (casaQuery.error instanceof ErroDaApi && casaQuery.error.status === 401) {
      return <Redirect href="/entrar" />
    }
    return (
      <SemConexao aoTentarDeNovo={() => void casaQuery.refetch()} ocupado={casaQuery.isFetching} />
    )
  }

  return <Redirect href={casaQuery.data ? '/tarefas' : '/nova-casa'} />
}
