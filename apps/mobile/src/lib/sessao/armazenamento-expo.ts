import * as SecureStore from 'expo-secure-store'
import type { ArmazenamentoRefresh } from './sessao'

/**
 * Cofre real do refresh token: Keychain (iOS) / Keystore (Android) via
 * expo-secure-store — nunca AsyncStorage, que é disco sem criptografia
 * (ADR-0008).
 *
 * Toda leitura/escrita em try/catch porque o secure store falha em condições
 * reais (keystore corrompido, device sem bloqueio de tela, restore de backup):
 * a falha vira "sessão ausente" — a pessoa loga de novo — em vez de crash na
 * abertura do app.
 */
const CHAVE_REFRESH = 'casa.refreshToken'

export const armazenamentoSeguro: ArmazenamentoRefresh = {
  async le() {
    try {
      return await SecureStore.getItemAsync(CHAVE_REFRESH)
    } catch (erro) {
      console.warn('[sessao] falha ao ler o refresh token do secure store', erro)
      return null
    }
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
