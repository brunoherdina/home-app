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
 * Cor do morador — IDENTIFICADOR DE TOKEN do design system, nunca `#rrggbb`.
 *
 * A coluna `moradores.cor` já nasceu documentada assim (`apps/api/src/db/schema.ts`)
 * e a identidade visual está travada (casa-ux-ui). Aceitar hex aqui punha o
 * contrato contra uma decisão já commitada: a escolha da pessoa viraria estilo
 * cru gravado no banco, e trocar tema — dark mode, rebranding — passaria a
 * exigir migration de DADOS em vez de uma edição no design system.
 *
 * Valida a FORMA de um slug, não a paleta: o `tokens.json` ainda não existe, e
 * listar cores aqui seria o contrato inventando identidade visual. Quando o
 * `tokens.json` aterrissar isto vira `z.enum([...])` com os nomes reais — e só
 * então token inexistente passa a reprovar, que é o objetivo final.
 */
export const corSchema = z.string().regex(/^[a-z][a-z0-9-]{1,31}$/)

/**
 * O morador como os OUTROS moradores da casa o veem.
 *
 * Só id, apelido e cor — NADA de e-mail, hash de senha ou qualquer credencial:
 * isso é dado da conta, não da convivência. O sufixo "Publico" é deliberado:
 * handler que serializa morador para outra pessoa passa por este schema, nunca
 * pelo registro inteiro do banco. (A RLS decide QUEM lê — ADR-0002; este schema
 * decide O QUE de cada linha sai.)
 *
 * `apelido` e `cor` são `z.string()` cru, e não os schemas de ENTRADA: leitura
 * não re-normaliza o que o banco guardou — mesmo princípio de `casaSchema`. Se
 * a regra de entrada endurecer (apelido com `min` maior, cor virando `z.enum`),
 * re-validar na saída derrubaria linha LEGADA na serialização: um 500 em
 * endpoint de leitura por causa de dado que já estava gravado. O valor deste
 * schema é a allowlist de campos, não a normalização.
 */
export const moradorPublicoSchema = z.object({
  id: uuidSchema,
  apelido: z.string(),
  cor: z.string(),
})

export type MoradorPublico = z.infer<typeof moradorPublicoSchema>
