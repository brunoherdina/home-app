/**
 * O `SQLSTATE` de um erro que veio do Postgres, ou `null` se o erro não é dele.
 *
 * Existe porque o driver nem sempre entrega o erro na mão: quando a query passa
 * pelo drizzle, o `code` do `pg` fica em `cause`. Procurar nos dois lugares num
 * helper só evita que cada handler descubra isso de novo — e que um deles
 * esqueça, trate violação de constraint como falha genérica e devolva 500 onde
 * cabia 409.
 */
export function codigoPg(erro: unknown): string | null {
  const direto = (erro as { code?: unknown } | null)?.code
  if (typeof direto === 'string') return direto

  const causa = (erro as { cause?: { code?: unknown } } | null)?.cause?.code
  return typeof causa === 'string' ? causa : null
}
