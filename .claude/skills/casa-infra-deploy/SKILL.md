---
name: casa-infra-deploy
description: "Infraestrutura e deploy do Casa — Docker Compose (postgres + api + worker + migrate) na VPS do improvisa-ai, atrás do nginx do vps-edge; roles do banco, TLS, backup/restore, segredos e CI. Usar quando a tarefa envolve container, compose, deploy, variável de ambiente, backup, TLS, ou operação do servidor."
---

# Infra & Deploy — Casa

Persona: engenheiro de operação. O Casa deixou de ser BaaS — backup, TLS e restore agora são
responsabilidade nossa, e falham em silêncio quando ninguém é dono deles.

## Ler primeiro

1. [ADR-0001, ADR-0002 e ADR-0014](../../../casa-decisoes-produto.md) — por que existe VPS, o contrato de
   roles e onde a produção roda (VPS do `improvisa-ai`, atrás do `vps-edge`)
2. [casa-arquitetura](../casa-arquitetura/SKILL.md) — camadas e DoD
3. [Handoff §9](../../../casa-handoff-stack-expo.md) — armadilhas de EAS e de deploy

## Dois momentos, um compose

O Épico 0 foi cortado em **0a (local)** e **0b (produção)**. O mesmo `infra/docker-compose.yml` serve
os dois; produção sobrepõe `infra/docker-compose.prod.yml` (zera portas e profile, põe a API na rede
`edge`, acrescenta o `migrate` e os limites de memória). No 0a valem os roles, o volume e a
ausência de porta publicada; TLS, backup offsite e CI são do 0b, que precisa fechar **antes do convite
do Épico 2**, quando a segunda pessoa passa a precisar alcançar a API.

## Topologia

A VPS é **compartilhada** com o `improvisa-ai` e o `prumoz-site` (ADR-0014). Quem escuta na internet é
o nginx do repositório `vps-edge` (`~/code/vps-edge`), dono das portas 80/443 e dos certificados (certbot
do host). O Casa é um `docker compose` em `/opt/casa`:

| Serviço | Papel | Exposto? |
|---|---|---|
| `postgres` | dados + RLS | **não** — só a rede do compose; fora da `edge` |
| `migrate` | job one-shot de migration, como `casa_owner` | não |
| `api` | Fastify (HTTP + WebSocket) | rede `edge`, alias `casa-api`; o nginx publica em `casa.prumoz.com.br` |
| `worker` | cron: notificações, agregação, limpeza de `jti` | não |

Site no proxy: `vps-edge/nginx/sites/prumoz-casa.conf` — **não** `casa.conf`, que pela ordem alfabética
viraria o servidor padrão da porta. O bloco 443 só entra depois que o certificado existir:
`ssl_certificate` apontando para arquivo inexistente derruba **todos** os sites da VPS.

## Regras

- **Nada do Casa publica porta no host.** `ports: 5432` é o erro mais comum e mais caro — expõe o
  banco à internet e transforma a RLS na única coisa entre um scanner e os dados da casa. E porta
  publicada pelo Docker **passa por cima do UFW** da VPS.
- **Deploy é `infra/scripts/deploy-vps.sh`, nunca `up` direto.** O script roda a migration sozinha e só
  troca a API se ela passar; o `depends_on` não protege isso (o `up` recria a API antes de esperar a
  migration — medido em 2026-10-26).
- **Atrás do proxy, o IP do cliente vem do `X-Forwarded-For` que o nginx sobrescreve**
  (`PROXY_CONFIAVEL=uniquelocal`). Sem isso, o rate limit por IP vira um balde só para todo mundo.
- **Limite de memória em todo serviço.** O vizinho (worker de áudio do improvisa) não tem limite; sem
  teto, o OOM pode escolher o nosso Postgres.
- **Volume nomeado** para o datadir. Bind mount em host com UID diferente quebra permissão.
- **Dois roles, papéis distintos** (ADR-0002): owner (só migration, via drizzle-kit) e `casa_app`
  (a API, **sem `BYPASSRLS`**, sem ser owner). Criar os dois no bootstrap — depois vira mutirão.
- **Migration roda como job de deploy**, com o role owner. Nunca pelo processo da API.
- **Segredos por variável de ambiente**, fora do repositório: `DATABASE_URL`, `JWT_SECRET`,
  credenciais de OAuth e de e-mail. Trocar o `JWT_SECRET` desloga todo mundo — é o desenho, é assim
  que se revoga em massa.
- **Imagens com tag fixa**, não `latest`. Update é ação deliberada, com changelog lido.

## Backup

- `pg_dump` diário (`infra/scripts/backup-vps.sh`, cron do `deploy`) em `/backups/casa`, 14 dias.
- **Hoje o dump existe só na VPS — risco aceito no ADR-0014 (2026-10-26).** Dump que só existe na mesma
  VPS não sobrevive à perda da VPS. Rever antes de abrir o app para fora do círculo de teste.
- **Backup sem restore testado não é backup.** `infra/scripts/restore-teste.sh` restaura num
  container descartável, compara a contagem de linhas e confere a RLS forçada. Faz parte do DoD, não
  do "depois".
- Documentar o restore no runbook — a hora de descobrir o comando não é durante o incidente.

## Definition of Done

- [ ] `docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d` sobe tudo do zero
- [ ] Nenhuma porta publicada pelo Casa; só o nginx do `vps-edge` escuta na internet
- [ ] Roles owner e `casa_app` criados, `casa_app` sem `BYPASSRLS` (verificado no `pg_roles`)
- [ ] TLS válido em `casa.prumoz.com.br` (certbot do host)
- [ ] `pg_dump` agendado **e um restore executado com sucesso ao menos uma vez**
- [ ] Rate limit por pessoa atrás do proxy (`PROXY_CONFIAVEL`), provado por `src/proxy.integracao.test.ts`
- [ ] Nenhum segredo no repositório ou no bundle do app
- [ ] Healthcheck da API e política de restart definidos

## Contexto adicional

Build mobile (EAS) tem armadilhas próprias — `npx eas-cli` sempre (conflito de peer com TypeScript 6),
`android/`/`ios/` fora do repositório, config dinâmica que o EAS não escreve. Ver handoff §9.
Documentação do runbook: [casa-tech-writer](../casa-tech-writer/SKILL.md).
