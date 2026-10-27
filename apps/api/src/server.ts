import { config } from './config.js'
import { criaApp } from './app.js'
import { afirmaContratoDeRls, pool, poolAuth } from './db/pool.js'

async function main() {
  // Antes de aceitar request: se um dos pools conectar como superusuário, com
  // BYPASSRLS ou com o role errado, a API não sobe. Ver ADR-0002 e ADR-0013.
  await afirmaContratoDeRls(pool, 'casa_app')
  await afirmaContratoDeRls(poolAuth, 'casa_auth')

  const app = await criaApp()

  for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(sinal, () => {
      app.log.info({ sinal }, 'encerrando')
      void app.close().then(() => Promise.all([pool.end(), poolAuth.end()]))
    })
  }

  await app.listen({ port: config.PORT, host: config.HOST })
}

main().catch((erro) => {
  console.error(erro)
  process.exit(1)
})
