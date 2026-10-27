-- Inverso de 0006_tarefas_divisao.sql. Ordem inversa da up.
--
-- A policy de INSERT volta à forma de 0003 (só `casa_id`): sem as colunas
-- novas, a versão com responsável não compila — e a 0003 continua valendo
-- sozinha depois deste down.

REVOKE UPDATE, DELETE ON TABLE "tarefas" FROM casa_app;--> statement-breakpoint

DROP POLICY IF EXISTS "morador_apaga_as_tarefas_da_casa" ON "tarefas";--> statement-breakpoint
DROP POLICY IF EXISTS "morador_edita_as_tarefas_da_casa" ON "tarefas";--> statement-breakpoint
DROP POLICY IF EXISTS "morador_cria_tarefa_na_propria_casa" ON "tarefas";--> statement-breakpoint

CREATE POLICY "morador_cria_tarefa_na_propria_casa" ON "tarefas"
  FOR INSERT TO casa_app
  WITH CHECK ("casa_id" = casa_atual());--> statement-breakpoint

ALTER TABLE "tarefas" DROP CONSTRAINT IF EXISTS "bonus_so_em_rodizio";--> statement-breakpoint
ALTER TABLE "tarefas" DROP CONSTRAINT IF EXISTS "tarefa_aberta_sem_responsavel";--> statement-breakpoint
ALTER TABLE "tarefas" DROP CONSTRAINT IF EXISTS "tarefas_responsavel_id_moradores_id_fk";--> statement-breakpoint

ALTER TABLE "tarefas" DROP COLUMN IF EXISTS "bonus_detestada";--> statement-breakpoint
ALTER TABLE "tarefas" DROP COLUMN IF EXISTS "responsavel_id";--> statement-breakpoint
ALTER TABLE "tarefas" DROP COLUMN IF EXISTS "modo";--> statement-breakpoint
ALTER TABLE "tarefas" DROP COLUMN IF EXISTS "peso";--> statement-breakpoint

DROP TYPE IF EXISTS "public"."peso_de_tarefa";--> statement-breakpoint
DROP TYPE IF EXISTS "public"."modo_de_tarefa";
