// ─── Ações do portal de parceiros que precisam do servidor ────────────────────
// POST /api/parceiros  { acao, ... }  com o token do usuário (Authorization).
//  - enviar_convite        gestor ou admin: envia o e-mail do convite
//  - notificar_pedido      cliente: avisa o vendedor de uma nova solicitação
//  - cobranca_ativar       admin: cria cliente e assinatura na Stripe
//  - cobranca_sincronizar  admin: ajusta a quantidade de clientes cobrados
//  - pedido_entregue       gestor ou vendedor: lança a entrega no estoque do cliente
// O acesso de cada ação é conferido com o cliente do Supabase do próprio
// usuário (RLS); a chave de serviço só é usada depois disso.
import { definirProvedorDb } from '../src/core/db.js'
import { recalcularIngrediente } from '../src/core/estoque.js'
import {
  clienteDoUsuario, clienteServico, json, enviarEmail, modeloEmail, emailsAtendimento,
  kg, dataBr, stripe, sincronizarCobranca, contarClientesCobrados,
  SERVICE_KEY, PRICE_FIXO, PRICE_CLIENTE, URL_PORTAL, URL_APP,
} from './_parceiros.js'

type Corpo = { acao?: string; convite_id?: string; pedido_id?: string; fornecedor_id?: string }

// O código de src/core usa o cliente de serviço nesta função (só em ações
// já autorizadas pelo RLS do usuário).
const servicoCore = SERVICE_KEY ? clienteServico() : null
if (servicoCore) definirProvedorDb(() => servicoCore)

export async function POST(request: Request): Promise<Response> {
  if (!SERVICE_KEY) return json({ error: 'SUPABASE_SERVICE_ROLE_KEY não configurada' }, 500)
  const m = (request.headers.get('authorization') ?? '').match(/^Bearer\s+(.+)$/i)
  if (!m) return json({ error: 'Não autenticado' }, 401)
  const token = m[1].trim()
  const usuario = clienteDoUsuario(token)
  const { data: auth, error: eAuth } = await usuario.auth.getUser(token)
  if (eAuth || !auth?.user) return json({ error: 'Sessão inválida' }, 401)
  const userId = auth.user.id

  let corpo: Corpo
  try { corpo = await request.json() } catch { return json({ error: 'JSON inválido' }, 400) }
  const servico = clienteServico()

  switch (corpo.acao) {
    case 'enviar_convite': {
      const { data: c } = await usuario.from('fornecedor_convites').select('*').eq('id', corpo.convite_id ?? '').maybeSingle()
      if (!c) return json({ error: 'Convite não encontrado' }, 404)
      if (c.aceito_em) return json({ error: 'Convite já aceito' }, 400)
      const { data: f } = await servico.from('fornecedores').select('nome').eq('id', c.fornecedor_id).maybeSingle()
      const base = c.papel === 'cliente' && c.modo === 'confina' ? URL_APP : URL_PORTAL
      const url = `${base}/convite?token=${c.token}`
      const nomeF = f?.nome ?? 'o fornecedor'
      const titulo = c.papel === 'cliente' ? `${nomeF} convida você para o Confina+` : `Convite para o portal ${nomeF}`
      const intro = c.papel === 'gestor'
        ? `Você foi convidado para gerenciar o portal de vendas da ${nomeF} no Confina+.`
        : c.papel === 'vendedor'
          ? `Você foi convidado como vendedor da ${nomeF} no portal de parceiros do Confina+.`
          : c.modo === 'confina'
            ? `A ${nomeF} conectou você ao Confina+. Use as dietas da ${nomeF}, acompanhe o estoque e peça ração em 1 clique.`
            : `A ${nomeF} liberou para você o controle de estoque de ração e os pedidos de cotação em 1 clique.`
      const r = await enviarEmail([c.email], titulo, modeloEmail(titulo, intro, [
        ['E-mail do convite', c.email],
        ['Válido até', dataBr(String(c.expira_em).slice(0, 10))],
      ], { texto: 'Aceitar convite', url }))
      if (r.error) return json({ error: r.error }, 502)
      await usuario.from('fornecedor_convites').update({ enviado_em: new Date().toISOString() }).eq('id', c.id)
      return json({ ok: true })
    }

    case 'notificar_pedido': {
      const { data: p } = await usuario.from('fornecedor_pedidos').select('*').eq('id', corpo.pedido_id ?? '').maybeSingle()
      if (!p) return json({ error: 'Pedido não encontrado' }, 404)
      if (p.notificado_em) return json({ ok: true, ja_notificado: true })
      const [{ data: cli }, { data: f }, { data: prod }] = await Promise.all([
        servico.from('fornecedor_clientes').select('*').eq('id', p.cliente_id).maybeSingle(),
        servico.from('fornecedores').select('nome').eq('id', p.fornecedor_id).maybeSingle(),
        p.produto_id ? servico.from('fornecedor_produtos').select('nome, embalagem').eq('id', p.produto_id).maybeSingle() : Promise.resolve({ data: null }),
      ])
      if (!cli || cli.user_id !== userId) return json({ error: 'Somente o cliente notifica o próprio pedido' }, 403)
      const para = await emailsAtendimento(servico, p.fornecedor_id, p.vendedor_id)
      const est = p.estoque_info ?? {}
      const titulo = `Nova solicitação de cotação #${p.numero}`
      const r = await enviarEmail(para, `${titulo} · ${cli.nome_fazenda ?? cli.responsavel ?? 'Cliente'}`, modeloEmail(titulo,
        `${cli.nome_fazenda ?? cli.responsavel ?? 'Um cliente'} pediu uma cotação pelo Confina+.`, [
          ['Produto', p.produto_nome ?? (prod as any)?.nome ?? '—'],
          ['Quantidade', kg(p.quantidade_kg)],
          ['Entrega desejada', dataBr(p.data_entrega)],
          ['Estoque atual', kg(est.saldo_kg)],
          ['Consumo médio', est.consumo_dia_kg != null ? `${kg(est.consumo_dia_kg)}/dia` : '—'],
          ['Fim previsto do estoque', dataBr(est.data_fim)],
          ['Fazenda', cli.nome_fazenda ?? '—'],
          ['Responsável', cli.responsavel ?? '—'],
          ['Contato', [cli.telefone, cli.email].filter(Boolean).join(' · ') || '—'],
          ['Observações', p.observacoes ?? '—'],
        ], { texto: 'Abrir no portal', url: `${URL_PORTAL}/pedidos` }))
      if (r.error) return json({ error: r.error }, 502)
      await servico.from('fornecedor_pedidos').update({ notificado_em: new Date().toISOString() }).eq('id', p.id)
      return json({ ok: true, fornecedor: f?.nome })
    }

    case 'pedido_entregue': {
      const { data: p } = await usuario.from('fornecedor_pedidos').select('*').eq('id', corpo.pedido_id ?? '').maybeSingle()
      if (!p) return json({ error: 'Pedido não encontrado' }, 404)
      const { data: papel } = await usuario.rpc('fornec_papel', { fid: p.fornecedor_id })
      const { data: perfilU } = await servico.from('profiles').select('role').eq('id', userId).maybeSingle()
      if (!papel && perfilU?.role !== 'admin') return json({ error: 'Somente a equipe do fornecedor' }, 403)
      if (p.status !== 'entregue') return json({ error: 'O pedido não está entregue' }, 400)
      if (p.estoque_lancado_em) return json({ ok: true, ja_lancado: true })
      if (!p.produto_id || !(Number(p.quantidade_kg) > 0)) return json({ error: 'Pedido sem produto ou quantidade' }, 400)
      const [{ data: cli }, { data: prod }] = await Promise.all([
        servico.from('fornecedor_clientes').select('*').eq('id', p.cliente_id).maybeSingle(),
        servico.from('fornecedor_produtos').select('*').eq('id', p.produto_id).maybeSingle(),
      ])
      if (!cli || !prod) return json({ error: 'Cliente ou produto não encontrado' }, 404)
      const hoje = new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10)
      const data = p.data_entrega && p.data_entrega <= hoje ? p.data_entrega : hoje
      const qtd = Number(p.quantidade_kg)
      if (cli.modo === 'estoque') {
        const { error } = await servico.from('estoque_movimentos').insert({
          user_id: cli.user_id, produto_id: prod.id, tipo: 'entrada', data, quantidade_kg: qtd,
          observacoes: `Pedido #${p.numero} entregue`, criado_por: userId, pedido_id: p.id,
        })
        if (error) return json({ error: error.message }, 500)
      } else {
        // Cliente do Confina+: compra do ingrediente ligado ao produto (cria se não existir).
        let { data: ing } = await servico.from('ingredientes_produtor').select('id, preco_kg, pct_ms')
          .eq('user_id', cli.user_id).eq('fornecedor_produto_id', prod.id).maybeSingle()
        if (!ing) {
          const categorias: Record<string, string> = { racao: 'concentrado_energetico', nucleo: 'mineral_aditivo', mineral: 'mineral_aditivo', grao: 'concentrado_energetico', farelo: 'concentrado_proteico', volumoso: 'volumoso', outro: 'subproduto' }
          const { data: novo, error } = await servico.from('ingredientes_produtor').insert({
            user_id: cli.user_id, nome: prod.nome, categoria: categorias[prod.categoria] ?? 'subproduto', pct_ms: prod.pct_ms,
            preco_kg: Number(p.preco_kg) || 0, ativo: true, fornecedor_produto_id: prod.id,
          }).select('id, preco_kg, pct_ms').single()
          if (error || !novo) return json({ error: error?.message ?? 'Erro ao criar o ingrediente' }, 500)
          ing = novo
        }
        const valor = p.valor_total != null ? Number(p.valor_total)
          : p.preco_kg != null ? Math.round(Number(p.preco_kg) * qtd * 100) / 100
            : Math.round(Number(ing.preco_kg || 0) * qtd * 100) / 100
        const { error } = await servico.from('compras_ingrediente').insert({
          origem_ingrediente: 'ingrediente_produtor', ingrediente_produtor_id: ing.id, tipo: 'compra', data,
          quantidade_kg: qtd, pct_ms: ing.pct_ms ?? prod.pct_ms ?? null, valor_total: valor,
          observacoes: `Pedido #${p.numero} entregue`, user_id: cli.user_id,
        })
        if (error) return json({ error: error.message }, 500)
        const r = await recalcularIngrediente(cli.user_id, `ingrediente_produtor:${ing.id}`)
        if (r.error) console.error('[parceiros] recalcular ingrediente', r.error)
      }
      await servico.from('fornecedor_pedidos').update({ estoque_lancado_em: new Date().toISOString() }).eq('id', p.id)
      return json({ ok: true })
    }

    case 'cobranca_ativar':
    case 'cobranca_sincronizar': {
      const { data: perfil } = await servico.from('profiles').select('role').eq('id', userId).maybeSingle()
      if (perfil?.role !== 'admin') return json({ error: 'Somente o administrador' }, 403)
      const fid = corpo.fornecedor_id ?? ''
      const { data: f } = await servico.from('fornecedores').select('*').eq('id', fid).maybeSingle()
      if (!f) return json({ error: 'Fornecedor não encontrado' }, 404)

      if (corpo.acao === 'cobranca_sincronizar') {
        const r = await sincronizarCobranca(servico, fid)
        return r.error ? json({ error: r.error }, 400) : json({ ok: true, clientes: r.clientes })
      }

      if (f.stripe_subscription_id) return json({ error: 'A cobrança já está ativa' }, 400)
      if (!f.opcao_plataforma) return json({ error: 'O fornecedor não contratou a plataforma de venda de ração' }, 400)
      if (!PRICE_FIXO || !PRICE_CLIENTE) return json({ error: 'Preços da Stripe não configurados' }, 500)
      try {
        let customerId: string = f.stripe_customer_id
        if (!customerId) {
          const cust = await stripe('POST', 'customers', {
            name: f.nome, ...(f.email_contato ? { email: f.email_contato } : {}), 'metadata[fornecedor_id]': f.id,
          })
          customerId = cust.id
        }
        const n = await contarClientesCobrados(servico, fid)
        const params: Record<string, string> = {
          customer: customerId,
          collection_method: 'send_invoice',
          days_until_due: '10',
          'metadata[fornecedor_id]': f.id,
          'items[0][price]': PRICE_FIXO,
          'items[0][quantity]': '1',
        }
        if (n > 0) { params['items[1][price]'] = PRICE_CLIENTE; params['items[1][quantity]'] = String(n) }
        const sub = await stripe('POST', 'subscriptions', params)
        const itemClientes = (sub.items?.data ?? []).find((i: any) => i.price?.id === PRICE_CLIENTE)
        await servico.from('fornecedores').update({
          stripe_customer_id: customerId, stripe_subscription_id: sub.id,
          stripe_item_clientes_id: itemClientes?.id ?? null, clientes_cobrados: n,
          cobranca_status: sub.status, cobranca_sincronizada_em: new Date().toISOString(),
        }).eq('id', fid)
        return json({ ok: true, status: sub.status, clientes: n })
      } catch (e) {
        return json({ error: (e as Error).message }, 502)
      }
    }

    default:
      return json({ error: 'Ação desconhecida' }, 400)
  }
}
