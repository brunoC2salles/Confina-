// Apoio às funções do portal de parceiros (api/parceiros.ts e
// api/parceiros-diario.ts): clientes do Supabase, e-mail (Resend) e
// cobrança (Stripe). Arquivo com "_" não vira função no Vercel.
//
// Variáveis de ambiente no Vercel:
//   SUPABASE_SERVICE_ROLE_KEY   leitura e gravação da rotina diária e dos avisos
//   RESEND_API_KEY              envio dos e-mails
//   RESEND_FROM                 remetente (padrão: Confina+ <parceiros@confinamais.com>)
//   STRIPE_SECRET_KEY           cobrança da plataforma de venda de ração
//   STRIPE_PRICE_PARCEIRO_FIXO      preço fixo mensal (R$ 2.000)
//   STRIPE_PRICE_PARCEIRO_CLIENTE   preço por cliente em pacotes (volume: 1-100 R$ 35,
//                                   101-200 R$ 32, 201-300 R$ 29, 301-400 R$ 26, acima R$ 24)
//   CRON_SECRET                 autenticação da rotina diária (Vercel Cron)
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './_config.js'

const env: Record<string, string | undefined> = (globalThis as any).process?.env ?? {}

export const SERVICE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || ''
export const CRON_SECRET = env.CRON_SECRET || ''
const RESEND_API_KEY = env.RESEND_API_KEY || ''
const RESEND_FROM = env.RESEND_FROM || 'Confina+ <parceiros@confinamais.com>'
const STRIPE_SECRET_KEY = env.STRIPE_SECRET_KEY || ''
export const PRICE_FIXO = env.STRIPE_PRICE_PARCEIRO_FIXO || ''
export const PRICE_CLIENTE = env.STRIPE_PRICE_PARCEIRO_CLIENTE || ''

export const URL_PORTAL = 'https://parceiros.confinamais.com'
export const URL_APP = 'https://www.confinamais.com'

export function clienteServico(): SupabaseClient {
  return createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
}

export function clienteDoUsuario(token: string): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}

export function json(corpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } })
}

// ─── E-mail ───────────────────────────────────────────────────────────────────

export async function enviarEmail(para: string[], assunto: string, html: string): Promise<{ error: string | null }> {
  const destinos = Array.from(new Set(para.filter(Boolean)))
  if (destinos.length === 0) return { error: 'Sem destinatário' }
  if (!RESEND_API_KEY) return { error: 'RESEND_API_KEY não configurada' }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: RESEND_FROM, to: destinos, subject: assunto, html }),
  })
  if (!r.ok) return { error: `Resend ${r.status}: ${await r.text()}` }
  return { error: null }
}

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string))

export const kg = (v: number | null | undefined) => v == null ? '—' : `${Math.round(Number(v)).toLocaleString('pt-BR')} kg`
export const dataBr = (iso: string | null | undefined) => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—'

// Layout simples dos e-mails, com as cores do Confina+.
export function modeloEmail(titulo: string, intro: string, linhas: Array<[string, string]>, botao?: { texto: string; url: string }): string {
  const tabela = linhas.map(([k, v]) =>
    `<tr><td style="padding:8px 0;color:#616161;font-size:14px;width:45%">${esc(k)}</td><td style="padding:8px 0;color:#111;font-size:14px;font-weight:600">${esc(v)}</td></tr>`).join('')
  const cta = botao
    ? `<p style="margin:28px 0 0"><a href="${esc(botao.url)}" style="background:#2e7d32;color:#fff;text-decoration:none;padding:12px 22px;border-radius:8px;font-size:14px;font-weight:600;display:inline-block">${esc(botao.texto)}</a></p>`
    : ''
  return `<!DOCTYPE html><html><body style="margin:0;background:#f5f5f5;font-family:Inter,Arial,sans-serif">
<div style="max-width:560px;margin:0 auto;padding:32px 16px">
<div style="background:#fff;border-radius:12px;border:1px solid #e0e0e0;padding:28px">
<div style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#2e7d32;font-weight:700;margin-bottom:8px">Confina+ Parceiros</div>
<h1 style="font-size:20px;margin:0 0 12px;color:#111">${esc(titulo)}</h1>
<p style="font-size:14px;color:#424242;line-height:1.6;margin:0 0 16px">${esc(intro)}</p>
${linhas.length ? `<table style="width:100%;border-collapse:collapse;border-top:1px solid #eee">${tabela}</table>` : ''}
${cta}
</div>
<p style="font-size:12px;color:#9e9e9e;text-align:center;margin-top:16px">CONFINAMAIS LTDA · confinamais.com</p>
</div></body></html>`
}

// E-mails de quem atende o cliente: o vendedor responsável, ou os gestores
// quando o cliente não tem vendedor.
export async function emailsAtendimento(sb: SupabaseClient, fornecedorId: string, vendedorId: string | null): Promise<string[]> {
  if (vendedorId) {
    const { data } = await sb.from('fornecedor_membros').select('email, ativo').eq('id', vendedorId).maybeSingle()
    if (data?.email && data.ativo) return [data.email as string]
  }
  const { data } = await sb.from('fornecedor_membros').select('email').eq('fornecedor_id', fornecedorId).eq('papel', 'gestor').eq('ativo', true)
  return ((data ?? []) as Array<{ email: string | null }>).map(m => m.email ?? '').filter(Boolean)
}

// ─── Stripe (API REST, corpo form-urlencoded) ─────────────────────────────────

export async function stripe(metodo: 'GET' | 'POST' | 'DELETE', caminho: string, params?: Record<string, string>): Promise<any> {
  if (!STRIPE_SECRET_KEY) throw new Error('STRIPE_SECRET_KEY não configurada')
  const corpo = params ? new URLSearchParams(params).toString() : undefined
  const url = `https://api.stripe.com/v1/${caminho}${metodo !== 'POST' && corpo ? `?${corpo}` : ''}`
  const r = await fetch(url, {
    method: metodo,
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: metodo === 'POST' ? corpo : undefined,
  })
  const dados = await r.json()
  if (!r.ok) throw new Error(dados?.error?.message ?? `Stripe ${r.status}`)
  return dados
}

// Clientes cobrados: contas só de estoque ativas vinculadas ao fornecedor
// (clientes do Confina+ da opção integrada não têm custo para o fornecedor).
export async function contarClientesCobrados(sb: SupabaseClient, fornecedorId: string): Promise<number> {
  const { count } = await sb.from('fornecedor_clientes').select('id', { count: 'exact', head: true })
    .eq('fornecedor_id', fornecedorId).eq('ativo', true).eq('modo', 'estoque')
  return count ?? 0
}

// Pacotes de clientes em múltiplos de 50: 489 clientes cobram o pacote de 500.
export function pacoteClientes(n: number): number {
  return n > 0 ? Math.ceil(n / 50) * 50 : 0
}

// Ajusta o item de clientes da assinatura ao pacote que cobre os clientes
// cobrados. Sem clientes, o item sai da assinatura (fica só o valor fixo).
// A nova quantidade vale a partir da próxima fatura (sem rateio).
export async function sincronizarCobranca(sb: SupabaseClient, fornecedorId: string): Promise<{ error: string | null; clientes?: number }> {
  try {
    const { data: f } = await sb.from('fornecedores').select('*').eq('id', fornecedorId).maybeSingle()
    if (!f?.stripe_subscription_id) return { error: 'Cobrança não ativada' }
    const n = await contarClientesCobrados(sb, fornecedorId)
    const pacote = pacoteClientes(n)
    let itemId: string | null = f.stripe_item_clientes_id
    if (pacote > 0 && itemId) {
      // price junto: migra assinaturas do preço antigo para o de pacotes
      await stripe('POST', `subscription_items/${itemId}`, { price: PRICE_CLIENTE, quantity: String(pacote), proration_behavior: 'none' })
    } else if (pacote > 0) {
      const item = await stripe('POST', 'subscription_items', {
        subscription: f.stripe_subscription_id, price: PRICE_CLIENTE, quantity: String(pacote), proration_behavior: 'none',
      })
      itemId = item.id
    } else if (itemId) {
      await stripe('DELETE', `subscription_items/${itemId}`, { proration_behavior: 'none' })
      itemId = null
    }
    const assinatura = await stripe('GET', `subscriptions/${f.stripe_subscription_id}`)
    await sb.from('fornecedores').update({
      stripe_item_clientes_id: itemId, clientes_cobrados: n,
      cobranca_status: assinatura.status, cobranca_sincronizada_em: new Date().toISOString(),
    }).eq('id', fornecedorId)
    return { error: null, clientes: n }
  } catch (e) {
    return { error: (e as Error).message }
  }
}
