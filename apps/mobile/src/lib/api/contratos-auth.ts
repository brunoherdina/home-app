/**
 * Shapes de /api/auth/refresh (ADR-0008), definidos localmente por enquanto.
 *
 * TODO(@casa/contracts): o endpoint ainda não existe e a lane de contratos
 * corre em paralelo — quando ela mergear, apagar este arquivo e importar o
 * schema zod compartilhado, como saude.ts já faz (ADR-0009).
 */
export type PedidoRefresh = { refreshToken: string }
export type RespostaRefresh = { accessToken: string; refreshToken: string }

export function validaRespostaRefresh(dado: unknown): RespostaRefresh {
  const r = dado as Partial<RespostaRefresh> | null
  if (typeof r?.accessToken !== 'string' || typeof r?.refreshToken !== 'string') {
    throw new Error('Resposta de /api/auth/refresh fora do contrato.')
  }
  return { accessToken: r.accessToken, refreshToken: r.refreshToken }
}
