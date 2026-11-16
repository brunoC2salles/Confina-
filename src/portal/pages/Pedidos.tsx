import { useState, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal, PageHeader, EmptyState } from '@/components/common/UI'
import { useDadosFornecedor, nomeCliente } from '@/portal/useDadosFornecedor'
import { usePortal } from '@/portal/PortalContext'
import { chamarApiParceiros } from '@/lib/parceirosApi'
import {
  ROTULO_STATUS, CLASSE_STATUS, ROTULO_ORIGEM, fmtKg, fmtDataBr, linkWhatsApp, criarPedido, hojeISO,
  type PedidoFornecedor, type StatusPedido, type ClienteFornecedor,
} from '@/core/parceiros'

const FUNIL: StatusPedido[] = ['novo', 'em_cotacao', 'cotado', 'aprovado', 'entregue']
const fmtReais = (v: number | null | undefined) => v == null ? '' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Mensagem pronta do WhatsApp para o cliente, com a cotação quando houver.
function mensagemWhatsApp(p: PedidoFornecedor, c: ClienteFornecedor | undefined, vendedor: string, fornecedor: string): string {
  const ola = `Olá ${c?.responsavel || ''}, aqui é ${vendedor} da ${fornecedor}.`
  const base = `Sobre o pedido #${p.numero} de ${p.produto_nome ?? ''}: ${fmtKg(p.quantidade_kg)}, entrega em ${fmtDataBr(p.data_entrega)}.`
  const cot = p.status === 'cotado' && (p.preco_kg != null || p.valor_total != null)
    ? ` Cotação: ${[p.preco_kg != null && `${fmtReais(p.preco_kg)}/kg`, p.valor_total != null && `total ${fmtReais(p.valor_total)}`].filter(Boolean).join(', ')}.${p.resposta ? ` ${p.resposta}` : ''} Você pode aprovar pelo Confina+.`
    : ''
  return `${ola} ${base}${cot}`
}

export default function Pedidos() {
  const { fornecedor, membro } = usePortal()
  const { clientes, produtos, pedidos, estoque, loading, recarregar } = useDadosFornecedor()
  const [filtro, setFiltro] = useState<StatusPedido | 'todos'>('todos')
  const [cotar, setCotar] = useState<PedidoFornecedor | null>(null)
  const [form, setForm] = useState({ quantidade: '', data: '', preco: '', total: '', resposta: '' })
  const [novo, setNovo] = useState(false)
  const [formNovo, setFormNovo] = useState({ cliente_id: '', produto_id: '', quantidade: '', data: hojeISO(), obs: '' })
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const clientePorId = useMemo(() => new Map(clientes.map(c => [c.id, c])), [clientes])
  const lista = filtro === 'todos' ? pedidos.filter(p => p.status !== 'cancelado') : pedidos.filter(p => p.status === filtro)
  const vendedorNome = membro?.nome || 'o vendedor'

  const mudarStatus = async (p: PedidoFornecedor, status: StatusPedido) => {
    setErro(null)
    const { error } = await supabase.from('fornecedor_pedidos').update({ status }).eq('id', p.id)
    if (error) { setErro(error.message); return }
    // Entregue: a quantidade entra no estoque do cliente (servidor).
    if (status === 'entregue') {
      const r = await chamarApiParceiros('pedido_entregue', { pedido_id: p.id })
      if (r.error) setErro(`Pedido marcado como entregue, mas a entrada no estoque do cliente falhou: ${r.error}`)
    }
    recarregar()
  }

  const abrirCotacao = (p: PedidoFornecedor) => {
    setCotar(p)
    setForm({
      quantidade: p.quantidade_kg != null ? String(p.quantidade_kg) : '', data: p.data_entrega ?? '',
      preco: p.preco_kg != null ? String(p.preco_kg) : '', total: p.valor_total != null ? String(p.valor_total) : '', resposta: p.resposta ?? '',
    })
    setErro(null)
  }

  const num = (s: string) => s.trim() === '' ? null : Number(s.replace(',', '.'))

  const salvarCotacao = async () => {
    if (!cotar) return
    const preco = num(form.preco)
    const qtd = num(form.quantidade)
    const total = num(form.total) ?? (preco != null && qtd != null ? Math.round(preco * qtd * 100) / 100 : null)
    if (preco == null && total == null) { setErro('Informe o preço por kg ou o valor total'); return }
    setSalvando(true); setErro(null)
    const { error } = await supabase.from('fornecedor_pedidos').update({
      quantidade_kg: qtd, data_entrega: form.data || null, preco_kg: preco, valor_total: total,
      resposta: form.resposta.trim() || null, status: 'cotado',
    }).eq('id', cotar.id)
    setSalvando(false)
    if (error) { setErro(error.message); return }
    setCotar(null)
    recarregar()
  }

  const salvarNovo = async () => {
    const qtd = num(formNovo.quantidade)
    if (!formNovo.cliente_id || !formNovo.produto_id) { setErro('Escolha o cliente e o produto'); return }
    const est = estoque.find(e => e.cliente_id === formNovo.cliente_id && e.produto_id === formNovo.produto_id)
    setSalvando(true); setErro(null)
    const r = await criarPedido({
      cliente_id: formNovo.cliente_id, produto_id: formNovo.produto_id, quantidade_kg: qtd ?? 0, data_entrega: formNovo.data,
      observacoes: formNovo.obs, origem: 'vendedor',
      estoque_info: est ? { saldo_kg: est.saldo_kg, consumo_dia_kg: est.consumo_dia_kg, data_fim: est.data_fim, dias_cobertura: est.dias_cobertura } : null,
    })
    setSalvando(false)
    if (r.error) { setErro(r.error); return }
    setNovo(false)
    setFormNovo({ cliente_id: '', produto_id: '', quantidade: '', data: hojeISO(), obs: '' })
    recarregar()
  }

  if (loading) return <div className="page"><div className="spinner" style={{ width: 28, height: 28, margin: '48px auto' }} /></div>

  return (
    <div className="page">
      <PageHeader title="Pedidos" subtitle="Solicitações dos clientes e alertas automáticos, do pedido novo até a entrega"
        action={<button className="btn btn-primary" onClick={() => { setErro(null); setNovo(true) }}>+ Lançar pedido</button>} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 16 }}>
        {FUNIL.map(s => (
          <button key={s} type="button" onClick={() => setFiltro(filtro === s ? 'todos' : s)} className="stat-card"
            style={{ textAlign: 'left', cursor: 'pointer', borderColor: filtro === s ? 'var(--green)' : undefined, fontFamily: 'inherit' }}>
            <div className="label">{ROTULO_STATUS[s]}</div>
            <div className="value">{pedidos.filter(p => p.status === s).length}</div>
          </button>
        ))}
      </div>
      {erro && !cotar && !novo && <div className="field-error" style={{ marginBottom: 12 }}>{erro}</div>}

      {lista.length === 0 ? <div className="card"><EmptyState icon="◻" title="Nenhum pedido" desc="Os pedidos dos clientes e os alertas de estoque aparecem aqui." /></div> : (
        <div className="table-wrap">
          <table>
            <thead><tr><th>Nº</th><th>Cliente</th><th>Produto</th><th>Qtd</th><th>Entrega</th><th>Origem</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {lista.map(p => {
                const c = clientePorId.get(p.cliente_id)
                const zap = linkWhatsApp(c?.telefone, mensagemWhatsApp(p, c, vendedorNome, fornecedor?.nome ?? ''))
                return (
                  <tr key={p.id}>
                    <td>#{p.numero}</td>
                    <td><strong>{nomeCliente(c)}</strong>{c?.telefone && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.telefone}</div>}</td>
                    <td>{p.produto_nome ?? '—'}{p.estoque_info?.data_fim && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Estoque até {fmtDataBr(p.estoque_info.data_fim)}</div>}</td>
                    <td>{fmtKg(p.quantidade_kg)}</td>
                    <td>{fmtDataBr(p.data_entrega)}</td>
                    <td style={{ fontSize: 12, color: p.origem === 'alerta' ? 'var(--red)' : 'var(--text-2)' }}>{ROTULO_ORIGEM[p.origem]}</td>
                    <td>
                      <span className={`badge ${CLASSE_STATUS[p.status]}`}>{ROTULO_STATUS[p.status]}</span>
                      {p.valor_total != null && <div style={{ fontSize: 11, marginTop: 2 }}>{fmtReais(p.valor_total)}</div>}
                    </td>
                    <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                      {p.status === 'novo' && <button className="btn btn-ghost btn-sm" onClick={() => mudarStatus(p, 'em_cotacao')}>Em cotação</button>}
                      {['novo', 'em_cotacao', 'cotado'].includes(p.status) && <button className="btn btn-primary btn-sm" style={{ marginLeft: 6 }} onClick={() => abrirCotacao(p)}>{p.status === 'cotado' ? 'Editar cotação' : 'Cotar'}</button>}
                      {p.status === 'aprovado' && <button className="btn btn-primary btn-sm" onClick={() => mudarStatus(p, 'entregue')}>Marcar entregue</button>}
                      {zap && <a className="btn btn-ghost btn-sm" style={{ marginLeft: 6 }} href={zap} target="_blank" rel="noreferrer">WhatsApp</a>}
                      {['novo', 'em_cotacao', 'cotado', 'aprovado'].includes(p.status) && (
                        <button className="btn btn-ghost btn-sm" style={{ marginLeft: 6 }} onClick={() => { if (window.confirm(`Cancelar o pedido #${p.numero}?`)) mudarStatus(p, 'cancelado') }}>Cancelar</button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {cotar && (
        <Modal open onClose={() => setCotar(null)} title={`Cotação do pedido #${cotar.numero}`} subtitle={`${nomeCliente(clientePorId.get(cotar.cliente_id))} · ${cotar.produto_nome ?? ''}`}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setCotar(null)}>Fechar</button>
            <button className="btn btn-primary" disabled={salvando} onClick={salvarCotacao}>{salvando ? 'Salvando...' : 'Enviar cotação'}</button>
          </>}>
          {cotar.observacoes && <div style={{ fontSize: 13, background: 'var(--gray-50)', borderRadius: 8, padding: 10, marginBottom: 12 }}>Cliente: {cotar.observacoes}</div>}
          <div className="form-row-2">
            <div className="field"><label>Quantidade (kg)</label><input type="number" value={form.quantidade} onChange={e => setForm({ ...form, quantidade: e.target.value })} /></div>
            <div className="field"><label>Entrega</label><input type="date" value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} /></div>
          </div>
          <div className="form-row-2">
            <div className="field"><label>Preço (R$/kg)</label><input type="number" step="0.0001" value={form.preco} onChange={e => setForm({ ...form, preco: e.target.value })} /></div>
            <div className="field"><label>Valor total (R$)</label><input type="number" step="0.01" value={form.total} placeholder="Calculado se vazio" onChange={e => setForm({ ...form, total: e.target.value })} /></div>
          </div>
          <div className="field"><label>Mensagem ao cliente</label><textarea value={form.resposta} onChange={e => setForm({ ...form, resposta: e.target.value })} placeholder="Condições de pagamento, frete, validade da cotação" /></div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>O cliente vê a cotação no Confina+ e pode aprovar. Use o WhatsApp da lista para avisar.</div>
          {erro && <div className="field-error" style={{ marginTop: 8 }}>{erro}</div>}
        </Modal>
      )}

      {novo && (
        <Modal open onClose={() => setNovo(false)} title="Lançar pedido" subtitle="Ofereça reposição ou registre um pedido recebido fora da plataforma"
          footer={<>
            <button className="btn btn-ghost" onClick={() => setNovo(false)}>Fechar</button>
            <button className="btn btn-primary" disabled={salvando} onClick={salvarNovo}>{salvando ? 'Salvando...' : 'Lançar'}</button>
          </>}>
          <div className="field"><label>Cliente</label>
            <select value={formNovo.cliente_id} onChange={e => setFormNovo({ ...formNovo, cliente_id: e.target.value })}>
              <option value="">Escolha</option>
              {clientes.filter(c => c.ativo).map(c => <option key={c.id} value={c.id}>{nomeCliente(c)}</option>)}
            </select>
          </div>
          <div className="field"><label>Produto</label>
            <select value={formNovo.produto_id} onChange={e => setFormNovo({ ...formNovo, produto_id: e.target.value })}>
              <option value="">Escolha</option>
              {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          <div className="form-row-2">
            <div className="field"><label>Quantidade (kg)</label><input type="number" value={formNovo.quantidade} onChange={e => setFormNovo({ ...formNovo, quantidade: e.target.value })} /></div>
            <div className="field"><label>Entrega</label><input type="date" value={formNovo.data} onChange={e => setFormNovo({ ...formNovo, data: e.target.value })} /></div>
          </div>
          <div className="field"><label>Observações</label><textarea value={formNovo.obs} onChange={e => setFormNovo({ ...formNovo, obs: e.target.value })} /></div>
          {erro && <div className="field-error">{erro}</div>}
        </Modal>
      )}
    </div>
  )
}
