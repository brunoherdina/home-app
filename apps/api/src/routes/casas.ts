import type { FastifyPluginAsync, FastifyRequest } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { z } from 'zod'
import {
  casaPovoadaSchema,
  casaSchema,
  conviteSchema,
  criarCasaSchema,
  entrarComCodigoSchema,
} from '@casa/contracts'
import { criaConvite, entraComConvite } from '../casa/convite.js'
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
 * A cota é por conta. `exigeIdentidade` já rodou (é `onRequest`, e o rate limit
 * do plugin corre depois), então `usuarioId` está preenchido; o `?? ip` é rede
 * de segurança para o caso de a ordem dos ganchos mudar — sem ele, um
 * `undefined` faria todo mundo compartilhar o mesmo balde.
 */
function chaveDaIdentidade(request: FastifyRequest): string {
  return request.usuarioId ?? request.ip
}

/**
 * As rotas da Fase 0 depois que a identidade existe: criar casa, convidar,
 * entrar por convite e ler a casa povoada.
 *
 * O `onRequest` vale para este plugin inteiro e para nada além dele: é o
 * encapsulamento do Fastify usado no sentido oposto ao de `/api/auth`, onde ele
 * limita o rate limit. Hook de identidade global quebraria `/api/saude` e as
 * próprias rotas de auth — quem ainda não tem token não pode ser barrado por
 * não ter token.
 */
export const rotasCasa: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', exigeIdentidade)

  // `global: false`: o plugin fica disponível e nenhuma rota herda cota — quem
  // define é o `config` de cada uma. Hoje só o aceite de convite tem.
  //
  // O `errorResponseBuilder` repete o de `/api/auth` pelo mesmo motivo que está
  // documentado lá: o que o builder devolve é LANÇADO, e sem um `ErroHttp` de
  // verdade o error handler não reconhece o tipo, cai no ramo genérico e o 429
  // vira 500 com "Algo quebrou aqui dentro" — o limite funciona e mente sobre
  // o motivo.
  await app.register(rateLimit, {
    global: false,
    errorResponseBuilder: () =>
      new ErroHttp(429, 'MUITAS_TENTATIVAS', 'Muitas tentativas. Espere um pouco e tente de novo.'),
  })

  app.post('/casas', async (request, reply) => {
    const dados = valida(criarCasaSchema, request.body)
    const casa = await request.withUser((db) => criaCasa(db, dados))
    return reply.status(201).send(casaSchema.parse(casa))
  })

  app.post('/convites', async (request, reply) => {
    const convite = await request.withUser((db) => criaConvite(db))
    return reply.status(201).send(conviteSchema.parse(convite))
  })

  /**
   * O ramo *tem convite* da Fase 0.
   *
   * Rate limit próprio e apertado — é a única rota da API em que acertar um
   * palpite dá acesso a dado de outra casa. 32^6 códigos com pouquíssimos vivos
   * por vez já tornam o sorteio inviável; o limite é o que garante que
   * "inviável" não vire "demorado, mas automatizável".
   *
   * A chave é a IDENTIDADE, não o IP: as duas pessoas de uma casa entram pelo
   * mesmo NAT doméstico, e um limite por IP faria a segunda esperar pela
   * primeira. Contra quem cria contas para multiplicar a cota, quem segura é o
   * limite de registro (10/h, `routes/auth.ts`) — e criar conta é bem mais caro
   * que chutar código.
   */
  app.post(
    '/casas/entrar',
    {
      config: { rateLimit: { max: 10, timeWindow: '1 hour', keyGenerator: chaveDaIdentidade } },
    },
    async (request, reply) => {
      const { codigo } = valida(entrarComCodigoSchema, request.body)
      const casa = await request.withUser((db) => entraComConvite(db, codigo))
      return reply.send(casaSchema.parse(casa))
    },
  )

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
