# Taxonomia de skills — núcleo + mapa sinal→skill

Coração da heurística. A lista final de skills de um projeto = **núcleo** (sempre) + **condicionais** (disparadas por sinais do relatório) + **domínio** (inferida dos substantivos do negócio).

Regra de saída: cada skill carrega marca `núcleo`/`condicional`/`domínio` + o sinal que a disparou. Nada entra sem justificativa rastreável.

---

## 1. Núcleo — todo projeto recebe

Nomeadas `<proj>-<role>`. Existem porque valem para qualquer software não-trivial.

| Role | Persona / foco | `disable-model-invocation` |
|---|---|---|
| `projeto` (ou `contexto`) | Escopo, produto, contexto de negócio. Fonte de "o que é isso e por quê". | não |
| `arquitetura` | Stack, convenções, Definition of Done, decisões de design. | não |
| `tech-lead` | Quebra de épicos, code review, sem overengineering. "Segundo par de olhos sênior". | não |
| `qa` | Cultura de testes: cobertura, fixtures, **testes verificam intenção, não só comportamento**. | não |
| `prd-tasks` | Escreve PRD + gera lista de tasks por camada. Co-localizar templates. | **sim** |
| `product-owner` | Backlog, escopo, horizontes de versão, trade-offs. | **sim** |
| `tech-writer` (ou `document`) | ADRs, README, docs de API, protocolo de atualização de KB. | não |

> Skills de planejamento (`prd-tasks`, `product-owner`) levam `disable-model-invocation: true` — são deliberadas, rodam via `/skill`, não auto-disparam.

---

## 2. Condicionais — disparadas por sinais

Varrer stack, roadmap e features do relatório. Para cada sinal presente, incluir a skill.

| Sinal no relatório | Skill(s) sugerida(s) | Foco |
|---|---|---|
| Framework frontend (Next.js, React, Vue, Svelte) | `frontend-dev` | Consumo de client gerado, componentes, estado, tokens |
| Framework backend (NestJS, FastAPI, Django, Rails, Go) | `backend-dev` | API, dados, auth, regras de negócio |
| URL Figma / design tokens / design system | `ux-ui` **+** `design-sync` | `ux-ui`: telas no Figma. `design-sync`: ponte código↔Figma (padrão `figma-screens-from-reference`) |
| Direção mobile (nativo / RN / Flutter) | `mobile-dev` | Framework, consumo do client gerado |
| Banco + migrations | `migrations` (ou `arquitetura-dados`) | Schema só muda por migration, segurança de migração |
| Fila / push assíncrono / realtime / Celery / BullMQ | `mensageria` (ou `celery`) | Tasks, workers, idempotência, escala |
| Docker / VPS / Ansible / Terraform / Kubernetes | `infra` (ou `iac`) | Containers, deploy, IaC, backup |
| Auth / RBAC / guards / sessões | `seguranca` | IDOR, ownership, rate limit, hardening |
| LGPD / GDPR / compliance / privacidade | `compliance` (ou `ciberseguranca`) | Termos, política, plano de compliance |
| Pagamentos / Stripe / assinaturas / créditos | `pagamentos` | Webhooks, gates de plano, cobrança |
| LLM / IA / chat / RAG / agentes | `especialista-ia` (+ skill de uso específico, ex. `tutor`) | Escolha de modelo, custo, guardrails, contexto estruturado |
| Analytics / PostHog / GA / métricas de produto | `analytics` | Eventos, funil, retenção |
| Observability / Sentry / logs / tracing | `observability` | Logs estruturados, alertas, dashboards |
| Marketing / SEO / growth / landing / waitlist | `marketing` (+ `seo` se SEO técnico explícito) | Posicionamento, aquisição, SEO técnico |
| E2E / Playwright / Cypress / testes visuais | `qa-lead` (ou reforça `qa` com viés visual) | Cobertura E2E, asserções, design-diff |
| OpenAPI / contract-first / clients gerados | `contrato` (ou dobra em `tech-lead`/`backend-dev`) | Geração/validação de contrato, clients tipados |

Notas:
- Se dois sinais apontam para a mesma skill, **uma** skill (não duplicar).
- Se um sinal é fraco (mencionado mas "a decidir"), incluir mas marcar como *provisório* no catálogo.

---

## 3. Domínio — inferida dos substantivos do negócio

Todo produto com **regras próprias** ganha pelo menos 1 skill de domínio. Detectar os substantivos centrais e as regras que os governam.

| Exemplo de projeto | Substantivos | Skill(s) de domínio |
|---|---|---|
| Improvisa Aí | tonalidade, campo harmônico, escalas, acordes | `dsp` (análise de áudio/librosa) + `teoria-musical` (validador de lógica musical) |
| KartPOA | corrida, vaga, lotação, estados (aberta/lotada/confirmada/cancelada) | `dominio-corridas` (máquina de estados de vagas/lotação) |
| E-commerce | pedido, carrinho, estoque, fulfillment | `dominio-pedidos` (estados de pedido, reserva de estoque) |

Heurística: se há uma **máquina de estados**, **cálculo/validação especializado**, ou **vocabulário de domínio** que um dev genérico erraria, isso é uma skill de domínio. Nomear pelo domínio, não pela tecnologia.

---

## 4. Sanidade da lista final

- **Orçamento de descrições** ~1% da janela de contexto. Lista grande (>15 skills) + descrições longas = risco de truncar e quebrar o auto-trigger. Manter `description` enxuta; consolidar roles próximos quando fizer sentido (ex.: `qa` + `qa-lead` em 1 se o projeto é pequeno).
- **Conflito relatório × boa prática**: se o relatório pede algo que contradiz a prática (ex.: skill que mistura 5 responsabilidades), escolher um lado, explicar, e sinalizar o outro. Não nivelar silenciosamente.
- **Cobertura dos gaps**: se um gap bloqueia uma skill (ex.: sem repo → `infra` não tem o que configurar), incluir a skill mas anotar a dependência no `harness-report.md`.
