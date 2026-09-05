/**
 * Erros que a API sabe traduzir em resposta.
 *
 * O envelope é o `erroSchema` do `@casa/contracts`: `codigo` estável para o
 * cliente decidir, `mensagem` para humano. Qualquer outro erro cai no
 * `ERRO_INTERNO` do handler global — o padrão seguro é não vazar detalhe de
 * exceção não prevista para fora.
 */
export class ErroHttp extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
  ) {
    super(mensagem)
    this.name = new.target.name
  }
}

/**
 * Credencial inválida — no login e no refresh.
 *
 * Uma mensagem só para "e-mail não existe" e "senha errada" é deliberado: dois
 * textos diferentes transformam o login num oráculo de quem tem conta aqui. O
 * `servico` complementa com tempo constante; a mensagem sozinha não bastaria.
 */
export class CredencialInvalidaError extends ErroHttp {
  constructor(mensagem = 'E-mail ou senha não conferem.') {
    super(401, 'CREDENCIAL_INVALIDA', mensagem)
  }
}

/** Payload reprovado pelo schema zod compartilhado (ADR-0009). */
export class PayloadInvalidoError extends ErroHttp {
  constructor(readonly detalhes: unknown) {
    super(400, 'PAYLOAD_INVALIDO', 'Os dados enviados não passaram na validação.')
  }
}

/**
 * Sessão que o servidor não aceita mais: refresh desconhecido, expirado,
 * revogado ou já consumido.
 *
 * Código próprio e separado de `CREDENCIAL_INVALIDA` porque o cliente reage
 * diferente: aqui ele desloga sem oferecer "tente de novo" — o interceptor de
 * `lib/api` já trata o segundo 401 como fim de sessão.
 */
export class SessaoInvalidaError extends ErroHttp {
  constructor(mensagem = 'Sua sessão expirou. Entre de novo.') {
    super(401, 'SESSAO_INVALIDA', mensagem)
  }
}
