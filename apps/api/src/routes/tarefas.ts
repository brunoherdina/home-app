import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import {
  conclusaoSchema,
  concluirTarefaSchema,
  criarTarefaSchema,
  editarTarefaSchema,
  listaDeTarefasSchema,
  tarefaSchema,
  uuidSchema,
} from '@casa/contracts'
import { exigeIdentidade } from '../plugins/exigeIdentidade.js'
import { concluiTarefa } from '../tarefas/conclusao.js'
import { apagaTarefa, criaTarefa, editaTarefa, listaTarefas } from '../tarefas/servico.js'
import { valida } from './valida.js'

const parametrosDeTarefa = z.object({ id: uuidSchema })

/**
 * Tarefas da casa (Épico 2): listar (story 5), o CRUD (story 4) e concluir
 * (story 6).
 *
 * Nenhum handler confere se a tarefa é da casa de quem pede, nem se o
 * responsável é morador dela: quem decide é a policy (ADR-0002), e o serviço
 * só traduz a recusa em 404/422. O que se valida aqui é FORMA (ADR-0009).
 */
export const rotasTarefas: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', exigeIdentidade)

  app.get('/tarefas', async (request, reply) => {
    const lista = await request.withUser((db) => listaTarefas(db))
    return reply.send(listaDeTarefasSchema.parse(lista))
  })

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

  /**
   * Concluir (story 6). O corpo passa pelo schema só para descartar o que
   * vier — `{ pontos: 99 }` é ignorado, não recusado (`concluirTarefaSchema`).
   * Corpo ausente vale como `{}`: não há nada a dizer além da URL e da sessão.
   */
  app.post('/tarefas/:id/conclusoes', async (request, reply) => {
    const { id } = valida(parametrosDeTarefa, request.params)
    valida(concluirTarefaSchema, request.body ?? {})
    const conclusao = await request.withUser((db) => concluiTarefa(db, id))
    return reply.status(201).send(conclusaoSchema.parse(conclusao))
  })
}
