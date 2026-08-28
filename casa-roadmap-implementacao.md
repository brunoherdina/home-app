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
   "top morador" em qualquer camada, é bug de arquitetura.
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

## Épico 0 — Bootstrap do harness + fundação

- **Meta:** ter o harness de skills e o esqueleto do projeto de pé.
- **Entregáveis:** rodar o `harness-architect` (→ skills `casa-*` + `harness-report.md`) ✅; criar
  repo ✅; skeleton **Expo + API Fastify**; `infra/docker-compose.yml` (postgres + api + worker +
  caddy); roles do banco (owner de migration + `casa_app` **sem `BYPASSRLS`**); plugin `withUser`;
  1ª migration com Drizzle; `pg_dump` agendado **com restore testado**; `tokens.json` do Figma;
  CI mínimo.
- **DoD:** app builda e abre; API responde com TLS pelo Caddy; migration inicial versionada e
  reversível (up→down→up); **restore do backup executado ao menos uma vez**; Postgres **sem porta
  publicada** no host; skills scaffoldadas e revisadas.
- **Depende de:** stack confirmado ✅ (ADR-0001) e provedor de VPS escolhido.
- **Onboarding:** — (infra).
- **Skills:** todo o núcleo + `casa-arquitetura`, `casa-infra-deploy`, `casa-migrations`,
  `casa-design-sync`.

## Épico 1 — Identidade & Casa

- **Meta:** uma pessoa cria ou entra numa casa e cai numa casa já povoada.
- **Entregáveis:** auth própria em `/api/auth` (apelido/e-mail + senha, Google, **Apple** — exigida
  pela App Store quando há outro social no iOS), token no `expo-secure-store`, blocklist de `jti` em
  Postgres (ADR-0003); criar casa (nome + tipo); **template por tipo de casa** (semear tarefas de
  casal/república/família); apelido + cor pro convidado; **fundação de RLS** (tudo escopado por casa;
  modelar já as tabelas de dados sensíveis sem coluna de atribuição).
- **DoD:** signup → cria/entra na casa → vê casa povoada; RLS impede ver dados de outra casa **provada
  no banco com `SET ROLE casa_app`, não só pelo endpoint**; schema de frustração/aspiração já anônimo
  por design.
- **Depende de:** Épico 0.
- **Onboarding que destrava:** **Fase 0** (ambos os ramos: cria a casa / tem convite).
- **Skills:** `casa-backend-dev`, `casa-migrations`, `casa-seguranca-privacidade`, `casa-mobile-dev`,
  `casa-dominio-cooperacao` (valida "sem atribuição" já no modelo).

## Épico 2 — Tarefas & Divisão

- **Meta:** o loop central funciona — duas pessoas dividem e concluem tarefas.
- **Entregáveis:** aba **Tarefas** (Todas / Minhas / Livres); concluir tarefa; **pontos por peso de
  esforço**; **3 modos** (Rodízio / Fixo / Aberta); FAB pra adicionar; **convite** (WhatsApp / QR /
  código curto, "sem labirinto").
- **DoD:** dois moradores na casa; atribuir/concluir; pontos acumulam; convite entrega a pessoa dentro
  da casa vendo quem já entrou.
- **Depende de:** Épico 1.
- **Onboarding que destrava:** **Fase 1** (convidar um morador → concluir 1 tarefa).
- **Skills:** `casa-dominio-tarefas` (máquina de estados, rotação, pontos), `casa-mobile-dev`,
  `casa-backend-dev`, `casa-tech-lead`.

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
  peso agregado sem atribuição**; **pulso semanal → termômetro anônimo**.
- **DoD:** frustração influencia a distribuição com **zero atribuição**; aspiração "pra mim" nunca
  aparece pra outros; pulso é anônimo e agregado.
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
  **runbook de operação da VPS** (restore, rotação de segredo, update de imagem); decidir **refresh
  token** (ADR-0003, delta 3); *(opcional)* analytics (PostHog); **decisão de modelo de negócio**;
  **política LGPD + termos**.
- **DoD:** beta instalável e usável pelos dois; gaps sinalizáveis do manifesto endereçados ou
  agendados.
- **Depende de:** todos.
- **Skills:** `casa-qa`, `casa-tech-writer` (LGPD/termos), `casa-infra-deploy`, `casa-product-owner` *(`casa-analytics` só se PostHog entrar)*.

---

## Mapa: onboarding → épico

| Fase de onboarding | Entregue em |
|---|---|
| Fase 0 (criar/entrar, casa povoada) | Épico 1 |
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
6. **Depois do harness:** siga do Épico 0 (fundação) em diante, deixando cada skill dirigir seu épico.

---

## Riscos & decisões que destravam

- ~~**Stack não confirmado**~~ → resolvido pelos ADR-0001 a ADR-0006.
- **Anonimização deixada pra UI — ou agora pro handler** → vaza atribuição. Com API no meio, o risco
  mudou de forma: conectar como superuser e checar em TypeScript anula a RLS sem quebrar teste
  nenhum. *Destrava:* roles + plugin `withUser` no Épico 0, policies no Épico 1, guarda de camada e
  teste de negação por identidade desde o começo (ADR-0002).
- **Operação da VPS sem backup restaurável** → perda total de dados da casa. *Destrava:* restore
  testado como DoD do Épico 0.
- **Rodízio + bônus (tarefa detestada)** ainda "a confirmar" → afeta `casa-dominio-tarefas`.
  *Destrava:* fechar a decisão nº 2 antes do Épico 2.
- **Escopo do pulso** (só humor vs. sobrecarga) → afeta Épico 4 e a skill de cooperação.
  *Destrava:* fechar a decisão nº 1 antes do Épico 4.
- **Sem CI/VPS** → Épico 0 não fecha. *Destrava:* escolher provedor + subir o compose. (Repo ✅.)
