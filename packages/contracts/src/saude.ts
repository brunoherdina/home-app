import { z } from 'zod'

/**
 * Resposta de `GET /api/saude`.
 *
 * Existe no Épico 0a para fechar o laço do ADR-0009 ponta a ponta antes de haver
 * domínio: o mesmo schema valida a resposta na API e tipa o client no app.
 */
export const saudeSchema = z.object({
  ok: z.literal(true),
  banco: z.enum(['conectado', 'indisponivel']),
  /** Role efetivo da conexão do pool. Deve ser sempre `casa_app` (ADR-0002). */
  role: z.string(),
  versao: z.string(),
})

export type Saude = z.infer<typeof saudeSchema>
