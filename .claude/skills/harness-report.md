# Harness Report — Casa

Gerado por `harness-architect` a partir de `casa-manifesto-projeto.md`. Stack (§3) **confirmado por Bruno** → harness completo.

> [!important] Revisão de 2026-08-28 — realinhamento ao ADR-0001
> O **ADR-0001** trocou Supabase por **Postgres em container + API Fastify em VPS**. Oito skills foram
> reescritas (`arquitetura`, `backend-dev`, `realtime`, `mobile-dev`, `migrations`,
> `seguranca-privacidade`, `qa`, `tech-writer`) e **uma foi criada** (`casa-infra-deploy`).
> Racional completo em `casa-decisoes-produto.md`.

- **Prefixo**: `casa-`
- **Idioma**: pt-BR
- **Alvo**: `.claude/skills/`
- **Total**: **17 skills** (16 na geração inicial + `casa-infra-deploy`, exigida pelo ADR-0001)

## Catálogo final

| # | Skill | Tipo | Sinal disparador | `disable-model-invocation` |
|---|---|---|---|---|
| 1 | `casa-projeto` | Núcleo | todo projeto | não |
| 2 | `casa-arquitetura` | Núcleo | todo projeto | não |
| 3 | `casa-tech-lead` | Núcleo | todo projeto | não |
| 4 | `casa-qa` | Núcleo | todo projeto | não |
| 5 | `casa-prd-tasks` | Núcleo | todo projeto | **sim** |
| 6 | `casa-product-owner` | Núcleo | todo projeto | **sim** |
| 7 | `casa-tech-writer` | Núcleo | todo projeto | não |
| 8 | `casa-mobile-dev` | Condicional | Expo/RN mobile-first | não |
| 9 | `casa-backend-dev` | Condicional | API própria (Fastify) | não |
| 10 | `casa-migrations` | Condicional | Postgres + Drizzle migrations | não |
| 11 | `casa-seguranca-privacidade` | Condicional (fusão) | RLS/IDOR + LGPD | não |
| 12 | `casa-realtime` | Condicional | LISTEN/NOTIFY + notif agendada | não |
| 13 | `casa-ux-ui` | Condicional | Figma + tokens | não |
| 14 | `casa-design-sync` | Condicional | Figma + tokens | não |
| 15 | `casa-dominio-tarefas` | Domínio | substantivos §4 | não |
| 16 | `casa-dominio-cooperacao` | Domínio (crítica) | substantivos §4 | não |
| 17 | `casa-infra-deploy` | Condicional (**nova, ADR-0001**) | Docker/VPS/backup/TLS | não |

Templates co-localizados: `casa-prd-tasks/create-prd-template.md`, `casa-prd-tasks/generate-tasks-template.md`.

## Decisões de consolidação (expostas, não niveladas)

1. **Fusão `seguranca` + `compliance` → `casa-seguranca-privacidade`.** Coesão forte: os invariantes de anonimização §2 são privacy-by-design imposto na camada RLS; LGPD e ownership/IDOR moram no mesmo lugar. Reverter se o compliance crescer (termos/política densos) → separar em 2.
2. **`casa-analytics` (PostHog) NÃO gerada.** Marcada *provisória* no §10; PostHog não confirmado. Reincluir quando houver decisão de instrumentação de produto.
3. **`design-sync` mantido separado de `ux-ui`.** Personas distintas (desenhar telas vs. sincronizar código↔Figma via MCP) — padrão documentado. Baixaria p/ 15 se fundido; não recomendado.
4. **Fronteira domínio ↔ segurança**: `casa-dominio-cooperacao` define as regras; `casa-seguranca-privacidade` as impõe em RLS. Cada invariante deve ter policy que o prova. Evita duplicação.
5. **E2E fica em `casa-qa`** até a decisão Maestro × Detox → então avaliar `casa-qa-lead` dedicada.
6. **`casa-infra-deploy` criada (2026-08-28).** Justificativa: o Supabase cobria backup, TLS, roles e
   deploy sem que ninguém fosse dono disso. Com VPS própria, essa superfície passou a ter DoD próprio
   (restore testado, Postgres sem porta publicada, `casa_app` sem `BYPASSRLS`) e falha em silêncio se
   ficar órfã. Sobe o total de 16 → 17, ainda dentro da âncora de ~18 do §10. Reverter só se a infra
   virar um `docker-compose.yml` estático que ninguém toca.

## Gaps sinalizados (não bloqueiam o bootstrap — próximos passos)

**Bloqueante do Épico 0 (destravado):**
- ~~Stack final~~ → confirmado (ADR-0001 a ADR-0006).
- ~~Repo git~~ → `git@github.com:brunoherdina/home-app.git`.

**Sinalizáveis (registrar e resolver ao longo do roadmap):**
- **Provedor da VPS** e destino do **backup offsite** — `pg_dump` local não sobrevive à perda da VPS.
  Trava o **Épico 0b**, não o 0a (corte de 2026-08-28).
- **CI** a definir → Épico 0b.
- ~~**Refresh token**~~ → **ADR-0008**: antecipado pro Épico 1, com rotação e detecção de reuso.
- **Sign in with Apple**: exigido pela App Store quando há outro social no iOS. Entra no Épico 1.
- **LGPD**: anonimização é privacy-by-design ✅, mas **termos de uso + política de privacidade não existem** (`<PREENCHER>`). Direito de exclusão/exportação a modelar. → `casa-seguranca-privacidade`.
- **Modelo de negócio** indefinido.
- **Nome "Casa"**: confirmar disponibilidade/marca.
- **PostHog/analytics**: decidir instrumentação → reincluir `casa-analytics` se sim.
- **Docs raiz ausentes** (fora do escopo desta skill, mas as skills apontam pra eles):
  - `CLAUDE.md` raiz — várias skills referenciam via `../../../`; criar no bootstrap de harness
    completo. O `README.md` da raiz já existe (2026-08-28), mas não substitui o `CLAUDE.md`.
  - `docs/adr/`, `docs/prds/` — pastas referenciadas, ainda não existem.
  - ~~`casa-decisoes-produto.md`~~ ✅ criado em 2026-08-28 com os ADRs.
  - ~~`casa-roadmap-implementacao.md`~~ ✅ presente.
  - `tokens.json` — referenciado por `ux-ui`/`design-sync`; exportar do Figma. Os **nomes** já estão
    em `apps/mobile/src/design-system/tokens.ts`; os valores hex são provisórios e marcados como tal.
  - `.mcp.json` — referenciado por `casa-design-sync` (Figma MCP); ainda não existe.
  - `references/figma-caveats.md` — referenciado por `casa-ux-ui`; ainda não existe.

## Decisões de produto em aberto (do manifesto §9 — não bloqueiam)

Lista canônica agora vive em `casa-decisoes-produto.md` → "Decisões ainda em aberto". Resumo:

1. Escopo do pulso semanal: só humor vs. também "alguém sobrecarregado?".
2. Modelo rodízio + bônus para tarefa detestada por todos (afeta `casa-dominio-tarefas`).
3. Modelo de negócio sustentável.
4. Qual tela prototipar primeiro (criador Fase 0 vs. preferências).
5. E2E (Maestro × Detox), OTA (`expo-updates`), formulários — técnicas, do handoff §11.

## Âncora de sanidade (§10)

Proposta reproduz o conjunto esperado do manifesto: 7 núcleo + condicionais (mobile, backend, migrations, seguranca-privacidade, realtime, ux-ui, design-sync, **infra-deploy**) + 2 domínio. Divergências vs. §10: `compliance` fundido em segurança; `analytics` adiado; `infra-deploy` acrescentada pelo ADR-0001 (o §10 foi escrito quando o Supabase cobria essa camada). Sem divergência estrutural → heurística validada.

## Próximos passos

1. ~~Confirmar/criar repo git~~ ✅.
2. ~~Resolver as decisões em aberto via `casa-product-owner`~~ → 7 fechadas em 2026-08-28
   (ADR-0007 a ADR-0011, o corte 0a/0b, e a primeira tela a prototipar). Restam 4, todas fora do 0a.
3. Bootstrap de harness completo: `CLAUDE.md` raiz + `docs/context/` (outra tarefa).
4. ~~**Épico 0a**: compose local + roles + `withUser`~~ ✅ **2026-08-28**. Entregues: monorepo
   (Expo + Fastify + `packages/contracts`), compose com `postgres`/`api`/`worker`, os três roles,
   plugin `withUser`, 1ª migration com `down.sql` à mão, e as guardas de camada executáveis
   (`npm run verify`) — antes do primeiro endpoint de domínio, como o DoD exige.
   **Aberto no 0a:** `tokens.json` (depende do Figma), `eas init` (depende de conta Expo) e o teste
   no **device físico** (depende da máquina do Bruno — runbook em `apps/mobile/README.md`).
5. Exportar `tokens.json` do Figma; prototipar o **criador da Fase 0**.
6. Épico 1 (Identidade & Casa): auth com refresh + modelo de dados + RLS + onboarding Fase 0.
7. Épico 0b (VPS, TLS, backup com restore testado) **antes do convite do Épico 2**.
