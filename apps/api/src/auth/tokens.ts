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
    return assinaRefreshDe(moradorId, jti, expiraEm)
  }

  /**
   * Reassina um refresh que JÁ existe em `sessoes`, com o mesmo `jti` e o mesmo
   * prazo.
   *
   * Existe por causa da janela de graça (ADR-0008): quando dois requests
   * paralelos chegam com o mesmo refresh, o segundo precisa receber o sucessor
   * que o primeiro emitiu — e o servidor não guarda o token, só a linha. Como
   * `jti` e `expira_em` estão gravados, a assinatura é reprodutível.
   *
   * O JWT sai diferente byte a byte do original (o `iat` é outro), e isso não
   * importa: o que identifica a sessão é o `jti`, e os dois strings apontam
   * para a mesma linha. Guardar o token em vez de reassiná-lo seria manter
   * credencial em claro no banco pelo prazo inteiro do refresh.
   */
  async function assinaRefreshDe(
    moradorId: string,
    jti: string,
    expiraEm: Date,
  ): Promise<RefreshAssinado> {
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

  return { assinaAcesso, assinaRefresh, assinaRefreshDe, verificaRefresh }
}

export type Tokens = ReturnType<typeof criaTokens>
