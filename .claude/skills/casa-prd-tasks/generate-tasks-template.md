# Template — Geração de tasks por camada (Casa)

Entrada: um PRD aprovado. Saída: `docs/prds/EP-XX-<slug>/tasks.md`.

Gerar tasks **na ordem das camadas** — nunca camada N+1 antes de N existir.

## Camada 1 — Dados (Postgres/migrations)
- [ ] Migration: tabelas/colunas (reversível)
- [ ] Policies RLS (anonimização/ownership) — ver casa-seguranca-privacidade
- [ ] Seed/fixtures de teste

## Camada 2 — Backend (Supabase/Edge Functions)
- [ ] Regras de negócio server-side (cálculo de pontos, agregação de frustração)
- [ ] Edge Function + cron se houver job (notif, agregação)
- [ ] Canal Realtime se ao vivo

## Camada 3 — Client tipado
- [ ] Tipos gerados do Supabase atualizados
- [ ] Funções de acesso (sem lógica de negócio duplicada)

## Camada 4 — UI (Expo/RN)
- [ ] Telas/componentes a partir dos tokens Figma
- [ ] Estados vazio/carregando/erro
- [ ] Sem lógica de negócio na UI

## Camada 5 — Testes de intenção
- [ ] 1 teste por regra inviolável tocada (falha se regra quebrar)
- [ ] Transições de estado inválidas (domínio)

## Camada 6 — Docs
- [ ] ADR se houve decisão de arquitetura
- [ ] Atualizar README/KB

## Definition of Done da feature
Todas as camadas verdes + review tech-lead sem 🔴/🟡.
