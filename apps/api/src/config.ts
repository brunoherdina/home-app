import { z } from 'zod'

/**
 * Env do processo da API, validado no boot.
 *
 * Falhar aqui é de propósito: subir sem `DATABASE_URL` e descobrir na primeira
 * request é o mesmo defeito que a RLS decorativa — o erro aparece longe da causa.
 */
const envSchema = z.object({
  /**
   * Credencial do role `casa_app` — sem BYPASSRLS e sem ser dono das tabelas.
   * A API nunca recebe a credencial de `casa_owner` nem a de `casa_admin`.
   */
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(3333),
  /**
   * 0.0.0.0 e não 127.0.0.1: no WSL2 o device físico alcança a API pela rede,
   * e localhost dentro do container não é o localhost do host.
   */
  HOST: z.string().default('0.0.0.0'),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
})

const parsed = envSchema.safeParse(process.env)

if (!parsed.success) {
  const problemas = parsed.error.issues
    .map((i) => `  ${i.path.join('.') || '(raiz)'}: ${i.message}`)
    .join('\n')
  throw new Error(`Env inválido para a API:\n${problemas}`)
}

export const config = parsed.data
