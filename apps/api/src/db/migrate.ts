import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

/**
 * Aplica as migrations pendentes como `casa_owner`.
 *
 * Roda como passo de deploy, nunca dentro do processo que atende request: a API
 * conecta como `casa_app` e não tem permissão para alterar schema — de propósito.
 */
async function main() {
  const url = process.env.MIGRATION_DATABASE_URL
  if (!url) throw new Error('MIGRATION_DATABASE_URL ausente (role casa_owner).')

  const pool = new pg.Pool({ connectionString: url, max: 1 })
  const db = drizzle(pool)
  const migrationsFolder = join(dirname(fileURLToPath(import.meta.url)), 'migrations')

  await migrate(db, { migrationsFolder })
  await pool.end()
  console.log('migrations aplicadas')
}

main().catch((erro) => {
  console.error(erro)
  process.exit(1)
})
