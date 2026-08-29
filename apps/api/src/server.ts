import { config } from './config.js'
import { criaApp } from './app.js'
import { afirmaContratoDeRls, pool } from './db/pool.js'

async function main() {
  // Antes de aceitar request: se o pool conectar como superusuário ou com
  // BYPASSRLS, a API não sobe. Ver ADR-0002.
  await afirmaContratoDeRls()

  const app = await criaApp()

  for (const sinal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(sinal, () => {
      app.log.info({ sinal }, 'encerrando')
      void app.close().then(() => pool.end())
    })
  }

  await app.listen({ port: config.PORT, host: config.HOST })
}

main().catch((erro) => {
  console.error(erro)
  process.exit(1)
})
