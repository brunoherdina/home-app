import {
  casaSchema,
  conviteSchema,
  type Casa,
  type Convite,
  type EntrarComCodigo,
} from '@casa/contracts'
import { requisita } from './cliente'

/**
 * Gera um código novo para a casa de quem pediu.
 *
 * Cada chamada emite um convite — não há "reaproveita o último". Dois códigos
 * vivos ao mesmo tempo é um custo pequeno (cada um vale por uma pessoa só e
 * expira sozinho), e a alternativa seria uma tela de gerenciar convites, que é
 * exatamente o labirinto que o convite curto existe para não ser. Cancelar
 * (`cancelaConvite`) vale para o código que está na tela, não para uma lista.
 */
export function geraConvite(): Promise<Convite> {
  return requisita('/api/convites', {
    method: 'POST',
    valida: (dado) => conviteSchema.parse(dado),
  })
}

/**
 * Cancela um código que a própria pessoa gerou e ninguém usou ainda (story
 * 13a). 204 sem corpo, como o DELETE de tarefa.
 */
export async function cancelaConvite(codigo: string): Promise<void> {
  await requisita(`/api/convites/${codigo}`, { method: 'DELETE', valida: () => undefined })
}

/**
 * O ramo *tem convite* da Fase 0: entra na casa de quem convidou.
 *
 * O corpo é a SAÍDA do schema compartilhado — o resolver já normalizou o que a
 * pessoa digitou (maiúsculas, hífen colado do WhatsApp, O/I/L) antes de chegar
 * aqui, e a API roda o mesmo schema de novo (ADR-0009).
 */
export function entraComCodigo(dados: EntrarComCodigo): Promise<Casa> {
  return requisita('/api/casas/entrar', {
    method: 'POST',
    body: JSON.stringify(dados),
    valida: (dado) => casaSchema.parse(dado),
  })
}
