-- Inverso de 0007_conclusoes.sql.
--
-- `DROP TABLE` já levaria policies, índices, constraint e grant junto; os
-- comandos explícitos existem para o down continuar correto se uma migration
-- futura deixar de dropar a tabela (mesma disciplina de 0001 e 0005).

REVOKE SELECT, INSERT ON TABLE "conclusoes" FROM casa_app;--> statement-breakpoint

DROP POLICY IF EXISTS "morador_conclui_na_propria_casa" ON "conclusoes";--> statement-breakpoint
DROP POLICY IF EXISTS "morador_le_as_conclusoes_da_casa" ON "conclusoes";--> statement-breakpoint

DROP TABLE IF EXISTS "conclusoes";
