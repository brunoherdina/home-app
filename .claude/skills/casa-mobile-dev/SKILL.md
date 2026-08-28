---
name: casa-mobile-dev
description: "Desenvolvimento mobile do Casa em Expo (React Native) + TypeScript. Usar quando a tarefa envolve escrever/modificar tela ou componente mobile, navegação, consumo da API na UI (TanStack Query), ou reaproveitar o protótipo React."
---

# Mobile Dev — Casa

Persona: implementador mobile cirúrgico. Escreve UI RN a partir dos tokens, consome a API pelo client tipado, sem meter lógica de negócio na tela.

## Ler primeiro

1. [casa-arquitetura](../casa-arquitetura/SKILL.md) — convenções TS/camadas
2. [casa-ux-ui](../casa-ux-ui/SKILL.md) — tokens e telas Figma (fonte da verdade visual)
3. Protótipo React existente (React, inline styles, tema, Lucide) — reaproveitar padrões
4. Client tipado em `lib/api/` do módulo tocado

## Padrões

- Expo + RN + TS. Componentes funcionais, hooks.
- Estilo a partir de `tokens.json` — não hardcodar cor/spacing.
- **Dados via TanStack Query** através de `lib/api/` (ADR-0006). Nenhum componente faz `fetch` direto — é regra de camada cobrada por teste.
- Sessão: **access curto em memória**, enviado como `Authorization: Bearer`; **refresh no `expo-secure-store`** (nunca `AsyncStorage`), usado só contra `/api/auth/refresh` e rotacionado a cada uso (ADR-0008). `EXPO_PUBLIC_*` só guarda a URL da API — nenhum segredo entra no bundle.
- 4 abas + tab bar inferior + FAB (manifesto §5): Início (anel Energia), Tarefas (filtros Todas/Minhas/Livres), Objetivos, Casa.
- Estados: vazio, carregando, erro — sempre.
- Realtime na UI por WebSocket, que **invalida queries** do TanStack em vez de manter estado paralelo (ver [casa-realtime](../casa-realtime/SKILL.md)). Ao reconectar, refetch — `NOTIFY` não persiste.
- **Formulários com React Hook Form + resolver zod** (ADR-0009). O schema zod vem de `packages/contracts` e é o mesmo que a API valida — não reescrever a regra na tela.
- **Sem lógica de negócio na tela.** Cálculo/regra mora no backend/domínio. UI só apresenta.
- **Nunca renderizar ranking/pódio.** "Sua parte" sim, comparação entre pessoas não.

## Definition of Done

- Typecheck limpo, sem `any` solto.
- Estilo via tokens; sem valores mágicos.
- Estados vazio/erro cobertos.
- Nenhuma regra inviolável violada na apresentação.

## Contexto adicional

Onboarding ultra-leve pro convidado (Fase 0) — priorizar caminho curto. Ver manifesto §5. A **primeira
tela a prototipar** é o criador da Fase 0: é o portão de retenção do §2.3.

`expo-updates` está instalado desde o Épico 0a mas **nenhum OTA é publicado até o Épico 6** (ADR-0007).
OTA entrega só JavaScript — mudança de módulo nativo ou de SDK continua exigindo build e submissão.
