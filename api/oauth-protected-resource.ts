// Metadados do recurso protegido (RFC 9728) do servidor MCP do Confina+.
// O Claude e o ChatGPT leem este documento para descobrir que o login é feito
// pelo OAuth 2.1 Server do Supabase Auth do projeto.
import { RECURSO_MCP, SERVIDOR_AUTORIZACAO, CABECALHOS_CORS } from './_config.js'

function metadados(): Response {
  return new Response(JSON.stringify({
    resource: RECURSO_MCP,
    authorization_servers: [SERVIDOR_AUTORIZACAO],
    bearer_methods_supported: ['header'],
    resource_name: 'Confina+',
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', ...CABECALHOS_CORS },
  })
}

export function GET(): Response {
  return metadados()
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CABECALHOS_CORS })
}
