import { expect, test } from 'vitest'
import { apelidoSchema, corSchema, moradorPublicoSchema } from './morador'

/**
 * Testes de INTENÇÃO (casa-qa) dos schemas de morador — ver `auth.test.ts`
 * para o racional da suíte.
 */

test('apelido: trim vem ANTES do min — "  a  " reprova, "  ab  " vira "ab"', () => {
  // Se o min rodasse sobre a string crua, "  a  " (5 chars) passaria — e "  "
  // viraria apelido válido.
  expect(apelidoSchema.safeParse('  a  ').success).toBe(false)
  expect(apelidoSchema.parse('  ab  ')).toBe('ab')
})

test('cor é TOKEN do design system, não hex — "#aabbcc" reprova', () => {
  // A coluna `moradores.cor` guarda token, não estilo cru (casa-ux-ui,
  // apps/api/src/db/schema.ts). Aceitar hex aqui devolveria ao app o poder de
  // gravar cor literal no banco e tirar o tema do design system.
  expect(corSchema.parse('verde-menta')).toBe('verde-menta')
  expect(corSchema.safeParse('#aabbcc').success).toBe(false)
  expect(corSchema.safeParse('VerdeMenta').success).toBe(false)
  expect(corSchema.safeParse('a').success).toBe(false)
})

test('moradorPublicoSchema faz strip: e-mail e hash de senha NÃO vazam no parse', () => {
  // Handler que serializa morador para outra pessoa passa por este schema; se
  // um refactor trocar para `.loose()`, credencial vaza — e é este teste que
  // reprova.
  const linhaDoBanco = {
    id: '123e4567-e89b-42d3-a456-426614174000',
    apelido: 'Ana',
    cor: 'verde-menta',
    email: 'nao-vaza@example.com',
    senhaHash: 'argon2id$...',
  }
  const publico = moradorPublicoSchema.parse(linhaDoBanco)
  expect(Object.keys(publico).sort()).toEqual(['apelido', 'cor', 'id'])
  expect('email' in publico).toBe(false)
  expect('senhaHash' in publico).toBe(false)
})

test('moradorPublicoSchema NÃO re-valida o que o banco guardou — leitura aceita legado', () => {
  // Schema de leitura é allowlist de campos, não normalizador. Se ele reusasse
  // apelidoSchema/corSchema, endurecer a regra de ENTRADA transformaria linha
  // antiga em erro de SERIALIZAÇÃO — 500 num endpoint de leitura por causa de
  // dado que já estava gravado.
  const linhaLegada = {
    id: '123e4567-e89b-42d3-a456-426614174000',
    apelido: 'A',
    cor: '#aabbcc',
  }
  expect(moradorPublicoSchema.parse(linhaLegada)).toEqual(linhaLegada)
})
