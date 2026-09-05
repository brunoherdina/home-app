import { z } from 'zod'
import { uuidSchema } from './comum'

/**
 * A tarefa como a API a devolve no Épico 1.
 *
 * Só `id` e `titulo`: peso de esforço, modo (Rodízio / Fixo / Aberta),
 * responsável e conclusão são o Épico 2 e chegam junto com quem escreve neles.
 * O contrato acompanha a tabela — devolver campo que a coluna ainda não tem
 * obrigaria o app a inventar valor default e a UI a mentir sobre estado.
 *
 * `titulo` é `z.string()` cru, e não um schema de entrada: leitura não
 * re-normaliza o que o banco guardou (mesmo princípio de `casaSchema` e
 * `moradorPublicoSchema`).
 */
export const tarefaSchema = z.object({
  id: uuidSchema,
  titulo: z.string(),
})

export type Tarefa = z.infer<typeof tarefaSchema>
