import { z } from 'zod'
import { uuidSchema } from './comum'

/**
 * Apelido — o nome pelo qual o morador existe dentro da casa.
 *
 * `trim` vem antes do `min` de propósito: teclado mobile adora completar com
 * espaço, e "  " não pode passar por apelido. Limites largos — a régua é caber
 * no chip da UI, não policiar gosto.
 */
export const apelidoSchema = z.string().trim().min(2).max(32)

/**
 * Cor do morador, canônica em `#rrggbb` minúsculo.
 *
 * Aqui cor é DADO (a escolha da pessoa na Fase 0), não estilo — a guarda que
 * proíbe hex literal fora do design system vale para telas, não para contrato.
 * Aceita maiúsculas na entrada e normaliza, para igualdade no banco não
 * depender de quem digitou.
 */
export const corSchema = z
  .string()
  .regex(/^#[0-9a-f]{6}$/i)
  .toLowerCase()

/**
 * O morador como os OUTROS moradores da casa o veem.
 *
 * Só id, apelido e cor — NADA de e-mail, hash de senha ou qualquer credencial:
 * isso é dado da conta, não da convivência. O sufixo "Publico" é deliberado:
 * handler que serializa morador para outra pessoa passa por este schema, nunca
 * pelo registro inteiro do banco. (A RLS decide QUEM lê — ADR-0002; este schema
 * decide O QUE de cada linha sai.)
 */
export const moradorPublicoSchema = z.object({
  id: uuidSchema,
  apelido: apelidoSchema,
  cor: corSchema,
})

export type MoradorPublico = z.infer<typeof moradorPublicoSchema>
