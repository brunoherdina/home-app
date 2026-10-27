# Casa — roadmap de implementação

Companheiro do `casa-manifesto-projeto.md` (aquele é a **entrada do agente**; este é o **plano que
você executa**). O manifesto carrega a versão compacta dos épicos; aqui está o detalhe, a sequência e
o runbook pra ligar o Claude Code.

---

## Como ler

Cada épico traz: **Meta** · **Entregáveis** · **DoD** (pronto quando) · **Depende de** · **Onboarding
que destrava** · **Skills `casa-*` que dirigem**. A ordem é deliberada: fundação e regras invioláveis
primeiro, gamificação e dados sensíveis depois — mas **modelados desde o início** pra não retrabalhar.

---

## Princípios transversais (valem em todos os épicos, desde o dia 1)

1. **Sem ranking, nunca.** Nenhuma tabela, coluna ou endpoint expõe pódio por pessoa. Se aparecer
   "top morador" em qualquer camada, é bug de arquitetura. Os **pontos-bônus** do ADR-0010 alimentam
   "sua parte" e a meta coletiva — nunca uma comparação entre moradores. Query que ordena pessoas por
   pontos é ranking, mesmo sem tela.
2. **Anonimização na camada de dados.** Frustração vira peso agregado sem atribuição; aspiração "pra
   mim" é privada — isso é **RLS/policy**, não if-no-front. Modelar as tabelas já assim no Épico 1.
3. **Onboarding leve pro convidado, diluído pro criador.** Toda tela nova pergunta: "isto pode virar
   nudge D0–D7 em vez de bloquear a entrada?"
4. **Mobile-first de verdade.** Toque, área de alvo, estados vazios e offline pensados desde o começo.
5. **A API é transporte, a RLS é a lei.** Desde o ADR-0001 existe uma camada de API entre o app e o
   Postgres. Ela **injeta identidade** (`SET LOCAL app.current_user_id`) e conecta com role sem
   `BYPASSRLS`; quem decide acesso é a policy. Regra de negócio checada só no handler é o mesmo
   defeito de checar só na UI. Ver **ADR-0002**.

---

## Épico 0 — Bootstrap: fundação local (0a) e produção (0b)

> [!important] O Épico 0 foi cortado em dois (2026-08-28)
> A versão anterior tratava tudo como bloco único e dependia de *"provedor de VPS escolhido"* — o que
> punha uma decisão de infra na frente do produto inteiro. **O 0a não precisa de VPS** e destrava o
> Épico 1 completo. O 0b só é obrigatório quando **outra pessoa** precisa alcançar a API, e isso
> acontece no **convite, no Épico 2**.
> Custo assumido: infra em duas passadas, e o ambiente local diverge de produção até o 0b — bug de
> deploy aparece mais tarde. Compensa porque a alternativa é semanas de infra sem uma tela.

### Épico 0a — Fundação local

- **Meta:** ter o esqueleto de pé na sua máquina, com o contrato do ADR-0002 valendo desde a primeira
  query.
- **Entregáveis:** harness `casa-*` ✅; repo ✅; skeleton **Expo + API Fastify** em monorepo;
  `infra/docker-compose.yml` rodando local (postgres + api + worker); **roles do banco** (owner de
  migration + `casa_app` **sem `BYPASSRLS`**); plugin **`withUser`**; 1ª migration com Drizzle +
  `down.sql` escrito à mão; `packages/contracts` com zod (ADR-0009); **`expo-updates` instalado e
  canal configurado, sem publicar OTA** (ADR-0007); **túnel do Expo pro device físico no WSL2**;
  `tokens.json` do Figma.
- **DoD:** `docker compose up` sobe o banco local; app builda e abre **no device físico**; migration
  inicial roda **up→down→up**; `casa_app` verificado sem `BYPASSRLS` no `pg_roles`; **guardas de
  camada do `casa-qa` ativas antes do primeiro endpoint** (scan de `fetch` no app, scan de pool cru no
  handler, teste de negação por identidade contra o Postgres do compose).
- **Depende de:** nada. Pode começar hoje.
- **Status (2026-08-28):** entregue, menos três itens que dependem de acesso externo — `tokens.json`
  (Figma), `eas init` (conta Expo) e a abertura no **device físico** (máquina do Bruno). O resto está
  de pé e verificável por `npm run verify`.
- **Onboarding:** — (infra).
- **Skills:** todo o núcleo + `casa-arquitetura`, `casa-infra-deploy`, `casa-migrations`,
  `casa-design-sync`.

> [!tip] Prototipar em paralelo
> A primeira tela a prototipar é o **criador da Fase 0** (decisão nº 9). É o portão de retenção do §2.3
> e é exatamente o que o Épico 1 entrega — o protótipo não esfria esperando virar código.

### Épico 0b — Produção

- **Meta:** a API acessível de fora, com os dados sobrevivendo a um acidente.
- **Entregáveis:** provedor de VPS escolhido (**ADR-0014**: a VPS do `improvisa-ai`); compose em
  produção (`infra/docker-compose.prod.yml` por cima do base); **entrada pelo nginx do `vps-edge` + TLS
  do certbot do host** em `casa.prumoz.com.br` (substitui o Caddy: as portas 80/443 da VPS já têm dono);
  migration como job de deploy (role owner, nunca o processo da API, e **antes** de trocar a API);
  `pg_dump` agendado; runbook de restore; deploy por push (workflow); CI mínimo (`npm run verify`
  antes do deploy); **provedor de envio de e-mail**,
  que destrava a verificação de e-mail gerada no Épico 1.
- **DoD:** API responde com TLS em `casa.prumoz.com.br`; Postgres e API **sem porta publicada** no host;
  **restore do backup executado com sucesso ao menos uma vez** (`infra/scripts/restore-teste.sh`);
  rate limit por pessoa atrás do proxy (`PROXY_CONFIAVEL`); nenhum segredo no repositório nem no bundle
  do app.
- **Backup offsite: fora do DoD por decisão (2026-10-26), como risco aceito.** O dump fica só na VPS;
  perder a VPS é perder os dados de todas as casas. Rever antes de abrir para fora do círculo de teste
  (ADR-0014).
- **Depende de:** 0a + decisão nº 5 — **fechada** pelo ADR-0014 em 2026-10-26.
- **Status (2026-10-27):** API no ar em `https://casa.prumoz.com.br/api/`.
  - Feito: TLS do certbot; nada do Casa publica porta; deploy pelo `infra/scripts/deploy-vps.sh`.
  - Backup: cron diário com o primeiro dump; restore provado pelo `restore-teste.sh` na VPS.
  - Rate limit: a API enxerga o IP real atrás do proxy (provado com `X-Forwarded-For` falso).
  - APK de preview apontando para produção.
  - Faltam:
    - **provedor de e-mail**;
    - **gate de `npm run verify` antes do deploy**;
    - **segredos do workflow** no GitHub (`VPS_HOST`, `VPS_SSH_KEY`, `VPS_KNOWN_HOSTS`). Sem eles, o deploy
      pela `main` falha; até lá, o deploy é à mão.
- **Prazo real:** antes do convite do **Épico 2** — é quando a segunda pessoa precisa alcançar a API.
- **Skills:** `casa-infra-deploy`, `casa-tech-writer` (runbook).

## Épico 1 — Identidade & Casa

- **Meta:** uma pessoa cria uma casa e cai numa casa já povoada, em menos de um minuto.
- **Entregáveis:** auth própria em `/api/auth` (e-mail + senha, Google); **par access curto + refresh
  rotativo** com detecção de reuso **e janela de graça**, refresh no `expo-secure-store` (**ADR-0008**);
  blocklist de `jti` em Postgres (ADR-0003); **role `casa_auth` + plugin `semIdentidade`** para as rotas
  que ainda não têm identidade (**ADR-0013**); **identidade = morador e escopo por `casa_atual()`**
  (**ADR-0012**); formulários com React Hook Form + zod compartilhado (ADR-0009); criar casa
  (nome + tipo); **template por tipo de casa** semeando `tarefas` mínimas; apelido + cor; no app,
  TanStack Query (ADR-0006) + interceptor `401 → refresh → retry` e sessão restaurada antes do splash
  sair; rate limit em `/api/auth/login`.
- **Fora do escopo, deliberadamente** (decidido em 2026-08-29 — todos dependem de acesso externo):
  - **Apple Sign In → Épico 6.** Exige conta Apple Developer paga e build iOS; não roda em Expo Go. A
    coluna `apple_sub` nasce no schema agora para não virar migration depois.
  - **Envio do e-mail de verificação → Épico 0b.** O token de 24 h é gerado e gravado no Épico 1; o
    transporte é log no console até existir provedor de e-mail (o domínio existe desde o ADR-0014).
  - **Ramo "tem convite" da Fase 0 → Épico 2.** Aceitar convite exige URL pública e deep link, que são
    0b + Épico 2. O Épico 1 entrega o **ramo do criador** ponta a ponta e só o *schema* do convite.
- **DoD:** signup → cria casa → **casa povoada pelo template**; RLS impede ver dados de outra casa
  **provada no banco com `SET ROLE casa_app`, não só pelo endpoint**; schema de frustração/aspiração
  nasce sem coluna de atribuição e sem coluna de sobrecarga por pessoa (ADR-0011); **refresh reusado
  revoga a família de tokens** e força login (teste, não intenção); **dois requests paralelos com o
  mesmo refresh não deslogam ninguém**; `casa_auth` sem `SELECT` em tabela de dado sensível;
  `npm run verify` verde.

### Quebra em stories

| # | Camada | Story | Critério de aceite |
|---|---|---|---|
| 1 | dados | `moradores` (credencial + casa), `casas`, `casa_atual()`, policies escopadas | `check:rls` nega leitura cruzada entre duas casas; `casa_atual()` sem `EXECUTE` para `PUBLIC` |
| 2 | dados | `sessoes` (família, `jti`, sucessor, consumido_em) e `revoked_tokens` | migration passa em `check:migration` (up → down → up) |
| 3 | infra | role `casa_auth` no initdb + `AUTH_DATABASE_URL` + boot assertion nos dois pools | `check:roles` reprova se `casa_auth` ganhar `SELECT` em dado sensível |
| 4 | backend | `semIdentidade` + rotas públicas (`register`, `login`, `refresh`) | `npm run guards` verde — nenhum handler toca o pool cru |
| 5 | backend | rotação, detecção de reuso e **janela de graça** | refresh consumido há > 30 s revoga a família; consumido há < 30 s devolve o par sucessor sem revogar |
| 6 | backend | criar casa + semear template por tipo | seed roda **antes** do `FORCE RLS` (armadilha do `infra/README.md`) |
| 7 | contracts | zod de auth, casa e morador | o mesmo schema valida o formulário e o payload no handler |
| 8 | client | Query + `lib/api` com `401 → refresh → retry` + SecureStore | token expirado renova e retenta **uma** vez; segundo 401 desloga |
| 9 | UI | Fase 0, ramo do criador (apelido → casa → povoada) | fluxo completo em < 1 min num device físico |

- **Depende de:** Épico 0a.
- **Onboarding que destrava:** **Fase 0**, ramo *cria a casa*. O ramo *tem convite* fecha no Épico 2.
- **Skills:** `casa-backend-dev`, `casa-migrations`, `casa-seguranca-privacidade`, `casa-mobile-dev`,
  `casa-dominio-cooperacao` (valida "sem atribuição" já no modelo).

> [!note] Tabelas sensíveis vazias
> O manifesto §2.2 pede modelar frustração/aspiração/pulso já aqui. Decisão do tech lead: **não criar
> tabela que ninguém escreve** — tabela fantasma envelhece errado. O invariante ("nenhuma tabela
> sensível nasce com coluna de atribuição") vale como critério de revisão e teste do `casa-qa`; o DDL
> nasce no Épico 4, junto com quem escreve nele.


## Épico 2 — Tarefas & Divisão

- **Meta:** o loop central funciona — duas pessoas dividem e concluem tarefas.
- **Entregáveis:** aba **Tarefas** (Todas / Minhas / Livres); concluir tarefa; **pontos por peso de
  esforço**; **3 modos** (Rodízio / Fixo / Aberta); **rodízio + pontos-bônus** na tarefa detestada,
  com marcação manual por enquanto (**ADR-0010**; a detecção automática vem do Épico 4); FAB pra
  adicionar; **convite** (WhatsApp / QR / código curto, "sem labirinto") **e o ramo *tem convite* da
  Fase 0** — abrir o convite, ver a casa e quem já entrou, escolher apelido + cor e entrar (herdado do
  Épico 1 em 2026-08-29: aceitar convite exige URL pública, que só existe depois do 0b).
- **Pré-requisito de infra:** o convite por **link/QR** exige URL pública → **o Épico 0b precisa estar
  fechado aqui**.

> [!note] Convite por código curto antecipado (2026-09-06)
> A fatia **código curto digitado à mão** foi entregue junto do Épico 1, fora de ordem e de propósito:
> ela é a única parte do convite que **não** depende de URL pública nem de deep link, e sem ela o app
> testável do Épico 1 só serve para uma pessoa — duas contas caem em duas casas diferentes.
> Entregue: `POST /api/convites`, `POST /api/casas/entrar`, `entra_na_casa()` (migration 0005) e o
> ramo *tem convite* da Fase 0. **Continua no Épico 2:** link, QR, e cancelar convite.
- **DoD:** dois moradores na casa; atribuir/concluir; pontos acumulam; convite entrega a pessoa dentro
  da casa vendo quem já entrou; **os pontos-bônus não aparecem em nenhuma comparação entre moradores**
  — sem tela, sem endpoint, sem query que ordene pessoas por pontos (ADR-0010).
- **Depende de:** Épico 1.
- **Onboarding que destrava:** **Fase 1** (convidar um morador → concluir 1 tarefa).
- **Skills:** `casa-dominio-tarefas` (máquina de estados, rotação, pontos), `casa-mobile-dev`,
  `casa-backend-dev`, `casa-tech-lead`.

### Decisões de escopo (tech lead, 2026-09-06)

Tomadas para a quebra abaixo caber no menor desenho que cumpre a regra. Cada uma corta uma
alternativa maior de propósito:

1. **Conclusão é evento, não estado terminal da tarefa.** Nasce a tabela `conclusoes`
   (append-only); `tarefas` não ganha coluna `concluida_em`. Tarefa doméstica é recorrente por
   natureza — a louça de hoje não "termina" a louça. Máquina de estados com pendente→concluída
   exigiria reabertura agendada, e **frequência é Épico 4**. Preço: "o que falta hoje" não existe
   ainda; a aba lista tarefas, não pendências do dia.
2. **Peso de esforço é enum de 3 (`leve` / `medio` / `pesado`) → 1 / 2 / 3 pontos**, calculado no
   servidor. Número livre digitado pelo morador vira negociação de placar entre duas pessoas, que é
   o atrito que o produto existe para remover.
3. **Bônus é `bonus_detestada boolean` na tarefa** → +2 pontos fixos para quem está da vez. Atributo
   da tarefa, nunca da pessoa (ADR-0010). Só tem efeito em modo Rodízio: bônus em Fixo é aumento
   permanente para o dono, e em Aberta é corrida por pontos.
4. **Rotação sai da ordem estável de `moradores.criado_em`**, sem tabela de ordem. O "próximo" é o
   morador seguinte ao responsável atual, circular. Ordem configurável é feature que ninguém pediu.
5. **Concluir não é `SECURITY DEFINER`.** `cria_casa()` e `entra_na_casa()` existem porque o
   privilégio bruto (`UPDATE moradores.casa_id`) abriria entrada em casa alheia — nenhuma policy
   sobre a linha distingue "a casa que criei" de "uma casa qualquer". Aqui não: `UPDATE` em tarefa
   com `casa_id = casa_atual()` é exatamente o que a policy sabe decidir. Função a mais é raio a
   mais para revisar.
6. **A navegação vira abas.** Hoje o app é um fluxo linear que termina em `casa.tsx`; a aba Tarefas
   não cabe nele sem `expo-router` em tabs. `casa.tsx` perde a lista de tarefas e vira a aba Casa
   (o conteúdo real dela é o Épico 3).

### Quebra em stories

| # | Camada | Story | Critério de aceite |
|---|---|---|---|
| 1 | dados | `0006`: `tarefas` ganha `peso`, `modo`, `responsavel_id`, `bonus_detestada`; policies de `UPDATE`/`DELETE` escopadas por `casa_atual()`; GRANT correspondente | `check:migration` up→down→up; `check:rls` prova que morador de outra casa não altera nem apaga tarefa **no banco**, com `SET ROLE casa_app` |
| 2 | dados | `0007`: `conclusoes` (`tarefa_id`, `casa_id`, `morador_id`, `pontos`, `concluida_em`), append-only | `casa_app` tem só `SELECT`/`INSERT` — `UPDATE`/`DELETE` falham por privilégio, não por handler; leitura cruzada entre casas negada |
| 3 | contracts | zod de tarefa completa, criar/editar tarefa, conclusão e `pontos` (sua parte + total da casa) | o mesmo schema valida o formulário e o payload no handler; **nenhum schema tem campo de pontos de terceiro** |
| 4 | backend | CRUD de tarefa: `POST`/`PATCH`/`DELETE /api/tarefas` | atribuir responsável de outra casa é recusado **pela policy**, não por `if` no handler; `npm run guards` verde |
| 5 | backend | `GET /api/tarefas` com `responsavelId` (o app resolve apelido/cor pela lista de moradores já em cache — story 3) | devolve modo, peso, responsável e bônus de toda tarefa da casa; nenhuma resposta carrega contador por morador |
| 6 | backend | concluir: `POST /api/tarefas/:id/conclusoes` — pontos no servidor + rodízio avança na mesma transação | Rodízio com 3 moradores: concluir passa a vez ao próximo, circular; Fixo e Aberta não mexem no responsável; `pontos` enviado pelo cliente é ignorado |
| 7 | backend | `GET /api/casa/pontos`: "sua parte" + total da casa | a resposta **não contém** pontos de outro morador; teste quebra se alguém adicionar breakdown por pessoa |
| 8 | qa | guarda anti-ranking (ADR-0010) | `npm run guards` reprova query que ordene moradores por pontos e endpoint que devolva pontos alheios — a guarda entra **junto com a feature**, não em review depois |
| 9 | client | `lib/api/tarefas.ts` + chaves de cache e invalidação | concluir invalida tarefas **e** pontos; o `401 → refresh → retry` continua valendo nas rotas novas |
| 10 | UI | navegação em abas + aba Tarefas (Todas / Minhas / Livres) com concluir | Livres = só modo Aberta; Minhas = só as da pessoa; concluir reflete na lista sem recarregar a tela |
| 11 | UI | FAB de adicionar + tela de tarefa (título, peso, modo, responsável, marcar detestada) | criar / editar / apagar num device físico; marcar detestada fora do Rodízio não oferece bônus |
| 12 | UI | Fase 1 do onboarding: convidar → concluir 1 tarefa | dois moradores na casa, uma conclusão, pontos somam em "sua parte" e no total — e em nenhum lugar mais |
| 13 | 🚧 0b | convite por **link** + **QR** + cancelar convite | **bloqueado**: exige URL pública e deep link (Épico 0b). Deep link abre a Fase 0 no ramo *tem convite*; cancelar invalida o código |

> [!note] Ordem de execução
> 1→2 antes de tudo (a UI não vem antes da camada de dados). A story 8 é a única que pode rodar em
> paralelo com 4–7 e **deve** ficar pronta antes da 10 — a guarda precisa existir antes de a tela
> ter onde exibir um pódio acidental. A 13 fica parada até o 0b fechar.

- **Status (2026-10-26):** stories 1–12 entregues; a 13 segue bloqueada pelo 0b. Decisões tomadas
  na implementação, que a tabela acima não fixava:
  - **qualquer morador conclui qualquer tarefa**, e os pontos — bônus incluído — vão para quem fez;
    cobrir o par é comportamento desejado, não exceção;
  - **a vez do rodízio anda a partir do responsável**, não de quem concluiu: cobrir o par não muda
    de quem é a próxima. Ninguém da vez recomeça do primeiro morador;
  - `GET /api/casa` ganhou **`euId`**: o filtro Minhas precisa saber quem é você, e os tokens são
    opacos para o app;
  - concluir pede **confirmação** no app, porque conclusão não se desfaz (append-only, 0007);
  - a **Fase 1** é um cartão derivado do estado (moradores ≥ 2, sua parte > 0), sem persistência.

## Épico 3 — Cooperativo

- **Meta:** o coletivo ganha vida, sem competição.
- **Entregáveis:** **Início** com anel **Energia da Casa** (realtime via `LISTEN/NOTIFY` + WebSocket,
  payload agregado — ADR-0004); aba **Casa** com nível,
  **ofensiva/streak**, **meta semanal coletiva** + **recompensa compartilhada**, contribuições
  não-competitivas, "**sua parte**".
- **DoD:** a meta coletiva enche com a contribuição de todos; a recompensa destrava; nível/streak
  atualizam; **nenhum ranking por pessoa** em lugar nenhum; o WebSocket **invalida cache** e o app
  reidrata ao reconectar (`NOTIFY` não persiste).
- **Depende de:** Épico 2.
- **Onboarding que destrava:** entrada da **Fase 2** (Início).
- **Skills:** `casa-dominio-cooperacao` (invariante de não-ranking, lógica da meta e do streak),
  `casa-realtime`, `casa-mobile-dev`.

## Épico 4 — Objetivos & dados sensíveis anonimizados

- **Meta:** capturar preferências e conforto **sem quebrar a confiança**.
- **Entregáveis:** aba **Objetivos** (poupança R$ + checklist; só aspirações "pra casa" viram
  objetivo); captura de tarefa que curte/detesta; **como dividir + frequências**; **incômodos →
  peso agregado sem atribuição**; **pulso semanal → termômetro anônimo, só humor** (ADR-0011);
  **sobrecarga inferida** do peso de tarefas concluídas vs. distribuição, sem coluna sensível nova;
  detecção automática de tarefa universalmente detestada, ligando o bônus do ADR-0010.
- **DoD:** frustração influencia a distribuição com **zero atribuição**; aspiração "pra mim" nunca
  aparece pra outros; pulso é anônimo e agregado, **e o agregado só é exibido acima do piso mínimo de
  respostas** — numa casa que não atinge o piso, a pergunta não é feita (ADR-0011).
- **Depende de:** Épicos 2–3.
- **Onboarding que destrava:** cauda da **Fase 2** (aspirações → meta+recompensa → incômodos+pulso).
- **Skills:** `casa-dominio-cooperacao`, `casa-seguranca-privacidade` (RLS + privacidade),
  `casa-backend-dev`.

## Épico 5 — Notificações & nudges progressivos

- **Meta:** avisar sem virar spam nem cobrança.
- **Entregáveis:** worker de cron no compose (substitui as Edge Functions); notificação **pessoal**
  ("é a sua vez"), **parcimoniosa**, com **horário de silêncio**, **aviso de vez com antecedência**
  (rotação), **tom cooperativo**; motor de **nudges contextuais D0–D7** que aciona os passos da
  Fase 2.
- **DoD:** notificações respeitam silêncio e são raras + pessoais; os nudges da Fase 2 disparam no
  cronograma certo; **jobs idempotentes** — o worker reexecuta e não duplica.
- **Depende de:** Épicos 2–4.
- **Onboarding que destrava:** entrega o motor por trás de toda a **Fase 2**.
- **Skills:** `casa-realtime` (realtime, jobs/cron do worker), `casa-mobile-dev`, `casa-product-owner`
  (regras de cadência).

## Épico 6 — Polimento, mobile & pré-lançamento

- **Meta:** um beta que você e sua esposa usam de verdade (dogfooding).
- **Entregáveis:** acessibilidade, estados vazios, offline, performance; build **EAS** p/ lojas;
  revisar o **runbook de operação da VPS** do 0b (restore, rotação de segredo, update de imagem);
  **ligar a publicação OTA** que ficou instalada e adormecida desde o 0a (ADR-0007); decidir **E2E**
  (Maestro × Detox); *(opcional)* analytics (PostHog); **decisão de modelo de negócio**;
  **política LGPD + termos**; **Sign in with Apple** (herdado do Épico 1 — exige conta Apple Developer
  paga e build iOS; a App Store passa a exigi-lo porque o app oferece Google).
- **DoD:** beta instalável e usável pelos dois; gaps sinalizáveis do manifesto endereçados ou
  agendados.
- **Depende de:** todos.
- **Skills:** `casa-qa`, `casa-tech-writer` (LGPD/termos), `casa-infra-deploy`, `casa-product-owner` *(`casa-analytics` só se PostHog entrar)*.

---

## Mapa: onboarding → épico

| Fase de onboarding | Entregue em |
|---|---|
| Fase 0, ramo *cria a casa* | Épico 1 |
| Fase 0, ramo *tem convite* | Épico 2 (precisa de URL pública) |
| Fase 1 (convidar + concluir 1 tarefa) | Épico 2 |
| Fase 2 (setup progressivo D0–D7) | Épicos 3–4 (telas) + Épico 5 (motor de nudges) |
| Convite sem fricção | Épico 2 |
| Notificação inteligente | Épico 5 |

---

## Runbook de kickoff do harness-architect (o passo 0 de verdade)

1. **Confirme o stack** (§3 do manifesto). É o que decide se o harness sai completo ou fino.
   Se trocar Expo/Postgres-próprio por outra coisa, avise o agente — as skills condicionais mudam.
   *(Feito: stack confirmado; ADR-0001 trocou Supabase por Postgres em container + API Fastify, e o
   harness foi realinhado.)*
2. **Coloque o manifesto** onde o agente vai lê-lo (na raiz do repo do Casa, ou passe o caminho).
3. **Invoque a skill deliberadamente.** Ela tem `disable-model-invocation: true`, então **não
   auto-dispara** — você a chama, passando o caminho do manifesto como argumento e o diretório-alvo.
   Sintaxe exata do `/skill` no seu setup: `<PREENCHER — confirmar>`. Forma esperada, algo como:
   `harness-architect  casa-manifesto-projeto.md  --alvo ./casa/.claude/skills/`
4. **O agente roda 4 fases:** Intake → Perfilar → **Propor + confirmar** → Scaffold. Na 3ª ele
   **para e mostra o catálogo** (tabela). **Revise contra o §10 do manifesto** (âncora de ~18 skills)
   e aprove/ajuste. Nada é escrito antes disso.
5. **Saída:** `casa-*/SKILL.md` + templates em `casa-prd-tasks` + `harness-report.md` (catálogo final
   + gaps + próximos passos).
6. **Depois do harness:** siga do **Épico 0a** (fundação local) em diante, deixando cada skill
   dirigir seu épico.

---

## Riscos & decisões que destravam

- ~~**Stack não confirmado**~~ → resolvido pelos ADR-0001 a ADR-0006.
- ~~**Rodízio + bônus**~~ → ADR-0010. ~~**Escopo do pulso**~~ → ADR-0011. ~~**OTA**~~ → ADR-0007.
  ~~**Formulários**~~ → ADR-0009. ~~**Refresh token**~~ → ADR-0008 (antecipado pro Épico 1).
- **Anonimização deixada pra UI — ou agora pro handler** → vaza atribuição. Com API no meio, o risco
  mudou de forma: conectar como superuser e checar em TypeScript anula a RLS sem quebrar teste
  nenhum. *Destrava:* roles + plugin `withUser` no Épico 0a, policies no Épico 1, guarda de camada e
  teste de negação por identidade **antes do primeiro endpoint** (ADR-0002).
- **Bônus virando ranking pela porta dos fundos** → o ADR-0010 introduz pontos extras por pessoa, que
  é a matéria-prima de um pódio. *Destrava:* a guarda entra como teste no Épico 2, junto com a feature
  — não em review depois.
- **Operação da VPS sem backup restaurável** → perda total dos dados da casa. *Destrava:* restore
  testado como DoD do **Épico 0b**, que precisa fechar antes do convite do Épico 2.
- **Provedor de VPS e backup offsite** (decisão nº 5) → fechada pelo ADR-0014 (2026-10-26): VPS do
  `improvisa-ai`, backup **só local** como risco aceito — perder a VPS é perder tudo. Rever antes de abrir
  o app para fora do círculo de teste.
  *Destrava:* bucket + usuário IAM na conta AWS que o improvisa já usa para o dump dele.
- **Divergência local × produção** → é o preço do corte 0a/0b: bug de deploy só aparece no 0b.
  *Destrava:* o mesmo `docker-compose.yml` nos dois ambientes; produção só sobrepõe o
  `docker-compose.prod.yml` (portas, rede `edge`, migration, limites).
- **Modelo de negócio** (nº 8) e **LGPD/termos** (nº 10) seguem abertos → Épico 6.

---

## Expectativa de sinal (calibração de PO)

O diferencial do Casa é a **combinação** das cinco features (§1 do manifesto), e ela só fecha no
**Épico 5**. Épicos 1–4 validam usabilidade e fluxo; nenhum deles testa a tese de mercado. Vale saber
antes de ler sinal fraco cedo demais como fracasso do produto.
