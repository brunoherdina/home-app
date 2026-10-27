import { afterAll, describe, expect, it } from 'vitest'
import { criaApp } from './app.js'
import { pool, poolAuth } from './db/pool.js'

/**
 * Rate limit por pessoa, e não por proxy (Épico 0b).
 *
 * Em produção toda request chega pelo nginx do vps-edge, então o IP do socket
 * é sempre o dele. O teste prova os dois lados da configuração:
 *
 * - com o proxy declarado, cada `X-Forwarded-For` é um balde próprio — senão a
 *   primeira pessoa que erra a senha cinco vezes trava o login de todo mundo;
 * - sem o proxy declarado, o cabeçalho é ignorado — senão qualquer cliente
 *   inventaria um IP por request e o limite deixaria de existir.
 *
 * Não toca o banco: payload vazio morre no zod com 400, e o limite (hook
 * `onRequest`) já contou a tentativa antes disso. Só precisa do `.env` porque
 * o app lê o config no import.
 */

const LIMITE_DO_LOGIN = 5 // o de src/routes/auth.ts

async function tentaLogin(app: Awaited<ReturnType<typeof criaApp>>, ip: string) {
  const resposta = await app.inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { 'x-forwarded-for': ip },
    payload: {},
  })
  return resposta.statusCode
}

afterAll(async () => {
  await Promise.all([pool.end(), poolAuth.end()])
})

describe('rate limit atrás do proxy', () => {
  it('com o proxy declarado, cada pessoa tem o próprio balde', async () => {
    const app = await criaApp({ proxyConfiavel: 'loopback' }) // o inject chega de 127.0.0.1
    try {
      for (let i = 0; i < LIMITE_DO_LOGIN; i++) expect(await tentaLogin(app, '203.0.113.1')).toBe(400)
      expect(await tentaLogin(app, '203.0.113.1')).toBe(429)

      // Outra pessoa, mesmo proxy: segue tentando.
      expect(await tentaLogin(app, '203.0.113.2')).toBe(400)
    } finally {
      await app.close()
    }
  })

  it('sem proxy declarado, X-Forwarded-For inventado não abre balde novo', async () => {
    const app = await criaApp({ proxyConfiavel: '' })
    try {
      for (let i = 0; i < LIMITE_DO_LOGIN; i++) expect(await tentaLogin(app, `198.51.100.${i}`)).toBe(400)
      expect(await tentaLogin(app, '198.51.100.99')).toBe(429)
    } finally {
      await app.close()
    }
  })
})
