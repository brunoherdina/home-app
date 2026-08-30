import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { defineConfig } from 'drizzle-kit'

/**
 * O `db:migrate` roda por `tsx --env-file`, mas o `drizzle-kit` tem CLI própria
 * e não aceita esse flag — sem isto, o `db:generate` que o infra/README manda
 * rodar como primeiro passo de toda migration morre em
 * "MIGRATION_DATABASE_URL ausente" numa shell limpa.
 *
 * O ambiente real tem precedência: o `.env` só preenche o que falta, e em
 * deploy (onde o arquivo não existe) o carregamento é simplesmente pulado.
 */
const envLocal = join(dirname(fileURLToPath(import.meta.url)), '../../infra/.env')
if (!process.env.MIGRATION_DATABASE_URL && existsSync(envLocal)) {
  process.loadEnvFile(envLocal)
}

/**
 * O drizzle-kit conecta como `casa_owner` — nunca como o role da API.
 * `MIGRATION_DATABASE_URL` só existe no ambiente de quem roda migration.
 */
const url = process.env.MIGRATION_DATABASE_URL

if (!url) {
  throw new Error(
    'MIGRATION_DATABASE_URL ausente. Migration roda como casa_owner; ' +
      'DATABASE_URL (casa_app) não serve — ver ADR-0002.',
  )
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: { url },
  // Toda migration é revisada à mão antes de aplicar: policy, GRANT e o down.sql
  // não saem do gerador (ADR-0005).
  verbose: true,
  strict: true,
})
