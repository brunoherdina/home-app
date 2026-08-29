# Infra local — Épico 0a

Postgres em container com os dois roles do **ADR-0002**. Sem VPS, sem TLS, sem
backup: isso é Épico 0b, e precisa fechar antes do convite do Épico 2.

## Subir

```bash
cp infra/.env.example infra/.env   # preencher as três senhas
cd infra && docker compose up -d
```

O `infra/.env` é gitignorado. As senhas nascem com `openssl rand -base64 24`.

> A porta é **5433** por padrão — 5432 costuma já estar ocupada por outro
> projeto na mesma máquina. Está presa ao loopback e só existe no 0a: em
> produção o Postgres não publica porta nenhuma.

## Provar o contrato

```bash
infra/scripts/check-roles.sh   # o catálogo confere com o ADR-0002
infra/scripts/smoke-rls.sh     # a policy realmente nega
```

Os dois rodam contra o Postgres do compose, e é essa a graça: mock de RLS não
prova nada. Rodar depois de **toda** migration — `check-roles.sh` afirma que
nenhuma tabela nasceu sem RLS e que `casa_app` não virou dona de nada.

## Os dois roles

| Role | Quem usa | Pode |
|---|---|---|
| `casa_admin` (superusuário) | só o initdb e o backup/restore | tudo — nunca em runtime |
| `casa_owner` | drizzle-kit, em deploy de migration | criar/alterar schema |
| `casa_app` | o pool da API | DML nas tabelas que receberam `GRANT`, sob a policy |

`casa_app` é `NOBYPASSRLS`, não é dona de tabela e não tem `CREATE` no schema.
Não existe `ALTER DEFAULT PRIVILEGES`: cada migration escreve seu `GRANT`
mínimo. Tabela sem grant quebra a API alto e cedo; grant automático esconderia
a tabela sem policy, que vaza calada.

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

## Ainda não está aqui

`api` e `worker` entram no compose quando o skeleton do monorepo existir. `caddy`,
backup com restore testado e CI são do Épico 0b.
