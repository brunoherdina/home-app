import { describe, expect, it } from 'vitest'
import {
  ALFABETO_DO_CODIGO,
  TAMANHO_DO_CODIGO,
  codigoDeConviteSchema,
  normalizaCodigo,
} from './convite'

describe('código de convite', () => {
  it('sobrevive ao caminho do WhatsApp: hífen, espaço e minúscula', () => {
    // O mesmo código, nas quatro formas em que ele realmente chega.
    for (const bruto of ['a1b2c3', 'A1B-2C3', ' a1b 2c3 ', 'A1B2C3']) {
      expect(codigoDeConviteSchema.parse(bruto)).toBe('A1B2C3')
    }
  })

  it('resolve as confusões visuais do alfabeto — O é zero, I e L são um', () => {
    // 'OIL' não existe no alfabeto; quem digitou isso queria '011'.
    expect(normalizaCodigo('oilW9Z')).toBe('011W9Z')
    expect(codigoDeConviteSchema.parse('oilW9Z')).toBe('011W9Z')
  })

  it('NÃO adivinha o U — entrar na casa errada é pior que reprovar', () => {
    expect(codigoDeConviteSchema.safeParse('UUUUUU').success).toBe(false)
  })

  it('reprova tamanho errado depois de normalizar, não antes', () => {
    // Cinco símbolos úteis: os hífens não contam, e é o que a pessoa vê.
    expect(codigoDeConviteSchema.safeParse('A1B-2C').success).toBe(false)
    expect(codigoDeConviteSchema.safeParse('A1B2C3D').success).toBe(false)
    expect(codigoDeConviteSchema.safeParse('').success).toBe(false)
  })

  it('o alfabeto não contém nenhum símbolo que a normalização apagaria', () => {
    // A prova de que gerador e validador falam a mesma língua: se alguém
    // acrescentar 'O' ao alfabeto, o gerador passa a emitir códigos que o
    // próprio schema converte em outro código — e o convite nunca fecha.
    expect(ALFABETO_DO_CODIGO).toHaveLength(32)
    expect(new Set(ALFABETO_DO_CODIGO).size).toBe(32)
    expect(normalizaCodigo(ALFABETO_DO_CODIGO)).toBe(ALFABETO_DO_CODIGO)
    expect(TAMANHO_DO_CODIGO).toBe(6)
  })
})
