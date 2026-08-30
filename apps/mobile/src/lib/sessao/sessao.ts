/**
 * Sessão do app — lógica pura, testável em Node.
 *
 * Divisão do ADR-0008: o access curto (~15 min) vive só em memória — fechar o
 * app descarta, e o refresh reidrata na volta; o refresh longo vive no secure
 * store e só sai daqui para o endpoint `/api/auth/refresh`.
 *
 * Nenhum import de expo-* neste arquivo: o storage chega injetado (a
 * implementação real está em armazenamento-expo.ts), o que deixa o módulo
 * rodar em vitest sem mock de nativo.
 */

/** Contrato do cofre do refresh token — cumprido por expo-secure-store no app. */
export type ArmazenamentoRefresh = {
  /**
   * `null` significa **não existe**, e só isso. Falha de leitura (Keychain
   * bloqueado, keystore em restore de backup) **rejeita**: colapsar as duas em
   * `null` faz quem lê tratar como sessão acabada e apagar um refresh que
   * ainda valia. Só o servidor pode declarar a credencial morta.
   */
  le(): Promise<string | null>
  grava(token: string): Promise<void>
  apaga(): Promise<void>
}

export type ParDeTokens = { accessToken: string; refreshToken: string }

export type Sessao = ReturnType<typeof criaSessao>

/** Visão mínima da sessão que o cliente HTTP precisa (lib/api/nucleo.ts). */
export type SessaoDoCliente = Pick<
  Sessao,
  'leAccessToken' | 'leRefreshToken' | 'guardaTokens' | 'expira'
>

export function criaSessao(armazenamento: ArmazenamentoRefresh) {
  let accessToken: string | null = null
  const ouvintes = new Set<() => void>()

  return {
    leAccessToken: () => accessToken,

    leRefreshToken: () => armazenamento.le(),

    /** Login e rotação de refresh passam por aqui (ADR-0008). */
    async guardaTokens(tokens: ParDeTokens) {
      accessToken = tokens.accessToken
      await armazenamento.grava(tokens.refreshToken)
    },

    /** Logout deliberado: limpa sem emitir evento — quem saiu não precisa de aviso. */
    async encerra() {
      accessToken = null
      await armazenamento.apaga()
    },

    /**
     * A sessão morreu sem o usuário pedir (refresh falhou ou foi revogado).
     * Limpa tudo e avisa quem assinou. A UI de login é a story 9; até lá o
     * evento só precisa existir para ela assinar depois.
     */
    async expira() {
      accessToken = null
      await armazenamento.apaga()
      for (const ouvinte of ouvintes) ouvinte()
    },

    /** Assina "sessão expirou"; devolve a função que cancela a assinatura. */
    aoExpirar(ouvinte: () => void) {
      ouvintes.add(ouvinte)
      return () => {
        ouvintes.delete(ouvinte)
      }
    },
  }
}
