import { randomInt } from 'node:crypto'
import { sql } from 'drizzle-orm'
import {
  ALFABETO_DO_CODIGO,
  DIAS_DE_VALIDADE_DO_CONVITE,
  TAMANHO_DO_CODIGO,
  type Casa,
  type Convite,
} from '@casa/contracts'
import type { CasaDb } from '../plugins/withUser.js'
import { codigoPg } from '../db/erros.js'
import { convites } from '../db/schema.js'
import { ErroHttp } from '../erros.js'
import { leCasaDaIdentidade } from './servico.js'

/** SQLSTATEs que `entra_na_casa()` levanta (ver 0005_convite.sql). */
const JA_TEM_CASA = 'C0001'
const CONVITE_INVALIDO = 'C0003'
/** `23505` = unique_violation — dois sorteios caíram no mesmo código. */
const CODIGO_REPETIDO = '23505'

/**
 * Quantas vezes um sorteio repetido é retentado antes de desistir.
 *
 * Três é folgado até o absurdo: com 32^6 códigos e um punhado vivo por vez, a
 * chance de UMA colisão já é desprezível, e a de três seguidas não acontece
 * neste universo. O número existe para o laço ter fim — retry infinito num
 * caminho que depende de aleatoriedade é como se trava um processo inteiro.
 */
const TENTATIVAS = 3

const MS_DE_VALIDADE = DIAS_DE_VALIDADE_DO_CONVITE * 24 * 60 * 60 * 1000

/**
 * Sorteia um código curto com o CSPRNG do Node.
 *
 * `randomInt` e não `Math.random()`: o segundo é previsível a partir de algumas
 * saídas observadas, e quem vê o próprio convite observa uma saída. Também não
 * é `randomBytes(n) % 32` — o módulo enviesa quando o intervalo não divide 256,
 * e aqui divide, mas escrever a versão que só funciona por coincidência é como
 * o viés entra quando o alfabeto mudar de tamanho.
 */
export function geraCodigo(): string {
  let codigo = ''
  for (let i = 0; i < TAMANHO_DO_CODIGO; i++) {
    codigo += ALFABETO_DO_CODIGO[randomInt(ALFABETO_DO_CODIGO.length)]
  }
  return codigo
}

/**
 * `POST /api/convites` — gera um código para a casa de quem pediu.
 *
 * `casa_id` e `criado_por` NÃO vêm do handler: saem de `casa_atual()` e do GUC
 * da identidade, dentro do próprio INSERT. É o mesmo princípio de
 * `cria_casa()` — payload não carrega autoridade —, e aqui ele também simplifica
 * a policy, que compara as colunas com exatamente as mesmas expressões.
 */
export async function criaConvite(db: CasaDb): Promise<Convite> {
  // Checagem explícita antes do INSERT: sem casa, `casa_atual()` é NULL e a
  // coluna NOT NULL estouraria com 23502 — um erro de integridade onde o que
  // houve foi uma regra de negócio. 409 diz o que aconteceu.
  const casa = await leCasaDaIdentidade(db)
  if (!casa) {
    throw new ErroHttp(409, 'SEM_CASA', 'Você precisa de uma casa antes de convidar alguém.')
  }

  const expiraEm = new Date(Date.now() + MS_DE_VALIDADE)

  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    const codigo = geraCodigo()
    try {
      await db.execute(sql`
        insert into ${convites} ("codigo", "casa_id", "criado_por", "expira_em")
        values (
          ${codigo},
          casa_atual(),
          nullif(current_setting('app.current_user_id', true), '')::uuid,
          ${expiraEm}
        )
      `)
      return { codigo }
    } catch (erro) {
      // Só a colisão é retentável. Falha de policy, de conexão ou de qualquer
      // outra coisa sobe — insistir sobre ela só multiplicaria o mesmo erro.
      if (codigoPg(erro) !== CODIGO_REPETIDO) throw erro
    }
  }

  throw new Error(`não foi possível sortear um código livre em ${TENTATIVAS} tentativas`)
}

/**
 * `POST /api/casas/entrar` — o ramo *tem convite* da Fase 0.
 *
 * Toda a decisão está em `entra_na_casa()` (migration 0005): achar o convite
 * vivo, consumi-lo e vincular quem pediu, sob um lock que fecha a corrida de
 * duas pessoas com o mesmo código. Aqui só se traduz SQLSTATE em HTTP.
 *
 * Não semeia tarefas, ao contrário de `criaCasa`: a casa em que se entra já tem
 * as dela. Semear de novo duplicaria a lista para quem já morava lá.
 */
export async function entraComConvite(db: CasaDb, codigo: string): Promise<Casa> {
  try {
    const { rows } = await db.execute<{ id: string }>(
      sql`select entra_na_casa(${codigo}) as id`,
    )
    if (!rows[0]?.id) throw new Error('entra_na_casa() não devolveu o id da casa')
  } catch (erro) {
    const codigoDoErro = codigoPg(erro)
    if (codigoDoErro === JA_TEM_CASA) {
      throw new ErroHttp(409, 'JA_TEM_CASA', 'Você já mora numa casa.')
    }
    if (codigoDoErro === CONVITE_INVALIDO) {
      // Uma resposta para os três casos (inexistente, expirado, já usado) — a
      // função os junta de propósito, e a mensagem não pode desfazer isso.
      throw new ErroHttp(
        404,
        'CONVITE_INVALIDO',
        'Esse código não vale mais. Peça outro para quem te convidou.',
      )
    }
    throw erro
  }

  // Relê sob RLS em vez de devolver o que a função retornou: a resposta passa a
  // ser o que a policy DEIXA a pessoa ler. Se o vínculo tivesse falhado, isto
  // viria vazio em vez de devolver uma casa que a próxima request não enxerga.
  const casa = await leCasaDaIdentidade(db)
  if (!casa) throw new Error('casa do convite não é visível para quem entrou — vínculo falhou')

  return casa
}
