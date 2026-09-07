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
TAREFA_A='cccccccc-cccc-4ccc-8ccc-000000000001'
TAREFA_B='dddddddd-dddd-4ddd-8ddd-000000000002'
# Sessões do smoke de logout (migration 0004). Saem por cascade quando os
# moradores são apagados — a FK de sessoes é ON DELETE cascade.
SESSAO_ANA='eeeeeeee-eeee-4eee-8eee-000000000001'
SESSAO_BRU='ffffffff-ffff-4fff-8fff-000000000002'
# A casa que a Dora cria via cria_casa() — id é sorteado pela função, então a
# limpeza acha pelo nome.
CASA_DORA='Casa Smoke da Dora'
# Duas contas SEM casa para o convite: a Dora já ganha uma em cria_casa(), na
# asserção 13, e reusá-la aqui testaria "já tem casa", não "entra por convite".
ERICA='55555555-5555-5555-5555-555555555555'
FABIO='66666666-6666-6666-6666-666666666666'
# Só símbolos do alfabeto de convite (contracts/convite.ts) — código com 'O' ou
# 'I' aqui ensinaria o formato errado para quem copiar daqui.
CODIGO='SMKE12'

limpa() {
  como_owner "drop table if exists smoke_rls" >/dev/null 2>&1 || true
  # moradores antes de casas (FK); tarefas saem por cascade da casa.
  # convites saem por cascade da casa e de quem os criou.
  como_admin "delete from moradores where id in ('$ANA','$BRU','$CARLA','$DORA','$ERICA','$FABIO');
              delete from casas where id in ('$CASA_A','$CASA_B') or nome = '$CASA_DORA'" >/dev/null 2>&1 || true
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
  delete from moradores where id in ('$ANA','$BRU','$CARLA','$DORA','$ERICA','$FABIO');
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
    ('$DORA',  null,      'Dora',  'lime',  'dora.smoke@example.com'),
    ('$ERICA', null,      'Erica', 'moss',  'erica.smoke@example.com'),
    ('$FABIO', null,      'Fabio', 'amber', 'fabio.smoke@example.com');
  insert into tarefas (id, casa_id, titulo) values
    ('$TAREFA_A', '$CASA_A', 'Louça da casa A'),
    ('$TAREFA_B', '$CASA_B', 'Louça da casa B');
  insert into sessoes (jti, morador_id, familia_id, expira_em) values
    ('$SESSAO_ANA', '$ANA', '$SESSAO_ANA', now() + interval '60 days'),
    ('$SESSAO_BRU', '$BRU', '$SESSAO_BRU', now() + interval '60 days');
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
# 9b. sessoes deixou de ser inalcançável para o casa_app na 0004 (sair da
# conta), e o que ele ganhou é estreito o bastante para caber em cinco
# asserções: só as próprias linhas, nada da rotação, e nenhuma escrita além de
# encerrar. É o recorte que permite ao logout rodar sob RLS em vez de sob um
# `where morador_id = $1` escrito à mão no serviço.
afirma "sem identidade, casa_app não vê sessão nenhuma" "0" \
  "$(como_app "select count(*) from sessoes" | tr -d '[:space:]')"
afirma "Ana vê só a própria sessão" "1" \
  "$(como_app "begin; set local app.current_user_id = '$ANA'; select count(*) from sessoes; commit;" | tr -d '[:space:]')"
afirma "e não alcança a sessão do Bruno nem por jti" "0" \
  "$(como_app "begin; set local app.current_user_id = '$ANA'; select count(*) from sessoes where jti = '$SESSAO_BRU'; commit;" | tr -d '[:space:]')"
contem "a cadeia de rotação não é coluna do casa_app" "permission denied" \
  "$(como_app "begin; set local app.current_user_id = '$ANA'; select substituida_por from sessoes; commit;")"
contem "e consumida_em não é escrita dele" "permission denied" \
  "$(como_app "begin; set local app.current_user_id = '$ANA'; update sessoes set consumida_em = now(); commit;")"

# 10. casa_auth (ADR-0013): lê credencial SEM identidade injetada — o limite
# dele é o GRANT por coluna, não a policy.
afirma "casa_auth lê credencial sem identidade" "ana.smoke@example.com" \
  "$(como_auth "select email from moradores where id = '$ANA'" | tr -d '[:space:]')"
contem "mas apelido não é assunto do auth" "permission denied" \
  "$(como_auth "select apelido from moradores")"
# As DUAS sessões, e não uma: `casa_auth` opera com `USING (true)` porque
# login e refresh acontecem antes de existir identidade (ADR-0013). É a
# assimetria com a asserção da Ana logo acima que mostra por que o logout
# preferiu o casa_app — lá o escopo é policy, aqui seria `where` na mão.
afirma "casa_auth alcança sessoes (todas — o limite dele é o GRANT)" "2" \
  "$(como_auth "select count(*) from sessoes" | tr -d '[:space:]')"
contem "casa_auth não alcança casas" "permission denied" \
  "$(como_auth "select count(*) from casas")"

# ─── Épico 1, story 6 — tarefas e o caminho ÚNICO para entrar numa casa.
echo
echo "story 6 — tarefas escopadas e cria_casa() como único vínculo"

# 11. Tarefa é dado da casa: mesmo predicado, mesma negação cruzada.
afirma "Ana vê 1 tarefa (a da casa dela)" "1" \
  "$(como_app "begin; set local app.current_user_id = '$ANA'; select count(*) from tarefas; commit;" | tr -d '[:space:]')"
afirma "e não alcança a tarefa da casa B nem por id" "0" \
  "$(como_app "begin; set local app.current_user_id = '$ANA'; select count(*) from tarefas where id = '$TAREFA_B'; commit;" | tr -d '[:space:]')"
afirma "Dora (sem casa) não vê tarefa nenhuma" "0" \
  "$(como_app "begin; set local app.current_user_id = '$DORA'; select count(*) from tarefas; commit;" | tr -d '[:space:]')"
contem "tarefas não são assunto do auth" "permission denied" \
  "$(como_auth "select count(*) from tarefas")"

# 12. O buraco que a função existe para fechar: se casa_app pudesse dar UPDATE
# em casa_id, a policy "atualiza a si mesmo" deixaria a Dora entrar na casa A
# só por saber o uuid. O privilégio não existe — a negação vem do GRANT, antes
# de qualquer policy.
contem "casa_app não escreve casa_id — entrar em casa não é UPDATE" "permission denied" \
  "$(como_app "begin; set local app.current_user_id = '$DORA'; update moradores set casa_id = '$CASA_A' where id = '$DORA'; commit;")"
contem "casa_app não insere casa direto" "permission denied" \
  "$(como_app "begin; set local app.current_user_id = '$DORA'; insert into casas (nome, tipo) values ('$CASA_DORA', 'casal'); commit;")"

# 13. cria_casa() é o caminho concedido — e só serve uma vez por conta (ADR-0012).
afirma "cria_casa() vincula a Dora à casa nova" "1" \
  "$(como_app "begin; set local role casa_app; set local app.current_user_id = '$DORA'; select cria_casa('$CASA_DORA', 'casal'); select count(*) from casas; commit;" | tail -1 | tr -d '[:space:]')"
contem "e recusa a segunda casa da mesma conta" "morador já tem casa" \
  "$(como_app "begin; set local role casa_app; set local app.current_user_id = '$DORA'; select cria_casa('outra', 'casal'); commit;")"
contem "sem identidade, cria_casa() não cria nada" "sem identidade" \
  "$(como_app "select cria_casa('anonima', 'casal')")"

# ─── Convite por código — a SEGUNDA porta para entrar numa casa (migration 0005).
echo
echo "convite — o código é a única porta, e ele é de uso único"

# 14. Convidar é escrita de quem mora na casa, PARA a própria casa. As duas
# metades do WITH CHECK aparecem nas duas asserções seguintes.
como_app "begin; set local app.current_user_id = '$ANA';
          insert into convites (codigo, casa_id, criado_por, expira_em)
          values ('$CODIGO', casa_atual(), '$ANA', now() + interval '1 day'); commit;" >/dev/null
afirma "Ana convida para a própria casa" "1" \
  "$(como_app "begin; set local app.current_user_id = '$ANA'; select count(*) from convites; commit;" | tr -d '[:space:]')"
contem "Bruno não emite convite para a casa da Ana" "violates row-level security policy" \
  "$(como_app "begin; set local app.current_user_id = '$BRU';
               insert into convites (codigo, casa_id, criado_por, expira_em)
               values ('XXXX99', '$CASA_A', '$BRU', now() + interval '1 day'); commit;")"

# 15. O convite não é legível de fora da casa — nem procurando pelo código
# exato. É o que impede o aceite de virar adivinhação com resposta imediata:
# quem tenta um código só descobre se acertou passando pela função.
afirma "Bruno não vê o convite da casa A" "0" \
  "$(como_app "begin; set local app.current_user_id = '$BRU'; select count(*) from convites where codigo = '$CODIGO'; commit;" | tr -d '[:space:]')"
afirma "Erica (sem casa) também não vê convite nenhum" "0" \
  "$(como_app "begin; set local app.current_user_id = '$ERICA'; select count(*) from convites; commit;" | tr -d '[:space:]')"

# 16. Consumir convite é a função, não um UPDATE. Sem o privilégio, nem quem é
# da casa marca (ou desmarca) um convite como usado por fora dela.
contem "casa_app não consome convite por fora da função" "permission denied" \
  "$(como_app "begin; set local app.current_user_id = '$ANA'; update convites set usado_em = now(); commit;")"

# 17. O caminho feliz e o uso único, em sequência.
afirma "Erica entra na casa A pelo código e passa a ver os 3 moradores" "3" \
  "$(como_app "begin; set local role casa_app; set local app.current_user_id = '$ERICA';
               select entra_na_casa('$CODIGO'); select count(*) from moradores; commit;" | tail -1 | tr -d '[:space:]')"
contem "e o mesmo código não serve para o Fabio" "convite inválido" \
  "$(como_app "begin; set local role casa_app; set local app.current_user_id = '$FABIO'; select entra_na_casa('$CODIGO'); commit;")"
afirma "Fabio continua sem casa" "0" \
  "$(como_app "begin; set local app.current_user_id = '$FABIO'; select count(*) from casas; commit;" | tr -d '[:space:]')"

# 18. Código inexistente e código já usado dão a MESMA recusa — separar os dois
# diria a quem adivinha que acertou o sorteio e chegou tarde.
contem "código que nunca existiu recebe a mesma recusa" "convite inválido" \
  "$(como_app "begin; set local role casa_app; set local app.current_user_id = '$FABIO'; select entra_na_casa('ZZZZZZ'); commit;")"
contem "sem identidade, entra_na_casa() não vincula ninguém" "sem identidade" \
  "$(como_app "select entra_na_casa('$CODIGO')")"

# ─── Épico 2, stories 1 e 2 — dividir e concluir (migrations 0006 e 0007).
echo
echo "Épico 2 — editar, atribuir e concluir ficam dentro da casa"

# 19. Editar é UPDATE sob policy: Ana alcança a tarefa da casa dela e NÃO a da
# casa B — nem por id direto. `returning 1` porque psql -q engole o "UPDATE n".
afirma "Ana edita a tarefa da casa A" "1" \
  "$(como_app "begin; set local app.current_user_id = '$ANA'; update tarefas set peso = 'pesado' where id = '$TAREFA_A' returning 1; commit;" | tr -d '[:space:]')"
afirma "e não alcança a tarefa da casa B para editar" "" \
  "$(como_app "begin; set local app.current_user_id = '$ANA'; update tarefas set peso = 'pesado' where id = '$TAREFA_B' returning 1; commit;" | tr -d '[:space:]')"
afirma "nem para apagar" "" \
  "$(como_app "begin; set local app.current_user_id = '$ANA'; delete from tarefas where id = '$TAREFA_B' returning 1; commit;" | tr -d '[:space:]')"

# 20. Responsável tem que morar na casa. É a policy que recusa, não o handler:
# Carla (casa A) passa; Bruno (casa B) é barrado no WITH CHECK.
afirma "Ana atribui a Carla (mesma casa) como dona fixa" "1" \
  "$(como_app "begin; set local app.current_user_id = '$ANA'; update tarefas set modo = 'fixo', responsavel_id = '$CARLA' where id = '$TAREFA_A' returning 1; commit;" | tr -d '[:space:]')"
contem "e não consegue atribuir o Bruno (outra casa)" "violates row-level security policy" \
  "$(como_app "begin; set local app.current_user_id = '$ANA'; update tarefas set responsavel_id = '$BRU' where id = '$TAREFA_A'; commit;")"
contem "criar tarefa já com responsável de fora também é barrado" "violates row-level security policy" \
  "$(como_app "begin; set local app.current_user_id = '$ANA'; insert into tarefas (casa_id, titulo, modo, responsavel_id) values (casa_atual(), 'x', 'fixo', '$BRU'); commit;")"

# 21. As duas formas inválidas de linha são CHECK — nem quem é da casa passa.
contem "tarefa aberta com responsável é contradição" "tarefa_aberta_sem_responsavel" \
  "$(como_app "begin; set local app.current_user_id = '$ANA'; update tarefas set modo = 'aberta' where id = '$TAREFA_A'; commit;")"
contem "bônus fora do rodízio é recusado (ADR-0010)" "bonus_so_em_rodizio" \
  "$(como_app "begin; set local app.current_user_id = '$ANA'; update tarefas set bonus_detestada = true where id = '$TAREFA_A'; commit;")"
afirma "em rodízio, o bônus entra" "1" \
  "$(como_app "begin; set local app.current_user_id = '$ANA'; update tarefas set modo = 'rodizio', bonus_detestada = true where id = '$TAREFA_A' returning 1; commit;" | tr -d '[:space:]')"

# 22. Concluir é INSERT em conclusoes — a MINHA conclusão, numa tarefa da
# MINHA casa. As três metades do WITH CHECK, uma asserção cada.
afirma "Ana registra a própria conclusão" "1" \
  "$(como_app "begin; set local app.current_user_id = '$ANA'; insert into conclusoes (tarefa_id, casa_id, morador_id, pontos) values ('$TAREFA_A', casa_atual(), '$ANA', 3) returning 1; commit;" | tr -d '[:space:]')"
contem "e não registra conclusão em nome da Carla" "violates row-level security policy" \
  "$(como_app "begin; set local app.current_user_id = '$ANA'; insert into conclusoes (tarefa_id, casa_id, morador_id, pontos) values ('$TAREFA_A', casa_atual(), '$CARLA', 3); commit;")"
contem "nem conclusão de tarefa da casa B com casa_id da A" "violates row-level security policy" \
  "$(como_app "begin; set local app.current_user_id = '$ANA'; insert into conclusoes (tarefa_id, casa_id, morador_id, pontos) values ('$TAREFA_B', casa_atual(), '$ANA', 3); commit;")"
contem "pontos zerados não registram esforço nenhum" "pontos_positivos" \
  "$(como_app "begin; set local app.current_user_id = '$ANA'; insert into conclusoes (tarefa_id, casa_id, morador_id, pontos) values ('$TAREFA_A', casa_atual(), '$ANA', 0); commit;")"

# 23. Leitura escopada por casa — a Carla vê a conclusão da Ana (é o total da
# casa); o Bruno não vê nada da casa A.
afirma "Carla (mesma casa) vê a conclusão — alimenta o total da casa" "1" \
  "$(como_app "begin; set local app.current_user_id = '$CARLA'; select count(*) from conclusoes; commit;" | tr -d '[:space:]')"
afirma "Bruno (casa B) não vê conclusão nenhuma da casa A" "0" \
  "$(como_app "begin; set local app.current_user_id = '$BRU'; select count(*) from conclusoes; commit;" | tr -d '[:space:]')"

# 24. Append-only por privilégio: editar o passado não existe nem para quem
# escreveu a linha.
contem "casa_app não edita conclusão" "permission denied" \
  "$(como_app "begin; set local app.current_user_id = '$ANA'; update conclusoes set pontos = 99; commit;")"
contem "nem apaga" "permission denied" \
  "$(como_app "begin; set local app.current_user_id = '$ANA'; delete from conclusoes; commit;")"
contem "conclusoes não são assunto do auth" "permission denied" \
  "$(como_auth "select count(*) from conclusoes")"

if ((falhas > 0)); then
  echo; echo "$falhas asserção(ões) falharam — a RLS está decorativa."
  exit 1
fi
echo; echo "A policy nega. Não é a aplicação que está negando."
