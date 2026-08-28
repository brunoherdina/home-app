---
name: casa-arquitetura
description: "Stack, convenções e Definition of Done do Casa (Expo/RN + TS, API Fastify, Postgres auto-hospedado + RLS + Drizzle, realtime por LISTEN/NOTIFY, Docker/VPS, Figma+tokens). Usar quando a tarefa envolve decisão de design, 'como estruturo isso', escolha de padrão, ou dúvida sobre convenções do projeto."
---

# Arquitetura — Casa

Persona: arquiteto do sistema. Define stack, convenções e o que conta como "pronto".

## Ler primeiro

1. [Manifesto §3 — Stack e arquitetura](../../../casa-manifesto-projeto.md)
2. [ADRs — `casa-decisoes-produto.md`](../../../casa-decisoes-produto.md) — **ADR-0002 é inegociável**

## Stack confirmado

| Camada | Tecnologia | Papel amarrado ao Casa |
|---|---|---|
| Mobile | Expo (React Native) + TS | reaproveita protótipo React; iOS+Android um código |
| Banco | Postgres em container + migrations | **RLS faz cumprir a anonimização**; schema só muda por migration |
| API | Fastify + TS | sem PostgREST, o app não alcança o banco. **Transporte, não autoridade** |
| Auth | JWT próprio (padrão do `improvisa-ai`) | `Bearer` + `expo-secure-store`; blocklist de `jti` em Postgres |
| Realtime | `LISTEN/NOTIFY` → WebSocket | anel Energia da Casa + meta coletiva, **payload agregado** |
| Jobs | worker Node + cron no compose | notif com horário de silêncio, agregação de incômodos |
| Dados (dev) | Drizzle + drizzle-kit | schema em TS, migrations `.sql`; **`down` à mão** |
| Infra | Docker Compose em VPS + Caddy | backup/TLS/monitoramento são nossos |
| Design | Figma + tokens (`tokens.json`) | identidade travada |

## Convenções

- TypeScript estrito. Sem `any` não justificado.
- Camadas: dados (migration/RLS) → API (rotas/regras) → client tipado → UI RN. Nunca UI antes da camada de dados existir.
- Estado sensível vive protegido por RLS, não por checagem só na UI **nem só no handler**.
- Nenhum componente faz `fetch` direto — passa por `lib/api/`. Nenhum handler pega o pool cru — passa pelo plugin `withUser`.

## A regra que não se negocia (ADR-0002)

A API conecta com role **sem `BYPASSRLS`** e injeta identidade por request:

```sql
BEGIN;
  SET LOCAL ROLE casa_app;
  SET LOCAL app.current_user_id = '<uuid do JWT>';
  -- queries do handler
COMMIT;
```

Policies leem `current_setting('app.current_user_id', true)::uuid`. Handler que checa permissão em TypeScript em vez de deixar a policy decidir é o **mesmo defeito** de esconder na UI — e não quebra nenhum teste funcional. Por isso é guarda de camada, não code review.

## Definition of Done (global)

- Compila + typecheck limpo.
- Testes de intenção passando (ver [casa-qa](../casa-qa/SKILL.md)).
- Migration reversível quando toca schema.
- RLS validada quando toca dado sensível — provada **no banco**, não só pelo endpoint (ver [casa-seguranca-privacidade](../casa-seguranca-privacidade/SKILL.md)).
- Commit Conventional Commits.

## Contexto adicional

Bifurcações descartadas estão no manifesto §3 (Supabase, PostgREST, Flutter, Firebase, PWA-only) — se o stack mudar, revisar skills condicionais. Deploy e operação: ver [casa-infra-deploy](../casa-infra-deploy/SKILL.md).
