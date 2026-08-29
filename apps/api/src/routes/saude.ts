import type { FastifyPluginAsync } from 'fastify'
import { saudeSchema } from '@casa/contracts'
import { estadoDoBanco } from '../db/estado.js'

/**
 * `GET /api/saude` — fecha o laço do ADR-0009 antes de existir domínio: o mesmo
 * schema zod valida a resposta aqui e tipa o client no app.
 *
 * Devolve o `role` da conexão de propósito: se um dia aparecer `casa_owner` ou
 * `casa_admin` nesse campo, a RLS virou decoração.
 */
export const rotaSaude: FastifyPluginAsync = async (app) => {
  app.get('/saude', async (_request, reply) => {
    try {
      const estado = await estadoDoBanco()
      return reply.send(
        saudeSchema.parse({
          ok: true,
          banco: 'conectado',
          role: estado.role,
          versao: estado.versao,
        }),
      )
    } catch (erro) {
      app.log.error({ erro }, 'saude: banco indisponível')
      return reply.status(503).send(
        saudeSchema.parse({
          ok: true,
          banco: 'indisponivel',
          role: 'desconhecido',
          versao: 'desconhecida',
        }),
      )
    }
  })
}
