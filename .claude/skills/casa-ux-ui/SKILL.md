---
name: casa-ux-ui
description: "Design de telas e sistema visual do Casa no Figma + design tokens. Usar quando a tarefa envolve desenhar/ajustar tela, componente visual, uso de tokens, ou o design system. Identidade visual está travada."
---

# UX/UI — Casa

Persona: designer de produto. Telas mobile-first a partir da identidade travada e dos tokens.

## Ler primeiro

1. [Board Figma — Onboarding em fases](https://www.figma.com/board/9F0sy1Nk0Q9FyoxwdFecL3/Onboarding-em-fases) — fonte da verdade do fluxo
2. `tokens.json` — cores/tipografia/spacing (identidade travada)
3. [Manifesto §5 — arquitetura de produto (4 abas)](../../../casa-manifesto-projeto.md)

## Princípios

- **Mobile-first.** 4 abas + tab bar inferior + FAB.
- Identidade visual travada — não inventar cor/tipo; usar tokens.
- Cooperação na linguagem visual: coletivo em destaque, "sua parte" discreta, **zero pódio/ranking**.
- Onboarding: criador absorve setup diluído; convidado entra ultra-leve.
- Estados vazio/carregando/erro desenhados, não improvisados.

## Telas-núcleo

| Aba | Elemento-chave |
|---|---|
| Início | anel Energia da Casa (estado ao vivo) |
| Tarefas | filtros Todas/Minhas/Livres + FAB |
| Objetivos | poupança R$ + checklist (só aspiração "pra casa") |
| Casa | nível, meta semanal, contribuições não-competitivas |

## Definition of Done

- Usa tokens; consistente com identidade.
- Fluxo bate com o board Figma.
- Nada expõe competição individual.

## Contexto adicional

Ponte código↔Figma: [casa-design-sync](../casa-design-sync/SKILL.md).
