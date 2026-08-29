#!/bin/bash
# Casa — cria os dois roles do ADR-0002. Roda uma única vez, no initdb do
# Postgres (datadir vazio). Depois disso, schema só muda por migration.
#
#   casa_owner → dono dos objetos. Usado SÓ pelo drizzle-kit, em deploy.
#   casa_app   → o pool da API. Sem BYPASSRLS, sem ser owner. Quem decide
#                acesso é a policy, não o handler.
#
# Não há ALTER DEFAULT PRIVILEGES aqui, e isso é deliberado: cada migration
# escreve seu próprio GRANT mínimo. Tabela sem grant quebra a API alto e cedo;
# um grant automático esconderia a tabela sem policy, que vaza em silêncio.
set -euo pipefail

psql -v ON_ERROR_STOP=1 \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" \
  -v owner_password="$CASA_OWNER_PASSWORD" \
  -v app_password="$CASA_APP_PASSWORD" \
  -v db_name="$POSTGRES_DB" <<'SQL'

CREATE ROLE casa_owner
  LOGIN PASSWORD :'owner_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION;

CREATE ROLE casa_app
  LOGIN PASSWORD :'app_password'
  NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS NOREPLICATION NOINHERIT;

-- Ninguém entra no banco por ser PUBLIC.
REVOKE ALL ON DATABASE :"db_name" FROM PUBLIC;
GRANT CONNECT ON DATABASE :"db_name" TO casa_owner, casa_app;
-- Só o owner cria schema: o migrator do drizzle registra o histórico em um
-- schema próprio (`drizzle`). casa_app fica só com CONNECT.
GRANT CREATE ON DATABASE :"db_name" TO casa_owner;

-- O schema público pertence ao owner de migration; a API só o enxerga.
ALTER SCHEMA public OWNER TO casa_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO casa_app;

-- Sem CREATE para casa_app: a API não altera schema, nem por acidente.

SQL
