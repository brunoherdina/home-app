import type { onRequestHookHandler } from 'fastify'
import { tokens } from '../auth/instancia.js'
import { SessaoInvalidaError } from '../erros.js'

const PREFIXO = 'Bearer '

/**
 * Traduz o `Authorization: Bearer` em `request.usuarioId` — o único lugar do
 * processo onde um access token vira identidade.
 *
 * É `onRequest`, o gancho mais cedo do ciclo do Fastify: o token é conferido
 * antes de o corpo ser lido, então request sem credencial não paga parsing de
 * JSON. E é opt-in por escopo (`app.addHook` dentro do plugin de rotas), não
 * global: `/api/saude` e `/api/auth` existem justamente para quem ainda não tem
 * identidade, e um hook global os quebraria — o mesmo motivo pelo qual o
 * `semIdentidade` do ADR-0013 tem pool próprio.
 *
 * Não abre transação nem toca o banco. Quem faz isso é o `withUser`, e a
 * separação é deliberada: identidade é o que o token PROVA, acesso é o que a
 * policy DECIDE (ADR-0002). Hook que já trouxesse a linha do morador tentaria
 * o handler a confiar nela em vez de consultar sob RLS.
 */
export const exigeIdentidade: onRequestHookHandler = async (request) => {
  const cabecalho = request.headers.authorization

  // Ausente e malformado dão a MESMA resposta: dizer "faltou o header" a mais
  // de um cliente é ensinar a sondar. Para o app os dois significam entrar de novo.
  if (!cabecalho?.startsWith(PREFIXO)) throw new SessaoInvalidaError()

  const token = cabecalho.slice(PREFIXO.length).trim()
  if (!token) throw new SessaoInvalidaError()

  request.usuarioId = await tokens.verificaAcesso(token)
}
