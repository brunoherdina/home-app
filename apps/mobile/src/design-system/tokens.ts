/**
 * Tokens do Casa — único lugar do app onde cor literal é permitida.
 *
 * A guarda `npm run guards` reprova `#hex` e `rgba()` fora deste diretório. A
 * regra nasce junto com os tokens de propósito: depois da primeira tela, virar
 * mutirão de conserto em vez de guarda-corpo.
 *
 * > [!warning] Valores provisórios
 * > Os nomes vêm da identidade já definida (handoff §5); os valores hex ainda
 * > NÃO foram exportados do Figma. Substituir pelo `tokens.json` real antes da
 * > primeira tela de produto — não desenhar em cima destes.
 */
export const cores = {
  moss: '#4A5D3A', // base — PROVISÓRIO
  amber: '#E0A33E', // moeda de pontos — PROVISÓRIO
  coral: '#E5705C', // streak / ofensiva — PROVISÓRIO
  lime: '#8FBF57', // sucesso — PROVISÓRIO
  tinta: '#1C1B18', // PROVISÓRIO
  papel: '#FAF8F3', // PROVISÓRIO
  cinza: '#6F6C64', // PROVISÓRIO
} as const

/** Escala de espaçamento em passos de 4 — mesma origem que as cores (handoff §5). */
export const espacos = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const

/**
 * Display: Bricolage Grotesque · UI: Plus Jakarta Sans — ambas no Google Fonts,
 * carregadas por `@expo-google-fonts/*` + `expo-font`, sem arquivo solto no repo.
 * As famílias entram junto com a primeira tela de produto.
 */
export const textos = {
  titulo: { fontSize: 28, lineHeight: 34 },
  corpo: { fontSize: 16, lineHeight: 24 },
  legenda: { fontSize: 13, lineHeight: 18 },
} as const

export type Cor = keyof typeof cores
