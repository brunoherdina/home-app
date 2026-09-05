import type { FastifyPluginAsync } from 'fastify'
import rateLimit from '@fastify/rate-limit'
import { z } from 'zod'
import {
  loginSchema,
  parDeTokensSchema,
  refreshSchema,
  registroSchema,
} from '@casa/contracts'
import { config } from '../config.js'
import { ErroHttp, PayloadInvalidoError, SessaoInvalidaError } from '../erros.js'
import { criaServicoDeAuth } from '../auth/servico.js'
import { criaTokens } from '../auth/tokens.js'

const tokens = criaTokens({
  segredo: config.JWT_SECRET,
  ttlAcessoSegundos: config.ACCESS_TTL_SEGUNDOS,
  ttlRefreshDias: config.REFRESH_TTL_DIAS,
})

const auth = criaServicoDeAuth(tokens, { gracaSegundos: config.REFRESH_GRACA_SEGUNDOS })

/** ADR-0009: o mesmo schema que valida o formulário no app valida o payload aqui. */
function valida<T extends z.ZodType>(schema: T, corpo: unknown): z.infer<T> {
  const resultado = schema.safeParse(corpo)
  if (!resultado.success) throw new PayloadInvalidoError(z.treeifyError(resultado.error))
  return resultado.data
}

/**
 * `/api/auth` — as três rotas que acontecem ANTES de existir identidade.
 *
 * Todas passam por `request.semIdentidade`, nunca pelo pool cru: é o que o
 * ADR-0013 troca pela exceção, e o que `npm run guards` cobra.
 *
 * Fora do escopo desta story, de propósito: `verify-email` (o transporte do
 * e-mail só existe no Épico 0b — token que ninguém consegue resgatar seria
 * decoração), `google` (ADR-0003, ainda sem client id) e `logout` (revogar
 * exige identidade, então é rota autenticada, não daqui).
 */
export const rotasAuth: FastifyPluginAsync = async (app) => {
  // Registrado DENTRO deste plugin: encapsulamento do Fastify faz o limite
  // valer só para /api/auth. O resto da API não deve herdar limite de auth.
  await app.register(rateLimit, {
    max: 30,
    timeWindow: '1 minute',
    // Um `ErroHttp` de verdade, e não o objeto de corpo que o exemplo do plugin
    // sugere: o que o builder devolve é LANÇADO, e chega ao error handler como
    // uma exceção qualquer. Devolvendo `{codigo, mensagem}` cru, o handler não
    // reconhece o tipo, cai no ramo genérico e o 429 vira 500 com
    // "Algo quebrou aqui dentro" — o limite funciona e mente sobre o motivo.
    errorResponseBuilder: () =>
      new ErroHttp(429, 'MUITAS_TENTATIVAS', 'Muitas tentativas. Espere um pouco e tente de novo.'),
  })

  app.post(
    '/auth/register',
    // Mais apertado que o limite do escopo: criar conta é caro (argon2) e é o
    // caminho por onde se enumera e-mail testando o 409.
    { config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request, reply) => {
      const dados = valida(registroSchema, request.body)
      const par = await request.semIdentidade((db) => auth.registra(db, dados))
      return reply.status(201).send(parDeTokensSchema.parse(par))
    },
  )

  app.post(
    '/auth/login',
    // Entregável do Épico 1. Sem ele, argon2 de 19 MiB por tentativa é tanto o
    // convite para força bruta quanto para esgotar a memória do processo.
    { config: { rateLimit: { max: 5, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const dados = valida(loginSchema, request.body)
      const par = await request.semIdentidade((db) => auth.autentica(db, dados))
      return reply.send(parDeTokensSchema.parse(par))
    },
  )

  app.post('/auth/refresh', async (request, reply) => {
    const dados = valida(refreshSchema, request.body)
    const par = await request.semIdentidade((db) => auth.renova(db, dados.refreshToken))

    // O 401 nasce FORA da transação de propósito: a recusa por reuso revoga a
    // família, e lançar lá dentro faria o `semIdentidade` dar ROLLBACK na
    // própria revogação. A transação fecha em COMMIT e só então isto recusa.
    if (!par) throw new SessaoInvalidaError()

    return reply.send(parDeTokensSchema.parse(par))
  })
}
