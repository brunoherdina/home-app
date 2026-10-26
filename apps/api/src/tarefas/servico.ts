import { eq } from 'drizzle-orm'
import type { CriarTarefa, EditarTarefa, Tarefa } from '@casa/contracts'
import type { CasaDb } from '../plugins/withUser.js'
import { colunasDaTarefa, leCasaDaIdentidade } from '../casa/servico.js'
import { codigoPg } from '../db/erros.js'
import { tarefas } from '../db/schema.js'
import { ErroHttp } from '../erros.js'

/**
 * `42501` (insufficient_privilege) é como o Postgres reporta linha que a
 * policy recusou no `WITH CHECK` — aqui, um `responsavel_id` que não é morador
 * da casa (migration 0006). `23503` (foreign_key_violation) é o uuid que não
 * é morador de casa nenhuma. Os dois viram a MESMA resposta: distinguir
 * "existe, mas é de outra casa" de "não existe" diria a quem chuta uuids
 * quais são contas de verdade.
 */
const RECUSADO_PELA_POLICY = '42501'
const MORADOR_INEXISTENTE = '23503'

class ResponsavelInvalidoError extends ErroHttp {
  constructor() {
    super(422, 'RESPONSAVEL_INVALIDO', 'Esse morador não é da sua casa.')
  }
}

/**
 * Uma resposta para "não existe" e para "existe, mas é de outra casa": a
 * policy de `tarefas` esconde a segunda, então o serviço nem fica sabendo da
 * diferença — que é o ponto do ADR-0002. Um 403 aqui exigiria consultar por
 * fora da RLS para descobrir que a tarefa existe, e seria o oráculo que a
 * policy existe para não ser.
 */
class TarefaNaoEncontradaError extends ErroHttp {
  constructor() {
    super(404, 'TAREFA_NAO_ENCONTRADA', 'Essa tarefa não existe mais.')
  }
}

/**
 * Traduz o que o banco recusou em resposta HTTP. Só os dois SQLSTATEs de
 * responsável; o resto sobe. Em particular `23514` (CHECK violado: aberta com
 * dono, bônus fora do rodízio) NÃO é traduzido de propósito — o schema zod
 * repete as duas regras com `refine`, então chegar ao CHECK significa que
 * contrato e migration divergiram, e isso é 500 para consertar, não 400
 * para o cliente contornar.
 */
function traduz(erro: unknown): unknown {
  const codigo = codigoPg(erro)
  if (codigo === RECUSADO_PELA_POLICY || codigo === MORADOR_INEXISTENTE) {
    return new ResponsavelInvalidoError()
  }
  return erro
}

/**
 * `POST /api/tarefas`.
 *
 * `casa_id` sai da casa que a identidade enxerga — não do payload, que não
 * tem esse campo (`criarTarefaSchema`). Responsável de outra casa passa no
 * zod (ADR-0009: forma, não autoridade) e é recusado pela policy de INSERT;
 * não há `if` aqui conferindo se o morador é da casa, e a ausência é
 * deliberada: o `if` seria a checagem que se esquece no PATCH seguinte.
 */
export async function criaTarefa(db: CasaDb, dados: CriarTarefa): Promise<Tarefa> {
  // Explícito e antes do INSERT, como em `criaConvite`: sem casa, `casa_id`
  // seria NULL e a coluna NOT NULL estouraria com 23502 — erro de integridade
  // onde o que houve foi regra de negócio.
  const casa = await leCasaDaIdentidade(db)
  if (!casa) throw new ErroHttp(409, 'SEM_CASA', 'Você precisa de uma casa antes de criar tarefas.')

  try {
    const [tarefa] = await db
      .insert(tarefas)
      .values({ casaId: casa.id, ...dados })
      .returning(colunasDaTarefa)
    if (!tarefa) throw new Error('INSERT em tarefas não devolveu a linha')
    return tarefa
  } catch (erro) {
    throw traduz(erro)
  }
}

/**
 * `PATCH /api/tarefas/:id` — recebe o formulário INTEIRO (ver
 * `editarTarefaSchema`) e substitui os cinco campos de uma vez.
 *
 * Sem `where casa_id = ...`: a policy de UPDATE (`USING casa_id =
 * casa_atual()`) é quem escopa, e zero linha atualizada é "não existe" para
 * quem pediu. O `WITH CHECK` da mesma policy recusa responsável de fora.
 */
export async function editaTarefa(db: CasaDb, id: string, dados: EditarTarefa): Promise<Tarefa> {
  let tarefa: Tarefa | undefined
  try {
    ;[tarefa] = await db.update(tarefas).set(dados).where(eq(tarefas.id, id)).returning(colunasDaTarefa)
  } catch (erro) {
    throw traduz(erro)
  }
  if (!tarefa) throw new TarefaNaoEncontradaError()
  return tarefa
}

/**
 * `DELETE /api/tarefas/:id`. As conclusões da tarefa saem por cascade — foi
 * decidido no schema (0007): não há o que ler de um histórico sem a tarefa.
 * Idempotente NÃO é: apagar duas vezes é 404 na segunda, porque a lista do
 * app precisa saber que a tarefa já não estava lá quando ela tentou.
 */
export async function apagaTarefa(db: CasaDb, id: string): Promise<void> {
  const apagadas = await db.delete(tarefas).where(eq(tarefas.id, id)).returning({ id: tarefas.id })
  if (apagadas.length === 0) throw new TarefaNaoEncontradaError()
}
