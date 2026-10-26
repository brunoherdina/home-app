/**
 * Quem fica com a vez depois de uma conclusão em Rodízio (decisão de escopo 4
 * do Épico 2).
 *
 * `ordem` é a lista estável da casa (`moradores.criado_em`), sem tabela de
 * ordem própria. A vez anda a partir do RESPONSÁVEL ATUAL, e não de quem
 * concluiu: se o par cobriu a sua vez, a fila continua de onde estava em vez
 * de premiar ou punir quem ajudou — ajudar não muda de quem é a próxima.
 *
 * `null` (ninguém da vez ainda, ou a conta do responsável foi apagada — a FK é
 * `set null`) e responsável que não está mais na lista recomeçam do primeiro:
 * é o ponto previsível da fila, e "previsível" é metade de "justo".
 */
export function proximoDaVez(ordem: readonly string[], atual: string | null): string | null {
  if (ordem.length === 0) return null
  const posicao = atual === null ? -1 : ordem.indexOf(atual)
  if (posicao === -1) return ordem[0]!
  return ordem[(posicao + 1) % ordem.length]!
}
