-- Inverso de 0004_logout.sql.
--
-- REVOKE por coluna, e não `REVOKE ... ON TABLE`: revogar privilégio de tabela
-- NÃO desfaz grant de coluna no Postgres — o de tabela sairia sem reclamar
-- (nunca existiu) e o de coluna continuaria de pé. Mesma armadilha de 0001 e
-- 0002, e a razão de `check-migration.sh` conferir com `has_column_privilege`.
REVOKE UPDATE ("revogada_em") ON "sessoes" FROM casa_app;--> statement-breakpoint
REVOKE SELECT ("jti", "morador_id", "familia_id", "revogada_em") ON "sessoes" FROM casa_app;--> statement-breakpoint

DROP POLICY IF EXISTS "morador_revoga_as_proprias_sessoes" ON "sessoes";--> statement-breakpoint
DROP POLICY IF EXISTS "morador_le_as_proprias_sessoes" ON "sessoes";
