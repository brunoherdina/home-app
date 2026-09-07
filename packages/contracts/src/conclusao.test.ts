import { describe, expect, it } from 'vitest'
import { concluirTarefaSchema, conclusaoSchema, pontosDaCasaSchema } from './conclusao'

describe('concluir tarefa', () => {
  it('ignora pontos vindos do cliente — não recusa, descarta', () => {
    expect(concluirTarefaSchema.parse({ pontos: 99 })).toEqual({})
    expect(concluirTarefaSchema.parse({})).toEqual({})
  })
})

describe('conclusão lida', () => {
  it('não diz quem concluiu — o "quem" soma "sua parte" no banco e não viaja', () => {
    expect(Object.keys(conclusaoSchema.shape)).toEqual(['id', 'tarefaId', 'pontos', 'concluidaEm'])
  })
})

describe('pontos da casa', () => {
  it('são dois números e só', () => {
    expect(pontosDaCasaSchema.parse({ suaParte: 4, total: 11 })).toEqual({ suaParte: 4, total: 11 })
  })

  it('REPROVA qualquer breakdown por pessoa — a regra inviolável §2.1 como schema', () => {
    // Se este teste quebrar porque alguém "precisou" de um destes campos, a
    // resposta é o ADR-0010, não o `.strictObject` virar `.object`.
    for (const podio of [
      { porMorador: [] },
      { moradores: [] },
      { ranking: [] },
      { outros: 7 },
    ]) {
      expect(pontosDaCasaSchema.safeParse({ suaParte: 4, total: 11, ...podio }).success).toBe(false)
    }
  })

  it('reprova negativo e fracionado', () => {
    expect(pontosDaCasaSchema.safeParse({ suaParte: -1, total: 0 }).success).toBe(false)
    expect(pontosDaCasaSchema.safeParse({ suaParte: 1.5, total: 2 }).success).toBe(false)
  })
})
