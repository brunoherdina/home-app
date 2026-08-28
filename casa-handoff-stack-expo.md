---
title: "Casa — Handoff de Stack (Expo + React Native)"
tipo: handoff
projeto: Casa
status: confirmado
stack: expo-react-native-postgres-self-hosted
data: 2026-08-24
revisao: 2026-08-28 — ADR-0001 removeu o Supabase; §3, §6, §7, §9 e §11 reescritas para API própria + Postgres em container
tags:
  - casa
  - handoff
  - stack
  - expo
  - react-native
relacionados:
  - "[[casa-manifesto-projeto]]"
  - "[[casa-roadmap-implementacao]]"
  - "[[casa-decisoes-produto]]"
  - "[[casa-decisoes-produto#ADR-0001]]"
---

# Casa — Handoff de Stack

> [!note] Origem desta revisão
> A versão anterior deste documento marcava a camada base inteira como "confirmada" a partir do `rimaai`, sem ter conseguido ler o repositório. **O repositório foi inspecionado.** Duas linhas que estavam como confirmadas eram presunção — Expo Router e Reanimated **não existem no `rimaai`**.
>
> A §2 agora está dividida em **herdado (verificado no código)** × **novo no Casa (sem precedente interno)**. A distinção importa: o que é herdado já tem armadilha mapeada e custo pago; o que é novo é risco que o Casa assume primeiro.
>
> As perguntas 1–4 da antiga §8 estão respondidas. O que sobra em aberto está na §11.

> [!danger] Revisão de 2026-08-28 — o backend mudou
> **O Supabase saiu.** O Casa roda **Postgres em container** com **API Fastify própria**, deploy em
> **VPS** via Docker Compose. Decisão e consequências completas em `casa-decisoes-produto.md`
> (ADR-0001 a ADR-0006).
>
> A arquitetura passou de **2 camadas** (app → Postgres, RLS decide) para **3 camadas**
> (app → API → Postgres). A RLS **continua** sendo a camada de enforcement — ver §7 e o **ADR-0002**.

---

## 1. Contexto do produto

**Casa** é um app de gestão doméstica cooperativa para casais, colegas de apartamento e famílias. Princípio-guia: manter a casa organizada **sem sobrecarregar ninguém**.

### Invariantes arquiteturais — não negociáveis

> [!danger] Estes dois pontos vetam qualquer implementação que os viole
> 1. **Cooperação sobre competição.** Nenhum ranking é exposto em nenhuma camada — nem no banco, nem na API, nem na UI. Rankings competitivos foram descartados explicitamente na fase de produto.
> 2. **Anonimização na camada de dados.** Dados sensíveis (frustrações, pulso de satisfação, aspirações pessoais) são anonimizados **via RLS no Postgres**, nunca via condicional de UI. Se a query devolve o dado nominal e a tela esconde, está errado.

### Arquitetura de 4 abas

| Aba | Conteúdo |
|---|---|
| **Início** | Anel coletivo "Energia da Casa" |
| **Tarefas** | Filtros: Todas / Minhas / Livres |
| **Objetivos** | Poupança + checklists |
| **Casa** | Nível da casa, meta semanal compartilhada, contribuição individual não-competitiva |

Mobile-first, bottom tab + FAB.

---

## 2. Stack — herdado do `rimaai` (verificado no código)

Tudo nesta seção foi lido do `package.json`, do `app.config.ts`, do `eas.json` e do `src/` do `rimaai`. É reuso com precedente: já roda, e a armadilha já foi paga uma vez.

| Camada | Escolha | Versão no `rimaai` |
|---|---|---|
| Framework | Expo SDK | **57** (`expo ~57.0.14`) |
| Runtime | React Native | **0.86.2** |
| React | React | **19.2.3** |
| Linguagem | TypeScript `strict` | **6.0.3** |
| Arquitetura | New Architecture (JSI + Fabric + TurboModules) | padrão, não-opcional |
| Motor JS | Hermes v1 | padrão |
| Vetor / ícones | `react-native-svg` 15.15.4 + `lucide-react-native` | — |
| Bordas do sistema | `react-native-safe-area-context` ~5.7.0 | um único módulo fala de inset |
| Fontes | `expo-font` + pacotes `@expo-google-fonts/*` | não arquivo solto no repo |
| Persistência local | AsyncStorage **atrás de interface** | `carregar` / `salvar` / `limpar`, nada mais |
| Estado | `useReducer` puro, **sem lib** | reducer proibido de tocar `Date`, `Math.random` e storage |
| Styling | `StyleSheet` + tokens, **sem NativeWind** | cor literal fora do tema é erro de ESLint |
| Testes | Jest (`jest-expo` ~57.0.4) + RNTL **14** | ver §8 |
| Lint / format | `eslint-config-expo` (flat) + Prettier | — |
| Build | EAS Build, dev client desde o dia 1 | ver §9 |

### Notas de versão que importam agora

> [!caution] Regressão de memória — Reanimated
> O SDK 56 introduziu uma regressão do Hermes V1 que aumentava drasticamente o uso de memória em apps que importam `react-native-worklets` ou `react-native-reanimated`. Foi **resolvida no `expo@57.0.9`**. Como o Casa depende de Reanimated para o anel de Energia, **fixar `expo >= 57.0.9`** desde o primeiro commit. Não iniciar em SDK 56.
>
> **Ressalva:** o `rimaai` não usa Reanimated. Este aviso vem do changelog, não de dor vivida aqui — ver §3.

Contexto de cadência: cada release do Expo mira uma única versão do React Native, e o time do Expo mantém um membro no time de releases do RN — então o acompanhamento é rápido, mas upgrades de SDK devem sempre passar pelo changelog antes.

### O que de fato transfere do `rimaai`

Não é o código de UI — o design system dele é acoplado à marca dele e **não é compartilhável**. O que transfere:

- **Perfis do `eas.json`** (`development` / `development-device` / `preview` / `production`, `appVersionSource: remote`) — copiam quase inteiros.
- **A regra de lint de cor literal.** Token tipado ajuda na fronteira de prop, mas `StyleSheet` aceita qualquer string. Sem a regra, o primeiro `#9B6CFF` copiado de um mock entra e não sai mais.
- **A guarda de camada por leitura de fonte.** Um teste que varre `src/`, lê o texto dos arquivos e reprova import proibido. É o que impede um autoimport da IDE de furar a fronteira de storage em silêncio.
- **As armadilhas de RNTL 14** (§8) e de config dinâmica (§9).
- **Aprendizado operacional de EAS** — o que quebra no builder e por quê.

---

## 3. Stack — novo no Casa (sem precedente interno)

Estas escolhas continuam certas para o Casa. O que muda em relação à versão anterior do handoff: **elas não vêm do `rimaai`**. São decisões originais, e o Casa é quem paga o custo de descobri-las.

| Camada | Escolha | Por que no Casa | Risco assumido |
|---|---|---|---|
| Navegação | **Expo Router** (file-based) | 4 abas + FAB + fluxo de onboarding em fases. O `rimaai` é tela única com máquina de estado — não tem router nenhum. | Toda a §6 é desenho novo. Nenhum padrão de rota validado internamente. |
| Animação | `react-native-reanimated` 4.x + `react-native-gesture-handler` | Anel de Energia a 60–120 FPS com a JS thread ocupada | O `rimaai` não importa nenhum dos dois. A regressão de memória do §2 nunca foi exercitada aqui. |
| Banco | **Postgres em container** (+ RLS) | Invariante arquitetural (§1, §7) | O `rimaai` é Next.js API-only na Vercel + DeepSeek. Nenhum padrão de sync para copiar. |
| API | **Fastify + TypeScript** | Sem PostgREST o app não alcança o banco. A API injeta identidade por request e a RLS decide (ADR-0002). | Desenho original. Nem o `rimaai` nem o `improvisa-ai` (que é Python/FastAPI) dão precedente em Node. |
| Auth | **JWT próprio** — padrão do `improvisa-ai` | Apelido/e-mail + senha, Google, Apple. Token no `expo-secure-store`, sempre `Bearer`. | O `improvisa-ai` é **Python** e **web**: herda-se o desenho, reescreve-se em TS. Cookie httpOnly não porta pra RN (ADR-0003). |
| Realtime | **`LISTEN/NOTIFY` + WebSocket** no Fastify | Anel de Energia e meta coletiva ao vivo, payload sempre agregado | `NOTIFY` não persiste e tem teto de 8 KB: o WS é invalidação de cache, não fonte da verdade (ADR-0004). |
| Jobs / cron | **worker Node** no mesmo deploy | Quiet hours, aviso de vez, agregação de incômodos | Sem precedente. Idempotência é requisito — cron reexecuta. |
| Infra | **Docker Compose em VPS + Caddy** | Sem lock-in, custo fixo | **Backup, TLS, restore e monitoramento viram seus.** Backup sem restore testado não é backup. |
| Notificações | `expo-notifications` | "É a sua vez", quiet hours | Sem precedente. Agendar quiet hours **no servidor**, não filtrar no cliente. |
| Biometria / câmera | pacotes do Expo SDK | Login e avatar | Sem precedente. |

> [!tip] Regra de precedência
> Onde a stack de um repo vizinho **conflitar** com uma decisão registrada em `casa-decisoes-produto.md`, vence a decisão do Casa. Reuso é conveniência; os invariantes são requisito. Dois casos concretos: o backend do `rimaai` (Vercel/DeepSeek) não se aplica — prevalece o Postgres próprio; e o auth do `improvisa-ai` é Python/web — herda-se o **desenho**, não o código, com os deltas do ADR-0003.

---

## 4. Stack — camadas ainda em aberto

| Camada | Status | Precedente no `rimaai` | Observação para o Casa |
|---|---|---|---|
| Estado global | **✅ Sem lib** (ADR-0006) | **Nenhuma lib** — `useReducer` puro, reducer testável sem falsificar ambiente | Mantém o precedente. Quase tudo no Casa é *server state* — Zustand viraria cache duplicado. |
| Data fetching | **✅ TanStack Query** (ADR-0006) | Nenhum — o app não faz rede | O WebSocket **invalida** queries; não mantém estado paralelo. |
| Schema / client tipado | **✅ Drizzle + drizzle-kit** (ADR-0005) | Nenhum | Substitui `supabase db push` + `gen types`. **`down` escrito à mão** — ver §8. |
| Formulários | **[A CONFIRMAR]** | Nenhum | React Hook Form, drop-in. |
| E2E de app | **[A CONFIRMAR]** | **Também aberto** (Maestro × Detox) | Não herdar decisão que não existe. Vale decidir junto com o `rimaai` e escolher a mesma. |
| OTA (EAS Update) | **[A CONFIRMAR]** | Adiado de propósito — ver §9 | Decidir cedo. Entra barato no começo, caro depois. |

---

## 5. Identidade visual — tokens

Traduzir a identidade já definida para tokens antes de escrever a primeira tela. **O tema do `rimaai` não é reaproveitável** — o que se copia é o método e a regra de lint.

| Token | Cor | Uso |
|---|---|---|
| `moss` | verde-musgo | base |
| `amber` | âmbar | moeda de pontos |
| `coral` | coral | streak / ofensiva |
| `lime` | lima | sucesso |

**Tipografia:**
- Display: **Bricolage Grotesque**
- UI: **Plus Jakarta Sans**

Ambas estão no Google Fonts — carregar pelos pacotes `@expo-google-fonts/*` + `expo-font`, mesmo padrão do `rimaai`, sem arquivo de fonte solto no repositório.

Definir a escala tipográfica e o espaçamento como tokens no mesmo lugar que as cores — a experiência do Improvisa Aí mostra que design system disperso vira dívida rápido.

> [!important] Trazer a regra junto com os tokens
> Ligar a regra de ESLint que proíbe `#hex` e `rgba()` fora do diretório de design system **no mesmo commit** em que os tokens nascem. Depois de a primeira tela existir, a regra vira mutirão de conserto em vez de guarda-corpo.

---

## 6. Estrutura de projeto sugerida

Desenho novo (ver §3 — o `rimaai` não tem router). Tratar como proposta, não como padrão validado.

Monorepo simples: o app e a API dividem tipos, e o `infra/` sobe o mesmo Postgres em dev e na VPS.

```
casa/
  apps/
    mobile/                 # Expo
      app/                  # Expo Router — rotas por arquivo
        (tabs)/
          _layout.tsx       # bottom tab navigator
          index.tsx         # Início — anel Energia da Casa
          tarefas.tsx
          objetivos.tsx
          casa.tsx
        (onboarding)/
          fase-0.tsx        # criador, <1min, casa templatizada
          convite.tsx
        _layout.tsx         # root — providers, fontes, auth gate
      src/
        design-system/      # tokens, tipografia, primitivos
        features/
          tarefas/  objetivos/  energia/
          pulso/            # dado sensível — ver §7
        lib/
          api/              # client HTTP tipado + token no SecureStore
          realtime/         # WebSocket → invalida queries do TanStack
        hooks/
    api/                    # Fastify + TS
      src/
        routes/             # /api/auth, /api/tarefas, /api/casa...
        db/
          schema.ts         # Drizzle — fonte da verdade do schema
          migrations/       # .sql gerados + down.sql escritos à mão
          rls/              # policies (SQL, entram nas migrations)
        plugins/
          withUser.ts       # SET LOCAL role + app.current_user_id (ADR-0002)
        realtime/           # LISTEN → fan-out WebSocket
      worker/               # cron: notificações, agregação, limpeza de jti
  packages/
    contracts/              # tipos e schemas compartilhados app ↔ API
  infra/
    docker-compose.yml      # postgres + api + worker + caddy
    Caddyfile
    backup/                 # pg_dump agendado + restore documentado
```

Ordem de montagem recomendada: **navegação funcionando primeiro**, depois data fetching, depois auth. Styling refinado por último — não brigar com estilo antes dos fluxos centrais rodarem.

> [!note] Duas regras de camada
> **No app** (vinda do `rimaai`): nenhum componente faz `fetch` direto. Tudo passa por `lib/api/`, que expõe funções de domínio. É o que permite cachear, mockar em teste e trocar de transporte sem reescrever tela — e é uma regra que se quebra por acidente, num autoimport, não por decisão.
>
> **Na API**: nenhum handler abre conexão própria. Tudo passa pelo plugin `withUser`, que garante o `SET LOCAL` do ADR-0002. Handler que pega o pool cru fura a RLS sem que nada quebre — por isso é a guarda de camada mais importante do projeto.
>
> Cobrar as duas com teste (§8).

---

## 7. Modelo de dados — o que a RLS precisa garantir

Esta seção é a mais importante do handoff. Não é sugestão de schema; é a lista de garantias que o banco precisa dar.

| Dado | Tratamento obrigatório |
|---|---|
| **Frustrações com tarefas** | Agregam como *peso* na tarefa. Nunca nominal. A query não pode devolver quem reclamou. |
| **Pulso semanal** | "Termômetro da casa" anônimo. Não ranqueia pessoas, não identifica respondentes. |
| **Aspirações "pra mim"** | Privadas. Só o autor lê. |
| **Aspirações "pra casa" / "pro grupo"** | Viram objetivos compartilhados — estas sim são visíveis ao grupo. |
| **Contribuição individual** | Visível, mas **sem ordenação comparativa**. Sem "top contribuidor", sem pódio, sem percentil. |

> [!danger] Critério de aceite não-negociável
> Para cada item acima, **duas provas**:
> 1. Autenticado como **outro membro da casa**, chamar o endpoint real e confirmar que o dado atribuível **não aparece no payload**.
> 2. Rodar a query direto no banco com `SET ROLE casa_app` + `SET LOCAL app.current_user_id` do outro membro, e confirmar que a **RLS bloqueia mesmo sem a API no caminho**.
>
> Se aparece e a UI esconde, reprovado. Se só o handler protege, também reprovado.

> [!danger] Com a API no meio, a RLS pode virar decorativa — e ninguém percebe
> Este é o risco nº 1 introduzido pelo ADR-0001. Sem PostgREST, é tentador conectar como owner e checar permissão em TypeScript. Aí a RLS deixa de fazer qualquer coisa e os invariantes §1 voltam a morar em código de aplicação. Trocar `if` de UI por `if` de controller **não é progresso**.
>
> O contrato (ADR-0002):
> - O pool da API usa um role **sem `BYPASSRLS`** e que **não é owner** das tabelas. Owner é o role de migration, usado só pelo drizzle-kit.
> - Toda request autenticada abre transação e injeta identidade antes de qualquer query:
>
> ```sql
> BEGIN;
>   SET LOCAL ROLE casa_app;
>   SET LOCAL app.current_user_id = '<uuid do JWT>';
>   -- queries do handler
> COMMIT;
> ```
>
> `SET LOCAL` morre com a transação — não vaza identidade entre requests do mesmo pool.
> - As policies leem `current_setting('app.current_user_id', true)::uuid` no lugar do `auth.uid()` que o Supabase daria.

> [!warning] Onde os segredos moram agora
> Com backend próprio, o app deixa de carregar chave de banco: `EXPO_PUBLIC_*` só guarda a **URL da API**. Tudo que é segredo (`DATABASE_URL`, `JWT_SECRET`, credenciais de OAuth e de e-mail) vive **só no servidor**, injetado por variável de ambiente no compose — nunca commitado, nunca no bundle. O token de sessão do usuário fica no **`expo-secure-store`**, não em `AsyncStorage`.

---

## 8. Testes e qualidade

Seção ausente na versão anterior. É o maior reuso disponível: o `rimaai` tem `jest-expo` + React Native Testing Library **14** de pé desde a primeira task, e três guardas que valem copiar antes da primeira tela.

### Guardas que se copiam

1. **Contraste AA cobrado por teste.** Um arquivo lista todo par texto/fundo que a UI desenha e afirma 4.5:1. Mudar um hex sem passar por lá derruba a suíte. No `rimaai` isso achou cinco reprovações que estavam na tela havia semanas, nenhuma visível a olho. Translúcido entra achatado contra o fundo — medir alpha contra ele mesmo não significa nada.
2. **Nome acessível cobrado por varredura.** Um teste percorre a árvore por papel e exige nome acessível com ao menos uma letra ou número: `×`, `‹`, `+` reprovam. Alvo de toque sai de uma função do tamanho visual, nunca de `hitSlop` chutado — 10 num glifo de 18px *parece* generoso e dá 38.
3. **Guarda de camada por leitura de fonte.** Varre os arquivos e reprova import proibido (componente → `fetch`/client HTTP direto, domínio → React). Barato de escrever, impede erosão silenciosa.

### Guardas novas, exigidas pelo ADR-0001

4. **Guarda de RLS na API.** Varre `apps/api/src/routes/` e reprova handler que toque o pool sem passar pelo plugin `withUser`. É a versão de leitura-de-fonte da regra do ADR-0002 — sem ela, um handler fura a RLS e **nenhum teste funcional quebra**.
5. **Teste de negação por identidade.** Para cada tabela sensível, um teste que abre transação como `casa_app` com o `app.current_user_id` de **outro** membro e afirma zero linhas atribuíveis. Roda contra o Postgres do compose, não contra mock — mock de RLS não prova nada.
6. **Teste de migration up → down → up.** O drizzle-kit não gera `down` (ADR-0005), então a reversibilidade é disciplina. Este teste é o que a torna cobrável.

### Armadilhas de RNTL 14 (custaram tempo no `rimaai`)

- **`render` é assíncrono.** Sem `await render(<X />)` as queries não existem, e o erro que aparece é `render function has not been called` — que não parece o problema que é.
- **`fireEvent` sozinho não descarrega a render concorrente do React 19.** O estado muda e a árvore continua a anterior: a asserção falha lendo o valor velho, **sem erro nenhum**. Conserto: `await act(async () => { fireEvent... })`.
- **`advanceTimersByTime` dentro de `act` assíncrono é o caminho oposto.** O React reclama de escopos de `act` sobrepostos e o erro contamina os testes seguintes. Nesse caso: relógio real com `waitFor`.

### O que ainda não tem resposta

E2E de app segue **aberto** nos dois projetos (Maestro × Detox). O Casa tem fluxo multi-usuário (convite, aceite, tarefa concluída por outro membro) que torna E2E mais valioso aqui do que lá — pode ser o projeto que decide.

---

## 9. Build e publicação

Também ausente na versão anterior. Tudo aqui é aprendizado pago pelo `rimaai`.

**Expo Go não serve.** O Casa precisa de `expo-notifications`, biometria, provavelmente câmera, e Reanimated com worklets. Dev build do EAS **desde o primeiro commit** — descobrir isso na semana 3 custa retrabalho de setup e um dia perdido achando por que o QR não abre.

**`android/` e `ios/` não vão para o repositório.** São gerados por CNG (`npx expo prebuild`) e ficam no `.gitignore`.

**Config dinâmica (`app.config.ts`): o EAS CLI não escreve nela.** Ele imprime o bloco que faltaria e aborta com:

```
Cannot automatically write to dynamic config at: app.config.ts
```

A mensagem é esperada, não é bug. Copiar a chave para o `app.config.ts` à mão, com comentário de origem, e rodar de novo. Acontece com o `projectId` do EAS e voltaria a acontecer com `updates.url` se OTA entrar.

**`eas-cli` fora das dependências do projeto.** Ele traz `@expo/require-utils` com peer `typescript ^5.0.0`, que colide com o TypeScript 6 do SDK 57. O npm local tolera; o npm 10 do builder resolve instalando um typescript aninhado que não está no lockfile, e o `npm ci --include=dev` do EAS aborta com `Missing: typescript@5.9.3 from lock file`. Chamar sempre por `npx eas-cli`. Para reproduzir a falha do builder localmente: `npx npm@10.9.8 ci --include=dev`.

**EAS Update (OTA) é decisão de cadeia inteira.** `channel` no `eas.json` exige `expo-updates`, que exige `updates.url` + `runtimeVersion` na config. Uma linha arrasta tudo. O `rimaai` adiou de propósito e nenhum perfil declara `channel` hoje. Para o Casa: decidir cedo — OTA é barato de ligar no começo e caro de retroencaixar.

**A API precisa estar acessível ao aparelho.** Em dev, o app não alcança `localhost` — aponte `EXPO_PUBLIC_API_URL` para o IP da máquina na LAN (ou para o túnel, ver abaixo). Em produção, a URL é o domínio servido pelo Caddy, sempre HTTPS.

**Deploy na VPS (novo — ADR-0001).** `docker compose up -d` com quatro serviços: `postgres`, `api`, `worker`, `caddy`. Pontos que costumam morder:
- **Volume nomeado para o Postgres.** Bind mount em host com UID diferente quebra permissão do datadir. Volume nomeado evita a classe inteira de problema.
- **`pg_dump` agendado + restore testado.** Backup que nunca foi restaurado não é backup — restaurar num container descartável faz parte do DoD do Épico 0.
- **Postgres não expõe porta pro host.** Só a rede interna do compose. O que sai pra internet é o Caddy (443). `ports: 5432` publicado é o erro mais comum e mais caro.
- **Migration roda como job de deploy**, com o role owner — nunca pelo processo da API, que usa o role sem `BYPASSRLS`.
- **`JWT_SECRET` e `DATABASE_URL` por variável de ambiente**, fora do repositório. Trocar o `JWT_SECRET` desloga todo mundo (é o desenho: é assim que se revoga em massa).

**Testar em aparelho físico a partir do WSL2 passa por túnel.** O IP que o `expo start` anuncia é o da VM e o celular não alcança. Reservar uma tarde para isso na primeira semana, não descobrir na demo.

**Identidade de publicação (bundle id, package, slug) é praticamente imutável** depois do primeiro submit / primeiro update. Nome de exibição muda de graça a qualquer momento nas duas lojas. Decidir os três primeiros com calma; não travar o projeto pelo nome.

---

## 10. Fases de onboarding (recapitulação para implementação)

| Fase | Escopo | Critério |
|---|---|---|
| **Fase 0** | Essencial, casa templatizada | < 1 minuto até estar dentro |
| **Fase 1** | Primeiro valor colaborativo | Convidar + completar 1 tarefa |
| **Fase 2** | Nudges progressivos D0–D7 | Dados sensíveis **por último** |

Filosofia: o criador absorve a configuração pesada, diluída ao longo do tempo; o membro convidado entra ultraleve.

**Convite:** WhatsApp-first, QR code, código curto, contexto social. Sem labirinto de códigos.

**Notificações:** pessoais ("é a sua vez"), parcimoniosas com quiet hours, aviso antecipado de rodízio, tom cooperativo. Implementar com `expo-notifications`, e tratar quiet hours como regra de agendamento no servidor, não filtro no cliente.

---

## 11. Perguntas abertas

### Respondidas nesta revisão (antigas 1–4)

| # | Pergunta | Resposta |
|---|---|---|
| 1 | Resto da stack do `rimaai` | TypeScript `strict` 6.0.3; sem lib de estado, styling, data fetching ou forms. Detalhe na §2. |
| 2 | O `rimaai` usa Supabase? | **Não** — Next.js API-only na Vercel + DeepSeek. Ficou irrelevante: o Casa também não usa (ADR-0001). |
| 3 | Design system compartilhável? | **Não existe.** O tema do `rimaai` é acoplado à marca dele. Reusa-se o método e a regra de lint, não o código. |
| 4 | SDK do `rimaai` | **57** (`expo ~57.0.14`, RN 0.86.2, React 19.2.3). Sem divergência entre os projetos. |

### Respondidas em 2026-08-28 (ADR-0001 a ADR-0006)

| # | Pergunta | Resposta |
|---|---|---|
| 5 | Backend | **Postgres em container + API Fastify em VPS.** Supabase descartado. ADR-0001. |
| 6 | Auth | **JWT próprio**, desenho do `improvisa-ai` reescrito em TS. Bearer-first, blocklist em Postgres, sem cookie. ADR-0003. |
| 7 | Estado global | **Sem lib** — `useReducer` + Context. ADR-0006. |
| 8 | Data fetching | **TanStack Query**; WebSocket invalida, não duplica. ADR-0006. |
| 9 | Schema / tipos | **Drizzle + drizzle-kit**, `down` à mão. ADR-0005. |

### Ainda em aberto — técnicas

1. E2E: Maestro ou Detox — decidir junto com o `rimaai`? (§4, §8)
2. OTA no v1: ligar `expo-updates` desde o começo ou adiar como o `rimaai`? (§9)
3. Formulários: React Hook Form ou controlado na mão? (§4)
4. **Refresh token.** O padrão herdado do `improvisa-ai` é token único de 7 dias sem refresh. Em web passa; em app instalado é **logout semanal**. Rever antes do beta (ADR-0003, delta 3).
5. **Provedor da VPS e backup offsite.** `pg_dump` local não sobrevive à perda da VPS.

### Ainda em aberto — produto (de `casa-decisoes-produto.md`)

5. Escopo do pulso semanal: só humor, ou também "alguém está sobrecarregado?"
6. Confirmar modelo de rodízio + pontos-bônus para tarefas universalmente detestadas
7. Modelo de negócio sustentável
8. Qual tela prototipar primeiro (criador na Fase 0, ou passo de seleção de preferências)

---

## 12. Próximos passos

Feito nesta revisão: stack fechado (`status: confirmado`), decisões registradas em
`casa-decisoes-produto.md`, harness `casa-*` gerado e realinhado ao ADR-0001.

**Infra e fundação (Épico 0)**
- [ ] `infra/docker-compose.yml`: `postgres` + `api` + `worker` + `caddy`, volume nomeado, Postgres **sem porta publicada** (§9)
- [ ] Criar os roles: owner (migration) e `casa_app` **sem `BYPASSRLS`** — é o que torna o ADR-0002 exequível
- [ ] `pg_dump` agendado **e um restore de verdade executado** antes de fechar o épico
- [ ] Decidir provedor da VPS e destino do backup offsite (§11)

**App**
- [ ] `npx create-expo-app@latest` com `expo >= 57.0.9`, TypeScript `strict`
- [ ] ESLint + Prettier + Jest (`jest-expo`) + RNTL 14 **no primeiro commit**, com as guardas de camada de pé (§8)
- [ ] Dev build do EAS antes da primeira feature — Expo Go não serve (§9)
- [ ] Tokens do design system junto com a regra de lint de cor literal (§5)
- [ ] Navegação das 4 abas antes de qualquer feature
- [ ] Teste de contraste AA assim que a paleta existir (§8)

**API e dados**
- [ ] Esqueleto Fastify + plugin `withUser` (`SET LOCAL`) **antes** do primeiro endpoint — depois vira mutirão
- [ ] Schema Drizzle + migration inicial, com policy RLS na mesma leva (§7)
- [ ] Auth `/api/auth` seguindo o ADR-0003, token no `expo-secure-store`
- [ ] Guarda de RLS na API + teste de negação por identidade (§8) — antes da primeira tela que toca dado sensível
- [ ] Decidir se `expo-updates` entra agora (§9, §11)
