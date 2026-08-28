---
name: casa-infra-deploy
description: "Infraestrutura e deploy do Casa — Docker Compose (postgres + api + worker + caddy) em VPS, roles do banco, TLS, backup/restore, segredos e CI. Usar quando a tarefa envolve container, compose, deploy, variável de ambiente, backup, TLS, ou operação do servidor."
---

# Infra & Deploy — Casa

Persona: engenheiro de operação. O Casa deixou de ser BaaS — backup, TLS e restore agora são
responsabilidade nossa, e falham em silêncio quando ninguém é dono deles.

## Ler primeiro

1. [ADR-0001 e ADR-0002](../../../casa-decisoes-produto.md) — por que existe VPS, e o contrato de roles
2. [casa-arquitetura](../casa-arquitetura/SKILL.md) — camadas e DoD
3. [Handoff §9](../../../casa-handoff-stack-expo.md) — armadilhas de EAS e de deploy

## Dois momentos, um compose

O Épico 0 foi cortado em **0a (local)** e **0b (produção)**. O mesmo `docker-compose.yml` serve os
dois — muda o env e o serviço `caddy`, que só existe em produção. No 0a valem os roles, o volume e a
ausência de porta publicada; TLS, backup offsite e CI são do 0b, que precisa fechar **antes do convite
do Épico 2**, quando a segunda pessoa passa a precisar alcançar a API.

## Topologia

Um `docker compose` na VPS, quatro serviços:

| Serviço | Papel | Exposto? |
|---|---|---|
| `postgres` | dados + RLS | **não** — só rede interna |
| `api` | Fastify (HTTP + WebSocket) | via Caddy |
| `worker` | cron: notificações, agregação, limpeza de `jti` | não |
| `caddy` | reverse proxy + TLS automático | 80/443 |

## Regras

- **Postgres nunca publica porta no host.** `ports: 5432` é o erro mais comum e mais caro — expõe o
  banco à internet e transforma a RLS na única coisa entre um scanner e os dados da casa.
- **Volume nomeado** para o datadir. Bind mount em host com UID diferente quebra permissão.
- **Dois roles, papéis distintos** (ADR-0002): owner (só migration, via drizzle-kit) e `casa_app`
  (a API, **sem `BYPASSRLS`**, sem ser owner). Criar os dois no bootstrap — depois vira mutirão.
- **Migration roda como job de deploy**, com o role owner. Nunca pelo processo da API.
- **Segredos por variável de ambiente**, fora do repositório: `DATABASE_URL`, `JWT_SECRET`,
  credenciais de OAuth e de e-mail. Trocar o `JWT_SECRET` desloga todo mundo — é o desenho, é assim
  que se revoga em massa.
- **Imagens com tag fixa**, não `latest`. Update é ação deliberada, com changelog lido.

## Backup

- `pg_dump` agendado + destino **offsite**. Dump que só existe na mesma VPS não sobrevive à perda da
  VPS.
- **Backup sem restore testado não é backup.** Restaurar num container descartável e conferir
  contagem de linhas faz parte do DoD, não do "depois".
- Documentar o restore no runbook — a hora de descobrir o comando não é durante o incidente.

## Definition of Done

- [ ] `docker compose up -d` sobe os quatro serviços do zero
- [ ] Postgres sem porta publicada; só o Caddy escuta na internet
- [ ] Roles owner e `casa_app` criados, `casa_app` sem `BYPASSRLS` (verificado no `pg_roles`)
- [ ] TLS válido pelo Caddy
- [ ] `pg_dump` agendado **e um restore executado com sucesso ao menos uma vez**
- [ ] Nenhum segredo no repositório ou no bundle do app
- [ ] Healthcheck da API e política de restart definidos

## Contexto adicional

Build mobile (EAS) tem armadilhas próprias — `npx eas-cli` sempre (conflito de peer com TypeScript 6),
`android/`/`ios/` fora do repositório, config dinâmica que o EAS não escreve. Ver handoff §9.
Documentação do runbook: [casa-tech-writer](../casa-tech-writer/SKILL.md).
