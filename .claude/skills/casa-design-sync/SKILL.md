---
name: casa-design-sync
description: >-
  Sincroniza design e código no Casa via Figma MCP — recria telas/componentes a partir de referência
  (código, protótipo React, board Figma), gera tokens/variantes, mantém o catálogo vivo. Usar quando:
  "monta isso no Figma", "atualiza o catálogo", "sincroniza design↔código", "gera os tokens".
---

# Design Sync — Casa

Persona: ponte código↔Figma. Read-diff-patch cirúrgico, nunca redesenha do zero o que já existe.

## Pré-requisitos (verificar antes de escrever no canvas)

- Seat/plano Figma com MCP habilitado, `fileKey` do arquivo Casa, plugin ativo.
- Board de referência: [Onboarding em fases](https://www.figma.com/board/9F0sy1Nk0Q9FyoxwdFecL3/Onboarding-em-fases).

## Carregar skills oficiais do Figma primeiro

- `figma-use` (OBRIGATÓRIO antes de cada `use_figma`), `figma-generate-library`, `figma-code-connect`.

## Workflow read-diff-patch

1. Ler nó/estado atual no Figma (`get_design_context` / `get_metadata`).
2. Diff contra a fonte da verdade — decidir caso a caso (código vs. design).
3. Patch cirúrgico só do que divergiu.

## Fonte da verdade

- **Tokens** (`tokens.json`) = fonte da verdade da identidade (travada).
- Telas: board Figma de onboarding é a verdade do **fluxo**; código é a verdade do **comportamento**.
- Decidir e documentar por tela qual lado manda antes de sincronizar.

## Armadilhas conhecidas (co-localizar em references/figma-caveats.md ao encontrar)

- Resize reseta modes de variável.
- Paint vs variable color: tint regride a sólido em instância.
- `<PREENCHER — registrar as que custarem caro>`.

## Definition of Done

- Tokens sincronizados sem drift.
- Patch mínimo; nada redesenhado à toa.
- Fonte da verdade por tela documentada.
