-- Épico 1 — sair da conta. Migration sem DDL: só policy e GRANT, no formato de
-- 0002 (cada fluxo novo traz o privilégio mínimo que ele exige).
--
-- A decisão que esta migration registra: quem revoga é `casa_app`, sob RLS —
-- e não `casa_auth`, que já tem a tabela inteira liberada.
--
-- `casa_auth` opera `sessoes` com policy `USING (true)` porque register, login
-- e refresh acontecem ANTES de existir identidade na transação: não há GUC para
-- escopar, e o limite do role é o GRANT. Logout é o oposto — a identidade já
-- está provada pelo access token e injetada em `app.current_user_id`. Rodando
-- pelo `casa_auth`, o "só as minhas sessões" seria um `where morador_id = $1`
-- escrito à mão no serviço, e um dia esquecido; rodando por aqui, é a policy
-- que nega. Custa dois GRANTs estreitos e devolve a garantia ao lugar onde o
-- ADR-0002 a quer.
--
-- O predicado é o mesmo `nullif(current_setting(...))` de 0000, escrito à mão
-- pela terceira vez. Continua inline de propósito: extraí-lo agora obrigaria a
-- reescrever as policies de 0000 (DROP + CREATE em regra de segurança que já
-- funciona) para não deixar dois idiomas convivendo. Se aparecer um quarto uso,
-- é hora de um `identidade_atual()` — e aí as quatro mudam juntas.

CREATE POLICY "morador_le_as_proprias_sessoes" ON "sessoes"
  FOR SELECT TO casa_app
  USING ("morador_id" = nullif(current_setting('app.current_user_id', true), '')::uuid);--> statement-breakpoint

CREATE POLICY "morador_revoga_as_proprias_sessoes" ON "sessoes"
  FOR UPDATE TO casa_app
  USING ("morador_id" = nullif(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK ("morador_id" = nullif(current_setting('app.current_user_id', true), '')::uuid);--> statement-breakpoint

-- SELECT por COLUNA, não na tabela. As quatro colunas são exatamente o que o
-- logout lê: acha a linha pelo `jti` que veio no refresh, descobre a
-- `familia_id`, e o `revogada_em` entra no WHERE do update ("só as ainda
-- vivas"). `morador_id` está aí porque o predicado da policy o usa.
--
-- Fora do grant, e isso é o ponto: `consumida_em`, `substituida_por` e
-- `expira_em`. São o estado da rotação (ADR-0008), e quem decide sobre ele é
-- `/api/auth/refresh`, rodando como `casa_auth`. Sem SELECT neles, nem um bug
-- em rota autenticada consegue mapear a cadeia de sucessores de uma família.
GRANT SELECT ("jti", "morador_id", "familia_id", "revogada_em") ON "sessoes" TO casa_app;--> statement-breakpoint

-- UPDATE de UMA coluna. `casa_app` pode matar a própria sessão e nada mais:
-- não consegue desfazer um `consumida_em` (que transformaria um refresh gasto
-- em válido de novo), nem repontar `substituida_por` (que enxertaria um ramo na
-- família). Encerrar é a única escrita que o logout precisa.
GRANT UPDATE ("revogada_em") ON "sessoes" TO casa_app;
