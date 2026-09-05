import { asc, eq, sql } from 'drizzle-orm'
import type { Casa, CasaPovoada, CriarCasa } from '@casa/contracts'
import type { CasaDb } from '../plugins/withUser.js'
import { codigoPg } from '../db/erros.js'
import { casas, moradores, tarefas } from '../db/schema.js'
import { ErroHttp } from '../erros.js'
import { TEMPLATES } from './templates.js'

/** SQLSTATEs que `cria_casa()` levanta (ver 0003_casa_e_tarefas.sql). */
const JA_TEM_CASA = 'C0001'

/**
 * Cria a casa, vincula quem pediu e semeia o template do tipo — tudo na
 * transação do `withUser`, que ou commita inteira ou não aconteceu.
 *
 * A atomicidade não é preciosismo: casa criada sem morador é uma linha que
 * policy nenhuma alcança (ninguém tem `casa_atual()` igual a ela), e morador
 * vinculado a casa sem tarefa é exatamente a tela vazia que a Fase 0 existe
 * para não mostrar.
 */
export async function criaCasa(db: CasaDb, dados: CriarCasa): Promise<Casa> {
  let casaId: string

  try {
    // A função é o único caminho para um morador passar a ter casa — casa_app
    // não tem INSERT em `casas` nem UPDATE em `moradores.casa_id`. O porquê
    // está na migration: com esses privilégios, entrar em casa alheia seria um
    // UPDATE com o uuid certo.
    const { rows } = await db.execute<{ id: string }>(
      sql`select cria_casa(${dados.nome}, ${dados.tipo}::tipo_de_casa) as id`,
    )
    const id = rows[0]?.id
    // `cria_casa()` ou devolve uuid ou levanta exceção — linha nenhuma aqui
    // significa que a função mudou de contrato, e seguir com `undefined`
    // semearia tarefas sem casa.
    if (!id) throw new Error('cria_casa() não devolveu o id da casa')
    casaId = id
  } catch (erro) {
    if (codigoPg(erro) === JA_TEM_CASA) {
      throw new ErroHttp(409, 'JA_TEM_CASA', 'Você já mora numa casa.')
    }
    throw erro
  }

  // Só agora `casa_atual()` devolve a casa nova — e é por isso que o seed vem
  // DEPOIS do vínculo, e não entre o INSERT da casa e o UPDATE do morador: a
  // policy de INSERT de `tarefas` compara `casa_id` com `casa_atual()`, que
  // ainda seria NULL no meio do caminho.
  const modelo = TEMPLATES[dados.tipo]
  await db.insert(tarefas).values(modelo.map((titulo) => ({ casaId, titulo })))

  // Relê em vez de devolver o payload de entrada: a resposta passa a ser o que
  // a policy DEIXA a pessoa ler, e não o que o handler acha que gravou. Se o
  // vínculo tivesse falhado silenciosamente, isto viria vazio em vez de
  // devolver uma casa que a próxima request não enxerga.
  const [casa] = await db
    .select({ id: casas.id, nome: casas.nome, tipo: casas.tipo })
    .from(casas)
    .where(eq(casas.id, casaId))
    .limit(1)

  if (!casa) throw new Error('casa criada não é visível para quem a criou — vínculo falhou')

  return casa
}

/**
 * A casa de quem está pedindo, com moradores e tarefas. `null` quando a pessoa
 * ainda não tem casa — é o estado normal entre o registro e a Fase 0, não erro.
 *
 * Nenhuma das três consultas filtra por casa: quem filtra é a RLS (ADR-0002).
 * Um `where casa_id = ...` aqui esconderia o dia em que a policy parasse de
 * negar — o teste passaria pelo motivo errado.
 */
export async function leCasaPovoada(db: CasaDb): Promise<CasaPovoada | null> {
  const [casa] = await db
    .select({ id: casas.id, nome: casas.nome, tipo: casas.tipo })
    .from(casas)
    .limit(1)

  if (!casa) return null

  const [moradoresDaCasa, tarefasDaCasa] = await Promise.all([
    db
      .select({ id: moradores.id, apelido: moradores.apelido, cor: moradores.cor })
      .from(moradores)
      .orderBy(asc(moradores.criadoEm)),
    db
      .select({ id: tarefas.id, titulo: tarefas.titulo })
      .from(tarefas)
      .orderBy(asc(tarefas.criadoEm)),
  ])

  return { casa, moradores: moradoresDaCasa, tarefas: tarefasDaCasa }
}
