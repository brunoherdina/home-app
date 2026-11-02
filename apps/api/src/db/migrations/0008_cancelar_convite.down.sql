-- Inverso de 0008_cancelar_convite.sql.
REVOKE DELETE ON TABLE "convites" FROM casa_app;--> statement-breakpoint

DROP POLICY IF EXISTS "morador_cancela_o_proprio_convite" ON "convites";
