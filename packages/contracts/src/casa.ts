import { z } from 'zod'
import { uuidSchema } from './comum'
import { moradorPublicoSchema } from './morador'
import { tarefaSchema } from './tarefa'

/**
 * Tipos de casa que o Épico 1 conhece — cada um tem o template de tarefas que o
 * backend semeia ao criar a casa. Tipo novo aqui sem template correspondente é
 * casa nascendo vazia: os dois andam juntos, no mesmo PR.
 */
export const tipoDeCasaSchema = z.enum(['casal', 'republica', 'familia'])

/**
 * Payload de `POST /api/casas`.
 *
 * ADR-0009: zod valida FORMA, nunca autoridade. Não há `moradorId` nem
 * `casaId` aqui de propósito — quem cria é a identidade do request
 * (`app.current_user_id`), e quem barra o resto é a RLS (ADR-0002). Payload
 * aprovado não é permissão concedida.
 */
export const criarCasaSchema = z.object({
  nome: z.string().trim().min(1).max(48),
  tipo: tipoDeCasaSchema,
})

/** A casa como a API a devolve — leitura não re-normaliza o que o banco guardou. */
export const casaSchema = z.object({
  id: uuidSchema,
  nome: z.string(),
  tipo: tipoDeCasaSchema,
})

export type TipoDeCasa = z.infer<typeof tipoDeCasaSchema>
export type CriarCasa = z.infer<typeof criarCasaSchema>
export type Casa = z.infer<typeof casaSchema>

/**
 * `GET /api/casa` — a casa como a Fase 0 a mostra depois de criada: com quem
 * mora nela e com as tarefas que o template semeou.
 *
 * Vem tudo numa resposta só de propósito. O critério de aceite da Fase 0 é
 * "cai numa casa já povoada em menos de um minuto": três requests paralelas
 * fariam a tela montar em três tempos, e a versão vazia dela — a que aparece
 * enquanto as outras duas não voltaram — é exatamente a impressão de casa
 * vazia que o Épico 1 existe para evitar.
 *
 * `moradores` usa `moradorPublicoSchema`: id, apelido e cor, nunca e-mail nem
 * credencial. Quem lê a lista é outro morador.
 */
export const casaPovoadaSchema = z.object({
  casa: casaSchema,
  moradores: z.array(moradorPublicoSchema),
  tarefas: z.array(tarefaSchema),
})

export type CasaPovoada = z.infer<typeof casaPovoadaSchema>
