#!/usr/bin/env bash
# Casa — prova o contrato do ADR-0002 direto no catálogo do Postgres.
#
# Não é teste funcional: um pool conectado como superusuário passa em toda a
# suíte de endpoints e ainda assim deixa a RLS decorativa. Estas asserções são
# a única coisa que pega isso.
#
# Uso: infra/scripts/check-roles.sh   (a partir da raiz do repositório)
set -euo pipefail

cd "$(dirname "$0")/.."
[[ -f .env ]] && set -a && source .env && set +a

: "${POSTGRES_SUPERUSER:?defina POSTGRES_SUPERUSER (veja infra/.env.example)}"
: "${POSTGRES_DB:?defina POSTGRES_DB}"

falhas=0

exec_sql() {
  docker compose exec -T -e PGPASSWORD="$POSTGRES_SUPERUSER_PASSWORD" postgres \
    psql -tAX -U "$POSTGRES_SUPERUSER" -d "$POSTGRES_DB" -c "$1"
}

afirma() { # afirma <descrição> <esperado> <obtido>
  if [[ "$2" == "$3" ]]; then
    printf '  ok   %s\n' "$1"
  else
    printf '  FALHA %s (esperado %q, obtido %q)\n' "$1" "$2" "$3"
    falhas=$((falhas + 1))
  fi
}

echo "ADR-0002 — contrato de roles"

afirma "casa_app existe"            "1"  "$(exec_sql "select count(*) from pg_roles where rolname = 'casa_app'")"
afirma "casa_app sem BYPASSRLS"     "f"  "$(exec_sql "select rolbypassrls from pg_roles where rolname = 'casa_app'")"
afirma "casa_app não é superusuário" "f" "$(exec_sql "select rolsuper from pg_roles where rolname = 'casa_app'")"
afirma "casa_app não cria role"     "f"  "$(exec_sql "select rolcreaterole from pg_roles where rolname = 'casa_app'")"
afirma "casa_owner existe"          "1"  "$(exec_sql "select count(*) from pg_roles where rolname = 'casa_owner'")"
afirma "casa_owner sem BYPASSRLS"   "f"  "$(exec_sql "select rolbypassrls from pg_roles where rolname = 'casa_owner'")"
afirma "schema public é do casa_owner" "casa_owner" \
  "$(exec_sql "select nspowner::regrole::text from pg_namespace where nspname = 'public'")"
afirma "casa_app não cria no schema public" "f" \
  "$(exec_sql "select has_schema_privilege('casa_app', 'public', 'CREATE')")"

# casa_app dono de tabela burla a RLS mesmo sem BYPASSRLS. Vazio hoje, precisa
# continuar vazio depois de cada migration.
afirma "casa_app não é dono de nenhuma tabela" "0" \
  "$(exec_sql "select count(*) from pg_tables where schemaname = 'public' and tableowner = 'casa_app'")"

# Toda tabela sensível precisa de RLS. Enquanto não houver migration, a lista é
# vazia — o teste começa a valer sozinho quando a primeira tabela nascer.
sem_rls="$(exec_sql "select coalesce(string_agg(relname, ', '), '') from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity")"
afirma "nenhuma tabela sem RLS habilitada" "" "$sem_rls"

# Sem FORCE, a policy não vale para o dono da tabela — e migration/manutenção
# rodando como casa_owner passaria por cima dela sem avisar.
sem_force="$(exec_sql "select coalesce(string_agg(relname, ', '), '') from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity and not c.relforcerowsecurity")"
afirma "nenhuma tabela com RLS sem FORCE" "" "$sem_force"

if ((falhas > 0)); then
  echo
  echo "$falhas asserção(ões) falharam — o contrato do ADR-0002 está quebrado."
  exit 1
fi

echo
echo "Contrato íntegro."
