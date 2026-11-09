// Configuração compartilhada das funções do servidor MCP (api/mcp.ts e
// api/oauth-protected-resource.ts). Variáveis de ambiente do projeto no Vercel:
// usa SUPABASE_URL / SUPABASE_ANON_KEY se existirem, senão as mesmas VITE_*
// que o app já usa no build. MCP_RESOURCE_URL permite trocar o endereço público.
const env: Record<string, string | undefined> = (globalThis as any).process?.env ?? {}

export const SUPABASE_URL = (env.SUPABASE_URL || env.VITE_SUPABASE_URL || '').replace(/\/$/, '')
export const SUPABASE_ANON_KEY = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY || ''

// Endereço público do servidor MCP (o que o produtor cola no Claude/ChatGPT).
export const RECURSO_MCP = (env.MCP_RESOURCE_URL || 'https://mcp.confinamais.com/mcp').replace(/\/$/, '')

// Metadados do recurso protegido (RFC 9728): /.well-known/oauth-protected-resource + caminho do recurso.
const urlRecurso = new URL(RECURSO_MCP)
export const URL_METADADOS_RECURSO = `${urlRecurso.origin}/.well-known/oauth-protected-resource${urlRecurso.pathname === '/' ? '' : urlRecurso.pathname}`

// Servidor de autorização: OAuth 2.1 Server do Supabase Auth do projeto.
export const SERVIDOR_AUTORIZACAO = `${SUPABASE_URL}/auth/v1`

export const CABECALHOS_CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept, Mcp-Protocol-Version, Mcp-Session-Id',
  'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id',
}
