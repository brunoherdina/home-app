import type { ModoDeTarefa, PesoDeTarefa } from '@casa/contracts'

/** Como cada modo aparece na tela. O valor do enum é do contrato; o texto é daqui. */
export const NOMES_DE_MODO: Readonly<Record<ModoDeTarefa, string>> = {
  rodizio: 'Rodízio',
  fixo: 'Fixo',
  aberta: 'Aberta',
}

/** O que cada modo significa, em uma frase — é o que o formulário mostra sob a escolha. */
export const EXPLICACAO_DO_MODO: Readonly<Record<ModoDeTarefa, string>> = {
  aberta: 'Qualquer um pega — aparece em Livres.',
  rodizio: 'Gira entre todo mundo da casa: quem conclui passa a vez.',
  fixo: 'Sempre com a mesma pessoa.',
}

export const NOMES_DE_PESO: Readonly<Record<PesoDeTarefa, string>> = {
  leve: 'Leve',
  medio: 'Médio',
  pesado: 'Pesado',
}

export function pontosPorExtenso(pontos: number): string {
  return pontos === 1 ? '1 ponto' : `${pontos} pontos`
}
