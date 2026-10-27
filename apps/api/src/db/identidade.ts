import { sql } from 'drizzle-orm'

/**
 * O morador da transação, lido do lugar onde o `withUser` o injetou
 * (`app.current_user_id`, ADR-0002) — a mesma expressão que as policies e
 * `cria_casa()`/`entra_na_casa()` usam.
 *
 * Existe para o serviço nunca receber "quem sou eu" como parâmetro: o "quem" é
 * a identidade da transação, e um `moradorId` passado à mão é exatamente o
 * argumento que um dia chega trocado. Função e não constante porque cada query
 * monta o próprio SQL.
 */
export function moradorDaTransacao() {
  return sql<string>`nullif(current_setting('app.current_user_id', true), '')::uuid`
}
