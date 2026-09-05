import Fastify from 'fastify'
import { config } from './config.js'
import { withUserPlugin } from './plugins/withUser.js'
import { semIdentidadePlugin } from './plugins/semIdentidade.js'
import { rotaSaude } from './routes/saude.js'
import { rotasAuth } from './routes/auth.js'
import { ErroHttp, PayloadInvalidoError } from './erros.js'
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

  // ANTES dos registros, e isso não é estilo: `await app.register(...)` carrega
  // o plugin na hora, e o contexto encapsulado do plugin herda o error handler
  // que existir NAQUELE instante. Definido depois, o handler valeria só para a
  // raiz — toda rota responderia com o envelope padrão do Fastify
  // (`{statusCode, error, message}`) em vez do `erroSchema` do contrato, e a
  // mensagem crua da exceção vazaria para o cliente. Foi assim que a primeira
  // versão desta story devolveu um hash de senha dentro de um 500.
  app.setErrorHandler((erro: Error & { statusCode?: number }, request, reply) => {
    if (erro instanceof ErroHttp) {
      // Erro previsto do domínio é `warn`, não `error`: senha errada é operação
      // normal, e alertar nela treina quem opera a ignorar o log.
      request.log.warn({ codigo: erro.codigo, status: erro.status }, 'requisição recusada')
      const corpo: Erro = { codigo: erro.codigo, mensagem: erro.message }
      // `detalhes` só no payload inválido, e vindo do zod: é o único erro em que
      // o cliente consegue agir sobre o motivo. Credencial e sessão respondem
      // sem detalhe de propósito.
      if (erro instanceof PayloadInvalidoError) corpo.detalhes = erro.detalhes
      return reply.status(erro.status).send(corpo)
    }

    request.log.error({ erro }, 'erro não tratado')
    const corpo: Erro = {
      codigo: 'ERRO_INTERNO',
      mensagem: 'Algo quebrou aqui dentro.',
    }
    return reply.status(erro.statusCode ?? 500).send(corpo)
  })

  await app.register(withUserPlugin)
  await app.register(semIdentidadePlugin)
  await app.register(rotaSaude, { prefix: '/api' })
  await app.register(rotasAuth, { prefix: '/api' })

  return app
}
