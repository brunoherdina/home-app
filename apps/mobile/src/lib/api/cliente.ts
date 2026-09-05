import Constants from 'expo-constants'
import { sessao } from '../sessao'
import { criaRequisita } from './nucleo'

/**
 * Único ponto de saída HTTP do app.
 *
 * Nenhum componente chama `fetch` — a guarda de camada reprova. É o que permite
 * cachear, mockar em teste e trocar transporte sem reescrever tela; e é uma
 * regra que se quebra por acidente num autoimport, não por decisão.
 */
const baseUrl =
  process.env.EXPO_PUBLIC_API_URL ??
  // No device físico, `localhost` é o próprio telefone. Sem a variável, cai no
  // host que serviu o bundle do Metro — que é a máquina de desenvolvimento.
  `http://${Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost'}:3333`

/**
 * Cliente com o interceptor de sessão: 401 → refresh single-flight → repete a
 * request uma vez (ADR-0008). A lógica mora em nucleo.ts, injetável e testada
 * em Node; aqui só se liga o baseUrl do runtime Expo e a sessão real.
 */
export const requisita = criaRequisita({ baseUrl, sessao })

export { ErroDaApi } from './nucleo'
export { baseUrl }
