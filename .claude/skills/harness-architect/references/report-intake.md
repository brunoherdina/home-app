# Intake — como ler o relatório de um projeto

Relatórios são heterogêneos: alguns têm YAML frontmatter (manifesto KartPOA), outros são prosa (README, doc de arranque). Extrair os mesmos campos dos dois.

## Campos a procurar

| Campo | Onde costuma estar | Usado para |
|---|---|---|
| `stack` (frontend/backend/banco/infra/contrato/mobile) | tabela "Stack e arquitetura", frontmatter `stack:` | disparar skills condicionais (taxonomia §2) |
| `dominio_de_negocio` / problema central / proposta de valor | "Identidade do projeto", one-liner | inferir skill(s) de domínio (taxonomia §3) |
| `roadmap` / épicos | tabela de épicos, "Roadmap" | priorização, confirmar que skills cobrem o roadmap |
| `idioma_do_time` | frontmatter, prosa | idioma de TODAS as skills geradas |
| `locais` / recursos | "Localização de recursos", frontmatter `locais:` | detectar gaps (repo, CI, host, Figma) |
| `skills_existentes` (se houver) | catálogo já curado | **ground truth** — comparar a proposta contra ele |
| nome / prefixo | nome de trabalho | prefixo `<proj>-` das skills |

## Tabela de prontidão

Mapear o estado de cada recurso (vocabulário comum nesses relatórios):

| Marca | Significado | Ação |
|---|---|---|
| ✅ / "feito" / "pronto" | existe | usar |
| 🟡 / "decidido" / "a abrir" | decidido, não implementado | skill pode assumir a decisão |
| ⬜ / "pendente" | falta | skill incluída, dependência anotada |
| `<PREENCHER>` / "a confirmar" | informação ausente | **gap** — triar |

## Triagem de gaps

**Bloqueante** (perguntar antes de prosseguir):
- idioma do time indefinível → não dá para escolher idioma das skills
- domínio de negócio obscuro → não dá para inferir skill de domínio nem prefixo

**Sinalizável** (não trava; registrar no `harness-report.md` como próximo passo):
- repositório git sem URL
- CI / host de produção a confirmar
- docs de compliance (LGPD/GDPR) não produzidos
- nome/domínio final em aberto

## Detecção de idioma

1. Campo explícito (`idioma_do_time: pt-BR`) vence.
2. Senão, inferir do idioma predominante da prosa do relatório.
3. Na dúvida entre dois, perguntar (bloqueante — afeta todas as skills).

## Saída desta fase

Um resumo estruturado em memória:
- prefixo `<proj>-`, idioma
- lista de sinais detectados (→ alimenta a taxonomia)
- substantivos de domínio (→ skill de domínio)
- gaps bloqueantes (perguntar) + sinalizáveis (registrar)
- se houver `skills_existentes`: guardar para comparar na verificação

## Exemplo — manifesto KartPOA (ground truth)

Sinais esperados: Next.js→`frontend-dev`; NestJS→`backend-dev`; Postgres+migrations→`migrations`; Docker/VPS/Ansible/Terraform→`infra`; OpenAPI contract-first→`contrato`/`tech-lead`; push assíncrono→`mensageria`; Figma+tokens→`ux-ui`+`design-sync`; LGPD→`compliance`/`ciberseguranca`; SEO/growth→`marketing`+`seo`; Playwright→`qa-lead`; mobile nativo→`mobile-dev`. Domínio: lotação/vagas/estados de corrida→`dominio-corridas`. Idioma: pt-BR. Gaps sinalizáveis: repo `<PREENCHER>`, CI/host, LGPD sem docs, nome final.

A proposta deve **reproduzir aproximadamente as 15 skills `kart-*`** já listadas no manifesto — se divergir muito, revisar a heurística antes de scaffoldar.
