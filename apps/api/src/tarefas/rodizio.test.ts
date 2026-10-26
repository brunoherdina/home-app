import { describe, expect, it } from 'vitest'
import { proximoDaVez } from './rodizio.js'

const ANA = 'ana'
const BIA = 'bia'
const CAIO = 'caio'
/** A ordem de `moradores.criado_em`: quem entrou primeiro vem primeiro. */
const CASA = [ANA, BIA, CAIO]

describe('rodízio', () => {
  it('passa a vez ao próximo da ordem, e do último volta ao primeiro', () => {
    expect(proximoDaVez(CASA, ANA)).toBe(BIA)
    expect(proximoDaVez(CASA, BIA)).toBe(CAIO)
    expect(proximoDaVez(CASA, CAIO)).toBe(ANA)
  })

  it('três conclusões dão a volta inteira — ninguém é pulado, ninguém repete', () => {
    let vez: string | null = ANA
    const visitados: (string | null)[] = []
    for (let i = 0; i < CASA.length; i++) {
      vez = proximoDaVez(CASA, vez)
      visitados.push(vez)
    }
    expect(visitados).toEqual([BIA, CAIO, ANA])
  })

  it('ninguém da vez começa do primeiro', () => {
    expect(proximoDaVez(CASA, null)).toBe(ANA)
  })

  it('responsável que já não está na casa também recomeça do primeiro', () => {
    expect(proximoDaVez(CASA, 'quem-saiu')).toBe(ANA)
  })

  it('morando sozinho, a vez é sempre sua; casa sem ninguém não tem vez', () => {
    expect(proximoDaVez([ANA], ANA)).toBe(ANA)
    expect(proximoDaVez([], null)).toBeNull()
  })
})
