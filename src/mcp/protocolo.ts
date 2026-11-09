// ─── Protocolo MCP (JSON-RPC 2.0) do servidor Confina+ ────────────────────────
// Transporte Streamable HTTP sem sessão: cada POST traz uma mensagem (ou lote)
// e a resposta volta em JSON. Este arquivo não depende de Node nem do Vercel —
// quem chama (api/mcp.ts) cuida do HTTP, da autenticação e do cliente do banco.
import { FERRAMENTAS, ErroFerramenta, type ContextoFerramenta } from './ferramentas.js'
import { validarEntrada, type Esquema } from './esquema.js'
import { ajudaEmTexto } from '../core/ajuda.js'

export const VERSOES_PROTOCOLO = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']

export const INFO_SERVIDOR = { name: 'confina-mais', title: 'Confina+', version: '1.0.0' }

const INSTRUCOES = [
  'Servidor da plataforma Confina+ de manejo bovino. Cada usuário acessa somente a própria conta.',
  'Use as ferramentas de leitura para responder sobre lotes, animais, custos, pesagens, vendas, dietas, estoque e simulações; e ajuda_plataforma para dúvidas de uso.',
  'Ids: obtenha com listar_lotes, buscar_animais, listar_dietas, listar_ingredientes, listar_parceiros etc. Nunca invente ids.',
  'Datas no formato aaaa-mm-dd. Valores em R$; pesos em kg.',
  'Antes de qualquer gravação, confirme com o produtor os dados que serão lançados. Exclusões exigem confirmar = true, enviado somente depois da confirmação explícita do produtor.',
  'Quando a ferramenta devolver erro de regra (ex.: limite do plano, data inválida), explique ao produtor em vez de tentar contornar.',
].join('\n')

const URI_AJUDA = 'confina://ajuda'

interface MensagemJsonRpc {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: any
}

type RespostaJsonRpc =
  | { jsonrpc: '2.0'; id: string | number | null; result: unknown }
  | { jsonrpc: '2.0'; id: string | number | null; error: { code: number; message: string; data?: unknown } }

const resposta = (id: MensagemJsonRpc['id'], result: unknown): RespostaJsonRpc => ({ jsonrpc: '2.0', id: id ?? null, result })
const erro = (id: MensagemJsonRpc['id'], code: number, message: string): RespostaJsonRpc => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } })

// Converte o esquema interno para JSON Schema padrão (nullable vira tipo "null").
function paraJsonSchema(e: Esquema): Record<string, unknown> {
  const { nullable, properties, items, ...resto } = e
  const out: Record<string, unknown> = { ...resto }
  if (nullable && e.type) out.type = [e.type, 'null']
  if (nullable && e.enum && !e.enum.includes(null)) out.enum = [...e.enum, null]
  if (properties) out.properties = Object.fromEntries(Object.entries(properties).map(([k, v]) => [k, paraJsonSchema(v)]))
  if (items) out.items = paraJsonSchema(items)
  return out
}

// Arredonda números longos para deixar o resultado legível sem perder precisão útil.
function arredondar(valor: unknown): unknown {
  if (typeof valor === 'number') return Number.isFinite(valor) && !Number.isInteger(valor) ? Math.round(valor * 10000) / 10000 : valor
  if (Array.isArray(valor)) return valor.map(arredondar)
  if (valor && typeof valor === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(valor)) if (v !== undefined) out[k] = arredondar(v)
    return out
  }
  return valor
}

function listarFerramentas() {
  return FERRAMENTAS.map(f => ({
    name: f.name,
    title: f.title,
    description: f.description,
    inputSchema: paraJsonSchema(f.inputSchema),
    annotations: {
      title: f.title,
      readOnlyHint: f.somenteLeitura,
      destructiveHint: f.destrutiva,
      idempotentHint: f.somenteLeitura,
      openWorldHint: false,
    },
  }))
}

async function chamarFerramenta(params: any, ctx: ContextoFerramenta) {
  const ferramenta = FERRAMENTAS.find(f => f.name === params?.name)
  if (!ferramenta) return null
  const args = params?.arguments ?? {}
  const errosEntrada = validarEntrada(args, ferramenta.inputSchema)
  if (errosEntrada.length > 0) {
    return { content: [{ type: 'text', text: `Entrada inválida:\n- ${errosEntrada.join('\n- ')}` }], isError: true }
  }
  try {
    const resultado = arredondar(await ferramenta.executar(args, ctx))
    const texto = typeof resultado === 'string' ? resultado : JSON.stringify(resultado ?? null)
    const estruturado = resultado && typeof resultado === 'object' && !Array.isArray(resultado) ? resultado : { resultado }
    return { content: [{ type: 'text', text: texto }], structuredContent: estruturado, isError: false }
  } catch (e) {
    if (e instanceof ErroFerramenta) return { content: [{ type: 'text', text: e.message }], isError: true }
    console.error(`[mcp] erro na ferramenta ${ferramenta.name}:`, e)
    return { content: [{ type: 'text', text: 'Erro interno ao executar a ferramenta. Tente de novo em instantes.' }], isError: true }
  }
}

// Processa uma mensagem. Notificações (sem id) não têm resposta: devolve null.
export async function processarMensagem(msg: MensagemJsonRpc, ctx: ContextoFerramenta): Promise<RespostaJsonRpc | null> {
  if (!msg || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
    return erro(msg?.id, -32600, 'Requisição JSON-RPC inválida')
  }
  const notificacao = msg.id === undefined
  if (notificacao) return null

  switch (msg.method) {
    case 'initialize': {
      const pedida = msg.params?.protocolVersion
      const protocolVersion = VERSOES_PROTOCOLO.includes(pedida) ? pedida : VERSOES_PROTOCOLO[0]
      return resposta(msg.id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false }, resources: { listChanged: false } },
        serverInfo: INFO_SERVIDOR,
        instructions: INSTRUCOES,
      })
    }
    case 'ping':
      return resposta(msg.id, {})
    case 'tools/list':
      return resposta(msg.id, { tools: listarFerramentas() })
    case 'tools/call': {
      const r = await chamarFerramenta(msg.params, ctx)
      if (!r) return erro(msg.id, -32602, `Ferramenta desconhecida: ${msg.params?.name}`)
      return resposta(msg.id, r)
    }
    case 'resources/list':
      return resposta(msg.id, {
        resources: [{ uri: URI_AJUDA, name: 'guia-de-uso', title: 'Guia de uso do Confina+', description: 'Tutorial da plataforma', mimeType: 'text/markdown' }],
      })
    case 'resources/templates/list':
      return resposta(msg.id, { resourceTemplates: [] })
    case 'resources/read':
      if (msg.params?.uri !== URI_AJUDA) return erro(msg.id, -32602, 'Recurso não encontrado')
      return resposta(msg.id, { contents: [{ uri: URI_AJUDA, mimeType: 'text/markdown', text: ajudaEmTexto() }] })
    case 'prompts/list':
      return resposta(msg.id, { prompts: [] })
    default:
      return erro(msg.id, -32601, `Método não suportado: ${msg.method}`)
  }
}
