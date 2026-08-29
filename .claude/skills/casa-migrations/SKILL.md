---
name: casa-migrations
description: "Migrations de schema Postgres do Casa (Drizzle + drizzle-kit, Postgres auto-hospedado). Usar quando a tarefa envolve criar/alterar tabela, coluna, índice, policy RLS, grant, ou qualquer mudança de schema. Schema só muda por migration."
---

# Migrations — Casa

Persona: guardião do schema. Toda mudança de banco passa por migration reversível e revisada.

## Ler primeiro

1. [casa-arquitetura](../casa-arquitetura/SKILL.md) — convenções de dados
2. [casa-seguranca-privacidade](../casa-seguranca-privacidade/SKILL.md) — policy junto do schema
3. Migrations anteriores (histórico) antes de escrever a nova

## Regras

- **Schema só muda por migration.** Nada de alteração manual no banco.
- Fonte da verdade é `apps/api/src/db/schema.ts` (Drizzle); o `.sql` sai do `drizzle-kit generate`.
- Toda migration é **reversível** (up/down claros).

  > [!warning] O drizzle-kit **não gera `down`** (ADR-0005). O `down.sql` é escrito à mão ao lado do gerado. A reversibilidade deixou de ser garantia da ferramenta e virou disciplina — o teste up→down→up é o que a torna cobrável.

- Ao criar tabela com dado sensível, criar a **policy RLS na mesma leva** — schema sem policy = vazamento. Policies não são expressáveis no schema TS: vão como SQL na mesma migration.
- **`GRANT` para o role `casa_app` também é SQL manual na migration.** Tabela sem grant quebra a API; tabela com grant e sem policy vaza.
- **Toda tabela com RLS leva `FORCE ROW LEVEL SECURITY`.** Sem `FORCE`, o owner lê tudo e um processo que rodasse como owner em runtime não enxergaria a policy. Consequência: **semear antes de forçar** — com `FORCE` ativo, o próprio `INSERT` de seed da migration é rejeitado (é o caso do template por tipo de casa).
- **Policy lê a identidade com `nullif`:**

  ```sql
  using (autor = nullif(current_setting('app.current_user_id', true), '')::uuid)
  ```

  Depois que uma transação faz `SET LOCAL` e commita, o GUC volta como **string vazia**, não como `NULL`. Sem o `nullif`, `''::uuid` lança `22P02` na conexão reciclada do pool: a policy quebra em erro em vez de negar limpo — 500 em vez de lista vazia. Verificado no `infra/scripts/smoke-rls.sh`.
- Migration roda com o role **owner**, nunca pelo processo da API (que usa `casa_app`, sem `BYPASSRLS`).
- Nomear por timestamp + slug descritivo.
- Índices para queries de agregação (frustração, pontos) e para os triggers de `NOTIFY`.

## Checklist

- [ ] up + down testados (up → down → up em banco local)
- [ ] RLS habilitada na tabela nova (`enable row level security`)
- [ ] Policies de ownership/anonimização definidas, lendo `current_setting('app.current_user_id', true)::uuid`
- [ ] `GRANT` mínimo para `casa_app`
- [ ] Tipos/contratos atualizados após aplicar

## Definition of Done

- Migration aplica e reverte limpo no Postgres do compose.
- Nenhuma tabela sensível sem RLS; nenhuma tabela nova sem grant.
- Client tipado atualizado.

## Contexto adicional

Anonimização estrutural (frustração/aspiração privada) nasce aqui — ver invariantes no [casa-dominio-cooperacao](../casa-dominio-cooperacao/SKILL.md).
