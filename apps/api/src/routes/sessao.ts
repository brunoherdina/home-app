import type { FastifyPluginAsync } from 'fastify'
import { refreshSchema } from '@casa/contracts'
import { auth } from '../auth/instancia.js'
import { exigeIdentidade } from '../plugins/exigeIdentidade.js'
import { valida } from './valida.js'

/**
 * `POST /api/auth/logout` — a única rota de `/api/auth` que exige identidade.
 *
 * Mora num plugin próprio, e não em `routes/auth.ts`, porque o `onRequest` do
 * Fastify vale para o plugin inteiro: o encapsulamento que dá rate limit a
 * register/login/refresh é o mesmo que daria `exigeIdentidade` a eles se esta
 * rota entrasse lá. Um arquivo a mais é mais barato do que um hook por rota
 * convivendo com um hook de escopo no mesmo lugar — que é onde se erra de qual
 * dos dois vale.
 *
 * O corpo reusa `refreshSchema`: o que o logout precisa saber é exatamente o
 * que o refresh precisa — qual sessão. Um `logoutSchema` idêntico só criaria
 * dois nomes para a mesma forma.
 */
export const rotasSessao: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', exigeIdentidade)

  app.post('/auth/logout', async (request, reply) => {
    const { refreshToken } = valida(refreshSchema, request.body)
    await request.withUser((db) => auth.encerra(db, refreshToken))

    // 204 mesmo quando nada foi revogado (token ilegível, família já morta).
    // Logout é idempotente: quem chamou já apagou o cofre do lado de cá, e um
    // 404 aqui viraria "tentar de novo" para um trabalho que não sobrou.
    return reply.status(204).send()
  })
}
