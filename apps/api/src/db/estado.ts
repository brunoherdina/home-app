import { pool } from './pool.js'

/**
 * Leituras de infraestrutura (`GET /api/saude`).
 *
 * Moram aqui e não na rota para que nenhuma rota precise importar o pool — a
 * guarda de camada reprova `db/pool` dentro de `routes/`.
 */
export type EstadoDoBanco = {
  role: string
  versao: string
}

export async function estadoDoBanco(): Promise<EstadoDoBanco> {
  const { rows } = await pool.query<{ role: string; versao: string }>(
    "select current_user as role, current_setting('server_version') as versao",
  )
  const linha = rows[0]
  if (!linha) throw new Error('Postgres não devolveu estado')
  return linha
}
