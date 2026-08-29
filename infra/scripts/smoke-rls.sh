#!/usr/bin/env bash
# Casa — prova que o substrato do ADR-0002 realmente nega, e não só existe.
#
# Cria uma tabela descartável com policy, tenta lê-la como casa_app com a
# identidade de OUTRO morador, e afirma que a policy — não um `if` — barra.
# Roda antes de existir qualquer endpoint: é o piso sobre o qual as migrations
# do Épico 1 vão assentar.
set -euo pipefail

cd "$(dirname "$0")/.."
[[ -f .env ]] && set -a && source .env && set +a

falhas=0

como_owner() {
  docker compose exec -T -e PGPASSWORD="$CASA_OWNER_PASSWORD" postgres \
    psql -tAX -v ON_ERROR_STOP=1 -U casa_owner -d "$POSTGRES_DB" -c "$1"
}
como_app() { # sem ON_ERROR_STOP: erro de permissão é resultado esperado
  docker compose exec -T -e PGPASSWORD="$CASA_APP_PASSWORD" postgres \
    psql -tAXq -U casa_app -d "$POSTGRES_DB" -c "$1" 2>&1
}

afirma() {
  if [[ "$2" == "$3" ]]; then printf '  ok   %s\n' "$1"
  else printf '  FALHA %s (esperado %q, obtido %q)\n' "$1" "$2" "$3"; falhas=$((falhas + 1)); fi
}
contem() {
  if [[ "$3" == *"$2"* ]]; then printf '  ok   %s\n' "$1"
  else printf '  FALHA %s (não contém %q em %q)\n' "$1" "$2" "$3"; falhas=$((falhas + 1)); fi
}

limpa() { como_owner "drop table if exists smoke_rls" >/dev/null 2>&1 || true; }
trap limpa EXIT

ANA='11111111-1111-1111-1111-111111111111'
BRU='22222222-2222-2222-2222-222222222222'

echo "ADR-0002 — negação por identidade"

como_owner "
  drop table if exists smoke_rls;
  create table smoke_rls (id serial primary key, autor uuid not null, texto text not null);
  -- Semear ANTES de forçar: com FORCE, a policy vale também para o owner, e um
  -- insert de seed sem identidade injetada é rejeitado. Vale para as migrations
  -- do Épico 1 que semeiam template por tipo de casa.
  insert into smoke_rls (autor, texto) values ('$ANA', 'da ana'), ('$BRU', 'do bruno');
  alter table smoke_rls enable row level security;
  -- FORCE: sem isto, o próprio owner lê tudo e um deploy que rodasse como owner
  -- em runtime tornaria a policy invisível.
  alter table smoke_rls force row level security;
  -- nullif() não é firula: depois que uma transação faz SET LOCAL e commita,
  -- o GUC volta como STRING VAZIA, não como NULL. Sem o nullif, ''::uuid lança
  -- 22P02 e a policy quebra em erro em vez de negar limpo — numa request real,
  -- 500 em vez de lista vazia.
  create policy so_o_autor on smoke_rls
    using (autor = nullif(current_setting('app.current_user_id', true), '')::uuid);
" >/dev/null

# 1. Sem GRANT, a API não alcança a tabela — falha alta e cedo.
contem "sem GRANT, casa_app é barrado" "permission denied" "$(como_app "select count(*) from smoke_rls")"

como_owner "grant select on smoke_rls to casa_app" >/dev/null

# 2. Com GRANT e sem identidade injetada, a policy não devolve nada.
afirma "sem app.current_user_id, zero linhas" "0" \
  "$(como_app "select count(*) from smoke_rls" | tr -d '[:space:]')"

# 3. Com a identidade da Ana, ela vê só o dela.
afirma "identidade da Ana vê 1 linha" "1" \
  "$(como_app "begin; set local role casa_app; set local app.current_user_id = '$ANA'; select count(*) from smoke_rls; commit;" | tr -d '[:space:]')"
afirma "e é a linha dela" "da ana" \
  "$(como_app "begin; set local app.current_user_id = '$ANA'; select texto from smoke_rls; commit;" | tr -d '\n')"

# 4. A linha do Bruno não é alcançável pela Ana nem por id direto — isto é IDOR.
afirma "Ana não alcança a linha do Bruno por id" "0" \
  "$(como_app "begin; set local app.current_user_id = '$ANA'; select count(*) from smoke_rls where autor = '$BRU'; commit;" | tr -d '[:space:]')"

# 5. SET LOCAL morre com a transação — identidade não vaza entre requests do
# pool, e o reset (para string vazia) nega em vez de estourar erro.
afirma "identidade não sobrevive à transação" "0" \
  "$(como_app "begin; set local app.current_user_id = '$ANA'; commit; select count(*) from smoke_rls;" | tr -d '[:space:]')"

if ((falhas > 0)); then
  echo; echo "$falhas asserção(ões) falharam — a RLS está decorativa."
  exit 1
fi
echo; echo "A policy nega. Não é a aplicação que está negando."
