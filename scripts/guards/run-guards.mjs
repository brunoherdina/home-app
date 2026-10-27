#!/usr/bin/env node
/**
 * Guardas de camada do Casa (casa-qa).
 *
 * Leitura de fonte, não teste funcional — e é esse o ponto: as erosões abaixo
 * deixam a suíte inteira verde enquanto quebram o projeto.
 *
 *   1. componente com `fetch` direto  → não dá pra cachear, mockar nem trocar transporte
 *   2. handler com o pool cru         → fura o SET LOCAL do ADR-0002; a RLS vira decoração
 *   3. `#hex` fora do design system   → identidade visual vira dívida em duas telas
 *   4. conclusões agrupadas/ordenadas por morador → ranking sem tela (ADR-0010, §2.1)
 *   5. `conclusoes.morador_id` saindo num SELECT   → pontos de terceiro na resposta
 *   6. `ranking`/`placar`/`pódio` como nome         → o pódio já tem nome antes de ter tela
 *
 * Cada guarda carrega os próprios exemplos (`reprova` / `aceita`) e é conferida
 * contra eles ANTES de ler o repositório: guarda que não reprova o exemplo
 * canônico da violação não é guarda, e a regex que envelhece em silêncio é
 * exatamente o defeito que estas guardas existem para impedir.
 *
 * Uso: npm run guards
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('../../', import.meta.url))
const IGNORADOS = new Set(['node_modules', '.git', '.expo', 'dist', 'android', 'ios', 'build'])

function arquivos(dir, extensoes) {
  if (!existsSync(dir)) return []
  const saida = []
  for (const nome of readdirSync(dir)) {
    if (IGNORADOS.has(nome)) continue
    const caminho = join(dir, nome)
    if (statSync(caminho).isDirectory()) saida.push(...arquivos(caminho, extensoes))
    else if (extensoes.some((e) => nome.endsWith(e))) saida.push(caminho)
  }
  return saida
}

/**
 * Remove comentários para não acusar o que só é documentação — este próprio
 * arquivo cita as violações que procura. Bloco vira só as quebras de linha que
 * tinha, para o número de linha reportado continuar sendo o do arquivo.
 */
function semComentarios(codigo) {
  return codigo
    .replace(/\/\*[\s\S]*?\*\//g, (bloco) => bloco.replace(/[^\n]/g, ''))
    .replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/**
 * Onde o padrão bate no texto (já sem comentários), uma entrada por linha.
 *
 * Roda sobre o ARQUIVO, não linha a linha: `groupBy(` numa linha e
 * `conclusoes.moradorId` na seguinte é a forma que o prettier dá a uma query, e
 * uma guarda por linha deixaria passar exatamente o que procura.
 */
function ocorrencias(padrao, codigo) {
  const texto = semComentarios(codigo)
  const linhas = texto.split('\n')
  const flags = padrao.flags.includes('g') ? padrao.flags : `${padrao.flags}g`
  const vistas = new Set()
  const saida = []
  for (const encontro of texto.matchAll(new RegExp(padrao.source, flags))) {
    const linha = texto.slice(0, encontro.index).split('\n').length
    if (vistas.has(linha)) continue
    vistas.add(linha)
    saida.push({ linha, trecho: linhas[linha - 1].trim() })
  }
  return saida
}

const API = join(RAIZ, 'apps/api/src')
const MOBILE = join(RAIZ, 'apps/mobile')
const CONTRACTS = join(RAIZ, 'packages/contracts/src')

const guardas = [
  {
    nome: 'app: nenhum componente faz fetch direto (tudo por lib/api/)',
    dirs: [MOBILE],
    extensoes: ['.ts', '.tsx'],
    isento: (rel) => rel.includes(`src${sep}lib${sep}api${sep}`),
    padrao: /\bfetch\s*\(/,
    dica: 'mova a chamada para apps/mobile/src/lib/api/ e importe a função de domínio',
    reprova: ["const r = await fetch('/api/casa')"],
    aceita: ['const r = await leCasa()', 'prefetchQuery(chave)'],
  },
  {
    nome: 'api: nenhuma rota toca o pool cru (tudo por withUser ou semIdentidade)',
    dirs: [join(API, 'routes')],
    extensoes: ['.ts'],
    isento: () => false,
    // `pool\w*` e não `pool`: o ADR-0013 trouxe um segundo pool (`poolAuth`), e
    // uma rota de auth pegando ELE cru fura o mesmo contrato — com o agravante
    // de que o role dele alcança credencial e sessão.
    padrao: /from\s+['"][^'"]*db\/pool(\.js)?['"]|\bpool\w*\.(query|connect)\b/,
    dica: 'use request.withUser(...) ou, em rota sem identidade, request.semIdentidade(...) — ADR-0002 e ADR-0013',
    reprova: ["import { pool } from '../db/pool.js'", 'await poolAuth.query(sql)'],
    aceita: ['await request.withUser((db) => leCasa(db))'],
  },
  {
    nome: 'ui: nenhuma cor literal fora do design system',
    dirs: [MOBILE],
    extensoes: ['.ts', '.tsx'],
    isento: (rel) => rel.includes(`src${sep}design-system${sep}`),
    padrao: /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(/,
    dica: 'use os tokens de apps/mobile/src/design-system/',
    reprova: ["color: '#1A2B3C'", 'background: rgba(0, 0, 0, 0.4)'],
    aceita: ['color: cores.texto', "const titulo = 'Casa #2'"],
  },
  {
    /**
     * ADR-0010: pontos por pessoa são matéria-prima de pódio. As duas únicas
     * leituras de `conclusoes` são "sua parte" (`where morador_id = eu`) e o
     * total da casa — nenhuma agrupa por morador, nenhuma ordena por pontos.
     * Uma query que faça isso é ranking mesmo sem tela, e a policy não
     * distingue "somar tudo" de "somar por pessoa e comparar" — por isso a
     * guarda é leitura de fonte, não RLS.
     */
    nome: 'api: nenhuma query agrupa por morador nem ordena por pontos (ADR-0010)',
    dirs: [API],
    extensoes: ['.ts'],
    isento: () => false,
    padrao:
      /\bgroupBy\s*\([^)]*morador|\bgroup\s+by[^;`]{0,120}?morador|\borderBy\s*\([^)]*pontos|\border\s+by[^;`]{0,120}?pontos/i,
    dica: 'só existem duas leituras de conclusões: a soma das SUAS linhas e a soma da casa — sem group by morador, sem order by pontos (ADR-0010, regra §2.1)',
    reprova: [
      'db.select({ m: conclusoes.moradorId, p: sum(conclusoes.pontos) }).from(conclusoes).groupBy(conclusoes.moradorId)',
      '.groupBy(\n  conclusoes.moradorId,\n)',
      'sql`select morador_id, sum(pontos) from conclusoes group by morador_id`',
      '.orderBy(desc(sum(conclusoes.pontos)))',
      'sql`select morador_id, sum(pontos) as total from conclusoes group by 1 order by total desc, pontos`',
    ],
    aceita: [
      'db.select({ total: sum(conclusoes.pontos) }).from(conclusoes)',
      '.where(eq(conclusoes.moradorId, eu))',
      '.orderBy(asc(moradores.criadoEm))',
      'sql`select count(*) from moradores where casa_id = $1 order by criado_em`',
    ],
  },
  {
    /**
     * `conclusoes.morador_id` existe para UM predicado: `where morador_id = eu`.
     * Saindo num SELECT ele vira "quem fez quanto" na resposta — e a resposta
     * não precisa dizer quem fez, porque quem lê é quem fez (contracts:
     * `conclusaoSchema` não tem `moradorId` de propósito). `select()` sem
     * projeção e a API relacional (`db.query.conclusoes`) devolvem a coluna
     * junto, e por isso contam como a mesma violação.
     */
    nome: 'api: conclusoes.morador_id entra no WHERE, nunca sai no SELECT',
    dirs: [API],
    extensoes: ['.ts'],
    isento: () => false,
    padrao:
      /\bselect\s*\(\s*\{[^}]*conclusoes\.moradorId|\bselect\s*\(\s*\)\s*\.from\s*\(\s*conclusoes\b|\bquery\.conclusoes\b|\bselect\b[^;`]{0,200}?\bmorador_id\b[^;`]{0,200}?\bfrom\s+"?conclusoes\b/i,
    dica: 'projete só o que a resposta precisa (pontos, tarefa, quando) — o "quem" é a identidade da transação, não uma coluna da resposta',
    reprova: [
      'db.select({ moradorId: conclusoes.moradorId, pontos: conclusoes.pontos }).from(conclusoes)',
      'db.select({\n  quem: conclusoes.moradorId,\n}).from(conclusoes)',
      'db.select().from(conclusoes)',
      'db.query.conclusoes.findMany()',
      'sql`select morador_id, pontos from conclusoes where casa_id = casa_atual()`',
    ],
    aceita: [
      'db.select({ pontos: conclusoes.pontos }).from(conclusoes).where(eq(conclusoes.moradorId, eu))',
      'db.select({ id: tarefas.id, responsavelId: tarefas.responsavelId }).from(tarefas)',
      'sql`select coalesce(sum(pontos), 0) from conclusoes where morador_id = ${eu}`',
      'sql`select id from moradores where casa_id = casa_atual()`',
    ],
  },
  {
    /**
     * Tripwire de nome, para as três camadas: quem constrói um pódio o chama
     * pelo nome antes de ter tela. Testes ficam de fora porque é neles que
     * o nome aparece como exemplo do que o schema REJEITA.
     */
    nome: 'nenhum ranking, placar ou pódio — nem de nome (regra inviolável §2.1)',
    dirs: [API, CONTRACTS, join(MOBILE, 'src')],
    extensoes: ['.ts', '.tsx'],
    isento: (rel) => /\.test\.tsx?$/.test(rel),
    padrao: /\b(ranking|leaderboard|p[oó]dio|placar)/i,
    dica: 'o Casa não compara pessoas: "sua parte" e o total da casa são as únicas leituras de pontos',
    reprova: ["const ranking = await leRanking(db)", "<Text>Placar da semana</Text>", 'podioSchema'],
    aceita: ['const pontos = await lePontosDaCasa(db)', 'suaParte'],
  },
]

/**
 * Cada guarda contra os próprios exemplos. Falha aqui é defeito da GUARDA, não
 * do repositório — e sai antes da varredura para não se confundir com ele.
 */
function provaAsGuardas() {
  const defeitos = []
  for (const guarda of guardas) {
    for (const exemplo of guarda.reprova) {
      if (ocorrencias(guarda.padrao, exemplo).length === 0) {
        defeitos.push(`${guarda.nome}\n         não reprova: ${JSON.stringify(exemplo)}`)
      }
    }
    for (const exemplo of guarda.aceita) {
      if (ocorrencias(guarda.padrao, exemplo).length > 0) {
        defeitos.push(`${guarda.nome}\n         reprova à toa: ${JSON.stringify(exemplo)}`)
      }
    }
  }
  return defeitos
}

const defeitos = provaAsGuardas()
if (defeitos.length > 0) {
  console.log('Guardas de camada — as próprias guardas falharam na prova:')
  for (const d of defeitos) console.log(`  FALHA ${d}`)
  process.exit(1)
}

let falhas = 0
console.log('Guardas de camada')

for (const guarda of guardas) {
  const violacoes = []
  for (const dir of guarda.dirs) {
    for (const caminho of arquivos(dir, guarda.extensoes)) {
      const rel = relative(RAIZ, caminho)
      if (guarda.isento(rel)) continue
      for (const { linha, trecho } of ocorrencias(guarda.padrao, readFileSync(caminho, 'utf8'))) {
        violacoes.push(`${rel}:${linha}  ${trecho}`)
      }
    }
  }

  if (violacoes.length === 0) {
    console.log(`  ok   ${guarda.nome}`)
  } else {
    console.log(`  FALHA ${guarda.nome}`)
    for (const v of violacoes) console.log(`         ${v}`)
    console.log(`         → ${guarda.dica}`)
    falhas += violacoes.length
  }
}

if (falhas > 0) {
  console.log(`\n${falhas} violação(ões) de camada.`)
  process.exit(1)
}
console.log('\nCamadas intactas.')
