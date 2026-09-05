import { randomUUID } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import { SessaoInvalidaError } from '../erros.js'

/**
 * Par de tokens do ADR-0008: access curto na memória do app, refresh longo no
 * `expo-secure-store`.
 *
 * Fábrica, e não módulo com `import { config }`: assim o teste assina com um
 * segredo de brinquedo e um TTL de um segundo sem precisar de `.env` — e a
 * expiração deixa de ser algo que só se verifica esperando 15 minutos.
 */
export type ConfigDeTokens = {
  segredo: string
  ttlAcessoSegundos: number
  ttlRefreshDias: number
}

/** O que um refresh válido prova: quem é, e QUAL linha de `sessoes` ele é. */
export type CrachaDeRefresh = {
  moradorId: string
  jti: string
}

export type AccessAssinado = {
  token: string
  jti: string
  expiraEmSegundos: number
}

export type RefreshAssinado = {
  token: string
  jti: string
  expiraEm: Date
}

const ALG = 'HS256'

/**
 * `tipo` no payload separa os dois tokens.
 *
 * Sem ele, os dois são JWT assinados pelo mesmo segredo e o access — que viaja
 * em todo header `Authorization`, aparece em log de proxy e vive fora do
 * SecureStore — seria aceito em `/api/auth/refresh` como se fosse o refresh.
 */
const TIPO_ACESSO = 'acesso'
const TIPO_REFRESH = 'refresh'

export function criaTokens(cfg: ConfigDeTokens) {
  const chave = new TextEncoder().encode(cfg.segredo)

  async function assinaAcesso(moradorId: string): Promise<AccessAssinado> {
    const jti = randomUUID()
    const token = await new SignJWT({ tipo: TIPO_ACESSO })
      .setProtectedHeader({ alg: ALG })
      .setSubject(moradorId)
      .setJti(jti)
      .setIssuedAt()
      .setExpirationTime(`${cfg.ttlAcessoSegundos}s`)
      .sign(chave)

    return { token, jti, expiraEmSegundos: cfg.ttlAcessoSegundos }
  }

  async function assinaRefresh(moradorId: string): Promise<RefreshAssinado> {
    const jti = randomUUID()
    const expiraEm = new Date(Date.now() + cfg.ttlRefreshDias * 24 * 60 * 60 * 1000)
    const token = await new SignJWT({ tipo: TIPO_REFRESH })
      .setProtectedHeader({ alg: ALG })
      .setSubject(moradorId)
      .setJti(jti)
      .setIssuedAt()
      // Segundos inteiros: `exp` é NumericDate, e o milissegundo que sobra da
      // divisão faria o token expirar até 1 s depois da linha de `sessoes`.
      .setExpirationTime(Math.floor(expiraEm.getTime() / 1000))
      .sign(chave)

    return { token, jti, expiraEm }
  }

  /**
   * Assinatura e prazo — nada além disso.
   *
   * Token válido aqui NÃO é sessão válida: rotação, reuso e revogação vivem na
   * tabela `sessoes`, e é ela que decide (ADR-0008). Este verify só existe para
   * o banco não ser consultado com um `jti` que qualquer um inventou.
   */
  async function verificaRefresh(token: string): Promise<CrachaDeRefresh> {
    let payload
    try {
      // `algorithms` explícito: sem a lista, um token com `alg: "none"` ou
      // trocado para outro algoritmo é o ataque de confusão de algoritmo.
      ;({ payload } = await jwtVerify(token, chave, { algorithms: [ALG] }))
    } catch {
      // Motivo real (expirado × assinatura errada × malformado) fica no
      // servidor: para o cliente as três significam a mesma coisa — entre de novo.
      throw new SessaoInvalidaError()
    }

    if (payload.tipo !== TIPO_REFRESH) throw new SessaoInvalidaError()
    if (!payload.sub || !payload.jti) throw new SessaoInvalidaError()

    return { moradorId: payload.sub, jti: payload.jti }
  }

  return { assinaAcesso, assinaRefresh, verificaRefresh }
}

export type Tokens = ReturnType<typeof criaTokens>
