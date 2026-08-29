import { defineConfig } from 'drizzle-kit'

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
