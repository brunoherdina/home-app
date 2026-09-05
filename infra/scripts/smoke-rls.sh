#!/usr/bin/env bash
# Casa — prova que o substrato do ADR-0002 realmente nega, e não só existe.
#
# Duas partes:
#   1. Tabela descartável com policy — o piso do ADR-0002, sem depender de
#      nenhuma migration.
#   2. As tabelas REAIS do Épico 1 (ADR-0012/0013): duas casas, negação
#      cruzada entre elas via casa_atual(), e o limite por GRANT do casa_auth.
#      Exige a migration 0001 aplicada (npm run db:migrate -w @casa/api).
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
como_auth() { # idem: parte das asserções espera "permission denied"
  docker compose exec -T -e PGPASSWORD="$CASA_AUTH_PASSWORD" postgres \
    psql -tAXq -U casa_auth -d "$POSTGRES_DB" -c "$1" 2>&1
}
# Só para semear/limpar as fixtures do teste entre casas: FORCE RLS bloqueia
# até o casa_owner (nenhuma policy de INSERT se aplica a ele — de propósito), e
# o superusuário de bootstrap é a mesma classe de uso que backup/restore.
# Nunca em runtime.
como_admin() {
  docker compose exec -T -e PGPASSWORD="$POSTGRES_SUPERUSER_PASSWORD" postgres \
    psql -tAXq -v ON_ERROR_STOP=1 -U "$POSTGRES_SUPERUSER" -d "$POSTGRES_DB" -c "$1"
}

afirma() {
  if [[ "$2" == "$3" ]]; then printf '  ok   %s\n' "$1"
  else printf '  FALHA %s (esperado %q, obtido %q)\n' "$1" "$2" "$3"; falhas=$((falhas + 1)); fi
}
contem() {
  if [[ "$3" == *"$2"* ]]; then printf '  ok   %s\n' "$1"
  else printf '  FALHA %s (não contém %q em %q)\n' "$1" "$2" "$3"; falhas=$((falhas + 1)); fi
}

ANA='11111111-1111-1111-1111-111111111111'
BRU='22222222-2222-2222-2222-222222222222'
CARLA='33333333-3333-3333-3333-333333333333'
DORA='44444444-4444-4444-4444-444444444444'
CASA_A='aaaaaaaa-aaaa-4aaa-8aaa-000000000001'
CASA_B='bbbbbbbb-bbbb-4bbb-8bbb-000000000002'

limpa() {
  como_owner "drop table if exists smoke_rls" >/dev/null 2>&1 || true
  como_admin "delete from moradores where id in ('$ANA','$BRU','$CARLA','$DORA');
              delete from casas where id in ('$CASA_A','$CASA_B')" >/dev/null 2>&1 || true
}
trap limpa EXIT

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

# ─── ADR-0012/0013 — negação cruzada ENTRE CASAS (critério de aceite da
# story 1 do Épico 1). Agora nas tabelas REAIS: duas casas, um morador em cada
# (mais uma colega na casa A e uma conta ainda sem casa), e a prova de que a
# identidade de um não alcança nada da casa do outro — nem por id direto.
echo
echo "ADR-0012 — negação entre casas (moradores e casas reais)"

# Seed como superusuário: FORCE RLS barra o INSERT até do owner, e é assim que
# deve ser — nenhuma policy de escrita se aplica a casa_owner.
como_admin "
  delete from moradores where id in ('$ANA','$BRU','$CARLA','$DORA');
  delete from casas where id in ('$CASA_A','$CASA_B');
  insert into casas (id, nome, tipo) values
    ('$CASA_A', 'Casa A', 'casal'),
    ('$CASA_B', 'Casa B', 'republica');
  -- cor é TOKEN do design system, não #hex (ver schema.ts). Fixture com hex
  -- ensinaria o formato errado para quem copiar daqui.
  insert into moradores (id, casa_id, apelido, cor, email) values
    ('$ANA',   '$CASA_A', 'Ana',   'moss',  'ana.smoke@example.com'),
    ('$CARLA', '$CASA_A', 'Carla', 'amber', 'carla.smoke@example.com'),
    ('$BRU',   '$CASA_B', 'Bruno', 'coral', 'bruno.smoke@example.com'),
    ('$DORA',  null,      'Dora',  'lime',  'dora.smoke@example.com');
" >/dev/null

# 6. Mesma casa aparece; a outra casa é zero — nem por filtro explícito.
afirma "Ana vê os 2 moradores da casa dela" "2" \
  "$(como_app "begin; set local app.current_user_id = '$ANA'; select count(*) from moradores; commit;" | tr -d '[:space:]')"
afirma "com a identidade da Ana, zero moradores da casa B" "0" \
  "$(como_app "begin; set local app.current_user_id = '$ANA'; select count(*) from moradores where casa_id = '$CASA_B'; commit;" | tr -d '[:space:]')"
afirma "Ana vê 1 casa (a dela)" "1" \
  "$(como_app "begin; set local app.current_user_id = '$ANA'; select count(*) from casas; commit;" | tr -d '[:space:]')"
afirma "Ana não alcança a casa B nem por id" "0" \
  "$(como_app "begin; set local app.current_user_id = '$ANA'; select count(*) from casas where id = '$CASA_B'; commit;" | tr -d '[:space:]')"
afirma "no sentido inverso, Bruno vê só a si mesmo" "1" \
  "$(como_app "begin; set local app.current_user_id = '$BRU'; select count(*) from moradores; commit;" | tr -d '[:space:]')"
afirma "e não vê a casa A" "0" \
  "$(como_app "begin; set local app.current_user_id = '$BRU'; select count(*) from casas where id = '$CASA_A'; commit;" | tr -d '[:space:]')"

# 7. O predicado central do ADR-0012, direto na fonte.
afirma "casa_atual() devolve a casa da identidade injetada" "$CASA_A" \
  "$(como_app "begin; set local app.current_user_id = '$ANA'; select casa_atual()::text; commit;" | tr -d '[:space:]')"

# 8. Conta sem casa: casa_id null nunca casa com null — quem ainda não criou
# casa vê só a si mesmo, e casa nenhuma. Comportamento desejado, não acidente.
afirma "Dora (sem casa) vê só a si mesma" "1" \
  "$(como_app "begin; set local app.current_user_id = '$DORA'; select count(*) from moradores; commit;" | tr -d '[:space:]')"
afirma "e não vê casa nenhuma" "0" \
  "$(como_app "begin; set local app.current_user_id = '$DORA'; select count(*) from casas; commit;" | tr -d '[:space:]')"

# 9. Credencial não é coluna do casa_app: o grant por coluna barra ANTES da
# policy — nem a própria pessoa lê o próprio hash pela API.
contem "hash_senha não é coluna do casa_app" "permission denied" \
  "$(como_app "begin; set local app.current_user_id = '$ANA'; select hash_senha from moradores; commit;")"
contem "sessoes não é assunto do casa_app" "permission denied" \
  "$(como_app "select count(*) from sessoes")"

# 10. casa_auth (ADR-0013): lê credencial SEM identidade injetada — o limite
# dele é o GRANT por coluna, não a policy.
afirma "casa_auth lê credencial sem identidade" "ana.smoke@example.com" \
  "$(como_auth "select email from moradores where id = '$ANA'" | tr -d '[:space:]')"
contem "mas apelido não é assunto do auth" "permission denied" \
  "$(como_auth "select apelido from moradores")"
afirma "casa_auth alcança sessoes" "0" \
  "$(como_auth "select count(*) from sessoes" | tr -d '[:space:]')"
contem "casa_auth não alcança casas" "permission denied" \
  "$(como_auth "select count(*) from casas")"

if ((falhas > 0)); then
  echo; echo "$falhas asserção(ões) falharam — a RLS está decorativa."
  exit 1
fi
echo; echo "A policy nega. Não é a aplicação que está negando."
