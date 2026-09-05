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
| [0007](#adr-0007--ota-instalado-no-bootstrap) | OTA instalado no bootstrap, publicação adiada | ✅ Aceito |
| [0008](#adr-0008--refresh-token-no-épico-1) | Refresh token antecipado para o Épico 1 | ✅ Aceito |
| [0009](#adr-0009--formulários-com-react-hook-form-e-zod) | Formulários com React Hook Form + zod | ✅ Aceito |
| [0010](#adr-0010--rodízio-com-bônus-de-pontos-para-tarefa-detestada) | Rodízio + bônus de pontos para tarefa detestada | ✅ Aceito |
| [0011](#adr-0011--pulso-semanal-só-de-humor) | Pulso semanal só de humor | ✅ Aceito |
| [0012](#adr-0012--identidade-é-o-morador-escopo-de-casa-por-função-sql) | Identidade é o morador; escopo de casa por função SQL | ✅ Aceito |
| [0013](#adr-0013--role-casa_auth-para-as-rotas-sem-identidade) | Role `casa_auth` para as rotas sem identidade | ✅ Aceito |

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

## ADR-0007 — OTA instalado no bootstrap

**Data:** 2026-08-28 · **Status:** ✅ Aceito

### Contexto

Pergunta técnica nº 2 do handoff §11, marcada *"barato agora, caro depois"*. `expo-updates` é módulo
nativo: adicioná-lo depois exige rebuild nativo e nova submissão às lojas — justamente quando você já
tem gente instalada e um bug pra corrigir.

### Decisão

Instalar `expo-updates` e configurar os canais no **Épico 0a**. **Não publicar nenhum update OTA** até
o Épico 6. A dependência existe pra estar lá quando for precisa, não pra ser usada agora.

### Consequências

- O primeiro dev build já nasce com runtime de update. Custo hoje ≈ zero.
- **OTA só entrega JavaScript.** Trocar módulo nativo, versão de SDK ou permissão continua exigindo
  build e submissão. Confundir os dois é como se descobre tarde que o rollback não existia.
- OTA não é atalho pra fugir de review: mudança de comportamento do app tem que passar pela loja. A
  política existe e o descumprimento custa a conta de publicação.

---

## ADR-0008 — Refresh token no Épico 1

**Data:** 2026-08-28 · **Status:** ✅ Aceito · **Emenda o** [ADR-0003](#adr-0003--auth-jwt-próprio-herdado-do-improvisa-ai) **(delta 3)**

### Contexto

O ADR-0003 herdou do `improvisa-ai` o token único de 7 dias sem refresh e deixou a revisão pro Épico 6.
Duas razões derrubam esse adiamento:

1. **Custo de retrofit.** Enquanto o auth é código novo, refresh é barato. Depois, mexe em storage do
   token, em todo cliente e na blocklist de `jti` — trabalho que só existe porque foi adiado.
2. **O sinal do beta.** O v1 é dogfooding com duas pessoas. Token de 7 dias significa **logout
   semanal**, que se apresenta como abandono e contamina a única medição que o beta produz.

### Decisão

O auth do Épico 1 nasce com par de tokens:

| Token | Vida | Onde vive |
|---|---|---|
| Access | ~15 min | memória do app, enviado como `Authorization: Bearer` |
| Refresh | longa (30–90 d) | `expo-secure-store`, usado só contra `/api/auth/refresh` |

- **Rotação a cada uso**: o refresh consumido é invalidado e um novo é emitido.
- **Detecção de reuso**: refresh já consumido chegando de novo = sinal de vazamento → revogar a
  família inteira de tokens daquela sessão e forçar login.
- A blocklist de `jti` do ADR-0003 (delta 2) passa a valer para refresh, não só para access.

### Consequências

- O Épico 1 cresce: rotação, reuso e revogação viram casos de teste, não detalhe de implementação.
- **A janela de um token vazado cai de 7 dias para ~15 minutos.** É o ganho principal, e ele é de
  segurança, não de conveniência.
- Logout de verdade passa a ser *revogar o refresh*, não descartar o access no cliente.

---

## ADR-0009 — Formulários com React Hook Form e zod

**Data:** 2026-08-28 · **Status:** ✅ Aceito

### Contexto

Pergunta técnica nº 3 do handoff §11. O Casa tem poucos formulários (login, criar casa, nova tarefa,
preferências), mas todos têm contraparte na API.

### Decisão

**React Hook Form** com resolver **zod**. Os schemas zod moram em **`packages/contracts`** e são
consumidos dos dois lados: validam o formulário no app e o payload no handler da API.

### Consequências

- Uma definição de regra, dois consumidores — a validação do app não diverge da validação da API,
  que é o defeito clássico de validar na mão em cada tela.
- `packages/contracts` precisa existir desde o Épico 1 (já está no layout do handoff §6).
- Uncontrolled por padrão: menos re-render por tecla em React Native.

> [!warning] Validação não é autorização
> zod valida **forma**, nunca **autoridade**. Um payload perfeitamente válido continua sujeito à RLS
> do [ADR-0002](#adr-0002--rls-continua-sendo-a-camada-de-enforcement). Schema aprovado não é permissão concedida.

---

## ADR-0010 — Rodízio com bônus de pontos para tarefa detestada

**Data:** 2026-08-28 · **Status:** ✅ Aceito

### Contexto

O manifesto §4 marcava *"modelo a confirmar"*: como compensar a tarefa que **todos** os moradores
detestam. Sem compensação, quem está da vez sente injustiça — o atrito exato que o produto existe pra
remover.

### Decisão

Modo **Rodízio** + **pontos-bônus** para quem está da vez numa tarefa marcada como universalmente
detestada (todos os moradores a marcaram como "detesto").

> [!danger] A guarda que torna isso legítimo
> Os pontos-bônus alimentam **"sua parte"** e a meta coletiva. Eles **nunca** aparecem em comparação
> entre moradores — nem tela, nem endpoint, nem query que ordene pessoas por pontos. Sem essa guarda,
> o bônus é um ranking entrando pela porta dos fundos, e viola o §2.1.

### Consequências

- **Sequência**: o Épico 2 implementa rodízio + bônus com a marcação **manual** na tarefa. O Épico 4
  liga a detecção automática, derivada das preferências ("detesto") capturadas lá.
- O bônus é atributo da **tarefa**, não da pessoa — o que preserva a ausência de atribuição.
- Cabe ao `casa-dominio-tarefas` calcular, e ao `casa-dominio-cooperacao` provar que nada disso vira
  pódio.

---

## ADR-0011 — Pulso semanal só de humor

**Data:** 2026-08-28 · **Status:** ✅ Aceito

### Contexto

Pergunta nº 1 do manifesto §9: o pulso semanal captura só humor, ou também *"alguém está
sobrecarregado?"*. Sobrecarga é literalmente a promessa do §1, o que torna a segunda opção tentadora.

### Decisão

**Só humor.** Uma pergunta, anônima, agregada em termômetro da casa.

A razão é de privacidade, não de escopo:

> [!danger] Anonimato numa casa de duas pessoas não existe
> Casal é o público principal e o seu caso de dogfooding. Numa casa de 2, qualquer resposta "anônima"
> é reidentificável no ato — se o termômetro mudou e não foi você, foi a outra pessoa. Prometer
> anonimato que o sistema não pode cumprir é **pior** do que não perguntar: quebra a confiança que o
> §2 existe pra construir.

### Consequências

- **Sobrecarga não fica invisível.** Ela sai do dado que já existe — peso das tarefas concluídas
  contra a distribuição esperada — sem criar coluna sensível nova. Evolução do Épico 4.
- **Regra derivada, válida para toda pergunta anônima futura**: agregado só é exibido acima de um
  piso mínimo de respostas. Numa casa que não atinge o piso, a pergunta simplesmente não é feita.
  Isso vale pro pulso e pros incômodos.
- O schema do Épico 1 nasce sem coluna de sobrecarga por pessoa.


---

## ADR-0012 — Identidade é o morador; escopo de casa por função SQL

**Data:** 2026-08-29 · **Status:** ✅ Aceito · **Depende de:** [ADR-0002](#adr-0002--rls-continua-sendo-a-camada-de-enforcement)

### Contexto

O Épico 1 não consegue escrever a primeira migration sem responder: **uma pessoa pode pertencer a mais
de uma casa?** A resposta define o que `app.current_user_id` significa e como *toda* policy do projeto
escopa. Decidir isso depois custa remigrar identidade em cada tabela.

### Decisão

**Uma casa por conta no v1.** `moradores` acumula credencial e pertencimento; a identidade injetada por
requisição é `morador.id`. Toda tabela escopada carrega `casa_id` **desde já**, e o predicado nunca é
escrito à mão duas vezes — sai de uma função:

```sql
create function casa_atual() returns uuid
  language sql stable security definer set search_path = public, pg_temp as $$
    select casa_id from moradores
     where id = nullif(current_setting('app.current_user_id', true), '')::uuid
  $$;

revoke execute on function casa_atual() from public;
grant execute on function casa_atual() to casa_app;

-- toda policy escopada por casa:
create policy "mesma_casa" on tarefas for select
  using (casa_id = casa_atual());
```

> [!warning] Por que `security definer` aqui, e por que isso não é um bypass
> A policy de `moradores` precisa deixar um morador **ver os outros da mesma casa** — é o "vê quem já
> entrou" da Fase 0. Se essa policy chamasse uma função `security invoker` que lê `moradores`, o
> Postgres entra em **recursão infinita**. `security definer` quebra o ciclo. O raio é estreito de
> propósito: a função lê **uma linha**, pela identidade já injetada, `search_path` fixo, `EXECUTE`
> revogado de `PUBLIC`. Ela não recebe parâmetro — não há o que injetar nela.

### Consequências

- **O caminho de volta é contido.** Se um dia `usuarios` e `moradores` se separarem, muda a função e a
  tabela — não as N policies que já estiverem escritas. É o que torna esta escolha reversível.
- **Uma pessoa que queira uma segunda casa precisa de outro e-mail.** Aceitável no beta de duas
  pessoas; **revisar antes de abrir para fora** — república e casa da família são o caso óbvio.
- `check-roles.sh` ganha uma asserção: `casa_atual()` não pode ser `EXECUTE` para `PUBLIC`.
- Toda policy escopada usa `casa_atual()`. Predicado de casa escrito inline em migration é desvio a
  ser pego em revisão.

---

## ADR-0013 — Role `casa_auth` para as rotas sem identidade

**Data:** 2026-08-29 · **Status:** ✅ Aceito · **Depende de:** [ADR-0002](#adr-0002--rls-continua-sendo-a-camada-de-enforcement) · **Emenda o** [ADR-0003](#adr-0003--auth-jwt-próprio-herdado-do-improvisa-ai)

### Contexto

`register`, `login` e `refresh` acontecem **antes** de existir identidade, e o plugin `withUser` exige
uma. Sem um caminho explícito, o atalho no primeiro dia do Épico 1 é o handler pegar o pool cru — que é
exatamente o furo que o ADR-0002 existe para impedir, e que `npm run guards` reprova.

### Decisão

Um **segundo role**, `casa_auth`, com **pool próprio** e credencial própria (`AUTH_DATABASE_URL`):

- `NOBYPASSRLS`, não é dono de nada, sem `CREATE` no schema — as mesmas restrições de `casa_app`.
- `GRANT` mínimo: as colunas de credencial de `moradores`, mais `sessoes` e `revoked_tokens`. Nada de
  tarefas, objetivos ou dado sensível.
- Plugin `semIdentidade(fn)` abre a transação com `SET LOCAL ROLE casa_auth`. A guarda de camada passa
  a exigir que **todo** handler use `withUser` **ou** `semIdentidade`.

Pool separado, e não `GRANT casa_auth TO casa_app`: se `casa_app` pudesse virar `casa_auth` por
`SET ROLE`, qualquer handler poderia escalar sozinho e o limite viraria convenção.

### Consequências

- Um segredo a mais no ambiente, e `afirmaContratoDeRls()` passa a rodar para os dois pools no boot.
- O raio de dano de um bug em `/api/auth` fica restrito a três tabelas.
- `check-roles.sh` ganha as mesmas asserções do `casa_app` aplicadas a `casa_auth`, mais uma: `casa_auth`
  **não** tem `SELECT` em tabela de dado sensível.


---

## Decisões ainda em aberto

### Técnicas

| # | Pergunta | Bloqueia |
|---|---|---|
| 1 | E2E de app: Maestro × Detox (decidir junto com o `rimaai`) | Épico 6 |
| 5 | Provedor da VPS e estratégia de backup offsite | **Épico 0b** — deixou de bloquear o 0a |

Fechadas em 2026-08-28: nº 2 → [ADR-0007](#adr-0007--ota-instalado-no-bootstrap) ·
nº 3 → [ADR-0009](#adr-0009--formulários-com-react-hook-form-e-zod) ·
nº 4 → [ADR-0008](#adr-0008--refresh-token-no-épico-1).

### Produto (do manifesto §9)

| # | Pergunta | Bloqueia |
|---|---|---|
| 8 | Modelo de negócio sustentável | Épico 6 |
| 10 | Termos de uso + política de privacidade (LGPD), exclusão e exportação de dados | Épico 6 |

Fechadas em 2026-08-28: nº 6 → [ADR-0011](#adr-0011--pulso-semanal-só-de-humor) ·
nº 7 → [ADR-0010](#adr-0010--rodízio-com-bônus-de-pontos-para-tarefa-detestada) ·
nº 9 → **criador da Fase 0** é a primeira tela a prototipar (é o portão de retenção do §2.3 e o que o
Épico 1 entrega; registrado no roadmap, não vira ADR).
