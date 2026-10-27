CREATE TABLE "tarefas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"casa_id" uuid NOT NULL,
	"titulo" text NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tarefas" ADD CONSTRAINT "tarefas_casa_id_casas_id_fk" FOREIGN KEY ("casa_id") REFERENCES "public"."casas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tarefas_casa_id_idx" ON "tarefas" USING btree ("casa_id");--> statement-breakpoint
-- Daqui para baixo é SQL escrito à mão: o drizzle-kit não gera policy, GRANT
-- nem função (ADR-0005).

ALTER TABLE "tarefas" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tarefas" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- Toda tarefa é da casa, e só a casa a vê. Mesmo predicado de `casas` e
-- `moradores`, pela mesma função — ADR-0012.
CREATE POLICY "morador_le_as_tarefas_da_casa" ON "tarefas"
  FOR SELECT TO casa_app
  USING ("casa_id" = casa_atual());--> statement-breakpoint

-- O template semeia por AQUI, como casa_app e sob policy — não por um INSERT
-- de migration. A armadilha do infra/README.md ("seed antes do FORCE") vale
-- para semente que roda DENTRO da migration, como casa_owner; o template por
-- tipo é por casa e em runtime, então não há seed de migration para ordenar.
-- O preço de fazer assim é este WITH CHECK: se `cria_casa()` não tivesse
-- acabado de vincular a identidade à casa nova, `casa_atual()` seria NULL e o
-- seed inteiro seria rejeitado — a mesma rejeição da armadilha, um andar acima.
CREATE POLICY "morador_cria_tarefa_na_propria_casa" ON "tarefas"
  FOR INSERT TO casa_app
  WITH CHECK ("casa_id" = casa_atual());--> statement-breakpoint

-- Sem UPDATE e sem DELETE: concluir, editar e apagar tarefa são o Épico 2, e
-- chegam com o fluxo. Privilégio antes da regra é folga que ninguém revisita.
GRANT SELECT, INSERT ON TABLE "tarefas" TO casa_app;--> statement-breakpoint

-- FORCE ROW LEVEL SECURITY vale também para o dono da tabela, e `casas` não
-- tem policy de INSERT nenhuma — 0001 só criou a de SELECT. Sem esta policy, o
-- INSERT de dentro de cria_casa() é rejeitado mesmo com a função rodando como
-- casa_owner: "new row violates row-level security policy for table casas".
--
-- É a armadilha do infra/README.md ("seed antes do FORCE") um andar acima: não
-- no seed da migration, mas na função SECURITY DEFINER. Como aqui não há
-- "antes do FORCE" possível — a função roda em runtime —, a saída é a policy.
--
-- `TO casa_owner` e não `TO casa_app`: dar INSERT em casas ao casa_app é
-- justamente o que abriria o caminho paralelo que esta função existe para
-- fechar. Quem chega a este INSERT já passou pelas duas checagens da função —
-- identidade presente na transação e morador ainda sem casa.
CREATE POLICY "cria_casa_insere_a_casa" ON "casas"
  FOR INSERT TO casa_owner
  WITH CHECK (true);--> statement-breakpoint

-- cria_casa() — o ÚNICO caminho pelo qual um morador passa a ter casa.
--
-- Por que uma função, e não `GRANT INSERT ON casas` + `GRANT UPDATE (casa_id)
-- ON moradores`: com esses dois privilégios, a policy que autoriza a pessoa a
-- atualizar a si mesma (`morador_atualiza_a_si_mesmo`, 0000) autorizaria
-- também `UPDATE moradores SET casa_id = '<uuid de outra casa>'`. Quem
-- descobrisse um uuid de casa — log, print, resposta de API futura — entraria
-- nela sem convite. Nenhuma policy escrita sobre a linha de `moradores`
-- consegue distinguir "a casa que acabei de criar" de "uma casa qualquer";
-- então o privilégio não é concedido, e entrar em casa passa a ser esta
-- operação nomeada. Aceitar convite (Épico 2) será a segunda função, com a sua
-- própria prova — e não um relaxamento desta.
--
-- SECURITY DEFINER pelos mesmos motivos de `casa_atual()`: raio estreito,
-- search_path fixo, EXECUTE revogado de PUBLIC. A identidade NÃO é parâmetro —
-- vem do GUC da transação, então não há como pedir casa em nome de outro.
CREATE FUNCTION cria_casa(p_nome text, p_tipo tipo_de_casa) RETURNS uuid
  LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_morador uuid := nullif(current_setting('app.current_user_id', true), '')::uuid;
  v_casa_atual uuid;
  -- Gerado aqui, e não lido de volta com `INSERT ... RETURNING id`: RETURNING
  -- exige policy de SELECT sobre a linha nova, e a de `casas` é `TO casa_app` —
  -- casa_owner não casa com ela. O Postgres reporta essa falta com a MESMA
  -- mensagem do WITH CHECK ("new row violates row-level security policy"), o
  -- que manda procurar o erro no lugar errado. Sem RETURNING, o INSERT não lê
  -- nada e nenhuma policy de leitura precisa existir para o owner.
  v_casa uuid := gen_random_uuid();
BEGIN
  IF v_morador IS NULL THEN
    RAISE EXCEPTION 'cria_casa sem identidade na transação' USING ERRCODE = 'C0002';
  END IF;

  -- FOR UPDATE, e não um SELECT solto: dois POSTs paralelos do mesmo morador
  -- passariam os dois pela checagem e criariam duas casas, deixando uma órfã
  -- sem morador nenhum. O lock serializa o par de requests na linha da pessoa.
  SELECT casa_id INTO v_casa_atual FROM moradores WHERE id = v_morador FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'identidade não corresponde a morador' USING ERRCODE = 'C0002';
  END IF;

  -- Uma casa por conta no v1 (ADR-0012). Sair de casa é fluxo de outro épico e
  -- vai ter regra própria (o que acontece com as tarefas, com o histórico).
  IF v_casa_atual IS NOT NULL THEN
    RAISE EXCEPTION 'morador já tem casa' USING ERRCODE = 'C0001';
  END IF;

  INSERT INTO casas ("id", "nome", "tipo") VALUES (v_casa, p_nome, p_tipo);
  UPDATE moradores SET casa_id = v_casa WHERE id = v_morador;

  RETURN v_casa;
END;
$$;--> statement-breakpoint

REVOKE EXECUTE ON FUNCTION cria_casa(text, tipo_de_casa) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION cria_casa(text, tipo_de_casa) TO casa_app;
