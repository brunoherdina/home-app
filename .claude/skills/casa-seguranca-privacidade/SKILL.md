---
name: casa-seguranca-privacidade
description: "Segurança e privacidade do Casa — RLS/ownership/IDOR, identidade por request (SET LOCAL), segredos do servidor + LGPD e a anonimização estrutural dos dados sensíveis. Usar quando a tarefa envolve policy RLS, acesso a dado sensível (frustração/pulso/aspiração), IDOR, auth, segredo, ou compliance/privacidade."
---

# Segurança & Privacidade — Casa

Persona: modelador de ameaças + privacy-by-design. Prova que o schema **cumpre** os invariantes de anonimização — não confia na UI.

Fronteira com o domínio: [casa-dominio-cooperacao](../casa-dominio-cooperacao/SKILL.md) **define** a regra ("frustração vira peso agregado"); esta skill **impõe** na camada RLS/policy.

## Ler primeiro

1. [Manifesto §2 — regras invioláveis](../../../casa-manifesto-projeto.md)
2. [ADR-0002 — RLS continua sendo o enforcement](../../../casa-decisoes-produto.md) — **leia antes de qualquer coisa**
3. [casa-migrations](../casa-migrations/SKILL.md) — policy nasce com o schema

## 🔴 O risco nº 1 do projeto: RLS decorativa

Desde o ADR-0001 existe uma API entre o app e o Postgres. O caminho preguiçoso é conectar como owner e checar permissão em TypeScript — aí a RLS não faz nada, os invariantes §2 voltam pro código de aplicação, e **nenhum teste funcional quebra**. Trocar `if` de UI por `if` de controller não é progresso.

Contrato:

- Pool da API usa role **sem `BYPASSRLS`** e que **não é owner** das tabelas. Owner é o role de migration, usado só pelo drizzle-kit.
- Toda request autenticada abre transação e injeta identidade **antes** de qualquer query:

  ```sql
  BEGIN;
    SET LOCAL ROLE casa_app;
    SET LOCAL app.current_user_id = '<uuid do JWT>';
  COMMIT;
  ```

  `SET LOCAL` morre com a transação — não vaza identidade entre requests do mesmo pool.
- Policies leem a identidade sempre por `nullif(current_setting('app.current_user_id', true), '')::uuid`. O `nullif` não é estilo: `SET LOCAL` reseta o GUC para **string vazia** ao fim da transação, e sem ele a próxima request naquela conexão do pool recebe `22P02` em vez de zero linhas.
- Tabela sensível leva `FORCE ROW LEVEL SECURITY` — sem isso a policy é invisível para o owner.
- **Rota sem identidade tem role próprio, não exceção** (ADR-0013): `register`/`login`/`refresh` rodam
  pelo plugin `semIdentidade`, num pool separado com o role `casa_auth` — também `NOBYPASSRLS`, também
  dono de nada, com `GRANT` só em credencial e sessão. Pool separado e **não** `GRANT casa_auth TO
  casa_app`: se um role pudesse virar o outro por `SET ROLE`, o limite viraria convenção.
- Credencial administrativa nunca é usada por handler de request.
- O contrato é verificável a qualquer momento: `infra/scripts/check-roles.sh` (catálogo) e `infra/scripts/smoke-rls.sh` (a policy nega de fato).

## Invariantes a impor (RLS, não UI)

1. **Sem ranking**: nenhuma query/view expõe agregação por pessoa comparável.
2. **Frustração / incômodo** → só legível como **peso agregado**; linha individual nunca retornável a outro morador.
3. **Pulso semanal** → termômetro anônimo; sem coluna que ligue humor↔pessoa em leitura de grupo.
4. **Aspiração "pra mim"** → privada; RLS restringe ao próprio autor. Só "pra casa" vira compartilhada.
5. **Ownership**: morador só acessa dados da casa que participa. IDOR se bloqueia por
   `casa_id = casa_atual()` na policy (ADR-0012) — nunca por `where` no handler. No v1 é **uma casa por
   conta**; se isso mudar, muda a função, não as policies.

## Checklist de review de segurança

- [ ] RLS habilitada em toda tabela sensível
- [ ] Handler passa por `withUser` ou, se for rota pública de auth, por `semIdentidade` — nunca toca o pool cru
- [ ] Policy testada **no banco** (`SET ROLE casa_app` + `app.current_user_id` de outro membro), não só pelo endpoint
- [ ] Aspiração privada inacessível a outros
- [ ] Sem endpoint/view de ranking por pessoa
- [ ] Payload de realtime agregado — sem linha atribuível no stream
- [ ] Rate limit em convites/auth
- [ ] Segredo só no servidor: `DATABASE_URL`, `JWT_SECRET`, OAuth. `EXPO_PUBLIC_*` só a URL da API; token do usuário em `expo-secure-store`

## LGPD (registrar progresso no harness-report)

- Anonimização é privacy-by-design ✅ (estrutural).
- Termos de uso + política de privacidade: `<PREENCHER — não produzidos>`.
- Direito de exclusão/exportação: `<PREENCHER>`.

## Definition of Done

- **Duas provas** para cada dado sensível: (1) endpoint real autenticado como outro membro não devolve o dado; (2) a query direto no banco como `casa_app` é bloqueada pela policy mesmo sem a API no caminho.
- Nenhum invariante §2 dependente só da UI **nem só do handler**.
- Nenhum segredo no bundle do app.
