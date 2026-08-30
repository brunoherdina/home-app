import { expect, test } from 'vitest'
import { loginSchema, registroSchema } from './auth'

/**
 * Testes de INTENÇÃO (casa-qa): cada caso aqui trava uma regra de negócio que
 * antes só existia como comentário no schema. O typecheck não vê nenhuma
 * delas — trocar o `pipe` por checks encadeados, ou alinhar a senha do login
 * com a do registro "por consistência", compila liso e só quebra em produção.
 */

const registroValido = {
  apelido: 'Bruno',
  cor: 'verde-menta',
  email: 'bruno@example.com',
  senha: 'a'.repeat(12),
}

test('e-mail é normalizado ANTES de validado: "  Foo@Bar.COM  " vira "foo@bar.com"', () => {
  // Se o trim/toLowerCase rodar DEPOIS do formato (checks encadeados em vez de
  // pipe), o espaço das pontas reprova e este teste falha.
  const { email } = registroSchema.parse({ ...registroValido, email: '  Foo@Bar.COM  ' })
  expect(email).toBe('foo@bar.com')
})

test('e-mail com espaço INTERNO reprova — trim só limpa as pontas', () => {
  expect(registroSchema.safeParse({ ...registroValido, email: 'foo @bar.com' }).success).toBe(false)
})

test('registro: senha de 11 caracteres reprova, 12 passa (OWASP ASVS V2.1.1)', () => {
  expect(registroSchema.safeParse({ ...registroValido, senha: 'a'.repeat(11) }).success).toBe(false)
  expect(registroSchema.safeParse({ ...registroValido, senha: 'a'.repeat(12) }).success).toBe(true)
})

test('login aceita qualquer senha NÃO VAZIA — a assimetria com o registro é deliberada', () => {
  // A política de comprimento vale no REGISTRO. No login, senha curta deve
  // chegar ao argon2 e falhar como 401, não como 400 — senão a primeira
  // mudança de política desloga pra sempre quem criou a conta antes dela.
  // Este teste existe para DOCUMENTAR a assimetria: quem "consertar" o login
  // para `senhaSchema` reprova aqui e lê o porquê.
  expect(loginSchema.safeParse({ email: 'a@b.com', senha: 'x' }).success).toBe(true)
  expect(loginSchema.safeParse({ email: 'a@b.com', senha: '' }).success).toBe(false)
})

test('registro exige cor — apelido e cor são escolhidos na mesma tela da Fase 0', () => {
  // `moradores.cor` é NOT NULL: sem a cor no payload, a rota de registro
  // (story 4) não teria de onde tirar o valor.
  const { cor: _cor, ...semCor } = registroValido
  expect(registroSchema.safeParse(semCor).success).toBe(false)
})
