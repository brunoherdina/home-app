# Blueprint das skills geradas

Padrão destilado do harness real do Improvisa Aí. Toda skill scaffoldada segue esta forma, no **idioma detectado** e com **prefixo do projeto**.

Princípios (constantes em todas as skills geradas):
- **Frontmatter mínimo**: `name` (= nome da pasta) + `description` (trigger preciso). `disable-model-invocation: true` só em skills de planejamento. `paths: "<glob>"` quando a skill é escopada a um diretório.
- **`description` = gatilho**: verbos do escopo real + frases literais que o usuário diria. Enxuta (orçamento de ~1% da janela).
- **"Ler primeiro"** logo no topo: docs obrigatórios antes de agir (evita dívida de contexto). Usar caminhos relativos (`../../../`) para a skill ser portável.
- **Persona explícita**: a skill declara seu papel (implementador / revisor / estrategista / validador).
- **Definition of Done**: como saber que terminou.

Substituir `{...}` ao gerar. Apagar seções que não se aplicam.

---

## Variante A — skill de ação (engenheiro, tech-lead, backend-dev, frontend-dev, dsp…)

```markdown
---
name: {proj}-{role}
description: "{Verbo-resumo do que faz no {Projeto}}. Usar quando a tarefa envolve {gatilhos concretos: ex. escrever/modificar código X, revisar Y, processar tasks de um épico}. {Frases literais opcionais: 'revisa isso', 'tem problema?'}."
---

# {Role} — {Projeto}

Persona: {1 linha — implementador cirúrgico / segundo par de olhos sênior / etc}.

## Ler primeiro

Antes de agir:
1. [CLAUDE.md raiz](../../../CLAUDE.md) — regras do projeto{, especialmente Regra N}
2. [{doc de subdiretório relevante}](../../../{path}/CLAUDE.md)
3. {Ler exports / chamadores / utilitários do módulo que será tocado}

## {Núcleo da skill: ordem por camada / checklist de review / workflow}

{Para skill de implementação: ordem de camadas — nunca camada N+1 antes de N compilar.}
{Para skill de review: matriz de severidade 🔴🟡🟢⚪ + checklist por camada da stack.}

## Definition of Done

- {critério 1 — testes passando, sem regressão}
- {critério 2 — convenções do codebase}
- {critério 3 — commit Conventional Commits}
- {critério específico do projeto}

## Contexto adicional

Para {tópico}, consulte [{doc}](../../../{path}). {placeholder se o doc ainda não existe — anotar no harness-report}.
```

---

## Variante B — skill de planejamento (prd-tasks, product-owner)

`disable-model-invocation: true` + templates co-localizados.

```markdown
---
name: {proj}-{role}
description: "{Cria PRDs / define estratégia de produto} do {Projeto}. Usar quando a tarefa envolve {escrever PRD, quebrar épico em tasks, priorizar backlog, definir escopo}."
disable-model-invocation: true
---

# {Role} — {Projeto}

## Modos de operação
- **{Modo 1}**: seguir [{template-1}.md]({template-1}.md).
- **{Modo 2}**: seguir [{template-2}.md]({template-2}.md).

## Processo geral
1. Ler `CLAUDE.md` raiz — fase atual, stack, regras.
2. {Ler design system se envolver UI.}
3. Fazer perguntas de clarificação ANTES de escrever — não assumir escopo.
4. Salvar artefatos em `{docs/prds/{EP-XX}-{slug}/}`.
5. Iterar com o usuário antes de finalizar.

## Definition of Done
{Checklist que entra em toda lista de tasks gerada.}

## Contexto adicional
- Para roadmap, consulte [{doc}](../../../{path}).
```

Co-localizar (mesma pasta da skill): `create-prd-template.md`, `generate-tasks-template.md` — estruturas completas de PRD e de geração de tasks por camada.

---

## Variante C — skill de domínio (teoria-musical, dominio-corridas…)

Foco em **validar lógica do domínio**, não escrever código.

```markdown
---
name: {proj}-{dominio}
description: "Valida {lógica/regras do domínio} no {Projeto}. Usar quando a tarefa envolve {conceitos do domínio: estados, cálculos, vocabulário especializado}."
---

# {Domínio} — {Projeto}

Persona: validador de domínio. Garante que o output respeita as regras de {domínio}.

## Regras / invariantes do domínio
- {regra 1: ex. máquina de estados aberta→lotada→confirmada; transições válidas}
- {regra 2: ex. min/max de participantes; lotação}

## Como validar
{Exemplos canônicos com entrada→saída esperada — o equivalente a "Sol maior = campo harmônico X" do Improvisa.}

## Contexto adicional
Para {regras de negócio formais}, consulte [{doc}](../../../{path}).
```

---

## Variante D — skill de design-sync (código↔Figma)

Quando há Figma + design tokens. Espelha o `figma-screens-from-reference` / `improvisa-ai-figma-mcp`.

```markdown
---
name: {proj}-design-sync
description: >-
  Sincroniza design e código no {Projeto} via Figma MCP — recria telas/componentes a partir de
  referência (código, export, outro arquivo Figma), gera tokens/variantes, e mantém o catálogo
  vivo. Usar quando: "monta isso no Figma", "atualiza o catálogo", "sincroniza design↔código".
---

# Design Sync — {Projeto}

## Pré-requisitos (verificar antes de escrever no canvas)
- {seat/plano Figma, fileKey, plugin}

## Carregar skills oficiais do Figma primeiro
- `figma-use` (obrigatório antes de cada `use_figma`), `figma-generate-library`, `figma-code-connect`.

## Workflow read-diff-patch
1. {Ler nó / estado atual}
2. {Diff contra a fonte da verdade (código OU design — decidir caso a caso)}
3. {Patch cirúrgico}

## Armadilhas conhecidas
{Co-localizar em references/figma-caveats.md as que custam caro: resize reseta modes, paint vs variable color, tint regride a sólido em instância, etc.}

## Fonte da verdade
{Code-as-source ou design-as-source? Decidir e documentar. Tokens em {tokens.json}.}
```
