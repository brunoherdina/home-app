---
title: "Casa — Decisões de Arquitetura e Produto"
tipo: adr
projeto: Casa
status: ativo
data: 2026-08-28
tags:
  - casa
  - adr
  - decisoes
relacionados:
  - "[[casa-manifesto-projeto]]"
  - "[[casa-handoff-stack-expo]]"
  - "[[casa-roadmap-implementacao]]"
---

# Casa — Decisões

Registro das decisões que travam a arquitetura. Cada ADR tem **contexto → decisão → consequências**.
Skills `casa-*` referenciam este arquivo; se um ADR mudar, as skills afetadas mudam junto.

Índice:

| # | Decisão | Status |
|---|---|---|
| [0001](#adr-0001--postgres-auto-hospedado-em-container-vps-em-vez-de-supabase) | Postgres auto-hospedado em container (VPS) em vez de Supabase | ✅ Aceito |
| [0002](#adr-0002--rls-continua-sendo-a-camada-de-enforcement) | RLS continua sendo a camada de enforcement | ✅ Aceito |
| [0003](#adr-0003--auth-jwt-próprio-herdado-do-improvisa-ai) | Auth: JWT próprio, herdado do padrão do `improvisa-ai` | ✅ Aceito |
| [0004](#adr-0004--realtime-por-listennotify--websocket) | Realtime por LISTEN/NOTIFY + WebSocket | ✅ Aceito |
| [0005](#adr-0005--drizzle--drizzle-kit-para-schema-e-client-tipado) | Drizzle + drizzle-kit para schema e client tipado | ✅ Aceito |
| [0006](#adr-0006--estado-e-data-fetching-no-app) | Estado e data fetching no app | ✅ Aceito |

---

## ADR-0001 — Postgres auto-hospedado em container (VPS) em vez de Supabase

**Data:** 2026-08-28 · **Status:** ✅ Aceito

### Contexto

O manifesto §3 e o handoff recomendavam **Supabase** como BaaS: Postgres + RLS + Auth + Realtime +
Edge Functions num pacote só. A justificativa era que a **RLS do Postgres** faz cumprir os invariantes
de anonimização do §2, e o resto vinha de brinde.

Decisão de Bruno: **não usar Supabase**. Rodar **Postgres em container**, com deploy em **VPS
própria**.

### Decisão

Stack de servidor passa a ser, tudo em Docker Compose na VPS:

| Peça | Escolha |
|---|---|
| Banco | **Postgres** em container (imagem oficial), volume persistente |
| API | **Fastify + TypeScript** em container |
| Realtime | `LISTEN/NOTIFY` → WebSocket no próprio Fastify (ver [ADR-0004](#adr-0004--realtime-por-listennotify--websocket)) |
| Jobs / cron | worker Node no mesmo deploy (notificações, agregação) |
| Reverse proxy / TLS | **Caddy** (certificado automático) |
| Migrations + client tipado | **Drizzle + drizzle-kit** (ver [ADR-0005](#adr-0005--drizzle--drizzle-kit-para-schema-e-client-tipado)) |
| Storage de arquivo | **nenhum no v1** — avatar é apelido + cor, não upload |

### Consequência arquitetural principal: 2 camadas → 3 camadas

Sem PostgREST, **o app Expo não fala com o Postgres**. Entra uma camada de API no meio:

```
antes:  Expo  ──anon key──▶  PostgREST/Supabase  ──▶  Postgres (RLS decide)
agora:  Expo  ──Bearer JWT──▶  Fastify  ──pool pg──▶  Postgres (RLS decide)
```

Isso muda quem é responsável por quê — e cria o risco tratado no [ADR-0002](#adr-0002--rls-continua-sendo-a-camada-de-enforcement).

### Consequências

**Ganhos**
- Sem vendor lock-in; custo fixo previsível de VPS.
- Some a restrição "anon key é pública": o segredo agora vive só no servidor.
- SQL e Postgres puros — o que se aprende transfere.

**Custos assumidos**
- Toda a camada de API é código novo (não existia no plano).
- Auth, realtime, cron e storage deixam de ser "de brinde".
- **Operação vira responsabilidade sua**: backup testado, TLS, updates de imagem, monitoramento,
  restore. Backup sem restore testado não é backup.
- Sem precedente interno: o `rimaai` é offline/Vercel, o `improvisa-ai` é Python/FastAPI. A camada
  Fastify do Casa é desenho original.

### Alternativas descartadas

- **Self-host do Supabase** (o compose oficial): tecnicamente atende "Postgres em container na VPS" e
  preservaria a arquitetura de 2 camadas. Descartado por decisão explícita de não usar Supabase.
- **PostgREST + container de auth**: manteria RLS como guarda única e quase zero backend, mas
  espalha a lógica em funções SQL e multiplica peças de infra.

---

## ADR-0002 — RLS continua sendo a camada de enforcement

**Data:** 2026-08-28 · **Status:** ✅ Aceito · **Depende de:** ADR-0001

### Contexto

> [!danger] Este ADR existe para impedir uma regressão silenciosa
> Com uma API no meio, o caminho preguiçoso é conectar ao Postgres como owner/superuser e checar
> permissão em TypeScript. Aí a RLS vira decorativa e os invariantes §2 voltam a morar em código de
> aplicação — exatamente o que o handoff §7 reprova: *"se a query devolve o dado nominal e a tela
> esconde, está errado"*. Trocar `if` de UI por `if` de controller não é progresso.

### Decisão

A API é **transporte**, não autoridade. Concretamente:

1. O pool da API conecta com um role de aplicação **sem `BYPASSRLS`** e **sem ser owner** das tabelas.
   O owner das tabelas é um role de migration, usado só pelo drizzle-kit.
2. Toda requisição autenticada abre transação e injeta a identidade **antes** de qualquer query:

   ```sql
   BEGIN;
     SET LOCAL ROLE casa_app;
     SET LOCAL app.current_user_id = '<uuid do JWT>';
     -- queries do handler aqui
   COMMIT;
   ```

   `SET LOCAL` morre com a transação — não vaza identidade entre requisições do mesmo pool.
3. As policies leem `current_setting('app.current_user_id', true)::uuid` no lugar do `auth.uid()`
   que o Supabase daria.
4. O role de migration e qualquer credencial administrativa **nunca** são usados por handler de
   request.

### Critério de aceite (substitui o do handoff §7)

Para cada dado sensível (frustração, pulso, aspiração "pra mim"): autenticar como **outro membro da
casa**, chamar o endpoint real, e confirmar que o dado atribuível **não está no payload**. Além
disso, um teste que roda a query direto no banco com `SET ROLE casa_app` e prova que a RLS bloqueia
mesmo sem a API no caminho.

Se a proteção só existe no handler, está reprovado.

---

## ADR-0003 — Auth: JWT próprio, herdado do `improvisa-ai`

**Data:** 2026-08-28 · **Status:** ✅ Aceito · **Depende de:** ADR-0001

### Contexto

O Auth do Supabase (GoTrue) some com o ADR-0001. Decisão de Bruno: usar **o mesmo sistema de auth do
`improvisa-ai`** (repo vizinho).

> [!important] O que se herda é o padrão, não o código
> O auth do `improvisa-ai` é **Python/FastAPI** (`python-jose` + `passlib[bcrypt]`, ~600 linhas em
> `backend/app/core/auth.py` e `backend/app/routers/auth.py`). O Casa é Fastify/TypeScript. Reescreve-se
> o mesmo desenho em TS; nenhuma linha é copiada.

### Decisão

Replicar o desenho do `improvisa-ai`:

| Aspecto | Padrão herdado | Equivalente no Casa (Node/TS) |
|---|---|---|
| Token | JWT HS256, claim `sub` = user id, `jti` para revogação | `jose` |
| Expiração | 7 dias (acesso), 24 h (verificação de e-mail) | igual |
| Senha | bcrypt via `passlib` | `argon2` (padrão atual do OWASP) |
| Social | Google OAuth, fluxo `access_token` + verificação no `tokeninfo` | `expo-auth-session` no app |
| Verificação de e-mail | token JWT de 24 h enviado por e-mail | igual |
| Logout | blocklist de `jti` com TTL = vida restante | ver delta 2 abaixo |
| Extração do token | `Authorization: Bearer` **ou** cookie httpOnly | ver delta 1 abaixo |
| Tabelas | `users` (com `hashed_password` nullable p/ contas sociais, `google_sub` único) | igual |
| Rota | prefixo `/api/auth`, com `register`/`login`/`google`/`verify-email`/`me`/`logout` | igual |

### Deltas conscientes (o Casa é mobile, o `improvisa-ai` é web)

1. **Bearer-first, sem cookie.** O `improvisa-ai` é browser: cookie httpOnly com proxy BFF. O Casa é
   Expo — não há browser nem cookie confiável. O token vive em **`expo-secure-store`** e vai sempre
   como `Authorization: Bearer`. O caminho de cookie não é portado.
2. **Blocklist em Postgres, não em Redis.** O `improvisa-ai` usa Redis para os `jti` revogados. Um
   container a menos vale mais aqui: tabela `revoked_tokens(jti, expires_at)` + limpeza agendada pelo
   worker de cron. Se Redis entrar por outro motivo, migrar é trivial.
3. **Refresh token — a rever.** O padrão herdado é token único de 7 dias, sem refresh. Em web isso
   passa; num app instalado, significa **logout semanal**. Fica registrado como dívida conhecida:
   avaliar par access curto + refresh no SecureStore antes do beta (Épico 6).
4. **Sign in with Apple.** A App Store exige Apple como opção quando o app oferece outro login
   social no iOS. O `improvisa-ai` não precisa disso (é web). Entra no escopo do Épico 1.

### Consequência para o §2

Auth entrega o `sub` que alimenta o `SET LOCAL app.current_user_id` do [ADR-0002](#adr-0002--rls-continua-sendo-a-camada-de-enforcement).
Sem auth correto, não há RLS correta.

---

## ADR-0004 — Realtime por LISTEN/NOTIFY + WebSocket

**Data:** 2026-08-28 · **Status:** ✅ Aceito · **Depende de:** ADR-0001

### Contexto

O Supabase Realtime lia o WAL e empurrava mudanças por websocket. Alimentava o anel **Energia da
Casa** (Início) e a **meta coletiva** (aba Casa).

### Decisão

- Trigger no Postgres emite `NOTIFY casa_<casa_id>` quando o estado coletivo muda (tarefa concluída,
  meta avançou).
- Uma conexão dedicada da API fica em `LISTEN` e faz fan-out por **WebSocket** para os clientes
  daquela casa.
- **O payload é sempre agregado.** Nunca um stream de linhas da tabela. Isso não é otimização: é o
  invariante §2 — um stream cru vazaria atribuição que a RLS bloquearia na query.

### Consequências

- `NOTIFY` tem limite de 8 KB de payload e **não persiste**: cliente que reconecta precisa refazer o
  fetch do estado. O cliente trata o WS como *invalidação de cache*, não como fonte da verdade.
- Uma conexão `LISTEN` fica ocupada permanentemente — fora do pool de requests.
- Sem Realtime gerenciado, o fan-out é código nosso e precisa de teste.

---

## ADR-0005 — Drizzle + drizzle-kit para schema e client tipado

**Data:** 2026-08-28 · **Status:** ✅ Aceito · **Depende de:** ADR-0001

### Contexto

Somem o `supabase db push` (migrations) e o `supabase gen types` (client tipado). Precisa de
substituto para os dois.

### Decisão

**Drizzle ORM + drizzle-kit.** Schema em TypeScript, queries tipadas, e o `drizzle-kit generate`
produz arquivos `.sql` versionados e editáveis.

### Consequências

> [!warning] Ressalva que muda uma regra do projeto
> O drizzle-kit **não gera down-migration**. A DoD "migration reversível" deixa de ser automática e
> vira disciplina: o `down.sql` é escrito à mão ao lado do gerado, e o teste de migration aplica
> **up + down + up** no banco local. Não é a ferramenta que garante — é o checklist.

- Policies de RLS não são expressáveis no schema TS: vão como SQL na mesma migration da tabela. A
  regra "tabela sensível nasce com policy" continua valendo e é cobrada em review.
- `GRANT` para o role `casa_app` (ADR-0002) também é SQL manual na migration.

### Alternativa descartada

**node-pg-migrate + Kysely** daria `up`/`down` de verdade, casando melhor com a DoD atual — ao custo
de duas ferramentas. Reavaliar se a disciplina de `down` manual falhar na prática.

---

## ADR-0006 — Estado e data fetching no app

**Data:** 2026-08-28 · **Status:** ✅ Aceito

### Contexto

Perguntas abertas do handoff §11 (1 e 2). O `rimaai` não tem lib de estado nem faz rede — o
precedente interno é `useReducer` puro.

### Decisão

- **Data fetching: TanStack Query.** Quase todo estado do Casa é *server state*; Query entrega cache,
  retry e offline. O WebSocket do [ADR-0004](#adr-0004--realtime-por-listennotify--websocket) **invalida** queries, não mantém estado paralelo.
- **Estado global: nenhuma lib.** `useReducer` + Context para o pouco que é genuinamente local (passo
  do onboarding, filtro da aba Tarefas). Mantém o precedente do `rimaai`.

### Consequências

Uma fonte da verdade por dado. Zustand entraria como cache duplicado do servidor e é o caminho mais
comum para telas dessincronizadas.

---

## Decisões ainda em aberto

### Técnicas

| # | Pergunta | Bloqueia |
|---|---|---|
| 1 | E2E de app: Maestro × Detox (decidir junto com o `rimaai`) | Épico 6 |
| 2 | OTA (`expo-updates`) no v1 ou adiado | Épico 0 — barato agora, caro depois |
| 3 | Formulários: React Hook Form ou controlado na mão | Épico 1 |
| 4 | Refresh token (delta 3 do [ADR-0003](#adr-0003--auth-jwt-próprio-herdado-do-improvisa-ai)) | Épico 6 |
| 5 | Provedor da VPS e estratégia de backup offsite | Épico 0 |

### Produto (do manifesto §9)

| # | Pergunta | Bloqueia |
|---|---|---|
| 6 | Escopo do pulso semanal: só humor, ou também "alguém sobrecarregado?" | Épico 4 |
| 7 | Modelo de rodízio + pontos-bônus para tarefa universalmente detestada | Épico 2 |
| 8 | Modelo de negócio sustentável | Épico 6 |
| 9 | Qual tela prototipar primeiro (criador Fase 0 × seleção de preferências) | — |
| 10 | Termos de uso + política de privacidade (LGPD), exclusão e exportação de dados | Épico 6 |
