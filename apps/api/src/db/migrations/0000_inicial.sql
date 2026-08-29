CREATE TABLE "moradores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"apelido" text NOT NULL,
	"cor" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
-- Daqui para baixo é SQL escrito à mão: o drizzle-kit não gera policy nem GRANT
-- (ADR-0005). Tabela sem policy vaza; tabela sem grant quebra a API alto — o
-- segundo erro é o barato.

ALTER TABLE "moradores" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- FORCE vale também para o dono da tabela. Sem isso, um processo que rodasse
-- como casa_owner em runtime não enxergaria policy nenhuma.
-- Consequência: seed de migration precisa vir ANTES do FORCE (não há seed aqui).
ALTER TABLE "moradores" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- nullif: depois que uma transação faz SET LOCAL e commita, o GUC volta como
-- string vazia, não como NULL. Sem ele, ''::uuid lança 22P02 na conexão
-- reciclada do pool — 500 em vez de lista vazia.
CREATE POLICY "morador_le_a_si_mesmo" ON "moradores"
  FOR SELECT
  USING ("id" = nullif(current_setting('app.current_user_id', true), '')::uuid);--> statement-breakpoint

CREATE POLICY "morador_atualiza_a_si_mesmo" ON "moradores"
  FOR UPDATE
  USING ("id" = nullif(current_setting('app.current_user_id', true), '')::uuid)
  WITH CHECK ("id" = nullif(current_setting('app.current_user_id', true), '')::uuid);--> statement-breakpoint

-- GRANT mínimo. Sem INSERT e sem DELETE de propósito: criar morador é parte da
-- auth (Épico 1, ADR-0003) e vai precisar de um caminho próprio — dar o
-- privilégio antes de existir a regra é o tipo de folga que ninguém revisita.
GRANT SELECT, UPDATE ON TABLE "moradores" TO casa_app;
