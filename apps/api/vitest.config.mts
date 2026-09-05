import { defineConfig } from 'vitest/config'

/**
 * Duas famílias de teste, no mesmo comando:
 *
 *   `*.test.ts`            lógica pura — assinatura de token, hash de senha.
 *                          Sem banco e sem `.env`; é por isso que `tokens.ts` é
 *                          fábrica e não importa `config`, e que a expiração
 *                          deixa de ser algo que só se verifica esperando 15 min.
 *   `*.integracao.test.ts` contra o Postgres do compose, como `casa_auth`.
 *                          Rotação, detecção de reuso e janela de graça vivem em
 *                          `FOR UPDATE` e em `GRANT` — provar isso em dobro de
 *                          teste seria provar o dobro, não o código.
 *
 * `npm test` exige o banco de pé, como `check:rls` e `check:roles` já exigem —
 * `npm run verify` é um alvo com Postgres, não sem.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
    // As transações de integração disputam a MESMA linha de `sessoes` com
    // `FOR UPDATE`. Arquivos em paralelo transformariam o lock em deadlock
    // intermitente — o tipo de teste instável que ensina a ignorar o vermelho.
    fileParallelism: false,
  },
})
