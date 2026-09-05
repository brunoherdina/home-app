import { defineConfig } from 'vitest/config'

/**
 * Só lógica pura roda aqui: assinatura de token e hash de senha — sem banco,
 * sem `.env`, sem processo Fastify. É por isso que `auth/tokens.ts` é fábrica e
 * não importa `config`: o teste assina com segredo de brinquedo e TTL negativo,
 * e a expiração deixa de ser algo que só se verifica esperando 15 minutos.
 *
 * O que depende do Postgres (rotação, reuso, janela de graça) é a story 5, e
 * entra com a suíte de integração que o critério de aceite dela exige.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
