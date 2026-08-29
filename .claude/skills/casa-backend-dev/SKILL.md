---
name: casa-backend-dev
description: "Backend do Casa — API Fastify + TS sobre Postgres auto-hospedado: rotas, auth JWT, jobs do worker, regras de negócio server-side. Usar quando a tarefa envolve criar/alterar endpoint, query, auth, job agendado, ou cálculo de negócio (pontos, agregação) no servidor."
---

# Backend Dev — Casa

Persona: engenheiro de confiabilidade. Regras de negócio moram aqui e na camada de dados — não na UI.

## Ler primeiro

1. [casa-arquitetura](../casa-arquitetura/SKILL.md) — stack e camadas
2. [casa-migrations](../casa-migrations/SKILL.md) — schema muda só por migration
3. [casa-seguranca-privacidade](../casa-seguranca-privacidade/SKILL.md) — RLS antes de expor dado
4. [casa-dominio-tarefas](../casa-dominio-tarefas/SKILL.md) / [casa-dominio-cooperacao](../casa-dominio-cooperacao/SKILL.md) — regras de negócio

## Padrões

- **Fastify + TS.** Rotas em `apps/api/src/routes/`, prefixo `/api`. Jobs agendados no `worker/`.
- **Todo handler autenticado passa pelo plugin `withUser`** (`apps/api/src/plugins/withUser.ts`) — abre transação, `SET LOCAL ROLE casa_app`, injeta a identidade e commita. Pool cru em handler é bug de arquitetura (ADR-0002), cobrado por `npm run guards`.

  ```ts
  app.get('/tarefas', async (request) =>
    request.withUser(async (db) => db.select().from(tarefas)),
  )
  ```

  A identidade entra por `set_config('app.current_user_id', $1, true)` e **não** por `SET LOCAL app.current_user_id = $1`: `SET` não aceita bind parameter.
- **Rota pública de auth usa `semIdentidade`, não o pool cru** (ADR-0013). Ela abre transação com
  `SET LOCAL ROLE casa_auth`, num pool separado que só tem grant em credencial e sessão. `npm run
  guards` exige que todo handler passe por um dos dois plugins.
- **Rotação de refresh precisa de janela de graça** (ADR-0008): app mobile dispara requests em paralelo
  e retenta em rede ruim. Refresh consumido há menos de ~30 s devolve o par sucessor; consumido antes
  disso é vazamento e revoga a família. Sem a janela, retry legítimo desloga o usuário — e o beta lê
  isso como abandono.
- O boot da API recusa subir se o pool for superusuário, tiver `BYPASSRLS` ou for dono de tabela (`afirmaContratoDeRls`). Contrato quebrado falha no start, não em produção.
- **Auth** em `/api/auth`, desenho do `improvisa-ai` reescrito em TS (ADR-0003): JWT HS256 com `sub` + `jti`, senha em argon2, Google/Apple, verificação de e-mail por token de 24 h, logout por blocklist de `jti` em Postgres. **Bearer-first — sem cookie**, o cliente é RN.
- **Par access + refresh desde o Épico 1** (ADR-0008): access ~15 min, refresh de 30–90 dias com **rotação a cada uso**. Refresh já consumido chegando de novo = vazamento → revogar a família inteira de tokens e forçar login. Logout de verdade é revogar o refresh, não descartar o access no cliente.
- **Validação de payload com os schemas zod de `packages/contracts`** (ADR-0009) — os mesmos do formulário no app. zod valida **forma**, nunca autoridade: payload válido continua sujeito à RLS.
- Cálculos de negócio server-side: pontos por esforço, agregação de frustração (peso, sem atribuição), estado de tarefa.
- **Anonimização é responsabilidade da camada de dados**: frustração vira peso agregado via query/policy, nunca linha atribuída a pessoa consultável. A API não é a guarda — a policy é.
- Idempotência em jobs (agregação, notif) — o cron do worker pode repetir.
- Client tipado: schema Drizzle é a fonte da verdade; tipos compartilhados em `packages/contracts/`.

## Definition of Done

- RLS cobre toda tabela com dado sensível (ver seguranca-privacidade).
- Handler passa pelo `withUser` — sem exceção silenciosa.
- Regra de negócio testada por intenção.
- Job idempotente se agendado.
- Sem endpoint que retorne ranking por pessoa — inclui os **pontos-bônus** do ADR-0010, que alimentam "sua parte" e o coletivo e nunca uma lista ordenada de moradores.
- Segredo (`DATABASE_URL`, `JWT_SECRET`, OAuth) só por env do servidor — nunca no bundle.

## Contexto adicional

Realtime (anel Energia, meta coletiva) e jobs de notif: ver [casa-realtime](../casa-realtime/SKILL.md). Compose, deploy e backup: ver [casa-infra-deploy](../casa-infra-deploy/SKILL.md). Racional das escolhas: [ADRs](../../../casa-decisoes-produto.md).
