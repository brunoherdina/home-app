import { z } from 'zod'

/**
 * Identificador de qualquer entidade do Casa.
 *
 * O mesmo uuid que o handler injeta em `app.current_user_id` (ADR-0002) — validar
 * a forma aqui não concede nenhuma permissão: quem decide acesso é a policy.
 */
export const uuidSchema = z.uuid()

/**
 * Envelope de erro da API. Único formato que o app precisa entender.
 *
 * `codigo` é estável e legível por máquina; `mensagem` é para humano e pode mudar
 * sem quebrar o cliente.
 */
export const erroSchema = z.object({
  codigo: z.string().min(1),
  mensagem: z.string().min(1),
  detalhes: z.unknown().optional(),
})

export type Erro = z.infer<typeof erroSchema>
