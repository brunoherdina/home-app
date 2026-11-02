-- Épico 2, story 13a — cancelar convite. Migration sem DDL: só policy e GRANT,
-- no formato de 0004 (o privilégio chega junto com a tela que o usa, como 0005
-- prometeu: "cancelar convite é fluxo com tela própria").
--
-- Cancelar é DELETE, não uma coluna `cancelado_em`. A linha apagada cai no
-- NOT FOUND de `entra_na_casa()` sem mexer na função, e é exatamente a recusa
-- que o critério pede: cancelado, inexistente, expirado e usado dão o mesmo
-- `convite inválido`. Uma coluna nova obrigaria a função a conhecer mais um
-- estado — e um quarto motivo de recusa é um quarto lugar para alguém um dia
-- separar a mensagem.
--
-- O raio da policy, cláusula por cláusula:
--   - `casa_id = casa_atual()`: só convite da própria casa (ADR-0012).
--   - `criado_por = identidade`: só quem emitiu cancela. O app só mostra o
--     código para quem o gerou, então ninguém mais tem caminho para pedir —
--     e privilégio sem caminho é raio sem motivo.
--   - `usado_em IS NULL`: convite consumido é histórico de quem entrou na casa
--     ("quando" responde suporte, ver schema.ts). Apagá-lo não desfaz a
--     entrada e só apagaria o registro dela.
CREATE POLICY "morador_cancela_o_proprio_convite" ON "convites"
  FOR DELETE TO casa_app
  USING (
    "casa_id" = casa_atual()
    AND "criado_por" = nullif(current_setting('app.current_user_id', true), '')::uuid
    AND "usado_em" IS NULL
  );--> statement-breakpoint

GRANT DELETE ON TABLE "convites" TO casa_app;
