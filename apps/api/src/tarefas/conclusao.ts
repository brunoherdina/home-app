import { asc, eq } from 'drizzle-orm'
import { pontosDaTarefa, type Conclusao } from '@casa/contracts'
import type { CasaDb } from '../plugins/withUser.js'
import { moradorDaTransacao } from '../db/identidade.js'
import { conclusoes, moradores, tarefas } from '../db/schema.js'
import { proximoDaVez } from './rodizio.js'
import { TarefaNaoEncontradaError } from './servico.js'

/**
 * `POST /api/tarefas/:id/conclusoes` — alguém da casa fez a tarefa.
 *
 * Três passos na transação do `withUser`, que commita inteira ou não aconteceu:
 *
 *   1. trava a tarefa (`FOR UPDATE`) — duas pessoas concluindo o mesmo rodízio
 *      ao mesmo tempo passam a vez DUAS vezes, uma depois da outra, em vez de
 *      as duas lerem o mesmo responsável e a fila andar uma casa só;
 *   2. registra a conclusão com os pontos calculados AQUI (`pontosDaTarefa`),
 *      em nome da identidade da transação — o payload não tem campo de pontos
 *      nem de autor, e a policy de 0007 recusaria outro autor de qualquer jeito;
 *   3. em Rodízio, passa a vez (`proximoDaVez`). Fixo e Aberta não mexem no
 *      responsável: Fixo tem dono, Aberta não tem ninguém.
 *
 * Qualquer pessoa da casa conclui qualquer tarefa — inclusive a que é da vez
 * de outra. Cobrir o par é o comportamento que o produto quer, e os pontos vão
 * para quem fez. O bônus da tarefa detestada também: é atributo da tarefa
 * (ADR-0010), e quem encarou o banheiro foi quem concluiu.
 *
 * Tarefa de outra casa não aparece no SELECT (policy), e por isso é 404 — a
 * mesma resposta de tarefa inexistente.
 */
export async function concluiTarefa(db: CasaDb, tarefaId: string): Promise<Conclusao> {
  const [tarefa] = await db
    .select({
      casaId: tarefas.casaId,
      peso: tarefas.peso,
      modo: tarefas.modo,
      responsavelId: tarefas.responsavelId,
      bonusDetestada: tarefas.bonusDetestada,
    })
    .from(tarefas)
    .where(eq(tarefas.id, tarefaId))
    .for('update')

  if (!tarefa) throw new TarefaNaoEncontradaError()

  const [conclusao] = await db
    .insert(conclusoes)
    .values({
      tarefaId,
      casaId: tarefa.casaId,
      moradorId: moradorDaTransacao(),
      pontos: pontosDaTarefa(tarefa),
    })
    .returning({
      id: conclusoes.id,
      tarefaId: conclusoes.tarefaId,
      pontos: conclusoes.pontos,
      concluidaEm: conclusoes.concluidaEm,
    })

  if (!conclusao) throw new Error('INSERT em conclusoes não devolveu a linha')

  if (tarefa.modo === 'rodizio') {
    // A ordem da fila é a de entrada na casa; `id` desempata quem entrou no
    // mesmo instante, para a fila não mudar de uma leitura para a outra.
    const fila = await db
      .select({ id: moradores.id })
      .from(moradores)
      .orderBy(asc(moradores.criadoEm), asc(moradores.id))

    const proximo = proximoDaVez(
      fila.map((morador) => morador.id),
      tarefa.responsavelId,
    )
    await db.update(tarefas).set({ responsavelId: proximo }).where(eq(tarefas.id, tarefaId))
  }

  return { ...conclusao, concluidaEm: conclusao.concluidaEm.toISOString() }
}
