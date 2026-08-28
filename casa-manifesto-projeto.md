---
nome: Casa
prefixo: casa-
idioma_do_time: pt-BR
uma_linha: >-
  App cooperativo de gestão do lar — casais, repúblicas e famílias — que mantém a casa
  organizada sem sobrecarregar ninguém. Cooperação acima de competição.
# stack: ✅ CONFIRMADO — ver §3 e os ADRs em casa-decisoes-produto.md.
# ADR-0001 (2026-08-28) trocou Supabase por Postgres auto-hospedado + API própria.
stack:
  mobile: "✅ Expo (React Native) + TypeScript"
  backend: "✅ API Fastify + TypeScript (container), auth JWT próprio (ADR-0003)"
  banco: "✅ Postgres em container + Row-Level Security + migrations (Drizzle)"
  design: "✅ Figma + design tokens (identidade visual travada)"
  infra: "✅ Docker Compose em VPS + Caddy (TLS); EAS para build mobile"
  contrato: "✅ client tipado gerado do schema Drizzle (sem OpenAPI dedicado no MVP)"
locais:
  figma_onboarding: "https://www.figma.com/board/9F0sy1Nk0Q9FyoxwdFecL3/Onboarding-em-fases"
  prototipo_react: "✅ existe (React, inline styles, tema, Lucide) em /mnt/user-data/outputs"
  vault_obsidian: "MegaBrain — notas de produto (casa-decisoes-produto.md etc.)"
  repo_git: "git@github.com:brunoherdina/home-app.git"
  ci: "<PREENCHER>"
  host_producao: "VPS própria (Docker Compose) — provedor a definir"
skills_existentes: []   # projeto ainda sem harness — este manifesto é o bootstrap
---

# Casa — manifesto de projeto (handoff para o harness-architect)

> **Propósito deste arquivo.** É a entrada do agente `harness-architect`. Ele lê stack, domínio,
> roadmap e gaps daqui e devolve um catálogo de skills `casa-*` + os `SKILL.md` scaffoldados.
> Não é doc de arquitetura profunda — é o suficiente pra ele triar sinais e propor o harness.
> A execução da implementação está no arquivo companheiro **`casa-roadmap-implementacao.md`**.

---

## 1. Identidade do projeto

Casa é um app **mobile-first** de gestão cooperativa do lar. Atende três formatos de convívio —
**casal, república e família** — com um objetivo único: manter a casa organizada **sem sobrecarregar
ninguém**. O norte é **cooperação acima de competição**: rankings e pódios foram **descartados
explicitamente**.

Espaço de mercado (pesquisa competitiva feita contra Tody, Sweepy, OurHome, Flatastic, Cozi e
Fairshare): o *white space* é a **combinação simultânea** de cinco coisas que nenhum concorrente faz
junto — atribuição de tarefa por pessoa + gamificação cooperativa + dados de conforto anonimizados +
onboarding sem fricção + notificação não-spam. O diferencial é a combinação, não uma feature isolada.

---

## 2. Regras invioláveis  ⟵ *filtram TODA decisão de produto e de código*

Estas não são preferências; são **invariantes de arquitetura desde o Épico 1**, não features tardias.
A skill de domínio gerada deve validá-las.

1. **Cooperação, não competição.** Nenhum schema, endpoint ou tela expõe ranking ou pódio por pessoa.
   Progresso individual existe só como "sua parte"; o resto é coletivo.
2. **Dados sensíveis são estruturalmente anônimos** (privacidade é pré-requisito de confiança, não
   ajuste posterior):
   - **Frustrações / incômodos** → viram **peso agregado** na distribuição de tarefas, **nunca
     atribuídos a uma pessoa**.
   - **Pulso semanal de satisfação** → "termômetro da casa" **anônimo**, não ranking de pessoas.
   - **Aspirações "pra mim"** → **privadas**; só aspirações "pra casa" / "pro grupo" viram objetivos
     compartilhados.
   - Anonimização deve ser garantida na **camada de dados (RLS/policies)**, não só na UI.
3. **Onboarding é risco de retenção.** Setup pesado do criador é **diluído em D0–D7** via nudges
   contextuais; morador convidado entra **ultra-leve**.

---

## 3. Stack e arquitetura  ✅ *confirmado — ADR-0001 a ADR-0006*

Bruno vinha **design-first** (protótipo React pronto, sem backend decidido). O stack abaixo está
**decidido**; o racional completo de cada linha está em `casa-decisoes-produto.md`.

| Camada | Decisão | Por quê (amarrado ao Casa) |
|---|---|---|
| Mobile | **Expo (React Native) + TS** | Reaproveita o protótipo React; um código p/ iOS+Android; melhor DX pra solo aprendendo. |
| Banco | **Postgres em container** + migrations | **RLS faz cumprir a anonimização** (frustração sem atribuição, aspiração "pra mim" privada). SQL aprendível; schema só muda por migration. |
| API | **Fastify + TypeScript** (container) | Sem PostgREST, o app não fala com o banco. A API é **transporte**: injeta a identidade por request e deixa a RLS decidir (ADR-0002). |
| Auth | **JWT próprio** (padrão do `improvisa-ai`) | Apelido/e-mail + senha, Google e Apple. Token no `expo-secure-store`, sempre `Bearer` (ADR-0003). |
| Realtime | **`LISTEN/NOTIFY` + WebSocket** | Alimenta o anel **Energia da Casa** e a **meta coletiva** ao vivo, com payload **agregado** (ADR-0004). |
| Jobs/notif. | **worker Node + cron** no mesmo deploy | Notificação com **horário de silêncio**, aviso de vez com antecedência, agregação de incômodos. |
| Infra | **Docker Compose em VPS + Caddy** | Sem lock-in, custo fixo. Em troca, backup/TLS/monitoramento viram responsabilidade nossa (ADR-0001). |
| Dados (dev) | **Drizzle + drizzle-kit** | Substitui `supabase db push` e `gen types`. Ressalva: `down` é escrito à mão (ADR-0005). |
| Design | **Figma + tokens** (`tokens.json`) | Identidade travada; ponte código↔Figma. |

> [!danger] A consequência que não pode ser esquecida
> A arquitetura deixou de ter 2 camadas (app → Postgres com RLS) e passou a ter 3 (app → API →
> Postgres). O caminho preguiçoso — API conectando como superuser e checando permissão em TypeScript —
> **anula os invariantes §2**. A API conecta com role sem `BYPASSRLS` e usa
> `SET LOCAL app.current_user_id` por requisição. Ver **ADR-0002**, que é inegociável.

**Bifurcações já descartadas** (registradas para não voltarem à mesa):
- **Supabase gerenciado ou self-hosted** — descartado por decisão explícita (ADR-0001).
- **PostgREST + container de auth** — manteria as 2 camadas, mas espalha lógica em SQL e multiplica
  peças de infra.
- **Flutter** — se quisesse aprender Dart / performance nativa máxima.
- **Firebase** — NoSQL/Google; RLS/SQL casa melhor com a privacidade exigida.
- **PWA-only React** — mais rápido pra web, mas *push* e sensação nativa ficam fracos.

---

## 4. Domínio de negócio  ⟵ *substantivos → skill(s) de domínio*

O domínio tem **regras próprias que um dev genérico erraria** → pelo menos 1 skill de domínio.
Substantivos centrais e as máquinas/regras que os governam:

- **Divisão de tarefas** — `tarefa`, `ponto` (peso por esforço), `modo` (**Rodízio** / **Fixo** /
  **Aberta**), `rotação`, `bônus`. Máquina de estados + cálculo de pontos.
  Regra pendente de confirmação: tarefa detestada por todos entra em **rodízio + bônus** (modelo a
  confirmar — ver §8).
- **Cooperação & anonimização** — `energia da casa`, `nível`, `ofensiva`/`streak`, `meta coletiva`,
  `recompensa compartilhada`, `contribuição não-competitiva`, `sua parte`, `frustração agregada`,
  `pulso anônimo`, `aspiração privada`. Invariantes: **sem ranking**, **sem atribuição de frustração**,
  **aspiração "pra mim" nunca compartilhada**.

Sugestão de nomeação (o agente decide/consolida): `casa-dominio-tarefas` +
`casa-dominio-cooperacao`. A de cooperação é a **mais crítica** — ela codifica as regras invioláveis
do §2.

---

## 5. Arquitetura de produto + fluxo de onboarding

**4 abas + tab bar inferior + FAB. Mobile-first.**

| Aba | Conteúdo |
|---|---|
| **Início** | Anel **Energia da Casa** (estado ao vivo). |
| **Tarefas** | Filtros **Todas / Minhas / Livres**; concluir; FAB pra adicionar. |
| **Objetivos** | Poupança em R$ + checklist; só aspirações "pra casa" viram objetivo. |
| **Casa** | Aba coletiva: nível, meta semanal compartilhada, contribuições não-competitivas. |

**Fluxo de onboarding (fonte da verdade: board do Figma, §locais). 3 fases:**

- **Fase 0 — Essencial (< 1 min).** Abre o app → *Criar ou entrar*.
  - *Cria a casa*: apelido + login social → nome + tipo da casa → **casa já populada com template**.
  - *Tem convite*: abre o convite e vê a casa → apelido + cor, **já entra**.
- **Fase 1 — Primeiro valor.** Convidar um morador → **concluir 1 tarefa**.
- **Fase 2 — Setup progressivo D0–D7 (via nudges), nesta ordem:**
  Início → tarefa que curte/detesta → **como dividir + frequências** → aspirações viram objetivos →
  meta semanal + recompensa → **incômodos anônimos + ativar pulso semanal (por último)**.
- **Convite sem fricção:** WhatsApp / QR / código curto → mostra a casa e quem já entrou → **sem
  labirinto de código**.
- **Notificação inteligente:** pessoal ("é a sua vez") → parcimoniosa, com horário de silêncio →
  avisa a vez com antecedência → **tom cooperativo, não cobrança**.

O criador absorve o setup pesado diluído; o convidado entra ultra-leve. (Ver §2.3.)

---

## 6. Roadmap / Épicos (resumo — detalhe em `casa-roadmap-implementacao.md`)

| Épico | Nome | Entrega-núcleo |
|---|---|---|
| **0** | Bootstrap do harness + fundação | rodar harness-architect; repo; skeleton Expo + API Fastify; compose Postgres; 1ª migration; tokens |
| **1** | Identidade & Casa | auth, modelo de dados, RLS, onboarding **Fase 0** |
| **2** | Tarefas & Divisão | aba Tarefas, pontos/modos, convite, onboarding **Fase 1** |
| **3** | Cooperativo | Início (anel) + aba Casa, nível, ofensiva, meta coletiva |
| **4** | Objetivos & dados sensíveis anonimizados | Objetivos, incômodos agregados, pulso anônimo (**Fase 2**) |
| **5** | Notificações & nudges progressivos | notif. pessoal/parcimoniosa; motor de nudges D0–D7 |
| **6** | Polimento, mobile & pré-lançamento | a11y, EAS, LGPD, modelo de negócio, beta |

O roadmap cobre o domínio e as regras invioláveis; o harness deve confirmar que **cada skill proposta
tem um épico que a exercita**.

---

## 7. Tabela de prontidão

| Item | Estado |
|---|---|
| Filosofia (cooperação > competição) | ✅ travada |
| Identidade visual (cores + tipografia) | ✅ travada |
| Arquitetura de produto (4 abas) | ✅ definida |
| Fluxo de onboarding (3 fases) | ✅ desenhado no Figma |
| Modos de divisão (Rodízio/Fixo/Aberta) | ✅ definidos |
| Regras de anonimização | ✅ definidas (implementação pendente) |
| Idioma do time | ✅ pt-BR |
| Domínio / prefixo (`casa-`) | ✅ claros |
| Stack técnico | 🟡 recomendado, **a confirmar** |
| Modelo de rodízio+bônus (tarefa detestada) | 🟡 a confirmar |
| Escopo do pulso semanal | 🟡 a confirmar |
| Repo / CI / host | ⬜ `<PREENCHER>` |
| Modelo de negócio | ⬜ `<PREENCHER>` |
| Docs LGPD (termos/política) | ⬜ `<PREENCHER>` |

---

## 8. Gaps

**Bloqueante para harness completo** (resolver antes de scaffoldar, ou o harness sai fino):
- **Stack final** (§3). Idioma e domínio — os dois gaps *de fato* bloqueantes do report-intake — já
  estão resolvidos; o stack é o que decide as skills condicionais.

**Sinalizáveis** (não travam o bootstrap; registrar no `harness-report.md` como próximos passos):
- Repositório git sem URL; CI e host de produção a confirmar.
- Docs de compliance **LGPD** não produzidos (a anonimização é *privacy-by-design*, mas termos/política
  ainda não existem).
- Modelo de negócio indefinido.
- Nome "Casa" — confirmar disponibilidade/marca (`<PREENCHER>`).

---

## 9. Decisões de produto em aberto (de `casa-decisoes-produto.md`)

1. Escopo do pulso semanal: só humor **vs.** também "alguém está sobrecarregado?".
2. Confirmação final do modelo **rodízio + bônus** para tarefas detestadas por todos.
3. Modelo de negócio sustentável.
4. Qual tela prototipar primeiro (criador na Fase 0 **vs.** passo de preferências).

Nenhuma bloqueia o bootstrap do harness. Todas devem ir pro `harness-report.md`.

---

## 10. Sinais esperados para o harness (âncora de sanidade)

Se o stack recomendado (§3) for confirmado, a proposta do harness deve **reproduzir aproximadamente**
este conjunto. Divergência grande = revisar a heurística antes de scaffoldar.

- **Núcleo** (todo projeto): `casa-projeto`, `casa-arquitetura`, `casa-tech-lead`, `casa-qa`,
  `casa-prd-tasks` *(disable-model-invocation)*, `casa-product-owner` *(disable-model-invocation)*,
  `casa-tech-writer`.
- **Condicionais** (por sinal):
  - Expo/RN mobile-first → `casa-mobile-dev`
  - API própria (dados/regras/auth) → `casa-backend-dev`
  - Postgres + migrations → `casa-migrations`
  - Container/VPS/deploy/backup → `casa-infra-deploy`
  - RLS / ownership / IDOR → `casa-seguranca`
  - Realtime + notif. agendada (silêncio/rotação) → `casa-realtime` (ou `mensageria`)
  - Figma + tokens → `casa-ux-ui` **+** `casa-design-sync`
  - Dados pessoais sensíveis + jurisdição BR → `casa-compliance` (LGPD/privacidade)
  - *(provisório)* analytics de produto (PostHog) → `casa-analytics`
- **Domínio**: `casa-dominio-tarefas`, `casa-dominio-cooperacao`.

Total ≈ 18 → **acima do limite de ~15**. Candidatos a consolidar (o agente decide): dobrar
`frontend-dev` em `mobile-dev` (é RN); fundir `seguranca` + `compliance` se pequenos; `qa` cobre E2E
até surgir Playwright. Manter `description` enxuta (orçamento ~1% da janela).

---

## 11. Instruções para o harness-architect

- **Argumento:** o caminho deste arquivo (`casa-manifesto-projeto.md`).
- **Diretório-alvo:** raiz do repo do Casa → `<alvo>/.claude/skills/`. Se ainda não há repo
  (`repo_git: <PREENCHER>`), perguntar o alvo — é o gap que destrava o Épico 0.
- **Rodar as 4 fases:** Intake → Perfilar → **Propor + confirmar (PARAR: Bruno aprova o catálogo)** →
  Scaffold. Nada é escrito sem aprovação.
- **Saída esperada:** arquivos `casa-*/SKILL.md` (1 por skill, prefixados, pt-BR), templates
  co-localizados em `casa-prd-tasks` (`create-prd-template.md` + `generate-tasks-template.md`), e um
  `harness-report.md` com catálogo final + gaps sinalizados + próximos passos.
- **Fora de escopo do agente:** não gerar `CLAUDE.md` raiz nem `.mcp.json`; não escrever o corpo
  profundo de cada skill — só o scaffold acionável.
