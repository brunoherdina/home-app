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
- **Onboarding:** — (infra).
- **Skills:** todo o núcleo + `casa-arquitetura`, `casa-infra-deploy`, `casa-migrations`,
  `casa-design-sync`.

> [!tip] Prototipar em paralelo
> A primeira tela a prototipar é o **criador da Fase 0** (decisão nº 9). É o portão de retenção do §2.3
> e é exatamente o que o Épico 1 entrega — o protótipo não esfria esperando virar código.

### Épico 0b — Produção

- **Meta:** a API acessível de fora, com os dados sobrevivendo a um acidente.
- **Entregáveis:** provedor de VPS escolhido; compose em produção; **Caddy + TLS**; migration como job
  de deploy (role owner, nunca o processo da API); `pg_dump` agendado com **destino offsite**; runbook
  de restore; CI mínimo.
- **DoD:** API responde com TLS por domínio próprio; Postgres **sem porta publicada** no host;
  **restore do backup executado com sucesso ao menos uma vez**; nenhum segredo no repositório nem no
  bundle do app.
- **Depende de:** 0a + **decisão nº 5** (provedor + backup offsite).
- **Prazo real:** antes do convite do **Épico 2** — é quando a segunda pessoa precisa alcançar a API.
- **Skills:** `casa-infra-deploy`, `casa-tech-writer` (runbook).

## Épico 1 — Identidade & Casa

- **Meta:** uma pessoa cria ou entra numa casa e cai numa casa já povoada.
- **Entregáveis:** auth própria em `/api/auth` (apelido/e-mail + senha, Google, **Apple** — exigida
  pela App Store quando há outro social no iOS); **par access curto + refresh rotativo** com detecção
  de reuso, refresh no `expo-secure-store` (**ADR-0008** — antecipado do Épico 6); blocklist de `jti`
  em Postgres (ADR-0003); formulários com React Hook Form + zod compartilhado (ADR-0009); criar casa
  (nome + tipo); **template por tipo de casa** (semear tarefas de casal/república/família); apelido +
  cor pro convidado; **fundação de RLS** (tudo escopado por casa; modelar já as tabelas de dados
  sensíveis sem coluna de atribuição, e **sem coluna de sobrecarga por pessoa** — ADR-0011).
- **DoD:** signup → cria/entra na casa → vê casa povoada; RLS impede ver dados de outra casa **provada
  no banco com `SET ROLE casa_app`, não só pelo endpoint**; schema de frustração/aspiração já anônimo
  por design; **refresh reusado revoga a família de tokens** e força login (teste, não intenção).
- **Depende de:** Épico 0a.
- **Onboarding que destrava:** **Fase 0** (ambos os ramos: cria a casa / tem convite).
- **Skills:** `casa-backend-dev`, `casa-migrations`, `casa-seguranca-privacidade`, `casa-mobile-dev`,
  `casa-dominio-cooperacao` (valida "sem atribuição" já no modelo).

## Épico 2 — Tarefas & Divisão

- **Meta:** o loop central funciona — duas pessoas dividem e concluem tarefas.
- **Entregáveis:** aba **Tarefas** (Todas / Minhas / Livres); concluir tarefa; **pontos por peso de
  esforço**; **3 modos** (Rodízio / Fixo / Aberta); **rodízio + pontos-bônus** na tarefa detestada,
  com marcação manual por enquanto (**ADR-0010**; a detecção automática vem do Épico 4); FAB pra
  adicionar; **convite** (WhatsApp / QR / código curto, "sem labirinto").
- **Pré-requisito de infra:** o convite exige URL pública → **o Épico 0b precisa estar fechado aqui**.
- **DoD:** dois moradores na casa; atribuir/concluir; pontos acumulam; convite entrega a pessoa dentro
  da casa vendo quem já entrou; **os pontos-bônus não aparecem em nenhuma comparação entre moradores**
  — sem tela, sem endpoint, sem query que ordene pessoas por pontos (ADR-0010).
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
- **Provedor de VPS e backup offsite** (decisão nº 5) → deixou de bloquear o começo, mas trava o 0b.
  *Destrava:* decidir durante o Épico 1, com folga.
- **Divergência local × produção** → é o preço do corte 0a/0b: bug de deploy só aparece no 0b.
  *Destrava:* o mesmo `docker-compose.yml` nos dois ambientes, mudando só env e o serviço `caddy`.
- **Modelo de negócio** (nº 8) e **LGPD/termos** (nº 10) seguem abertos → Épico 6.

---

## Expectativa de sinal (calibração de PO)

O diferencial do Casa é a **combinação** das cinco features (§1 do manifesto), e ela só fecha no
**Épico 5**. Épicos 1–4 validam usabilidade e fluxo; nenhum deles testa a tese de mercado. Vale saber
antes de ler sinal fraco cedo demais como fracasso do produto.
