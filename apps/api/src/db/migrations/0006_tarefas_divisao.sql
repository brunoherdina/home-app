CREATE TYPE "public"."modo_de_tarefa" AS ENUM('rodizio', 'fixo', 'aberta');--> statement-breakpoint
CREATE TYPE "public"."peso_de_tarefa" AS ENUM('leve', 'medio', 'pesado');--> statement-breakpoint
ALTER TABLE "tarefas" ADD COLUMN "peso" "peso_de_tarefa" DEFAULT 'medio' NOT NULL;--> statement-breakpoint
ALTER TABLE "tarefas" ADD COLUMN "modo" "modo_de_tarefa" DEFAULT 'aberta' NOT NULL;--> statement-breakpoint
ALTER TABLE "tarefas" ADD COLUMN "responsavel_id" uuid;--> statement-breakpoint
ALTER TABLE "tarefas" ADD COLUMN "bonus_detestada" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_responsavel_id_moradores_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."moradores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Daqui para baixo é SQL escrito à mão: o drizzle-kit não gera CHECK com
-- expressão, policy nem GRANT (ADR-0005).
--
-- Épico 2, story 1 — a tarefa ganha peso, modo, responsável e a marcação de
-- "todo mundo detesta". As colunas vieram do gerador acima; o que este bloco
-- traz é a REGRA: quem pode mexer, e em que forma a linha pode existir.

-- Tarefa Aberta é "qualquer um pega" — alguém de posse dela é contradição.
-- O inverso NÃO é exigido (Rodízio/Fixo com responsável NULL é permitido):
-- a FK é `set null`, e uma conta apagada não pode falhar por deixar tarefa
-- sem ninguém. A rotação trata NULL como "começa do primeiro".
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefa_aberta_sem_responsavel"
  CHECK ("modo" <> 'aberta' OR "responsavel_id" IS NULL);--> statement-breakpoint

-- O bônus do ADR-0010 só existe em Rodízio. Fora dele, o mesmo boolean seria
-- aumento permanente para o dono (Fixo) ou corrida por pontos (Aberta) —
-- as duas formas de a compensação virar competição. Constraint e não regra de
-- handler porque handler é o lugar onde ela seria esquecida no PATCH seguinte.
ALTER TABLE "tarefas" ADD CONSTRAINT "bonus_so_em_rodizio"
  CHECK (NOT "bonus_detestada" OR "modo" = 'rodizio');--> statement-breakpoint

-- A policy de INSERT de 0003 só sabia de `casa_id`. Agora a linha carrega um
-- responsável, e a policy é quem recusa responsável de OUTRA casa — não um
-- `if` no handler (ADR-0002). A subquery em `moradores` roda sob a RLS de
-- `moradores` (policy "mesma casa", ADR-0012): mesmo sem o `where`, casa_app
-- só enxergaria a própria casa. O `where` fica assim mesmo, para a regra ser
-- legível aqui e não depender de outra policy para ser verdade.
DROP POLICY "morador_cria_tarefa_na_propria_casa" ON "tarefas";--> statement-breakpoint

CREATE POLICY "morador_cria_tarefa_na_propria_casa" ON "tarefas"
  FOR INSERT TO casa_app
  WITH CHECK (
    "casa_id" = casa_atual()
    AND (
      "responsavel_id" IS NULL
      OR "responsavel_id" IN (SELECT id FROM moradores WHERE casa_id = casa_atual())
    )
  );--> statement-breakpoint

-- Editar, atribuir, passar a vez: tudo é UPDATE na tarefa da própria casa.
-- USING escopa o que a pessoa alcança; WITH CHECK impede que a linha SAIA da
-- casa (mudar casa_id) ou ganhe responsável de fora.
--
-- Não é SECURITY DEFINER, ao contrário de cria_casa()/entra_na_casa(): lá o
-- privilégio bruto (UPDATE em moradores.casa_id) abriria entrada em casa
-- alheia porque policy nenhuma sobre aquela linha distingue "a casa que
-- criei" de "uma casa qualquer". Aqui `casa_id = casa_atual()` é exatamente o
-- que a policy sabe decidir. Função a mais seria raio a mais para revisar.
CREATE POLICY "morador_edita_as_tarefas_da_casa" ON "tarefas"
  FOR UPDATE TO casa_app
  USING ("casa_id" = casa_atual())
  WITH CHECK (
    "casa_id" = casa_atual()
    AND (
      "responsavel_id" IS NULL
      OR "responsavel_id" IN (SELECT id FROM moradores WHERE casa_id = casa_atual())
    )
  );--> statement-breakpoint

CREATE POLICY "morador_apaga_as_tarefas_da_casa" ON "tarefas"
  FOR DELETE TO casa_app
  USING ("casa_id" = casa_atual());--> statement-breakpoint

-- 0003 concedeu SELECT e INSERT e deixou escrito: "concluir, editar e apagar
-- são o Épico 2, e chegam com o fluxo". Chegaram.
GRANT UPDATE, DELETE ON TABLE "tarefas" TO casa_app;
