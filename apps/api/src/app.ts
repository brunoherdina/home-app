import Fastify from 'fastify'
import { config } from './config.js'
import { withUserPlugin, SemIdentidadeError } from './plugins/withUser.js'
import { rotaSaude } from './routes/saude.js'
import type { Erro } from '@casa/contracts'

export async function criaApp() {
  const app = Fastify({
    logger: {
      level: config.NODE_ENV === 'production' ? 'info' : 'debug',
      // Sem body nem header no log: token e payload de dado sensível não viram
      // linha de log (casa-seguranca-privacidade).
      redact: ['req.headers.authorization'],
    },
  })

  await app.register(withUserPlugin)
  await app.register(rotaSaude, { prefix: '/api' })

  app.setErrorHandler((erro: Error & { statusCode?: number }, request, reply) => {
    if (erro instanceof SemIdentidadeError) {
      const corpo: Erro = { codigo: erro.codigo, mensagem: erro.message }
      return reply.status(401).send(corpo)
    }

    request.log.error({ erro }, 'erro não tratado')
    const corpo: Erro = {
      codigo: 'ERRO_INTERNO',
      mensagem: 'Algo quebrou aqui dentro.',
    }
    return reply.status(erro.statusCode ?? 500).send(corpo)
  })

  return app
}
