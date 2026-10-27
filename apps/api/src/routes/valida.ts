import { z } from 'zod'
import { PayloadInvalidoError } from '../erros.js'

/**
 * ADR-0009: o mesmo schema que valida o formulário no app valida o payload
 * aqui — e vale para `body` e para `params` igualmente: um `:id` que não é
 * uuid é payload inválido, não "tarefa não encontrada".
 *
 * O `treeifyError` vai para `detalhes` da resposta 400: é o único erro em que
 * o cliente consegue agir sobre o motivo (marcar o campo). Credencial e sessão
 * respondem sem detalhe de propósito (`erros.ts`).
 */
export function valida<T extends z.ZodType>(schema: T, corpo: unknown): z.infer<T> {
  const resultado = schema.safeParse(corpo)
  if (!resultado.success) throw new PayloadInvalidoError(z.treeifyError(resultado.error))
  return resultado.data
}
