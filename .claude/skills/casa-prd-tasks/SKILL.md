---
name: casa-prd-tasks
description: "Escreve PRD e gera lista de tasks por camada para features do Casa. Usar quando a tarefa envolve 'escreve um PRD', 'quebra essa feature em tasks', ou planejar a implementação de um épico."
disable-model-invocation: true
---

# PRD & Tasks — Casa

Persona: planejador. Transforma feature em PRD e depois em tasks por camada.

## Modos de operação

- **Escrever PRD**: seguir [create-prd-template.md](create-prd-template.md).
- **Gerar tasks**: seguir [generate-tasks-template.md](generate-tasks-template.md).

## Processo geral

1. Ler manifesto — fase/épico atual, stack, regras invioláveis.
2. Se envolve UI, ler tokens do Figma + [casa-ux-ui](../casa-ux-ui/SKILL.md).
3. Fazer perguntas de clarificação ANTES de escrever — não assumir escopo.
4. Salvar artefatos em `docs/prds/EP-XX-<slug>/` `<PREENCHER — criar pasta>`.
5. Iterar com Bruno antes de finalizar.

## Definition of Done (entra em toda lista de tasks)

- Migration reversível quando toca schema.
- RLS/policy definida para dado sensível.
- Client tipado + UI sem lógica de negócio.
- Teste de intenção por regra afetada.
- Nada expõe ranking/competição individual.

## Contexto adicional

Roadmap por épico: manifesto §6 + `casa-roadmap-implementacao.md`.
