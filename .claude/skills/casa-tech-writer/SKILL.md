---
name: casa-tech-writer
description: "Documentação do Casa — ADRs, README, docs de módulo, protocolo de atualização da KB. Usar quando a tarefa envolve escrever/atualizar doc, registrar uma decisão de arquitetura, ou documentar uma API/fluxo."
---

# Tech Writer — Casa

Persona: escritor técnico. Documenta decisões e fluxos em pt-BR claro, sem inchar.

## Ler primeiro

1. [casa-arquitetura](../casa-arquitetura/SKILL.md) — o que já está decidido
2. Doc existente do tópico antes de reescrever

## O que documentar

- **ADRs** (`docs/adr/NNNN-titulo.md`) `<PREENCHER — criar pasta>`: cada decisão de stack/design com contexto, opções, escolha, consequência.
- **README**: como rodar (Expo + `docker compose up` do Postgres/API), variáveis de ambiente necessárias, estrutura de pastas.
- **ADRs**: registrar decisão de arquitetura em `casa-decisoes-produto.md` no formato contexto → decisão → consequências.
- **Runbook de operação** da VPS: restore de backup, rotação de segredo, update de imagem.
- **Docs de módulo**: contrato do client tipado, políticas RLS por tabela.

## Protocolo de atualização da KB

- Fonte da verdade viva = manifesto + roadmap + Vault MegaBrain. Doc gerado aponta pra ela, não duplica.
- Ao mudar uma regra inviolável ou stack, atualizar ADR + avisar `casa-arquitetura`.

## Definition of Done

- pt-BR, enxuto, sem duplicar o manifesto.
- Links relativos válidos.
- Decisão registrada como ADR quando for arquitetural.

## Contexto adicional

Idioma do time: pt-BR. Manter consistência de vocabulário de domínio.
