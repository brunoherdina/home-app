import { z } from 'zod'
import { uuidSchema } from './comum'

/**
 * Tipos de casa que o Épico 1 conhece — cada um tem o template de tarefas que o
 * backend semeia ao criar a casa. Tipo novo aqui sem template correspondente é
 * casa nascendo vazia: os dois andam juntos, no mesmo PR.
 */
export const tipoDeCasaSchema = z.enum(['casal', 'republica', 'familia'])

/**
 * Payload de `POST /api/casas`.
 *
 * ADR-0009: zod valida FORMA, nunca autoridade. Não há `moradorId` nem
 * `casaId` aqui de propósito — quem cria é a identidade do request
 * (`app.current_user_id`), e quem barra o resto é a RLS (ADR-0002). Payload
 * aprovado não é permissão concedida.
 */
export const criarCasaSchema = z.object({
  nome: z.string().trim().min(1).max(48),
  tipo: tipoDeCasaSchema,
})

/** A casa como a API a devolve — leitura não re-normaliza o que o banco guardou. */
export const casaSchema = z.object({
  id: uuidSchema,
  nome: z.string(),
  tipo: tipoDeCasaSchema,
})

export type TipoDeCasa = z.infer<typeof tipoDeCasaSchema>
export type CriarCasa = z.infer<typeof criarCasaSchema>
export type Casa = z.infer<typeof casaSchema>
