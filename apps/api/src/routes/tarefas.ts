import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { criarTarefaSchema, editarTarefaSchema, tarefaSchema, uuidSchema } from '@casa/contracts'
import { exigeIdentidade } from '../plugins/exigeIdentidade.js'
import { apagaTarefa, criaTarefa, editaTarefa } from '../tarefas/servico.js'
import { valida } from './valida.js'

const parametrosDeTarefa = z.object({ id: uuidSchema })

/**
 * CRUD de tarefa (Épico 2, story 4). Listar é a story 5 e concluir é a 6 —
 * chegam neste mesmo plugin.
 *
 * Nenhum handler confere se a tarefa é da casa de quem pede, nem se o
 * responsável é morador dela: quem decide é a policy (ADR-0002), e o serviço
 * só traduz a recusa em 404/422. O que se valida aqui é FORMA (ADR-0009).
 */
export const rotasTarefas: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', exigeIdentidade)

  app.post('/tarefas', async (request, reply) => {
    const dados = valida(criarTarefaSchema, request.body)
    const tarefa = await request.withUser((db) => criaTarefa(db, dados))
    return reply.status(201).send(tarefaSchema.parse(tarefa))
  })

  app.patch('/tarefas/:id', async (request, reply) => {
    const { id } = valida(parametrosDeTarefa, request.params)
    const dados = valida(editarTarefaSchema, request.body)
    const tarefa = await request.withUser((db) => editaTarefa(db, id, dados))
    return reply.send(tarefaSchema.parse(tarefa))
  })

  app.delete('/tarefas/:id', async (request, reply) => {
    const { id } = valida(parametrosDeTarefa, request.params)
    await request.withUser((db) => apagaTarefa(db, id))
    return reply.status(204).send()
  })
}
