import { z } from 'zod'
import { uuidSchema } from './comum'

/**
 * Payload de `POST /api/tarefas/:id/conclusoes`.
 *
 * Objeto VAZIO, de propósito, e não `z.undefined()`: quem conclui já disse
 * tudo na URL (qual tarefa) e na sessão (quem). Não há campo de pontos porque
 * pontos são calculados no servidor a partir da tarefa (`pontosDaTarefa`) —
 * e `z.object` sem `strict` descarta chave desconhecida, então um cliente que
 * mande `{ pontos: 99 }` é IGNORADO, não recusado. Recusar viraria um canal
 * de "descobrir o que o servidor aceita"; ignorar não conta nada.
 */
export const concluirTarefaSchema = z.object({})

/**
 * A conclusão como a API a devolve a quem acabou de concluir.
 *
 * Sem `moradorId`: quem recebe esta resposta é quem concluiu, e o campo só
 * serviria para, um dia, listar conclusões de outra pessoa com pontos ao lado
 * — que é o breakdown por morador que o ADR-0010 proíbe. O "quem" da
 * conclusão existe no banco para somar "sua parte"; não viaja.
 *
 * `pontos` é a foto do momento (o que `conclusoes.pontos` guardou), e serve
 * para a UI dizer "+3" na hora — não para o app somar nada por conta própria.
 */
export const conclusaoSchema = z.object({
  id: uuidSchema,
  tarefaId: uuidSchema,
  pontos: z.number().int().positive(),
  concluidaEm: z.iso.datetime(),
})

/**
 * Resposta de `GET /api/casa/pontos` — os DOIS números que o produto mostra,
 * e só eles: o que a pessoa que pergunta já fez, e o que a casa fez junta.
 *
 * `strictObject` é a regra inviolável §2.1 escrita como schema: se alguém
 * acrescentar `porMorador`, `ranking` ou qualquer breakdown por pessoa na
 * resposta, o `parse` do cliente reprova a resposta inteira, e o teste deste
 * arquivo reprova antes disso. Todo outro schema de leitura descarta campo
 * extra em silêncio; este não pode, porque aqui campo extra não é ruído — é
 * pódio.
 */
export const pontosDaCasaSchema = z.strictObject({
  suaParte: z.number().int().min(0),
  total: z.number().int().min(0),
})

export type ConcluirTarefa = z.infer<typeof concluirTarefaSchema>
export type Conclusao = z.infer<typeof conclusaoSchema>
export type PontosDaCasa = z.infer<typeof pontosDaCasaSchema>
