import { describe, expect, it } from 'vitest'
import { validadeDoConvite } from '../validadeDoConvite'

/** Datas ao meio-dia local: o teste não pode depender do fuso de quem roda. */
const local = (ano: number, mes: number, dia: number) => new Date(ano, mes - 1, dia, 12)

describe('validade do convite', () => {
  it('diz o dia e o mês por extenso', () => {
    expect(validadeDoConvite(local(2026, 11, 9).toISOString(), local(2026, 11, 2))).toBe(
      '9 de novembro',
    )
  })

  it('põe o ano quando o convite vira o ano', () => {
    expect(validadeDoConvite(local(2027, 1, 3).toISOString(), local(2026, 12, 27))).toBe(
      '3 de janeiro de 2027',
    )
  })
})
