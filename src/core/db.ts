// ─── Cliente Supabase compartilhado entre o app e o servidor MCP ──────────────
// O código de src/core e de src/lib usa sempre este `supabase`. Ele não é um
// cliente fixo: cada acesso é repassado ao cliente devolvido pelo provedor
// registrado em definirProvedorDb.
//  - No navegador, src/lib/supabase.ts registra o cliente único do app.
//  - No servidor MCP (api/mcp.ts), o provedor devolve o cliente da requisição
//    em andamento, criado com o token do produtor — o RLS continua valendo.
// Este arquivo não lê import.meta.env nem process.env, para poder ser
// importado nos dois ambientes.
import type { SupabaseClient } from '@supabase/supabase-js'

type ProvedorDb = () => SupabaseClient

let provedor: ProvedorDb | null = null

export function definirProvedorDb(p: ProvedorDb) {
  provedor = p
}

export const supabase = new Proxy({} as SupabaseClient, {
  get(_alvo, prop) {
    if (!provedor) throw new Error('Cliente Supabase não configurado')
    const cliente = provedor() as unknown as Record<string | symbol, unknown>
    const valor = cliente[prop]
    return typeof valor === 'function' ? (valor as (...a: unknown[]) => unknown).bind(cliente) : valor
  },
})
