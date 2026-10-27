-- Inverso de 0003_casa_e_tarefas.sql. Ordem inversa da up.
--
-- `DROP TABLE tarefas` já levaria policies, índice e grants junto; os comandos
-- explícitos existem para o down continuar correto se uma migration futura
-- deixar de dropar a tabela (mesma disciplina de 0001).

REVOKE EXECUTE ON FUNCTION cria_casa(text, tipo_de_casa) FROM casa_app;--> statement-breakpoint
DROP FUNCTION cria_casa(text, tipo_de_casa);--> statement-breakpoint

DROP POLICY "cria_casa_insere_a_casa" ON "casas";--> statement-breakpoint

REVOKE ALL ON TABLE "tarefas" FROM casa_app;--> statement-breakpoint
DROP POLICY "morador_cria_tarefa_na_propria_casa" ON "tarefas";--> statement-breakpoint
DROP POLICY "morador_le_as_tarefas_da_casa" ON "tarefas";--> statement-breakpoint
DROP TABLE "tarefas";
