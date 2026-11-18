import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  ROTULO_STATUS, CLASSE_STATUS, fmtKg, fmtDataBr, linkWhatsApp,
  type PedidoFornecedor, type VinculoCliente,
} from '@/core/parceiros'
import './estoque-gerenciado.css'

const fmtReais = (v: number | null) => v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// Pedidos do cliente: acompanha o atendimento, aprova a cotação respondida
// ou cancela um pedido em aberto.
export function PedidosCliente({ vinculo, pedidos, onAlterado }: {
  vinculo: VinculoCliente
  pedidos: PedidoFornecedor[]
  onAlterado: () => void
}) {
  const [salvando, setSalvando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const mudarStatus = async (p: PedidoFornecedor, status: 'aprovado' | 'cancelado') => {
    if (status === 'cancelado' && !window.confirm(`Cancelar o pedido #${p.numero}?`)) return
    setSalvando(p.id); setErro(null)
    const { error } = await supabase.from('fornecedor_pedidos').update({ status }).eq('id', p.id)
    setSalvando(null)
    if (error) { setErro(error.message); return }
    onAlterado()
  }

  if (pedidos.length === 0) {
    return <div style={{ fontSize: 13, color: 'var(--text-3)', padding: '12px 0' }}>Nenhum pedido ainda.</div>
  }

  const zap = vinculo.vendedor?.telefone
    ? (p: PedidoFornecedor) => linkWhatsApp(vinculo.vendedor?.telefone, `Olá ${vinculo.vendedor?.nome ?? ''}, sobre o pedido #${p.numero} de ${p.produto_nome ?? ''} (${fmtKg(p.quantidade_kg)}).`)
    : null

  const acoes = (p: PedidoFornecedor) => (
    <>
      {p.status === 'cotado' && (
        <button className="btn btn-primary btn-sm" disabled={salvando === p.id} onClick={() => mudarStatus(p, 'aprovado')}>Aprovar</button>
      )}
      {['novo', 'em_cotacao', 'cotado'].includes(p.status) && (
        <button className="btn btn-ghost btn-sm" disabled={salvando === p.id} onClick={() => mudarStatus(p, 'cancelado')}>Cancelar</button>
      )}
      {zap && zap(p) && (
        <a className="btn btn-ghost btn-sm" href={zap(p)!} target="_blank" rel="noreferrer">WhatsApp</a>
      )}
    </>
  )
  const cotacao = (p: PedidoFornecedor) => p.preco_kg != null || p.valor_total != null
    ? `${p.preco_kg != null ? `${fmtReais(p.preco_kg)}/kg` : ''}${p.preco_kg != null && p.valor_total != null ? ' · ' : ''}${p.valor_total != null ? fmtReais(p.valor_total) : ''}`
    : null

  return (
    <>
      {erro && <div className="field-error" style={{ marginBottom: 8 }}>{erro}</div>}
      <div className="eg-cards">
        {pedidos.map(p => (
          <div key={p.id} className="eg-card">
            <div className="eg-topo">
              <div><strong>{p.produto_nome ?? '—'}</strong><div className="eg-mut">#{p.numero}{p.origem === 'alerta' ? ' · alerta automático' : ''}</div></div>
              <span className={`badge ${CLASSE_STATUS[p.status]}`} style={{ whiteSpace: 'nowrap' }}>{ROTULO_STATUS[p.status]}</span>
            </div>
            <div className="eg-dados">
              <div><span>Quantidade</span><b>{fmtKg(p.quantidade_kg)}</b></div>
              <div><span>Entrega</span><b>{fmtDataBr(p.data_entrega)}</b></div>
              <div><span>Cotação</span><b>{cotacao(p) ?? '—'}</b></div>
            </div>
            {p.resposta && <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{p.resposta}</div>}
            <div className="eg-botoes">{acoes(p)}</div>
          </div>
        ))}
      </div>
      <div className="table-wrap eg-tabela">
        <table>
          <thead><tr><th>Nº</th><th>Produto</th><th>Quantidade</th><th>Entrega</th><th>Status</th><th>Cotação</th><th></th></tr></thead>
          <tbody>
            {pedidos.map(p => (
              <tr key={p.id}>
                <td>#{p.numero}</td>
                <td>{p.produto_nome ?? '—'}{p.origem === 'alerta' && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Alerta automático</div>}</td>
                <td>{fmtKg(p.quantidade_kg)}</td>
                <td>{fmtDataBr(p.data_entrega)}</td>
                <td><span className={`badge ${CLASSE_STATUS[p.status]}`}>{ROTULO_STATUS[p.status]}</span></td>
                <td style={{ fontSize: 12 }}>
                  {p.preco_kg != null || p.valor_total != null
                    ? <>{p.preco_kg != null && <div>{fmtReais(p.preco_kg)}/kg</div>}{p.valor_total != null && <div><strong>{fmtReais(p.valor_total)}</strong></div>}</>
                    : '—'}
                  {p.resposta && <div style={{ color: 'var(--text-2)', marginTop: 2 }}>{p.resposta}</div>}
                </td>
                <td className="eg-acoes">{acoes(p)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
