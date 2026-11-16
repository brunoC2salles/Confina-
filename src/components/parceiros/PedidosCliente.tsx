import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  ROTULO_STATUS, CLASSE_STATUS, fmtKg, fmtDataBr, linkWhatsApp,
  type PedidoFornecedor, type VinculoCliente,
} from '@/core/parceiros'

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

  return (
    <>
      {erro && <div className="field-error" style={{ marginBottom: 8 }}>{erro}</div>}
      <div className="table-wrap">
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
                <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                  {p.status === 'cotado' && (
                    <button className="btn btn-primary btn-sm" disabled={salvando === p.id} onClick={() => mudarStatus(p, 'aprovado')}>Aprovar</button>
                  )}
                  {['novo', 'em_cotacao', 'cotado'].includes(p.status) && (
                    <button className="btn btn-ghost btn-sm" style={{ marginLeft: 6 }} disabled={salvando === p.id} onClick={() => mudarStatus(p, 'cancelado')}>Cancelar</button>
                  )}
                  {zap && zap(p) && (
                    <a className="btn btn-ghost btn-sm" style={{ marginLeft: 6 }} href={zap(p)!} target="_blank" rel="noreferrer">WhatsApp</a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
