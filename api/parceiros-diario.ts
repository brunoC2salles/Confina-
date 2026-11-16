// ─── Rotina diária do portal de parceiros (Vercel Cron) ───────────────────────
// Para cada cliente ativo de cada fornecedor ativo:
//  1. recalcula o estoque por produto (mesmas regras do app, src/core/parceiros.ts)
//     e grava o resumo que o vendedor vê;
//  2. produto em alerta (cobertura abaixo dos dias de alerta ou saldo abaixo do
//     kg mínimo) sem alerta em aberto: cria o pedido de origem "alerta" e envia
//     o e-mail ao vendedor responsável;
//  3. alerta ainda "novo" cujo estoque voltou ao normal: cancela.
// Depois ajusta a cobrança dos fornecedores com assinatura ativa.
// Autenticação: Authorization: Bearer CRON_SECRET (enviado pelo Vercel Cron).
import { definirProvedorDb } from '../src/core/db.js'
import {
  atualizarResumoCliente, emAlerta, quantidadeSugerida, dataEntregaSugerida,
  type ClienteFornecedor, type ProdutoFornecedor, type EstoqueCliente,
} from '../src/core/parceiros.js'
import {
  clienteServico, json, enviarEmail, modeloEmail, emailsAtendimento, kg, dataBr,
  sincronizarCobranca, SERVICE_KEY, CRON_SECRET, URL_PORTAL,
} from './_parceiros.js'

const servico = SERVICE_KEY ? clienteServico() : null
if (servico) definirProvedorDb(() => servico)

export async function GET(request: Request): Promise<Response> {
  if (!servico) return json({ error: 'SUPABASE_SERVICE_ROLE_KEY não configurada' }, 500)
  if (!CRON_SECRET || request.headers.get('authorization') !== `Bearer ${CRON_SECRET}`) return json({ error: 'Não autorizado' }, 401)

  const relatorio = { clientes: 0, alertas: 0, emails: 0, cancelados: 0, erros: [] as string[] }
  // Fornecedor de demonstração fica de fora: dados fixos para apresentação.
  const { data: fornecedores } = await servico.from('fornecedores').select('id, nome, stripe_subscription_id').eq('ativo', true).eq('demo', false)

  for (const f of (fornecedores ?? []) as Array<{ id: string; nome: string; stripe_subscription_id: string | null }>) {
    const [{ data: prods }, { data: clis }] = await Promise.all([
      servico.from('fornecedor_produtos').select('*').eq('fornecedor_id', f.id),
      servico.from('fornecedor_clientes').select('*').eq('fornecedor_id', f.id).eq('ativo', true),
    ])
    const produtos = (prods ?? []) as ProdutoFornecedor[]
    const produtoPorId = new Map(produtos.map(p => [p.id, p]))

    for (const cliente of (clis ?? []) as ClienteFornecedor[]) {
      relatorio.clientes++
      let linhas: EstoqueCliente[] = []
      try {
        const r = await atualizarResumoCliente(cliente.user_id, cliente, produtos)
        if (r.error) relatorio.erros.push(`${cliente.id}: ${r.error}`)
        linhas = r.linhas
      } catch (e) {
        relatorio.erros.push(`${cliente.id}: ${(e as Error).message}`)
        continue
      }

      const { data: abertos } = await servico.from('fornecedor_pedidos').select('id, produto_id, status')
        .eq('cliente_id', cliente.id).eq('origem', 'alerta').in('status', ['novo', 'em_cotacao', 'cotado'])
      const alertaAberto = new Map(((abertos ?? []) as Array<{ id: string; produto_id: string | null; status: string }>).map(a => [a.produto_id, a]))

      for (const linha of linhas) {
        const produto = produtoPorId.get(linha.produto_id)
        if (!produto) continue
        const aberto = alertaAberto.get(linha.produto_id)
        if (emAlerta(produto, linha)) {
          if (aberto) continue
          const quantidade = quantidadeSugerida(produto, linha.consumo_dia_kg, 30)
          const { data: novo, error } = await servico.from('fornecedor_pedidos').insert({
            cliente_id: cliente.id, fornecedor_id: f.id, produto_id: produto.id, origem: 'alerta', status: 'novo',
            quantidade_kg: quantidade > 0 ? quantidade : null,
            data_entrega: dataEntregaSugerida(produto, linha.data_fim),
            estoque_info: { saldo_kg: linha.saldo_kg, consumo_dia_kg: linha.consumo_dia_kg, data_fim: linha.data_fim, dias_cobertura: linha.dias_cobertura },
          }).select('id, numero, vendedor_id').single()
          if (error || !novo) { relatorio.erros.push(`alerta ${cliente.id}: ${error?.message}`); continue }
          relatorio.alertas++
          const para = await emailsAtendimento(servico, f.id, novo.vendedor_id)
          const titulo = `Alerta de estoque · ${produto.nome}`
          const r = await enviarEmail(para, `${titulo} · ${cliente.nome_fazenda ?? cliente.responsavel ?? 'Cliente'}`, modeloEmail(titulo,
            `O estoque de ${produto.nome} de ${cliente.nome_fazenda ?? cliente.responsavel ?? 'um cliente'} está acabando.`, [
              ['Saldo atual', kg(linha.saldo_kg)],
              ['Consumo médio', linha.consumo_dia_kg != null ? `${kg(linha.consumo_dia_kg)}/dia` : '—'],
              ['Dias de estoque', linha.dias_cobertura != null ? String(linha.dias_cobertura).replace('.', ',') : '—'],
              ['Fim previsto', dataBr(linha.data_fim)],
              ['Reposição sugerida (30 dias)', quantidade > 0 ? kg(quantidade) : '—'],
              ['Fazenda', cliente.nome_fazenda ?? '—'],
              ['Contato', [cliente.responsavel, cliente.telefone, cliente.email].filter(Boolean).join(' · ') || '—'],
            ], { texto: 'Abrir no portal', url: `${URL_PORTAL}/pedidos` }))
          if (r.error) relatorio.erros.push(`email ${novo.id}: ${r.error}`)
          else {
            relatorio.emails++
            await servico.from('fornecedor_pedidos').update({ notificado_em: new Date().toISOString() }).eq('id', novo.id)
          }
        } else if (aberto && aberto.status === 'novo') {
          await servico.from('fornecedor_pedidos').update({ status: 'cancelado', resposta: 'Estoque normalizado' }).eq('id', aberto.id)
          relatorio.cancelados++
        }
      }
    }

    if (f.stripe_subscription_id) {
      const r = await sincronizarCobranca(servico, f.id)
      if (r.error) relatorio.erros.push(`cobrança ${f.nome}: ${r.error}`)
    }
  }

  return json(relatorio)
}
