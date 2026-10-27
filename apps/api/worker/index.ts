import { afirmaContratoDeRls, pool } from '../src/db/pool.js'

/**
 * Worker do Casa — cron de notificação, agregação de incômodos e limpeza de jti.
 *
 * No Épico 0a ele existe sem job nenhum: o que se prova aqui é o encanamento
 * (container, env, conexão) e que ele obedece ao mesmo contrato da API — o
 * worker também conecta como `casa_app`, sem BYPASSRLS. Job que precisa agregar
 * dado sensível vai injetar identidade como qualquer request (ADR-0002), não
 * escapar da RLS por ser "processo interno".
 *
 * Jobs entram a partir do Épico 3. Todo job precisa ser idempotente: o cron
 * repete.
 */
const jobs: Array<{ nome: string; cron: string; executa: () => Promise<void> }> = []

async function main() {
  await afirmaContratoDeRls(pool, 'casa_app')

  if (jobs.length === 0) {
    console.log('worker: nenhum job registrado (esperado até o Épico 3)')
  }

  const encerra = async () => {
    await pool.end()
    process.exit(0)
  }
  process.once('SIGINT', encerra)
  process.once('SIGTERM', encerra)

  // Mantém o processo vivo para que o container não entre em restart loop.
  setInterval(() => {}, 60_000)
}

main().catch((erro) => {
  console.error(erro)
  process.exit(1)
})
