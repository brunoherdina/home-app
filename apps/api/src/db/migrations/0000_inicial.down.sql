-- Down escrito à mão: o drizzle-kit não gera (ADR-0005). A reversibilidade
-- deixou de ser garantia da ferramenta e virou disciplina — o que a torna
-- cobrável é o teste up → down → up (infra/scripts/check-migration.sh).
--
-- Ordem inversa da up. DROP TABLE já levaria policies e grants junto; os
-- comandos explícitos existem para que o down continue correto se a tabela
-- deixar de ser dropada (numa migration futura que só adiciona coluna, por ex.).

REVOKE ALL ON TABLE "moradores" FROM casa_app;--> statement-breakpoint
DROP POLICY IF EXISTS "morador_atualiza_a_si_mesmo" ON "moradores";--> statement-breakpoint
DROP POLICY IF EXISTS "morador_le_a_si_mesmo" ON "moradores";--> statement-breakpoint
DROP TABLE IF EXISTS "moradores";
