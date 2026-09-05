#!/usr/bin/env node
/**
 * Guardas de camada do Casa (casa-qa).
 *
 * Leitura de fonte, não teste funcional — e é esse o ponto: as três erosões
 * abaixo deixam a suíte inteira verde enquanto quebram o projeto.
 *
 *   1. componente com `fetch` direto  → não dá pra cachear, mockar nem trocar transporte
 *   2. handler com o pool cru         → fura o SET LOCAL do ADR-0002; a RLS vira decoração
 *   3. `#hex` fora do design system   → identidade visual vira dívida em duas telas
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

/** Remove comentários e strings de import para não acusar o que só é documentação. */
function semComentarios(codigo) {
  return codigo.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

const guardas = [
  {
    nome: 'app: nenhum componente faz fetch direto (tudo por lib/api/)',
    dir: join(RAIZ, 'apps/mobile'),
    extensoes: ['.ts', '.tsx'],
    isento: (rel) => rel.includes(`src${sep}lib${sep}api${sep}`),
    padrao: /\bfetch\s*\(/,
    dica: 'mova a chamada para apps/mobile/src/lib/api/ e importe a função de domínio',
  },
  {
    nome: 'api: nenhuma rota toca o pool cru (tudo por withUser ou semIdentidade)',
    dir: join(RAIZ, 'apps/api/src/routes'),
    extensoes: ['.ts'],
    isento: () => false,
    // `pool\w*` e não `pool`: o ADR-0013 trouxe um segundo pool (`poolAuth`), e
    // uma rota de auth pegando ELE cru fura o mesmo contrato — com o agravante
    // de que o role dele alcança credencial e sessão.
    padrao: /from\s+['"][^'"]*db\/pool(\.js)?['"]|\bpool\w*\.(query|connect)\b/,
    dica: 'use request.withUser(...) ou, em rota sem identidade, request.semIdentidade(...) — ADR-0002 e ADR-0013',
  },
  {
    nome: 'ui: nenhuma cor literal fora do design system',
    dir: join(RAIZ, 'apps/mobile'),
    extensoes: ['.ts', '.tsx'],
    isento: (rel) => rel.includes(`src${sep}design-system${sep}`),
    padrao: /#[0-9a-fA-F]{3,8}\b|\brgba?\s*\(/,
    dica: 'use os tokens de apps/mobile/src/design-system/',
  },
]

let falhas = 0
console.log('Guardas de camada')

for (const guarda of guardas) {
  const violacoes = []
  for (const caminho of arquivos(guarda.dir, guarda.extensoes)) {
    const rel = relative(RAIZ, caminho)
    if (guarda.isento(rel)) continue
    const linhas = semComentarios(readFileSync(caminho, 'utf8')).split('\n')
    linhas.forEach((linha, i) => {
      if (guarda.padrao.test(linha)) violacoes.push(`${rel}:${i + 1}  ${linha.trim()}`)
    })
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
