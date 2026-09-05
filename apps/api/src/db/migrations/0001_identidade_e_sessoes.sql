CREATE TYPE "public"."tipo_de_casa" AS ENUM('casal', 'republica', 'familia');--> statement-breakpoint
CREATE TABLE "casas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"tipo" "tipo_de_casa" NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "revoked_tokens" (
	"jti" uuid PRIMARY KEY NOT NULL,
	"expira_em" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessoes" (
	"jti" uuid PRIMARY KEY NOT NULL,
	"morador_id" uuid NOT NULL,
	"familia_id" uuid NOT NULL,
	"substituida_por" uuid,
	"consumida_em" timestamp with time zone,
	"expira_em" timestamp with time zone NOT NULL,
	"revogada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "moradores" ADD COLUMN "casa_id" uuid;--> statement-breakpoint
ALTER TABLE "moradores" ADD COLUMN "email" text NOT NULL;--> statement-breakpoint
ALTER TABLE "moradores" ADD COLUMN "hash_senha" text;--> statement-breakpoint
ALTER TABLE "moradores" ADD COLUMN "google_sub" text;--> statement-breakpoint
ALTER TABLE "moradores" ADD COLUMN "apple_sub" text;--> statement-breakpoint
ALTER TABLE "moradores" ADD COLUMN "email_verificado_em" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_morador_id_moradores_id_fk" FOREIGN KEY ("morador_id") REFERENCES "public"."moradores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessoes" ADD CONSTRAINT "sessoes_substituida_por_sessoes_jti_fk" FOREIGN KEY ("substituida_por") REFERENCES "public"."sessoes"("jti") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "revoked_tokens_expira_em_idx" ON "revoked_tokens" USING btree ("expira_em");--> statement-breakpoint
CREATE INDEX "sessoes_familia_id_idx" ON "sessoes" USING btree ("familia_id");--> statement-breakpoint
CREATE INDEX "sessoes_expira_em_idx" ON "sessoes" USING btree ("expira_em");--> statement-breakpoint
ALTER TABLE "moradores" ADD CONSTRAINT "moradores_casa_id_casas_id_fk" FOREIGN KEY ("casa_id") REFERENCES "public"."casas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "moradores_casa_id_idx" ON "moradores" USING btree ("casa_id");--> statement-breakpoint
ALTER TABLE "moradores" ADD CONSTRAINT "moradores_email_unique" UNIQUE("email");--> statement-breakpoint
ALTER TABLE "moradores" ADD CONSTRAINT "moradores_google_sub_unique" UNIQUE("google_sub");--> statement-breakpoint
ALTER TABLE "moradores" ADD CONSTRAINT "moradores_apple_sub_unique" UNIQUE("apple_sub");--> statement-breakpoint
-- Daqui para baixo é SQL escrito à mão: o drizzle-kit não gera policy, GRANT
-- nem função (ADR-0005). Tabela sem policy vaza; tabela sem grant quebra a API
-- alto — o segundo erro é o barato.

ALTER TABLE "casas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "casas" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sessoes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sessoes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "revoked_tokens" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "revoked_tokens" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- casa_atual() — ADR-0012. O predicado de escopo por casa NUNCA é escrito à
-- mão duas vezes: sai daqui. Se um dia identidade e pertencimento se
-- separarem, muda esta função — não as N policies.
--
-- Por que SECURITY DEFINER, e por que isso NÃO é um bypass: a policy "mesma
-- casa" de moradores precisa ler moradores para descobrir a casa da identidade
-- — com SECURITY INVOKER isso re-dispara a própria policy e o Postgres entra
-- em recursão infinita. DEFINER quebra o ciclo, e o raio é estreito de
-- propósito: a função lê UMA linha, pela identidade já injetada na transação,
-- com search_path fixo e EXECUTE revogado de PUBLIC. Ela não recebe parâmetro
-- — não há o que injetar nela.
--
-- Detalhe que o FORCE RLS acrescenta ao ADR: o definer aqui é casa_owner, que
-- por causa do FORCE também está sujeito às policies de moradores. A leitura
-- interna só não recursa porque a policy "mesma casa" é `TO casa_app` — para
-- casa_owner ela nem se aplica, e a linha da própria identidade passa pela
-- policy "a si mesmo" (TO PUBLIC). Verificado empiricamente: com a policy em
-- PUBLIC, estoura stack; com TO casa_app, nega e devolve certinho.
CREATE FUNCTION casa_atual() RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
    SELECT casa_id FROM moradores
     WHERE id = nullif(current_setting('app.current_user_id', true), '')::uuid
  $$;--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION casa_atual() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION casa_atual() TO casa_app;--> statement-breakpoint

-- Policies de casas. Só leitura da própria casa; INSERT chega na leva 2
-- (story 6, criar casa) junto com o GRANT e a policy de INSERT — policy antes
-- do fluxo é folga que ninguém revisita.
CREATE POLICY "morador_le_a_propria_casa" ON "casas"
  FOR SELECT TO casa_app
  USING ("id" = casa_atual());--> statement-breakpoint

-- Leitura "mesma casa" em moradores — o "vê quem já entrou" da Fase 0.
-- casa_id NULL nunca casa com NULL (NULL = NULL não é verdadeiro): quem ainda
-- não tem casa vê só a si mesmo, pela policy de 0000 — comportamento desejado.
-- O TO casa_app não é cosmético: mantém casa_owner (definer de casa_atual())
-- fora do alcance desta policy — sem isso, o FORCE RLS faria a função
-- reavaliar a policy que a chamou, em recursão infinita.
CREATE POLICY "morador_le_a_mesma_casa" ON "moradores"
  FOR SELECT TO casa_app
  USING ("casa_id" = casa_atual());--> statement-breakpoint

-- Policies do casa_auth (ADR-0013). USING (true) é deliberado: register, login
-- e refresh acontecem ANTES de existir identidade na transação — não há GUC
-- para escopar. O limite do casa_auth é o GRANT (por tabela e por coluna),
-- não a policy; a policy só existe porque RLS + FORCE negam por padrão.
CREATE POLICY "auth_opera_moradores" ON "moradores"
  FOR ALL TO casa_auth
  USING (true) WITH CHECK (true);--> statement-breakpoint

CREATE POLICY "auth_opera_sessoes" ON "sessoes"
  FOR ALL TO casa_auth
  USING (true) WITH CHECK (true);--> statement-breakpoint

CREATE POLICY "auth_opera_revoked_tokens" ON "revoked_tokens"
  FOR ALL TO casa_auth
  USING (true) WITH CHECK (true);--> statement-breakpoint

-- GRANTs — mínimos e explícitos, sem ALTER DEFAULT PRIVILEGES (ADR-0002).
--
-- moradores ganhou colunas de credencial nesta migration, e o GRANT de tabela
-- inteira que 0000 deu a casa_app passaria a incluí-las: com a policy "mesma
-- casa", um morador leria o hash_senha e o e-mail do outro. Troca-se o grant
-- de tabela por grants POR COLUNA — convivência para casa_app, credencial para
-- casa_auth, sem interseção além do id.
REVOKE SELECT, UPDATE ON TABLE "moradores" FROM casa_app;--> statement-breakpoint
GRANT SELECT ("id", "casa_id", "apelido", "cor", "criado_em") ON "moradores" TO casa_app;--> statement-breakpoint
-- UPDATE só de apelido e cor (o que 0000 já exercia, menos as credenciais).
-- casa_id NÃO: entrar numa casa é o fluxo criar-casa da leva 2 (story 6), que
-- concede junto com a regra.
GRANT UPDATE ("apelido", "cor") ON "moradores" TO casa_app;--> statement-breakpoint

-- casa_auth: só credencial. Sem apelido/cor/casa_id — convivência não é
-- assunto do auth. Sem INSERT: register é a leva 2 (story 4) e concede lá,
-- junto com o fluxo; UPDATE (verify-email, google_sub no primeiro login
-- social) idem.
GRANT SELECT ("id", "email", "hash_senha", "google_sub", "apple_sub", "email_verificado_em") ON "moradores" TO casa_auth;--> statement-breakpoint

-- casas: casa_app só lê. INSERT vem na leva 2 (criar casa); UPDATE/DELETE não
-- têm fluxo nenhum no Épico 1.
GRANT SELECT ON TABLE "casas" TO casa_app;--> statement-breakpoint

-- sessoes: assunto exclusivo do auth. Login INSERE, refresh LÊ e ATUALIZA
-- (consumida_em, substituida_por) e INSERE o sucessor; revogar família é
-- UPDATE de revogada_em. Sem DELETE: limpar expiradas é o worker de cron
-- (época do worker decide o role e concede). casa_app não recebe nada.
GRANT SELECT, INSERT, UPDATE ON TABLE "sessoes" TO casa_auth;--> statement-breakpoint

-- revoked_tokens: INSERT no logout (access restante vai pra blocklist),
-- SELECT na validação de refresh/logout. Sem UPDATE (linha é imutável) e sem
-- DELETE (worker de cron). Se a leva 2 decidir checar a blocklist dentro do
-- withUser, o SELECT para casa_app entra na migration dessa leva.
GRANT SELECT, INSERT ON TABLE "revoked_tokens" TO casa_auth;
