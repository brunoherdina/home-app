# Infra — local (Épico 0a) e produção (Épico 0b)

Postgres, API e worker em container, com os roles do **ADR-0002** e do
**ADR-0013**. Local é o `docker-compose.yml` sozinho; produção é ele com o
`docker-compose.prod.yml` por cima, na VPS do improvisa-ai (**ADR-0014**) — ver
[Produção](#produção), no fim.

## Subir

```bash
cp infra/.env.example infra/.env   # preencher as quatro senhas e as três URLs
npm run db:up                      # sobe só o Postgres
```

`api` e `worker` estão no profile `app` e ficam de fora por padrão. O fluxo de
desenvolvimento é banco no container e API no host, com hot reload:

```bash
npm run dev -w @casa/api
```

Para conferir paridade com produção (a API dentro do container, como vai rodar
no 0b):

```bash
cd infra && docker compose --env-file .env --profile app up -d --build
```

O `infra/.env` é gitignorado. As senhas nascem com `openssl rand -hex 24` — hex,
não base64: um `/` na senha quebra a URL do Postgres.

> A porta é **5433** por padrão — 5432 costuma já estar ocupada por outro
> projeto na mesma máquina. Está presa ao loopback e só existe no 0a: em
> produção o Postgres não publica porta nenhuma.

## Provar o contrato

```bash
npm run check:roles       # o catálogo confere com o ADR-0002
npm run check:rls         # a policy realmente nega
npm run check:migration   # up → down → up: o down.sql não é decorativo
npm run verify            # os três + guardas de camada + typecheck
```

Todos rodam contra o Postgres do compose, e é essa a graça: mock de RLS não
prova nada. Rodar depois de **toda** migration — `check-roles.sh` afirma que
nenhuma tabela nasceu sem RLS, que nenhuma RLS ficou sem `FORCE`, e que
`casa_app` não virou dona de nada.

O contrato também é checado no boot da API: se o pool conectar como
superusuário, com `BYPASSRLS` ou como dono de tabela, o processo **não sobe**
(`afirmaContratoDeRls`, em `apps/api/src/db/pool.ts`).

## Os quatro roles

| Role | Quem usa | Pode |
|---|---|---|
| `casa_admin` (superusuário) | só o initdb e o backup/restore | tudo — nunca em runtime |
| `casa_owner` | drizzle-kit, em deploy de migration | criar/alterar schema |
| `casa_app` | o pool da API, nas rotas COM identidade | DML nas tabelas que receberam `GRANT`, sob a policy |
| `casa_auth` | o pool das rotas SEM identidade — `register`/`login`/`refresh` (ADR-0013) | só credencial, `sessoes` e `revoked_tokens` |

`casa_app` e `casa_auth` são `NOBYPASSRLS`, não são donos de tabela e não têm
`CREATE` no schema. Não existe `ALTER DEFAULT PRIVILEGES`: cada migration
escreve seu `GRANT` mínimo. Tabela sem grant quebra a API alto e cedo; grant
automático esconderia a tabela sem policy, que vaza calada.

`casa_auth` tem pool e senha próprios (`AUTH_DATABASE_URL`) em vez de
`GRANT casa_auth TO casa_app`: se `casa_app` pudesse virar `casa_auth` por
`SET ROLE`, qualquer handler escalaria sozinho e o limite viraria convenção.
O raio dele é o `GRANT` — inclusive **por coluna** em `moradores`, porque a
policy dele é `USING (true)`: antes do login não há identidade para escopar.

> [!warning] `initdb/` só roda em volume vazio
> Quem já tinha o Postgres de pé antes de um role novo aparecer no
> `01-roles.sh` **não** ganha o role rodando `npm run db:up` — o initdb do
> Postgres só executa em datadir vazio. Ou recria o volume, ou cria o role à
> mão no banco em execução, com a mesma definição do script e a senha que
> estiver no `.env`. Foi o caso do `casa_auth` quando o ADR-0013 chegou.
> `npm run check:roles` é o que denuncia a divergência.

## Duas armadilhas que o smoke test já pagou

1. **`FORCE ROW LEVEL SECURITY` vale também para o owner.** É o que se quer — um
   processo que rodasse como owner em runtime não veria a policy. Consequência
   prática: **seed antes de forçar**, senão o próprio `INSERT` da migration é
   rejeitado (vale para o template por tipo de casa, no Épico 1).
2. **`SET LOCAL` reseta o GUC para string vazia, não para `NULL`.** Policy escrita
   como `current_setting('app.current_user_id', true)::uuid` funciona na primeira
   transação e depois estoura `22P02` — 500 em vez de lista vazia. Forma correta:

   ```sql
   using (autor = nullif(current_setting('app.current_user_id', true), '')::uuid)
   ```

## Migrations

Rodam como `casa_owner`, nunca pelo processo da API:

```bash
npm run db:generate -w @casa/api   # drizzle-kit gera o .sql
# escrever à mão: policy, GRANT e o 000X_nome.down.sql
npm run db:migrate -w @casa/api
npm run check:migration
```

O drizzle-kit não gera `down` (ADR-0005). O `down.sql` ao lado do gerado é a
disciplina; o teste up → down → up é o que a torna cobrável.

## Produção

VPS Hostinger do improvisa-ai (`2.25.204.192`), dividida com o improvisa e o
site da Prumoz (**ADR-0014**). Quem escuta na internet é o nginx do repositório
`vps-edge`; o Casa não publica porta nenhuma. A API entra na rede Docker `edge`
como `casa-api` e o proxy a serve em `https://casa.prumoz.com.br/api/`.

| O quê | Onde |
|---|---|
| Código e `infra/.env` (600) | `/opt/casa`, do usuário `deploy` |
| Site no proxy | `vps-edge/nginx/sites/prumoz-casa.conf` |
| Certificado | `/etc/letsencrypt/live/casa.prumoz.com.br/` (certbot do host, HTTP-01) |
| Backups | `/backups/casa/casa_*.dump`, 14 dias, log em `backup.log` |
| Deploy automático | `.github/workflows/deploy-vps.yml` (push na `main`) |

### Deploy

```bash
bash infra/scripts/deploy-vps.sh   # em /opt/casa, depois do git merge --ff-only
```

Build → migration **sozinha** (como `casa_owner`) → troca api e worker →
`/api/saude` pela rede `edge` respondendo como `casa_app`. Migration que falha
para o deploy com a API antiga no ar. **Nunca** `docker compose up` direto em
produção: o `up` recria a API antes de esperar a migration, e uma migration
quebrada derruba o app (medido).

### Backup e restore

```bash
infra/scripts/backup-vps.sh     # cron do deploy: 30 3 * * *
infra/scripts/restore-teste.sh  # restaura o mais recente num Postgres descartável
```

O `restore-teste` restaura sem rede, compara a contagem de linhas tabela por
tabela com o banco no ar e confere que nenhuma tabela voltou sem `FORCE ROW
LEVEL SECURITY`. Rodar depois de toda mudança de schema que mexa em role ou
policy, e de tempos em tempos — backup sem restore testado não é backup.

> [!warning] O dump existe só na VPS
> Risco aceito em 2026-10-26 (ADR-0014): perder a VPS é perder os dados de todas
> as casas. Rever antes de abrir o app para fora do círculo de teste.

Restaurar **de verdade** (perda de dados, não teste): parar api e worker,
recriar o banco e restaurar como superusuário.

```bash
C="docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml --env-file infra/.env"
set -a; . infra/.env; set +a
$C stop api worker
$C exec -T postgres dropdb -U "$POSTGRES_SUPERUSER" "$POSTGRES_DB"
$C exec -T postgres pg_restore -U "$POSTGRES_SUPERUSER" -d postgres --create --exit-on-error < /backups/casa/<arquivo>.dump
bash infra/scripts/check-roles.sh  # o contrato do ADR-0002 voltou inteiro?
$C up -d api worker
```

Os roles são do cluster, não do banco: sobrevivem ao `dropdb`. O `REVOKE ...
FROM PUBLIC` e o `GRANT CONNECT` do `01-roles.sh` são do banco, e só voltam
porque o banco é recriado PELO dump (`--create`, conectando em `postgres`).
`createdb` + `pg_restore -d casa` restaura as tabelas e perde esses grants em
silêncio. Procedimento provado em 2026-10-26 na pilha de produção local.

### Primeira subida (uma vez)

1. DNS: registro `A` de `casa.prumoz.com.br` → `2.25.204.192` no hPanel da Hostinger.
2. VPS: `/opt` é do root — `sudo install -d -o deploy -g deploy /opt/casa`. Depois,
   como `deploy`: `git init /opt/casa`; da máquina local, `git push
   deploy@<vps>:/opt/casa <commit>:refs/remotes/origin/main`; na VPS,
   `git checkout -b main origin/main` (o mesmo desenho do prumoz-site e do vps-edge:
   sem remote, a VPS não fala com o GitHub).
3. `infra/.env` a partir do `.env.example`, com `chmod 600`. Segredos gerados
   **na própria VPS** (`openssl rand -hex 24`, `-hex 48` para o JWT), nunca
   colados de outro lugar. `NODE_ENV=production`.
4. `bash infra/scripts/deploy-vps.sh` — o initdb cria os roles no volume vazio.
5. `vps-edge`: `prumoz-casa.conf` só com a porta 80 → `bash scripts/deploy.sh`
   lá → `certbot certonly --webroot -w /var/www/certbot --cert-name
   casa.prumoz.com.br -d casa.prumoz.com.br` (root) → descomentar o bloco 443 →
   deploy do vps-edge de novo.
6. Cron do backup (`crontab -e` do `deploy`) e um `restore-teste.sh` depois do
   primeiro dump.
7. Workflow: chave SSH só deste deploy no `authorized_keys` do `deploy`
   (comentário `casa-deploy`), e os segredos `VPS_HOST`, `VPS_SSH_KEY`,
   `VPS_KNOWN_HOSTS` no repositório do GitHub.

### Trocar um segredo

- `JWT_SECRET`: editar o `.env` e `deploy-vps.sh`. **Desloga todo mundo** — é o
  desenho, é assim que se revoga em massa.
- Senha de role: `ALTER ROLE ... PASSWORD` como superusuário **e** o `.env`, no
  mesmo deploy. O initdb não roda de novo: mudar só o `.env` deixa a API sem
  conectar.

## Ainda não está aqui

Provedor de e-mail (a verificação gerada no Épico 1 ainda vai para o log), cópia
do backup fora da VPS (risco aceito, ADR-0014) e o gate de testes antes do
deploy. A imagem da API roda `tsx` direto em produção — trocar por build
compilado quando o tamanho importar, não antes.
