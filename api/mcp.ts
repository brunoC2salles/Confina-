// ─── Servidor MCP do Confina+ (função Node do Vercel) ─────────────────────────
// Endpoint: https://mcp.confinamais.com/mcp (ver rewrites em vercel.json).
// Transporte Streamable HTTP sem sessão, respostas em JSON.
// Autenticação: token OAuth emitido pelo OAuth 2.1 Server do Supabase Auth.
// O cliente do Supabase de cada requisição é criado com esse token, então o
// RLS limita tudo à conta do produtor, como no app. As regras de negócio vêm
// de src/core (as mesmas do app) via src/mcp.
// @ts-ignore -- tipos do Node não estão instalados no projeto
import { AsyncLocalStorage } from 'node:async_hooks'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { definirProvedorDb } from '../src/core/db.js'
import { processarMensagem } from '../src/mcp/protocolo.js'
import { SUPABASE_URL, SUPABASE_ANON_KEY, URL_METADADOS_RECURSO, CABECALHOS_CORS } from './_config.js'

// Cliente do Supabase da requisição em andamento (uma por chamada, mesmo com
// várias requisições simultâneas na mesma instância da função).
const clienteDaRequisicao = new AsyncLocalStorage()
definirProvedorDb(() => {
  const cliente = clienteDaRequisicao.getStore() as SupabaseClient | undefined
  if (!cliente) throw new Error('Cliente Supabase fora de uma requisição MCP')
  return cliente
})

function json(corpo: unknown, status = 200, extras: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json', ...CABECALHOS_CORS, ...extras } })
}

function naoAutorizado(tokenInvalido: boolean): Response {
  const desafio = tokenInvalido
    ? `Bearer error="invalid_token", error_description="Token ausente, expirado ou inválido", resource_metadata="${URL_METADADOS_RECURSO}"`
    : `Bearer resource_metadata="${URL_METADADOS_RECURSO}"`
  return json({ error: tokenInvalido ? 'invalid_token' : 'unauthorized' }, 401, { 'WWW-Authenticate': desafio })
}

async function autenticar(request: Request): Promise<{ cliente: SupabaseClient; userId: string } | Response> {
  const m = (request.headers.get('authorization') ?? '').match(/^Bearer\s+(.+)$/i)
  if (!m) return naoAutorizado(false)
  const token = m[1].trim()
  const cliente = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  const { data, error } = await cliente.auth.getUser(token)
  if (error || !data?.user) return naoAutorizado(true)
  return { cliente, userId: data.user.id }
}

export async function POST(request: Request): Promise<Response> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.error('[mcp] variáveis SUPABASE_URL/SUPABASE_ANON_KEY (ou VITE_*) ausentes')
    return json({ error: 'server_misconfigured' }, 500)
  }
  const auth = await autenticar(request)
  if (auth instanceof Response) return auth

  let corpo: unknown
  try {
    corpo = await request.json()
  } catch {
    return json({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'JSON inválido' } }, 400)
  }

  const mensagens = Array.isArray(corpo) ? corpo : [corpo]
  const respostas = await clienteDaRequisicao.run(auth.cliente, async () => {
    const lista = []
    for (const m of mensagens) {
      const r = await processarMensagem(m as any, { userId: auth.userId })
      if (r) lista.push(r)
    }
    return lista
  })

  // Só notificações/respostas: 202 sem corpo (Streamable HTTP).
  if (respostas.length === 0) return new Response(null, { status: 202, headers: CABECALHOS_CORS })
  return json(Array.isArray(corpo) ? respostas : respostas[0])
}

// Sem fluxo SSE iniciado pelo servidor: GET não é suportado (permitido pela especificação).
export function GET(): Response {
  return new Response(null, { status: 405, headers: { Allow: 'POST, OPTIONS', ...CABECALHOS_CORS } })
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CABECALHOS_CORS })
}
