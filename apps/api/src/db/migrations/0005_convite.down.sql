-- Inverso de 0005_convite.sql.
--
-- A função sai antes da tabela: `entra_na_casa()` referencia `convites` só no
-- corpo (plpgsql não cria dependência de catálogo), então a ordem não é exigida
-- pelo Postgres — é exigida pela leitura. DROP TABLE ... CASCADE levaria as
-- policies junto e deixaria a função de pé, apontando para uma tabela que não
-- existe mais: erro em runtime, não na migration.
DROP FUNCTION IF EXISTS entra_na_casa(text);--> statement-breakpoint

DROP POLICY IF EXISTS "entra_na_casa_consome_o_convite" ON "convites";--> statement-breakpoint
DROP POLICY IF EXISTS "entra_na_casa_le_o_convite" ON "convites";--> statement-breakpoint
DROP POLICY IF EXISTS "morador_convida_para_a_propria_casa" ON "convites";--> statement-breakpoint
DROP POLICY IF EXISTS "morador_le_os_convites_da_casa" ON "convites";--> statement-breakpoint

-- O GRANT morre com a tabela; o REVOKE explícito existe para o caso de o DROP
-- abaixo ser editado um dia para preservar dados.
REVOKE SELECT, INSERT ON TABLE "convites" FROM casa_app;--> statement-breakpoint

DROP TABLE IF EXISTS "convites";
