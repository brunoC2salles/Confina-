import { supabase } from '@/lib/supabase'

// Chama /api/parceiros com o token da sessão (ver api/parceiros.ts).
export async function chamarApiParceiros(acao: string, dados: Record<string, string>): Promise<{ error: string | null; [k: string]: unknown }> {
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) return { error: 'Sessão expirada. Entre novamente.' }
  try {
    const r = await fetch('/api/parceiros', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ acao, ...dados }),
    })
    const corpo = await r.json().catch(() => ({}))
    if (!r.ok) return { error: (corpo as { error?: string }).error ?? `Erro ${r.status}` }
    return { ...(corpo as Record<string, unknown>), error: null }
  } catch (e) {
    return { error: (e as Error).message }
  }
}
