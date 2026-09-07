import { z } from 'zod'
import { uuidSchema } from './comum'

/**
 * Peso de esforço — três degraus, nunca um número livre (decisão de escopo 2
 * do Épico 2). Espelha o enum `peso_de_tarefa` do banco: valor novo aqui sem
 * migration é 500 no INSERT, e o contrário é coluna que o app não sabe mostrar.
 */
export const pesoDeTarefaSchema = z.enum(['leve', 'medio', 'pesado'])

/**
 * Os três modos do manifesto §4. Rodízio gira entre moradores, Fixo tem dono,
 * Aberta qualquer um pega — é o que a aba Tarefas chama de "Livres".
 */
export const modoDeTarefaSchema = z.enum(['rodizio', 'fixo', 'aberta'])

export type PesoDeTarefa = z.infer<typeof pesoDeTarefaSchema>
export type ModoDeTarefa = z.infer<typeof modoDeTarefaSchema>

/**
 * Quanto cada peso vale. A UI diz "leve = 1 ponto" a partir DAQUI, e o
 * servidor grava `conclusoes.pontos` a partir DAQUI — uma fonte para as duas
 * pontas, como `DIAS_DE_VALIDADE_DO_CONVITE`.
 *
 * Estar no pacote compartilhado não muda quem decide: o cliente pode calcular
 * para mostrar, mas o que vale é o que o handler calcula ao concluir —
 * `concluirTarefaSchema` não tem campo de pontos, então não há o que
 * "confiar".
 */
export const PONTOS_POR_PESO: Readonly<Record<PesoDeTarefa, number>> = {
  leve: 1,
  medio: 2,
  pesado: 3,
}

/** O bônus do ADR-0010 para quem está da vez na tarefa detestada. Fixo, não configurável. */
export const BONUS_DA_TAREFA_DETESTADA = 2

/**
 * Pontos que uma conclusão desta tarefa vale AGORA.
 *
 * O bônus só entra em Rodízio — a mesma regra do CHECK `bonus_so_em_rodizio`
 * (migration 0006), repetida aqui porque o banco só vê a linha, e a linha
 * gravada nunca viola o CHECK; o que esta função protege é o CÁLCULO: um
 * PATCH que troque o modo e esqueça o bônus não pode virar +2 para o dono.
 */
export function pontosDaTarefa(tarefa: {
  peso: PesoDeTarefa
  modo: ModoDeTarefa
  bonusDetestada: boolean
}): number {
  const base = PONTOS_POR_PESO[tarefa.peso]
  const bonus = tarefa.bonusDetestada && tarefa.modo === 'rodizio' ? BONUS_DA_TAREFA_DETESTADA : 0
  return base + bonus
}

/**
 * Título — o que aparece no cartão. `trim` antes do `min` pelo mesmo motivo do
 * apelido: teclado mobile completa com espaço. O teto de 64 cabe no maior
 * título do template ("Arrumar a cozinha depois do jantar") com folga e ainda
 * cabe numa linha do cartão; título de dois parágrafos é descrição, e
 * descrição não existe neste épico.
 */
export const tituloDeTarefaSchema = z.string().trim().min(1).max(64)

/**
 * A tarefa como a API a devolve a partir do Épico 2.
 *
 * `responsavelId` e não o morador embutido: o app já tem a lista de moradores
 * da casa em cache (`GET /api/casa`) e resolve apelido/cor por ela. Embutir
 * repetiria três campos por tarefa e criaria uma segunda cópia do morador
 * que a UI teria de manter coerente com a primeira.
 *
 * Nada de contador, "quantas vezes concluiu" ou último morador a concluir:
 * histórico por pessoa é o breakdown que o ADR-0010 proíbe, e a tarefa não é
 * o lugar de guardá-lo.
 *
 * Campos crus (`z.string()`, `z.boolean()`) e não os schemas de entrada:
 * leitura não re-normaliza o que o banco guardou (mesmo princípio de
 * `casaSchema` e `moradorPublicoSchema`).
 */
export const tarefaSchema = z.object({
  id: uuidSchema,
  titulo: z.string(),
  peso: pesoDeTarefaSchema,
  modo: modoDeTarefaSchema,
  responsavelId: uuidSchema.nullable(),
  bonusDetestada: z.boolean(),
})

export type Tarefa = z.infer<typeof tarefaSchema>

/**
 * Payload de `POST /api/tarefas` — e de `PATCH /api/tarefas/:id`, que recebe
 * o formulário INTEIRO e não um diff. A tela de tarefa edita os cinco campos
 * de uma vez, e as duas regras cruzadas abaixo só se deixam validar quando
 * `modo`, `responsavelId` e `bonusDetestada` chegam juntos: um diff que
 * mandasse só `modo: 'aberta'` passaria aqui e cairia no CHECK do banco, com
 * a mesma regra dando erro de formulário numa hora e 409 na outra.
 *
 * As duas regras são as CHECKs de 0006 escritas na língua do formulário:
 * `tarefa_aberta_sem_responsavel` e `bonus_so_em_rodizio`. Repetir aqui não
 * substitui o CHECK — é o que faz a pessoa ver o erro no campo certo antes
 * de o servidor recusar (ADR-0009: o mesmo schema roda no resolver e no
 * handler).
 *
 * ADR-0009: FORMA, nunca autoridade. `responsavelId` de outra casa passa
 * neste schema e é a POLICY quem recusa (`WITH CHECK` de 0006).
 */
export const criarTarefaSchema = z
  .object({
    titulo: tituloDeTarefaSchema,
    peso: pesoDeTarefaSchema.default('medio'),
    modo: modoDeTarefaSchema.default('aberta'),
    responsavelId: uuidSchema.nullable().default(null),
    bonusDetestada: z.boolean().default(false),
  })
  .refine((tarefa) => tarefa.modo !== 'aberta' || tarefa.responsavelId === null, {
    message: 'Tarefa aberta não tem responsável — qualquer um pega.',
    path: ['responsavelId'],
  })
  .refine((tarefa) => !tarefa.bonusDetestada || tarefa.modo === 'rodizio', {
    message: 'O bônus da tarefa detestada só existe em rodízio.',
    path: ['bonusDetestada'],
  })

/** Ver `criarTarefaSchema`: editar é mandar o formulário inteiro de novo. */
export const editarTarefaSchema = criarTarefaSchema

export type CriarTarefa = z.infer<typeof criarTarefaSchema>
export type EditarTarefa = z.infer<typeof editarTarefaSchema>
