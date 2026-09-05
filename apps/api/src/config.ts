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
  /**
   * Credencial do role `casa_auth` — o pool das rotas que ainda não têm
   * identidade (ADR-0013). Pool separado e não `GRANT casa_auth TO casa_app`:
   * se um role pudesse virar o outro por `SET ROLE`, o limite viraria convenção.
   */
  AUTH_DATABASE_URL: z.string().min(1),
  /**
   * Segredo HS256 dos tokens (ADR-0003). O mínimo de 32 bytes não é estética:
   * chave HMAC menor que o digest enfraquece a assinatura, e um segredo de
   * desenvolvimento curto vazando para produção é exatamente o acidente que
   * este `min` reprova no boot. Gerar com `openssl rand -base64 48`.
   */
  JWT_SECRET: z.string().min(32),
  /**
   * Vida do access token (ADR-0008). Curta de propósito: é ela que define a
   * janela de um token vazado. O refresh rotativo é o que evita que "curta"
   * signifique "logout a cada 15 minutos".
   */
  ACCESS_TTL_SEGUNDOS: z.coerce.number().int().positive().default(900),
  /** Vida do refresh token (ADR-0008): 30–90 d. */
  REFRESH_TTL_DIAS: z.coerce.number().int().positive().default(60),
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
