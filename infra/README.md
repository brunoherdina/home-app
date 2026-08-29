# Infra local — Épico 0a

Postgres, API e worker em container, com os três roles do **ADR-0002**. Sem VPS,
sem TLS, sem backup: isso é Épico 0b, e precisa fechar antes do convite do
Épico 2.

## Subir

```bash
cp infra/.env.example infra/.env   # preencher as três senhas e as duas URLs
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

O `infra/.env` é gitignorado. As senhas nascem com `openssl rand -base64 24`.

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

## Os três roles

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

## Ainda não está aqui

`caddy`, backup com restore testado e CI são do Épico 0b. A imagem da API roda
`tsx` direto em produção — trocar por build compilado quando o tamanho importar,
não antes.
