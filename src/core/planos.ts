// Limites por plano — usados pelo app e pelo servidor MCP.
export type Plano = 'free' | 'pro' | 'master'

export const LIMITE_LOTES_ATIVOS: Record<Plano, number> = {
  free: Infinity, pro: 12, master: Infinity,
}

// Limite de animais é sobre o total histórico já cadastrado pelo usuário
// (inclui animais vendidos/saídos, não só os ativos).
export const LIMITE_ANIMAIS_TOTAL: Record<Plano, number> = {
  free: 100, pro: 500, master: Infinity,
}
