import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

/**
 * Carrega `infra/.env` para os testes de integração.
 *
 * Os mesmos segredos que o `npm run dev` usa, e o mesmo banco: rotação, reuso e
 * revogação de família só são demonstráveis contra um Postgres de verdade —
 * `FOR UPDATE`, `FORCE RLS` e `GRANT` por coluna não existem em dobro de teste.
 * Ausência do arquivo não interrompe nada aqui: quem depende de `.env` é o teste
 * de integração, e é ele que falha, alto, com a variável faltando.
 */
const env = fileURLToPath(new URL('../../infra/.env', import.meta.url))
if (existsSync(env)) process.loadEnvFile(env)
