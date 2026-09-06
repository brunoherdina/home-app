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
  # ── 0000 + 0001: toda tabela nasce com RLS, FORCE e dono casa_owner.
  local tabela
  for tabela in moradores casas sessoes revoked_tokens convites; do
    afirma "tabela $tabela existe" "1" \
      "$(como_owner -c "select count(*) from pg_tables where schemaname='public' and tablename='$tabela'")"
    afirma "$tabela com RLS habilitada" "t" \
      "$(como_owner -c "select relrowsecurity from pg_class where relname='$tabela'")"
    afirma "$tabela com FORCE RLS" "t" \
      "$(como_owner -c "select relforcerowsecurity from pg_class where relname='$tabela'")"
    afirma "$tabela não é do casa_app" "casa_owner" \
      "$(como_owner -c "select tableowner from pg_tables where tablename='$tabela'")"
  done

  # ── moradores (0000 + as policies novas de 0001)
  afirma "quatro policies em moradores (2 de 0000 + mesma_casa + casa_auth)" "4" \
    "$(como_owner -c "select count(*) from pg_policies where tablename='moradores'")"
  afirma "as policies de identidade leem com nullif" "2" \
    "$(como_owner -c "select count(*) from pg_policies where tablename='moradores' and qual ilike '%nullif%'")"
  # O grant de 0001 é POR COLUNA: convivência para casa_app, credencial para
  # casa_auth. has_table_privilege não enxerga grant de coluna — as asserções
  # descem ao nível certo.
  afirma "casa_app lê apelido" "t" \
    "$(como_owner -c "select has_column_privilege('casa_app','moradores','apelido','SELECT')")"
  afirma "casa_app NÃO lê hash_senha" "f" \
    "$(como_owner -c "select has_column_privilege('casa_app','moradores','hash_senha','SELECT')")"
  afirma "casa_auth lê hash_senha" "t" \
    "$(como_owner -c "select has_column_privilege('casa_auth','moradores','hash_senha','SELECT')")"
  afirma "casa_auth NÃO lê apelido" "f" \
    "$(como_owner -c "select has_column_privilege('casa_auth','moradores','apelido','SELECT')")"
  # ── 0002: o register (story 4) concede INSERT ao casa_auth, por coluna.
  afirma "casa_auth insere email em moradores" "t" \
    "$(como_owner -c "select has_column_privilege('casa_auth','moradores','email','INSERT')")"
  # A assimetria que o grant de coluna torna possível: escrever a primeira
  # versão do próprio perfil sem poder ler o perfil dos outros.
  afirma "casa_auth escreve apelido mas não o lê" "t" \
    "$(como_owner -c "select has_column_privilege('casa_auth','moradores','apelido','INSERT') and not has_column_privilege('casa_auth','moradores','apelido','SELECT')")"
  # casa_id fora do grant: entrar numa casa é a story 6, e um bug em /api/auth
  # não consegue enfiar ninguém numa casa alheia se o privilégio não existe.
  afirma "casa_auth NÃO insere casa_id" "f" \
    "$(como_owner -c "select has_column_privilege('casa_auth','moradores','casa_id','INSERT')")"
  afirma "casa_app não insere em moradores" "f" \
    "$(como_owner -c "select has_table_privilege('casa_app','moradores','INSERT') or has_any_column_privilege('casa_app','moradores','INSERT')")"

  # ── casa_atual() (ADR-0012)
  afirma "casa_atual() existe" "1" \
    "$(como_owner -c "select count(*) from pg_proc where proname='casa_atual'")"
  afirma "casa_atual() é security definer" "t" \
    "$(como_owner -c "select prosecdef from pg_proc where proname='casa_atual'")"
  afirma "casa_atual() com search_path fixo" "t" \
    "$(como_owner -c "select coalesce(array_to_string(proconfig, ',') like '%search_path=public, pg_temp%', false) from pg_proc where proname='casa_atual'")"
  afirma "casa_app executa casa_atual()" "t" \
    "$(como_owner -c "select has_function_privilege('casa_app','casa_atual()','EXECUTE')")"

  # ── casas: casa_app só lê. A segunda policy é a de INSERT do casa_owner, que
  # existe só para o INSERT de dentro de cria_casa() passar pelo FORCE RLS
  # (0003) — casa_app continua sem INSERT, que é o ponto.
  afirma "duas policies em casas" "2" \
    "$(como_owner -c "select count(*) from pg_policies where tablename='casas'")"
  afirma "casa_app lê casas" "t" \
    "$(como_owner -c "select has_table_privilege('casa_app','casas','SELECT')")"
  afirma "casa_app não insere casas" "f" \
    "$(como_owner -c "select has_table_privilege('casa_app','casas','INSERT')")"

  # ── story 6: entrar numa casa não é UPDATE, é cria_casa(). O privilégio que
  # NÃO existe é a asserção mais importante daqui: com UPDATE em casa_id, a
  # policy "atualiza a si mesmo" viraria porta para entrar em casa alheia.
  afirma "casa_app NÃO escreve casa_id" "f" \
    "$(como_owner -c "select has_column_privilege('casa_app','moradores','casa_id','UPDATE')")"
  afirma "cria_casa() existe" "1" \
    "$(como_owner -c "select count(*) from pg_proc where proname='cria_casa'")"
  afirma "cria_casa() é security definer" "t" \
    "$(como_owner -c "select prosecdef from pg_proc where proname='cria_casa'")"
  afirma "cria_casa() com search_path fixo" "t" \
    "$(como_owner -c "select coalesce(array_to_string(proconfig, ',') like '%search_path=public, pg_temp%', false) from pg_proc where proname='cria_casa'")"
  afirma "cria_casa() não é executável por PUBLIC" "f" \
    "$(como_owner -c "select has_function_privilege('public','cria_casa(text,tipo_de_casa)','EXECUTE')")"
  afirma "casa_app executa cria_casa()" "t" \
    "$(como_owner -c "select has_function_privilege('casa_app','cria_casa(text,tipo_de_casa)','EXECUTE')")"

  # ── tarefas: dado da casa, escopado pelo mesmo casa_atual().
  afirma "duas policies em tarefas" "2" \
    "$(como_owner -c "select count(*) from pg_policies where tablename='tarefas'")"
  afirma "casa_app lê e semeia tarefas" "t" \
    "$(como_owner -c "select has_table_privilege('casa_app','tarefas','SELECT') and has_table_privilege('casa_app','tarefas','INSERT')")"
  # Concluir e apagar tarefa são o Épico 2 — chegam com o fluxo.
  afirma "casa_app não atualiza nem deleta tarefas" "f" \
    "$(como_owner -c "select has_table_privilege('casa_app','tarefas','UPDATE') or has_table_privilege('casa_app','tarefas','DELETE')")"
  afirma "casa_auth não alcança tarefas" "f" \
    "$(como_owner -c "select has_table_privilege('casa_auth','tarefas','SELECT')")"

  # ── 0005: convites. Duas policies para casa_app (ler os da casa, criar para a
  # própria casa) e duas para casa_owner — estas últimas existem só porque o
  # FORCE RLS sujeita o definer de entra_na_casa() às policies da tabela.
  afirma "quatro policies em convites" "4" \
    "$(como_owner -c "select count(*) from pg_policies where tablename='convites'")"
  afirma "casa_app lê e cria convites" "t" \
    "$(como_owner -c "select has_table_privilege('casa_app','convites','SELECT') and has_table_privilege('casa_app','convites','INSERT')")"
  # A ausência é o ponto: sem UPDATE, marcar (ou desmarcar) um convite como
  # usado só acontece dentro de entra_na_casa().
  afirma "casa_app não consome nem apaga convite direto" "f" \
    "$(como_owner -c "select has_table_privilege('casa_app','convites','UPDATE') or has_table_privilege('casa_app','convites','DELETE')")"
  afirma "casa_auth não alcança convites" "f" \
    "$(como_owner -c "select has_table_privilege('casa_auth','convites','SELECT')")"

  # ── entra_na_casa(): a SEGUNDA porta para um morador passar a ter casa, com
  # as mesmas defesas de cria_casa() — e o mesmo privilégio ausente no casa_app.
  afirma "entra_na_casa() existe" "1" \
    "$(como_owner -c "select count(*) from pg_proc where proname='entra_na_casa'")"
  afirma "entra_na_casa() é security definer" "t" \
    "$(como_owner -c "select prosecdef from pg_proc where proname='entra_na_casa'")"
  afirma "entra_na_casa() com search_path fixo" "t" \
    "$(como_owner -c "select coalesce(array_to_string(proconfig, ',') like '%search_path=public, pg_temp%', false) from pg_proc where proname='entra_na_casa'")"
  afirma "entra_na_casa() não é executável por PUBLIC" "f" \
    "$(como_owner -c "select has_function_privilege('public','entra_na_casa(text)','EXECUTE')")"
  afirma "casa_app executa entra_na_casa()" "t" \
    "$(como_owner -c "select has_function_privilege('casa_app','entra_na_casa(text)','EXECUTE')")"
  # O lock que faz o convite ser de uso único quando duas pessoas chegam juntas.
  afirma "entra_na_casa() trava o convite antes de consumir" "t" \
    "$(como_owner -c "select prosrc like '%FROM convites%FOR UPDATE%' from pg_proc where proname='entra_na_casa'")"

  # ── sessoes e revoked_tokens: assunto do casa_auth (ADR-0013).
  # Três policies: a do casa_auth (0001) e as duas do logout (0004).
  afirma "tres policies em sessoes" "3" \
    "$(como_owner -c "select count(*) from pg_policies where tablename='sessoes'")"
  afirma "casa_auth lê e escreve sessoes" "t" \
    "$(como_owner -c "select has_table_privilege('casa_auth','sessoes','SELECT') and has_table_privilege('casa_auth','sessoes','INSERT') and has_table_privilege('casa_auth','sessoes','UPDATE')")"
  # DELETE é do worker de limpeza (época futura concede, com o role do job).
  afirma "casa_auth não deleta sessoes" "f" \
    "$(como_owner -c "select has_table_privilege('casa_auth','sessoes','DELETE')")"
  # ── 0004: o logout dá a casa_app o raio mínimo em sessoes — e nada além.
  afirma "casa_app lê familia_id (acha a família pelo jti)" "t" \
    "$(como_owner -c "select has_column_privilege('casa_app','sessoes','familia_id','SELECT')")"
  afirma "casa_app escreve revogada_em (sair da conta)" "t" \
    "$(como_owner -c "select has_column_privilege('casa_app','sessoes','revogada_em','UPDATE')")"
  # O que NÃO existe é a asserção que segura o desenho: com UPDATE em
  # consumida_em, uma rota autenticada desfaria a rotação e revalidaria um
  # refresh já gasto; com SELECT em substituida_por, mapearia a cadeia inteira.
  afirma "casa_app NÃO desfaz a rotação" "f" \
    "$(como_owner -c "select has_column_privilege('casa_app','sessoes','consumida_em','UPDATE')")"
  afirma "casa_app NÃO lê a cadeia de sucessores" "f" \
    "$(como_owner -c "select has_column_privilege('casa_app','sessoes','substituida_por','SELECT')")"
  afirma "casa_app não insere nem deleta sessoes" "f" \
    "$(como_owner -c "select has_any_column_privilege('casa_app','sessoes','INSERT') or has_table_privilege('casa_app','sessoes','DELETE')")"
  afirma "uma policy em revoked_tokens" "1" \
    "$(como_owner -c "select count(*) from pg_policies where tablename='revoked_tokens'")"
  afirma "casa_auth lê e insere revoked_tokens" "t" \
    "$(como_owner -c "select has_table_privilege('casa_auth','revoked_tokens','SELECT') and has_table_privilege('casa_auth','revoked_tokens','INSERT')")"
  afirma "casa_auth não atualiza revoked_tokens" "f" \
    "$(como_owner -c "select has_table_privilege('casa_auth','revoked_tokens','UPDATE')")"
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
