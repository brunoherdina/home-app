import { defineConfig } from 'vitest/config'

/**
 * Só a lógica pura roda aqui (sessão e núcleo do cliente HTTP) — em Node,
 * sem Expo. É por isso que esses módulos não importam expo-*: teste rápido,
 * sem mock de nativo. Componentes/telas ficam para a decisão de E2E
 * (Maestro × Detox, casa-qa).
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
