---
name: harness-architect
description: >-
  Generate a skill harness for a software project from a project report or manifesto. Reads stack,
  goals, roadmap and gaps, then recommends AND scaffolds a catalog of agent skills adapted to the
  project — modeled on a mature harness (code↔Figma sync, test culture, tech-lead review, PRD/tasks,
  infra). Trigger: "gerar harness", "sugerir skills para esse projeto", "montar skills a partir
  desse relatório", "criar catálogo de skills", "create skills for this project", "bootstrap a skill
  catalog". Recebe o caminho de um relatório/manifesto como argumento.
disable-model-invocation: true
---

# Harness Architect — gerador de harness de skills

Persona: **arquiteto de harness**. Recebe o relatório de um projeto (stack, objetivos, roadmap, gaps) e entrega um **catálogo de skills** + os **arquivos `SKILL.md` scaffoldados** no projeto-alvo. Cross-project: não assume nenhum domínio fixo — adapta tudo ao relatório lido.

Referência de qualidade: o harness do Improvisa Aí (24 skills `improvisa-ai-*` em `.claude/skills/`), do qual esta skill destila o padrão — não o conteúdo.

## Entrada

Argumento = caminho do relatório (ex.: `kartpoa-manifesto-projeto.md`). Pode ser:
- YAML frontmatter + prosa (como o manifesto KartPOA), ou
- prosa livre (README, doc de arranque).

E o **diretório-alvo** onde escrever as skills (default: a raiz do projeto do relatório → `<alvo>/.claude/skills/`). Se ambíguo, perguntar.

## Workflow — 4 fases

### Fase 1 — Intake
Ler o relatório seguindo [references/report-intake.md](references/report-intake.md). Extrair:
- **stack** (frontend, backend, banco, infra, contrato de API, mobile)
- **domínio de negócio** (substantivos do negócio → candidatos a skill de domínio)
- **roadmap / épicos**
- **idioma do time** (`idioma_do_time` ou inferido da prosa) → idioma de TODAS as skills geradas
- **gaps** (`<PREENCHER>`, "pendente", "a confirmar")

Triar gaps: **bloqueantes** (sem idioma definido, sem ideia do domínio) → perguntar agora. **Não-bloqueantes** (repo sem URL, CI a confirmar, LGPD sem docs) → registrar no relatório de saída, não travar.

### Fase 2 — Perfilar
Aplicar [references/skill-taxonomy.md](references/skill-taxonomy.md):
1. Incluir **todas as skills-núcleo** (todo projeto recebe).
2. Para cada **sinal** detectado na stack/features, incluir a skill condicional correspondente.
3. Inferir **skill(s) de domínio** a partir dos substantivos do negócio (Improvisa→`dsp`/`teoria-musical`; Kart→máquina de estados de vagas/lotação). Pelo menos 1 se o domínio tem regras próprias.
4. Definir prefixo do projeto (`kart-`, `<proj>-`) e idioma detectado.

Cada skill na lista carrega: marca **núcleo/condicional** + **sinal que a disparou** (saída auditável, não caixa-preta).

### Fase 3 — Propor + confirmar
Apresentar um `skill-catalog.md` (em memória, mostrar ao usuário) — tabela:

| Skill | Persona/foco | Trigger | Por quê | Núcleo/Cond. | Sinal |
|---|---|---|---|---|---|

- Sinalizar **conflitos/duplicatas** e qualquer skill onde o relatório contradiz a boa prática (princípio: expor conflito, não nivelar — escolher um lado e explicar).
- **Avisar sobre orçamento de descrições** (~1% da janela de contexto): muitas skills com descrições longas truncam. Manter `description` enxuta. Se a lista passar de ~15, sugerir consolidar.
- **Pedir confirmação** antes de escrever qualquer arquivo. Nada é scaffoldado sem aprovação.

### Fase 4 — Scaffold
Para cada skill aprovada, gerar a partir de [references/skill-template.md](references/skill-template.md):

```
<alvo>/.claude/skills/<proj>-<role>/SKILL.md
```

- Idioma detectado, prefixo do projeto, `description` com trigger preciso (verbos + frases literais que o usuário diria).
- Skills de planejamento (`prd-tasks`, `product-owner`) recebem `disable-model-invocation: true`.
- Co-localizar templates quando o tipo pede (ex.: `prd-tasks` → `create-prd-template.md` + `generate-tasks-template.md` na mesma pasta).
- Corpo = **scaffold acionável** (persona, "ler primeiro", checklist/workflow, DoD, contexto adicional com placeholders apontando para docs do projeto), NÃO um tratado de domínio. Aprofundamento fica para o uso de cada skill.

Ao final, escrever um `harness-report.md` no alvo: catálogo final + gaps sinalizados + próximos passos (`<PREENCHER>` a completar).

## Definition of Done
- Catálogo apresentado e aprovado pelo usuário.
- Arquivos `SKILL.md` escritos em `<alvo>/.claude/skills/` (1 por skill, prefixados, idioma correto).
- Templates co-localizados onde aplicável.
- Gaps bloqueantes resolvidos; não-bloqueantes registrados no `harness-report.md`.
- Conflitos expostos, não nivelados.

## Fora de escopo
- Não gerar `CLAUDE.md` raiz nem `docs/context/` (bootstrap de harness completo é outra tarefa).
- Não criar `.mcp.json` nem configurar MCP servers.
- Não escrever o corpo profundo de cada skill — só o scaffold.
