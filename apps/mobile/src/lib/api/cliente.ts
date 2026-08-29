import Constants from 'expo-constants'

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

export class ErroDaApi extends Error {
  constructor(
    readonly status: number,
    readonly codigo: string,
    mensagem: string,
  ) {
    super(mensagem)
  }
}

export async function requisita<T>(
  caminho: string,
  opcoes: RequestInit & { valida: (dado: unknown) => T },
): Promise<T> {
  const { valida, ...init } = opcoes
  const resposta = await fetch(`${baseUrl}${caminho}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...init.headers },
  })

  const corpo: unknown = await resposta.json().catch(() => null)

  if (!resposta.ok) {
    const erro = corpo as { codigo?: string; mensagem?: string } | null
    throw new ErroDaApi(
      resposta.status,
      erro?.codigo ?? 'ERRO_DESCONHECIDO',
      erro?.mensagem ?? 'A API respondeu com erro.',
    )
  }

  // Valida a resposta com o mesmo schema zod que a API usou para produzi-la
  // (ADR-0009). Contrato quebrado aparece aqui, não três telas adiante.
  return valida(corpo)
}

export { baseUrl }
