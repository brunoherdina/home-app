import { describe, expect, it } from 'vitest'
import { conferaSenha, geraHash } from './senha.js'

const SENHA = 'uma senha longa o suficiente'

describe('senha', () => {
  it('confere a senha correta', async () => {
    const hash = await geraHash(SENHA)

    expect(hash).not.toContain(SENHA)
    expect(hash.startsWith('$argon2id$')).toBe(true)
    await expect(conferaSenha(SENHA, hash)).resolves.toBe(true)
  })

  it('recusa a senha errada', async () => {
    const hash = await geraHash(SENHA)

    await expect(conferaSenha('uma senha longa o suficientf', hash)).resolves.toBe(false)
  })

  it('sala cada hash — duas contas com a mesma senha não se parecem', async () => {
    // Sem sal, hashes iguais no dump denunciam quem repetiu senha, e uma
    // rainbow table quebra as duas contas de uma vez.
    const [a, b] = await Promise.all([geraHash(SENHA), geraHash(SENHA)])

    expect(a).not.toBe(b)
  })

  it('recusa sem explodir quando não há hash (conta social ou e-mail inexistente)', async () => {
    // O caminho do login com e-mail que não existe. Precisa devolver false, não
    // lançar: um throw aqui viraria 500 e distinguiria "não existe" de "senha
    // errada" pelo status — o oráculo de enumeração que a mensagem única evita.
    await expect(conferaSenha(SENHA, null)).resolves.toBe(false)
  })

  it('trata hash corrompido como credencial inválida, não como erro interno', async () => {
    await expect(conferaSenha(SENHA, 'isto-não-é-um-hash-argon2')).resolves.toBe(false)
  })
})
