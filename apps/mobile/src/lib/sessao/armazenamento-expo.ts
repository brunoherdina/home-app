import * as SecureStore from 'expo-secure-store'
import type { ArmazenamentoRefresh } from './sessao'

/**
 * Cofre real do refresh token: Keychain (iOS) / Keystore (Android) via
 * expo-secure-store — nunca AsyncStorage, que é disco sem criptografia
 * (ADR-0008).
 *
 * `grava` e `apaga` engolem a falha porque ali a degradação é de fato
 * aceitável: sem persistir, a sessão dura até o app fechar; sem apagar, nada
 * fica pior do que já estava.
 *
 * `le` **não** engole. Devolver `null` quando a leitura falhou colapsa "não
 * consegui ler" em "não existe", e quem recebe esse `null` (nucleo.ts) lê
 * ausência como sessão acabada e chama `sessao.expira()` — que faz
 * `deleteItemAsync`. A assimetria é o que torna o engano irreversível:
 * `getItemAsync` falha com o device bloqueado (o Keychain nasce
 * `WHEN_UNLOCKED`, e um refetch do TanStack Query ao reconectar acontece com
 * a tela apagada), mas `deleteItemAsync` funciona bloqueado. O refresh de
 * 30–90 dias que ainda valia seria destruído por uma condição passageira, e ao
 * desbloquear a pessoa estaria na tela de login — o logout que o ADR-0008
 * existe para eliminar. Idem no restore de backup no Android, onde o erro de
 * decrypt dura até o item ser reescrito.
 *
 * A falha de leitura sobe como exceção e o núcleo a trata pelo que ela é:
 * transitória — a request falha, o cofre fica, a próxima tentativa lê de novo.
 */
const CHAVE_REFRESH = 'casa.refreshToken'

export const armazenamentoSeguro: ArmazenamentoRefresh = {
  /** Sem try/catch de propósito — ver o comentário do módulo. */
  le() {
    return SecureStore.getItemAsync(CHAVE_REFRESH)
  },

  async grava(token) {
    try {
      await SecureStore.setItemAsync(CHAVE_REFRESH, token)
    } catch (erro) {
      // Sem persistir, a sessão dura só até o app fechar — degradação aceitável.
      console.warn('[sessao] falha ao gravar o refresh token no secure store', erro)
    }
  },

  async apaga() {
    try {
      await SecureStore.deleteItemAsync(CHAVE_REFRESH)
    } catch (erro) {
      console.warn('[sessao] falha ao apagar o refresh token do secure store', erro)
    }
  },
}
