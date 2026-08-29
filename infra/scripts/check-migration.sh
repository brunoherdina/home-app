#!/usr/bin/env bash
# Casa — prova que a migration é reversível: up → down → up no banco local.
#
# O drizzle-kit não gera down (ADR-0005). A reversibilidade deixou de ser
# garantia da ferramenta e virou disciplina; este script é o que a torna
# cobrável. Roda depois de toda migration nova.
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$RAIZ/infra"
[[ -f .env ]] && set -a && source .env && set +a

: "${POSTGRES_DB:?defina POSTGRES_DB}"
: "${CASA_OWNER_PASSWORD:?defina CASA_OWNER_PASSWORD}"

MIGRATIONS="$RAIZ/apps/api/src/db/migrations"
falhas=0

# Migration roda como casa_owner. Nunca como casa_app (que não altera schema) e
# nunca como superusuário.
como_owner() {
  docker compose exec -T -e PGPASSWORD="$CASA_OWNER_PASSWORD" postgres \
    psql -tAXq -v ON_ERROR_STOP=1 -U casa_owner -d "$POSTGRES_DB" "$@"
}

afirma() { # afirma <descrição> <esperado> <obtido>
  if [[ "$2" == "$3" ]]; then
    printf '  ok   %s\n' "$1"
  else
    printf '  FALHA %s (esperado %q, obtido %q)\n' "$1" "$2" "$3"
    falhas=$((falhas + 1))
  fi
}

aplica_up() {
  (cd "$RAIZ" && npm run --silent db:migrate -w @casa/api >/dev/null)
}

aplica_down() {
  # Ordem inversa dos arquivos: o down mais novo primeiro.
  local arquivo
  for arquivo in $(ls -r "$MIGRATIONS"/*.down.sql); do
    como_owner -f - < "$arquivo" >/dev/null
  done
  # O migrator do drizzle registra o que já aplicou; sem limpar, o próximo up
  # acha que não há nada a fazer e o teste passaria sem testar nada.
  como_owner -c "truncate table drizzle.__drizzle_migrations" >/dev/null
}

estrutura() { # asserções que valem depois de todo up
  afirma "tabela moradores existe" "1" \
    "$(como_owner -c "select count(*) from pg_tables where schemaname='public' and tablename='moradores'")"
  afirma "moradores com RLS habilitada" "t" \
    "$(como_owner -c "select relrowsecurity from pg_class where relname='moradores'")"
  afirma "moradores com FORCE RLS" "t" \
    "$(como_owner -c "select relforcerowsecurity from pg_class where relname='moradores'")"
  afirma "duas policies em moradores" "2" \
    "$(como_owner -c "select count(*) from pg_policies where tablename='moradores'")"
  afirma "policy lê a identidade com nullif" "2" \
    "$(como_owner -c "select count(*) from pg_policies where tablename='moradores' and qual ilike '%nullif%'")"
  afirma "casa_app pode ler" "t" \
    "$(como_owner -c "select has_table_privilege('casa_app','moradores','SELECT')")"
  # Sem INSERT de propósito: criar morador é parte da auth do Épico 1.
  afirma "casa_app não pode inserir" "f" \
    "$(como_owner -c "select has_table_privilege('casa_app','moradores','INSERT')")"
  afirma "moradores não é do casa_app" "casa_owner" \
    "$(como_owner -c "select tableowner from pg_tables where tablename='moradores'")"
}

echo "ADR-0005 — migration reversível (up → down → up)"

echo "up (1/2)"
aplica_up
estrutura

echo "down"
aplica_down
afirma "moradores não existe mais" "0" \
  "$(como_owner -c "select count(*) from pg_tables where schemaname='public' and tablename='moradores'")"
afirma "nenhuma policy órfã" "0" \
  "$(como_owner -c "select count(*) from pg_policies where tablename='moradores'")"

echo "up (2/2)"
aplica_up
estrutura

if ((falhas > 0)); then
  echo
  echo "$falhas asserção(ões) falharam — a migration não é reversível."
  exit 1
fi

echo
echo "up → down → up limpo. O down.sql não é decorativo."
