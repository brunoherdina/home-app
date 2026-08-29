import { z } from 'zod'
import { apelidoSchema } from './morador'

/**
 * E-mail normalizado ANTES de validado (por isso o `pipe`, e não checks
 * encadeados: check roda na ordem em que foi anexado, e o formato reprovaria o
 * espaço que o `trim` removeria em seguida). Teclado mobile insere espaço e
 * maiúscula sozinho; sem normalizar, "Foo@bar.com" e "foo@bar.com" viram duas
 * contas. O teto de 254 é o limite prático de e-mail (RFC 5321).
 */
const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254))

/**
 * Política de senha: comprimento, não composição.
 *
 * OWASP (ASVS V2.1.1) pede mínimo de 12; o NIST SP 800-63B proíbe exigir
 * maiúscula/número/símbolo — regra de composição produz padrão previsível
 * ("Senha@123"), não senha mais forte. O teto de 128 não é estética: o custo do
 * argon2 (ADR-0003) cresce com o tamanho da entrada, e sem teto o registro vira
 * vetor de DoS barato. Sem `trim`: espaço é caractere legítimo de senha.
 */
export const senhaSchema = z.string().min(12).max(128)

/**
 * Payload de `POST /api/auth/register`.
 *
 * ADR-0009: o mesmo schema roda no resolver do formulário e no handler, e ele
 * valida FORMA — e-mail já cadastrado, por exemplo, não é papel daqui: quem
 * responde é o índice único no banco.
 */
export const registroSchema = z.object({
  apelido: apelidoSchema,
  email: emailSchema,
  senha: senhaSchema,
})

/**
 * Payload de `POST /api/auth/login`.
 *
 * A senha aqui é só "não vazia", de propósito: a política de comprimento vale
 * no REGISTRO. No login, qualquer string deve chegar ao argon2 e falhar como
 * credencial inválida (401), não como payload malformado (400) — senão a
 * primeira mudança de política desloga pra sempre quem criou a conta antes.
 */
export const loginSchema = z.object({
  email: emailSchema,
  senha: z.string().min(1),
})

/**
 * Payload de `POST /api/auth/refresh`.
 *
 * O refresh é opaco para o cliente de propósito — nada de `z.jwt()` aqui: se o
 * servidor trocar o formato do token, o contrato não muda. Quem sabe se ele
 * ainda vale (rotação, reuso, blocklist de `jti`) é o servidor — ADR-0008.
 */
export const refreshSchema = z.object({
  refreshToken: z.string().min(1),
})

/**
 * Resposta de `register`, `login` e `refresh` — o par do ADR-0008.
 *
 * `expiraEmSegundos` é relativo, não timestamp absoluto: relógio de celular
 * desvia, e o cliente agenda a renovação contando do próprio relógio no
 * instante em que a resposta chega (access ~15 min — renovar um pouco antes de
 * expirar, em vez de reagir ao 401). Os dois tokens são opacos para o cliente:
 * access vai em `Authorization: Bearer`, refresh só volta em `/api/auth/refresh`.
 */
export const parDeTokensSchema = z.object({
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  /** Vida restante do ACCESS token, em segundos. */
  expiraEmSegundos: z.number().int().positive(),
})

export type Registro = z.infer<typeof registroSchema>
export type Login = z.infer<typeof loginSchema>
export type Refresh = z.infer<typeof refreshSchema>
export type ParDeTokens = z.infer<typeof parDeTokensSchema>
