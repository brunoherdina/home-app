import { randomUUID } from 'node:crypto'
import { hash, verify } from '@node-rs/argon2'

/**
 * Hash de senha com argon2id (ADR-0003 — o `improvisa-ai` usa bcrypt via
 * passlib; aqui é argon2, o padrão atual do OWASP).
 *
 * Parâmetros do OWASP Password Storage Cheat Sheet para argon2id: 19 MiB de
 * memória, 2 iterações, paralelismo 1. O custo de memória é o ponto — é ele que
 * torna o ataque por GPU caro, e é por isso que o `senhaSchema` do contracts
 * tem teto de 128 caracteres: sem teto, o registro vira DoS barato.
 *
 * O `algorithm` não é passado: `Algorithm.Argon2id` é o default do
 * `@node-rs/argon2`, e o enum dele é `const enum` — inalcançável com
 * `verbatimModuleSyntax` sem um cast numérico que envelheceria pior do que a
 * omissão. Quem cobra a escolha é o teste, conferindo o prefixo `$argon2id$` do
 * hash gerado: se a lib mudar de default, ele reprova.
 */
const PARAMETROS = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
} as const

export function geraHash(senha: string): Promise<string> {
  return hash(senha, PARAMETROS)
}

/**
 * Hash descartável de uma senha aleatória, usado só para gastar tempo.
 *
 * Sem ele, "e-mail não existe" responde em microssegundos e "senha errada"
 * responde em ~50 ms: a diferença é um oráculo de quem tem conta no Casa, e
 * nenhuma mensagem de erro cuidadosa esconde isso. A promessa é memoizada de
 * propósito — o custo é pago uma vez por processo, não a cada login falho.
 */
let hashFalso: Promise<string> | null = null
function hashDeComparacao(): Promise<string> {
  hashFalso ??= geraHash(randomUUID())
  return hashFalso
}

/**
 * Confere a senha em tempo comparável ao do caminho feliz.
 *
 * `hashArmazenado` é `null` para conta social (Google/Apple, sem senha local) e
 * para e-mail inexistente. Nos dois casos o resultado é `false` — mas depois de
 * um argon2 de verdade.
 */
export async function conferaSenha(senha: string, hashArmazenado: string | null): Promise<boolean> {
  if (hashArmazenado === null) {
    await verify(await hashDeComparacao(), senha, PARAMETROS).catch(() => false)
    return false
  }

  // Hash gravado num formato que o argon2 não entende (corrupção, migração de
  // algoritmo) é credencial inválida, não 500: o efeito é o mesmo para quem
  // tenta entrar, e um throw aqui viraria erro interno num caminho público.
  return verify(hashArmazenado, senha, PARAMETROS).catch(() => false)
}
