-- Down escrito à mão: o drizzle-kit não gera (ADR-0005). Ordem inversa da up;
-- o teste up → down → up (infra/scripts/check-migration.sh) é o que torna a
-- reversibilidade cobrável.
--
-- DROP TABLE já levaria policies e grants junto; os comandos explícitos
-- existem para que o down continue correto se uma migration futura deixar de
-- dropar a tabela. Em moradores (que sobrevive ao down), além de reverter os
-- grants novos é preciso RESTAURAR o estado de 0000 — grant de tabela inteira
-- para casa_app, que esta migration trocou por grants por coluna.

-- grants (inverso do bloco final da up)
REVOKE ALL ON TABLE "revoked_tokens" FROM casa_auth;--> statement-breakpoint
REVOKE ALL ON TABLE "sessoes" FROM casa_auth;--> statement-breakpoint
REVOKE ALL ON TABLE "casas" FROM casa_app;--> statement-breakpoint
-- REVOKE de tabela não desfaz grant POR COLUNA (Postgres separa os dois):
-- as colunas precisam ser revogadas explicitamente.
REVOKE SELECT ("id", "email", "hash_senha", "google_sub", "apple_sub", "email_verificado_em") ON "moradores" FROM casa_auth;--> statement-breakpoint
REVOKE SELECT ("id", "casa_id", "apelido", "cor", "criado_em"), UPDATE ("apelido", "cor") ON "moradores" FROM casa_app;--> statement-breakpoint
-- Restaura o grant de 0000 (tabela inteira — antes das colunas de credencial
-- existirem, era o mínimo).
GRANT SELECT, UPDATE ON TABLE "moradores" TO casa_app;--> statement-breakpoint

-- policies
DROP POLICY IF EXISTS "auth_opera_revoked_tokens" ON "revoked_tokens";--> statement-breakpoint
DROP POLICY IF EXISTS "auth_opera_sessoes" ON "sessoes";--> statement-breakpoint
DROP POLICY IF EXISTS "auth_opera_moradores" ON "moradores";--> statement-breakpoint
DROP POLICY IF EXISTS "morador_le_a_mesma_casa" ON "moradores";--> statement-breakpoint
DROP POLICY IF EXISTS "morador_le_a_propria_casa" ON "casas";--> statement-breakpoint

-- função (depois das policies que a referenciam — pg_policy guarda a
-- expressão com o OID da função e o DROP falharia antes disso)
DROP FUNCTION IF EXISTS casa_atual();--> statement-breakpoint

-- constraints e colunas novas de moradores (a tabela é de 0000 e fica)
ALTER TABLE "moradores" DROP CONSTRAINT IF EXISTS "moradores_apple_sub_unique";--> statement-breakpoint
ALTER TABLE "moradores" DROP CONSTRAINT IF EXISTS "moradores_google_sub_unique";--> statement-breakpoint
ALTER TABLE "moradores" DROP CONSTRAINT IF EXISTS "moradores_email_unique";--> statement-breakpoint
DROP INDEX IF EXISTS "moradores_casa_id_idx";--> statement-breakpoint
ALTER TABLE "moradores" DROP CONSTRAINT IF EXISTS "moradores_casa_id_casas_id_fk";--> statement-breakpoint
ALTER TABLE "moradores" DROP COLUMN IF EXISTS "email_verificado_em";--> statement-breakpoint
ALTER TABLE "moradores" DROP COLUMN IF EXISTS "apple_sub";--> statement-breakpoint
ALTER TABLE "moradores" DROP COLUMN IF EXISTS "google_sub";--> statement-breakpoint
ALTER TABLE "moradores" DROP COLUMN IF EXISTS "hash_senha";--> statement-breakpoint
ALTER TABLE "moradores" DROP COLUMN IF EXISTS "email";--> statement-breakpoint
ALTER TABLE "moradores" DROP COLUMN IF EXISTS "casa_id";--> statement-breakpoint

-- tabelas novas (sessoes antes de moradores não é necessário — o FK dela cai
-- com a própria tabela; casas por último entre as tabelas porque moradores já
-- soltou o FK acima)
DROP INDEX IF EXISTS "sessoes_expira_em_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "sessoes_familia_id_idx";--> statement-breakpoint
DROP INDEX IF EXISTS "revoked_tokens_expira_em_idx";--> statement-breakpoint
DROP TABLE IF EXISTS "sessoes";--> statement-breakpoint
DROP TABLE IF EXISTS "revoked_tokens";--> statement-breakpoint
DROP TABLE IF EXISTS "casas";--> statement-breakpoint
DROP TYPE IF EXISTS "tipo_de_casa";
