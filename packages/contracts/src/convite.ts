import { z } from 'zod'
import { casaSchema } from './casa'

/**
 * Alfabeto do código de convite — base32 de Crockford.
 *
 * Sem `I`, `L`, `O` e `U`. As três primeiras somem porque se confundem com `1`
 * e `0` em qualquer fonte, e este código é DITADO ou digitado à mão — a
 * ambiguidade não vira erro de validação, vira "não funciona" sem explicação.
 * O `U` sai por herança do Crockford: evita que o sorteio produza palavra
 * ofensiva por acidente.
 *
 * 32 símbolos em 6 casas = 32^6 ≈ 1,07 bilhão de códigos (30 bits). Não é
 * segredo criptográfico e não precisa ser: o que protege é a combinação de
 * espaço grande, validade curta, uso único e rate limit na rota de aceite —
 * com pouquíssimos códigos vivos por vez, adivinhar um exige milhões de
 * tentativas contra um limite de dezenas por hora.
 */
export const ALFABETO_DO_CODIGO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

/** Seis é o maior código que ainda se dita ao telefone sem repetir. */
export const TAMANHO_DO_CODIGO = 6

/** Quanto tempo um convite vale. A UI diz isto em palavras — daqui, não à mão. */
export const DIAS_DE_VALIDADE_DO_CONVITE = 7

/**
 * Normaliza o que a pessoa digitou antes de qualquer comparação.
 *
 * Tudo que não é letra ou número cai fora: quem recebe `A1B-2C3` pelo WhatsApp
 * cola com o hífen, e quem lê em voz alta produz espaço. Depois disso, as
 * confusões visuais do alfabeto viram o símbolo que existe — `O` é sempre zero
 * e `I`/`l` são sempre um, porque nenhum dos três está no alfabeto e portanto
 * não há ambiguidade a resolver.
 *
 * `U` NÃO é mapeado para `V`: seria adivinhar. Código com `U` reprova, e
 * "código inválido" é resposta melhor do que entrar na casa errada.
 */
export function normalizaCodigo(bruto: string): string {
  return bruto
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
}

/**
 * O código como ele viaja — sempre normalizado.
 *
 * A normalização é `transform` e não `check` porque o mesmo schema roda no
 * resolver do formulário e no handler (ADR-0009): o app manda o que o servidor
 * espera, e o servidor não confia nisso — normaliza de novo.
 */
export const codigoDeConviteSchema = z
  .string()
  .transform(normalizaCodigo)
  .pipe(
    z
      .string()
      .length(TAMANHO_DO_CODIGO)
      .regex(/^[0-9A-HJKMNP-TV-Z]+$/, 'Código inválido.'),
  )

/** Payload de `POST /api/casas/entrar` — o ramo *tem convite* da Fase 0. */
export const entrarComCodigoSchema = z.object({
  codigo: codigoDeConviteSchema,
})

/**
 * Resposta de `POST /api/convites`.
 *
 * Só o código. Nem `casaId` (quem pede já está na casa, e devolver o uuid dela
 * num payload que vai para o WhatsApp é vazar identificador sem motivo) nem
 * `expiraEm` — a validade é constante e vive em `DIAS_DE_VALIDADE_DO_CONVITE`,
 * então serializá-la só criaria duas fontes para o mesmo número.
 */
export const conviteSchema = z.object({
  codigo: z.string(),
})

/** Resposta de `POST /api/casas/entrar`: a casa em que a pessoa acabou de entrar. */
export const entradaNaCasaSchema = casaSchema

export type Convite = z.infer<typeof conviteSchema>
export type EntrarComCodigo = z.infer<typeof entrarComCodigoSchema>
