import { describe, expect, it } from 'vitest'
import {
  BONUS_DA_TAREFA_DETESTADA,
  PONTOS_POR_PESO,
  criarTarefaSchema,
  editarTarefaSchema,
  pesoDeTarefaSchema,
  pontosDaTarefa,
  tarefaSchema,
} from './tarefa'

const RESPONSAVEL = '6f1d2a3c-1111-4aaa-8bbb-000000000001'

describe('criar tarefa', () => {
  it('só o título já é uma tarefa — os defaults são os do template', () => {
    expect(criarTarefaSchema.parse({ titulo: 'Louça' })).toEqual({
      titulo: 'Louça',
      peso: 'medio',
      modo: 'aberta',
      responsavelId: null,
      bonusDetestada: false,
    })
  })

  it('apara o título e reprova vazio e comprido', () => {
    expect(criarTarefaSchema.parse({ titulo: '  Louça  ' }).titulo).toBe('Louça')
    expect(criarTarefaSchema.safeParse({ titulo: '   ' }).success).toBe(false)
    expect(criarTarefaSchema.safeParse({ titulo: 'x'.repeat(65) }).success).toBe(false)
  })

  it('aberta não tem responsável — a CHECK do banco, no campo certo do formulário', () => {
    const resultado = criarTarefaSchema.safeParse({
      titulo: 'Louça',
      modo: 'aberta',
      responsavelId: RESPONSAVEL,
    })
    expect(resultado.success).toBe(false)
    expect(resultado.error?.issues.map((issue) => issue.path)).toEqual([['responsavelId']])
  })

  it('fixo e rodízio aceitam responsável, e aceitam ficar sem — a FK é set null', () => {
    for (const modo of ['fixo', 'rodizio'] as const) {
      expect(criarTarefaSchema.safeParse({ titulo: 'Louça', modo, responsavelId: RESPONSAVEL }).success).toBe(true)
      expect(criarTarefaSchema.safeParse({ titulo: 'Louça', modo }).success).toBe(true)
    }
  })

  it('bônus da tarefa detestada só em rodízio — nem aumento do dono, nem corrida', () => {
    for (const modo of ['fixo', 'aberta'] as const) {
      const resultado = criarTarefaSchema.safeParse({ titulo: 'Banheiro', modo, bonusDetestada: true })
      expect(resultado.success).toBe(false)
      expect(resultado.error?.issues.map((issue) => issue.path)).toEqual([['bonusDetestada']])
    }
    expect(criarTarefaSchema.safeParse({ titulo: 'Banheiro', modo: 'rodizio', bonusDetestada: true }).success).toBe(true)
  })

  it('editar é o mesmo formulário inteiro, não um diff', () => {
    expect(editarTarefaSchema).toBe(criarTarefaSchema)
  })
})

describe('pontos', () => {
  it('leve, médio e pesado valem 1, 2 e 3 — e todo peso do enum tem valor', () => {
    expect(PONTOS_POR_PESO).toEqual({ leve: 1, medio: 2, pesado: 3 })
    expect(Object.keys(PONTOS_POR_PESO).sort()).toEqual([...pesoDeTarefaSchema.options].sort())
  })

  it('o bônus entra só em rodízio, mesmo com a marcação ligada', () => {
    const detestada = { peso: 'pesado', bonusDetestada: true } as const
    expect(pontosDaTarefa({ ...detestada, modo: 'rodizio' })).toBe(3 + BONUS_DA_TAREFA_DETESTADA)
    expect(pontosDaTarefa({ ...detestada, modo: 'fixo' })).toBe(3)
    expect(pontosDaTarefa({ ...detestada, modo: 'aberta' })).toBe(3)
    expect(pontosDaTarefa({ peso: 'leve', modo: 'rodizio', bonusDetestada: false })).toBe(1)
  })
})

describe('tarefa lida', () => {
  it('não carrega contador, histórico nem pontos — isso seria breakdown por pessoa (ADR-0010)', () => {
    const chaves = Object.keys(tarefaSchema.shape)
    expect(chaves).toEqual(['id', 'titulo', 'peso', 'modo', 'responsavelId', 'bonusDetestada'])
    expect(chaves.filter((chave) => /pont|conclu|contador|vezes|ultim/i.test(chave))).toEqual([])
  })
})
