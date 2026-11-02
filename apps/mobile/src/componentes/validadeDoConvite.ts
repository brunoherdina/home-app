/**
 * Meses por extenso numa tabela fixa, e não `toLocaleDateString('pt-BR')`: o
 * Hermes depende dos dados de locale do aparelho para o `Intl`, e a mesma
 * chamada pode devolver "9 de novembro", "09/11/2026" ou o mês em inglês.
 */
const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
]

/**
 * "9 de novembro" — até quando o convite vale, no fuso do aparelho.
 *
 * Só o dia: o código vale sete dias, e a hora exata em que expira é precisão
 * que ninguém usa ao mandar um convite. O ano entra apenas quando não é o
 * corrente, que é o único caso em que a data sem ele engana.
 */
export function validadeDoConvite(expiraEm: string, agora: Date = new Date()): string {
  const data = new Date(expiraEm)
  const dia = `${data.getDate()} de ${MESES[data.getMonth()]}`
  return data.getFullYear() === agora.getFullYear() ? dia : `${dia} de ${data.getFullYear()}`
}
