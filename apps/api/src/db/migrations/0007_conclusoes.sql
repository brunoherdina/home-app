CREATE TABLE "conclusoes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tarefa_id" uuid NOT NULL,
	"casa_id" uuid NOT NULL,
	"morador_id" uuid,
	"pontos" smallint NOT NULL,
	"concluida_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "conclusoes" ADD CONSTRAINT "conclusoes_tarefa_id_tarefas_id_fk" FOREIGN KEY ("tarefa_id") REFERENCES "public"."tarefas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conclusoes" ADD CONSTRAINT "conclusoes_casa_id_casas_id_fk" FOREIGN KEY ("casa_id") REFERENCES "public"."casas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conclusoes" ADD CONSTRAINT "conclusoes_morador_id_moradores_id_fk" FOREIGN KEY ("morador_id") REFERENCES "public"."moradores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "conclusoes_casa_id_morador_id_idx" ON "conclusoes" USING btree ("casa_id","morador_id");--> statement-breakpoint
CREATE INDEX "conclusoes_tarefa_id_idx" ON "conclusoes" USING btree ("tarefa_id");--> statement-breakpoint
-- Daqui para baixo é SQL escrito à mão: o drizzle-kit não gera CHECK com
-- expressão, policy nem GRANT (ADR-0005).
--
-- Épico 2, story 2 — concluir é EVENTO, e esta é a tabela dele. Append-only
-- por construção: casa_app recebe SELECT e INSERT e mais nada, então "desfazer
-- conclusão" e "corrigir pontos" não existem como privilégio — e a ausência é
-- a garantia, não uma checagem em handler.

-- Pontos são peso (1 / 2 / 3) mais bônus quando houver; zero ou negativo é
-- linha que não registra esforço nenhum e só existiria por bug de cálculo.
ALTER TABLE "conclusoes" ADD CONSTRAINT "pontos_positivos"
  CHECK ("pontos" > 0);--> statement-breakpoint

ALTER TABLE "conclusoes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "conclusoes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- A casa lê as conclusões da casa — é o que alimenta "sua parte" (as MINHAS
-- linhas) e o total (todas). Mesmo predicado de `tarefas` (ADR-0012).
--
-- O que a policy NÃO faz é esconder as linhas dos outros: a soma da casa
-- precisa delas. A guarda contra pódio não mora aqui — mora na proibição de
-- query que agrupe por morador e ordene (story 8), porque nenhuma policy
-- consegue distinguir "somar tudo" de "somar por pessoa e comparar".
CREATE POLICY "morador_le_as_conclusoes_da_casa" ON "conclusoes"
  FOR SELECT TO casa_app
  USING ("casa_id" = casa_atual());--> statement-breakpoint

-- Três metades no WITH CHECK, e as três são necessárias:
--   1. a linha é da minha casa;
--   2. a conclusão é MINHA — ninguém registra esforço em nome de outro, nem
--      como favor: é a única forma de "sua parte" continuar sendo sua;
--   3. a tarefa é da minha casa — sem isto, `casa_id` certo e `tarefa_id` de
--      outra casa passariam, e uma conclusão apontaria para fora. A subquery
--      roda sob a RLS de `tarefas`; o `where` fica para a regra ser legível
--      aqui sem depender de outra policy para ser verdade.
CREATE POLICY "morador_conclui_na_propria_casa" ON "conclusoes"
  FOR INSERT TO casa_app
  WITH CHECK (
    "casa_id" = casa_atual()
    AND "morador_id" = nullif(current_setting('app.current_user_id', true), '')::uuid
    AND "tarefa_id" IN (SELECT id FROM tarefas WHERE casa_id = casa_atual())
  );--> statement-breakpoint

-- Sem UPDATE e sem DELETE — de propósito, e não "até o próximo épico".
-- Conclusão é registro do que aconteceu; editar o passado é o que faria os
-- pontos virarem negociação. Se um dia existir "desfazer" (toque errado), ele
-- nasce como evento inverso, não como apagar a linha.
GRANT SELECT, INSERT ON TABLE "conclusoes" TO casa_app;
