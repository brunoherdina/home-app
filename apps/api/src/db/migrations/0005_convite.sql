CREATE TABLE "convites" (
	"codigo" text PRIMARY KEY NOT NULL,
	"casa_id" uuid NOT NULL,
	"criado_por" uuid NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"usado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "convites" ADD CONSTRAINT "convites_casa_id_casas_id_fk" FOREIGN KEY ("casa_id") REFERENCES "public"."casas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "convites" ADD CONSTRAINT "convites_criado_por_moradores_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."moradores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "convites_casa_id_idx" ON "convites" USING btree ("casa_id");--> statement-breakpoint
-- Daqui para baixo é SQL escrito à mão: o drizzle-kit não gera policy, GRANT
-- nem função (ADR-0005).

ALTER TABLE "convites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "convites" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- Quem já está na casa vê os convites dela — é o que permite reexibir um código
-- já gerado sem emitir outro. Mesmo predicado de `casas` e `tarefas` (ADR-0012).
--
-- Note o que esta policy NÃO permite: buscar convite POR CÓDIGO. Quem aceita
-- ainda não tem casa, então `casa_atual()` é NULL e esta policy devolve zero
-- linhas para ele — de propósito. Achar o convite pelo código é trabalho da
-- função lá embaixo, e é isso que impede o aceite de virar uma leitura livre da
-- tabela (que seria adivinhar código com feedback imediato).
CREATE POLICY "morador_le_os_convites_da_casa" ON "convites"
  FOR SELECT TO casa_app
  USING ("casa_id" = casa_atual());--> statement-breakpoint

-- Convidar é escrita de quem MORA na casa, para a PRÓPRIA casa. As duas metades
-- do WITH CHECK são necessárias: sem a primeira, um morador emitiria convite
-- para casa alheia; sem a segunda, emitiria convite assinado por outra pessoa.
CREATE POLICY "morador_convida_para_a_propria_casa" ON "convites"
  FOR INSERT TO casa_app
  WITH CHECK (
    "casa_id" = casa_atual()
    AND "criado_por" = nullif(current_setting('app.current_user_id', true), '')::uuid
  );--> statement-breakpoint

-- As duas policies do casa_owner existem pela armadilha do FORCE RLS, a mesma
-- que 0003 documenta em `casas`: `entra_na_casa()` é SECURITY DEFINER e roda
-- como casa_owner, que com FORCE também está sujeito às policies — e as de cima
-- são `TO casa_app`, então não se aplicam a ele. Sem estas, a função lê zero
-- convites e o aceite falha como se todo código fosse inválido.
--
-- O raio delas é o corpo da função, não uma porta: `casa_owner` não é role de
-- runtime (a API conecta como casa_app / casa_auth — ADR-0002) e não tem GRANT
-- de conexão para a aplicação.
CREATE POLICY "entra_na_casa_le_o_convite" ON "convites"
  FOR SELECT TO casa_owner
  USING (true);--> statement-breakpoint

CREATE POLICY "entra_na_casa_consome_o_convite" ON "convites"
  FOR UPDATE TO casa_owner
  USING (true) WITH CHECK (true);--> statement-breakpoint

-- SELECT e INSERT, e nada além. Sem UPDATE: consumir convite é a função, e dar
-- UPDATE ao casa_app seria deixá-lo marcar `usado_em` sem entrar em casa
-- nenhuma — ou, pior, desmarcar. Sem DELETE: cancelar convite é fluxo com tela
-- própria, e o privilégio chega junto com ela.
GRANT SELECT, INSERT ON TABLE "convites" TO casa_app;--> statement-breakpoint

-- entra_na_casa() — a SEGUNDA (e última) porta para um morador passar a ter
-- casa. A primeira é `cria_casa()`, em 0003.
--
-- São duas funções e não uma com parâmetro opcional, e isso está prometido na
-- 0003: "aceitar convite será a segunda função, com a sua própria prova — e não
-- um relaxamento desta". As duas terminam no mesmo `UPDATE moradores SET
-- casa_id`, mas provam coisas diferentes antes de chegar lá — uma prova que a
-- casa acabou de nascer, a outra que alguém de dentro emitiu o convite. Fundir
-- as duas seria colocar as duas provas atrás do mesmo `IF`.
--
-- O privilégio continua ausente do casa_app: sem `GRANT UPDATE (casa_id) ON
-- moradores`, a policy `morador_atualiza_a_si_mesmo` (0000) não consegue ser
-- usada para entrar em casa alheia com um uuid descoberto.
CREATE FUNCTION entra_na_casa(p_codigo text) RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_morador uuid := nullif(current_setting('app.current_user_id', true), '')::uuid;
  v_casa_atual uuid;
  v_casa uuid;
BEGIN
  IF v_morador IS NULL THEN
    RAISE EXCEPTION 'entra_na_casa sem identidade na transação' USING ERRCODE = 'C0002';
  END IF;

  -- Mesma ordem de lock de `cria_casa()`: a linha da pessoa primeiro, o recurso
  -- disputado depois. Ordem invertida entre as duas funções seria deadlock
  -- entre alguém criando casa e alguém aceitando convite.
  SELECT casa_id INTO v_casa_atual FROM moradores WHERE id = v_morador FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'identidade não corresponde a morador' USING ERRCODE = 'C0002';
  END IF;

  -- Uma casa por conta no v1 (ADR-0012) — inclusive para quem convidou (que já
  -- tem casa) e para quem tenta usar um segundo convite.
  IF v_casa_atual IS NOT NULL THEN
    RAISE EXCEPTION 'morador já tem casa' USING ERRCODE = 'C0001';
  END IF;

  -- Comparação exata: quem normaliza o que a pessoa digitou (maiúsculas, hífen,
  -- O/I/L) é o contrato compartilhado (packages/contracts/src/convite.ts), e o
  -- app e a API rodam o MESMO schema (ADR-0009). Normalizar de novo aqui criaria
  -- uma segunda regra para divergir da primeira.
  --
  -- FOR UPDATE fecha a corrida das duas pessoas com o mesmo código: em READ
  -- COMMITTED o Postgres reavalia o WHERE depois de pegar o lock, então a
  -- segunda transação vê `usado_em` já preenchido, a linha deixa de casar e ela
  -- cai no NOT FOUND abaixo. Sem o lock, as duas leriam NULL e as duas entrariam
  -- — que é como um convite de uso único vira convite de uso ilimitado.
  SELECT casa_id INTO v_casa
    FROM convites
   WHERE codigo = p_codigo
     AND usado_em IS NULL
     AND expira_em > now()
   FOR UPDATE;

  -- Inexistente, expirado e já usado dão a MESMA recusa, de propósito: separar
  -- os três diria a quem adivinha código que ele acertou o sorteio e chegou
  -- tarde — informação que só serve para quem está adivinhando.
  IF NOT FOUND THEN
    RAISE EXCEPTION 'convite inválido' USING ERRCODE = 'C0003';
  END IF;

  UPDATE convites SET usado_em = now() WHERE codigo = p_codigo;
  UPDATE moradores SET casa_id = v_casa WHERE id = v_morador;

  RETURN v_casa;
END;
$$;--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION entra_na_casa(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION entra_na_casa(text) TO casa_app;
