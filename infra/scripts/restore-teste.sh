#!/usr/bin/env bash
# Prova que um backup restaura (DoD do Épico 0b). Sobe um Postgres descartável,
# sem rede, com os mesmos roles do initdb; restaura o dump nele pelo mesmo
# procedimento do restore de verdade; compara tabela por tabela e os grants do
# banco com o banco no ar; confere que a RLS voltou forçada. Não toca no
# banco de produção além de ler contagens.
#
#   infra/scripts/restore-teste.sh                 # o dump mais recente
#   infra/scripts/restore-teste.sh <arquivo.dump>
#
# Contagem diferente da do banco no ar é aviso, não falha: a casa pode ter
# concluído uma tarefa depois do dump. Falha é o restore errar, faltar tabela
# ou uma tabela voltar sem FORCE ROW LEVEL SECURITY, ou os grants do banco mudarem.
set -euo pipefail
cd "$(dirname "$0")/../.."
set -a; . infra/.env; set +a

DESTINO="${CASA_BACKUP_DIR:-/backups/casa}"
dump="${1:-$(ls -1t "$DESTINO"/casa_*.dump 2>/dev/null | head -1)}"
[ -n "$dump" ] && [ -f "$dump" ] || { echo "nenhum dump em $DESTINO" >&2; exit 1; }
echo "restaurando $dump"

C="docker compose -f infra/docker-compose.yml -f infra/docker-compose.prod.yml --env-file infra/.env"
descartavel="casa-restore-teste-$$"
trap 'docker rm -f "$descartavel" >/dev/null 2>&1 || true' EXIT

# Os roles precisam existir antes do restore (OWNER e GRANT do dump apontam
# para eles). Senhas aleatórias: ninguém conecta neste container pela rede.
senha() { openssl rand -hex 16; }
docker run -d --name "$descartavel" --network none \
  -e POSTGRES_USER="$POSTGRES_SUPERUSER" -e POSTGRES_PASSWORD="$(senha)" -e POSTGRES_DB="$POSTGRES_DB" \
  -e CASA_OWNER_PASSWORD="$(senha)" -e CASA_APP_PASSWORD="$(senha)" -e CASA_AUTH_PASSWORD="$(senha)" \
  -v "$PWD/infra/initdb:/docker-entrypoint-initdb.d:ro" \
  postgres:17.2-alpine >/dev/null

# pg_isready responde durante o initdb (servidor temporário); o "pronto" de
# verdade é o servidor final, depois do initdb, aceitando query.
for _ in $(seq 60); do
  if docker logs "$descartavel" 2>&1 | grep -q 'PostgreSQL init process complete' &&
    docker exec "$descartavel" pg_isready -q -U "$POSTGRES_SUPERUSER" -d "$POSTGRES_DB"; then
    break
  fi
  sleep 1
done

# O MESMO procedimento do restore de verdade (infra/README.md, "Produção"): o
# banco é recriado pelo dump, com --create. Só assim os grants de banco do
# 01-roles.sh (REVOKE de PUBLIC, CONNECT por role) voltam — e é isso que a
# comparação de datacl abaixo cobra.
docker exec "$descartavel" dropdb -U "$POSTGRES_SUPERUSER" "$POSTGRES_DB"
docker exec -i "$descartavel" pg_restore -U "$POSTGRES_SUPERUSER" -d postgres --create --exit-on-error <"$dump"

sql_restaurado() { docker exec "$descartavel" psql -tAX -U "$POSTGRES_SUPERUSER" -d "$POSTGRES_DB" -c "$1"; }
sql_no_ar() {
  $C exec -T -e PGPASSWORD="$POSTGRES_SUPERUSER_PASSWORD" postgres \
    psql -tAX -U "$POSTGRES_SUPERUSER" -d "$POSTGRES_DB" -c "$1"
}

tabelas="select relname from pg_class where relkind = 'r' and relnamespace = 'public'::regnamespace order by 1"
no_ar=$(sql_no_ar "$tabelas")
restauradas=$(sql_restaurado "$tabelas")
if [ "$no_ar" != "$restauradas" ]; then
  echo "FALHA: conjunto de tabelas diferente do banco no ar" >&2
  diff <(echo "$no_ar") <(echo "$restauradas") >&2 || true
  exit 1
fi

acl="select datacl from pg_database where datname = current_database()"
if [ "$(sql_no_ar "$acl")" != "$(sql_restaurado "$acl")" ]; then
  echo "FALHA: grants do banco diferentes do banco no ar ($(sql_restaurado "$acl"))" >&2
  exit 1
fi

sem_force=$(sql_restaurado "select count(*) from pg_class where relkind = 'r'
  and relnamespace = 'public'::regnamespace and not relforcerowsecurity")
if [ "$sem_force" != "0" ]; then
  echo "FALHA: $sem_force tabela(s) voltaram sem FORCE ROW LEVEL SECURITY" >&2
  exit 1
fi

printf '%-24s %10s %10s\n' tabela no_ar restaurado
avisos=0
for t in $restauradas; do
  a=$(sql_no_ar "select count(*) from public.\"$t\"")
  r=$(sql_restaurado "select count(*) from public.\"$t\"")
  marca=""
  if [ "$a" != "$r" ]; then marca="  ← mudou depois do dump?"; avisos=$((avisos + 1)); fi
  printf '%-24s %10s %10s%s\n' "$t" "$a" "$r" "$marca"
done

echo "Restore ok: $(echo "$restauradas" | wc -l) tabelas, grants do banco iguais, RLS forçada em todas, $avisos contagem(ns) diferente(s)."
