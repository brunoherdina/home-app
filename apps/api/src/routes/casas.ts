import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { casaPovoadaSchema, casaSchema, criarCasaSchema } from '@casa/contracts'
import { criaCasa, leCasaPovoada } from '../casa/servico.js'
import { ErroHttp, PayloadInvalidoError } from '../erros.js'
import { exigeIdentidade } from '../plugins/exigeIdentidade.js'

/** ADR-0009: o mesmo schema que valida o formulário no app valida o payload aqui. */
function valida<T extends z.ZodType>(schema: T, corpo: unknown): z.infer<T> {
  const resultado = schema.safeParse(corpo)
  if (!resultado.success) throw new PayloadInvalidoError(z.treeifyError(resultado.error))
  return resultado.data
}

/**
 * As duas rotas da Fase 0 depois que a identidade existe.
 *
 * O `onRequest` vale para este plugin inteiro e para nada além dele: é o
 * encapsulamento do Fastify usado no sentido oposto ao de `/api/auth`, onde ele
 * limita o rate limit. Hook de identidade global quebraria `/api/saude` e as
 * próprias rotas de auth — quem ainda não tem token não pode ser barrado por
 * não ter token.
 */
export const rotasCasa: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', exigeIdentidade)

  app.post('/casas', async (request, reply) => {
    const dados = valida(criarCasaSchema, request.body)
    const casa = await request.withUser((db) => criaCasa(db, dados))
    return reply.status(201).send(casaSchema.parse(casa))
  })

  app.get('/casa', async (request, reply) => {
    const povoada = await request.withUser((db) => leCasaPovoada(db))

    // 404 e não 200 com `null`: "ainda não tem casa" é um lugar diferente do
    // app (a Fase 0), não um estado vazio da tela da casa. O código é o que o
    // cliente usa para rotear — a mensagem é para humano.
    if (!povoada) {
      throw new ErroHttp(404, 'SEM_CASA', 'Você ainda não tem uma casa.')
    }

    return reply.send(casaPovoadaSchema.parse(povoada))
  })
}
