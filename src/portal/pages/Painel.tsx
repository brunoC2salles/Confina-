import { Link } from 'react-router-dom'
import { PageHeader } from '@/components/common/UI'
import { useDadosFornecedor, nomeCliente } from '@/portal/useDadosFornecedor'
import { usePortal } from '@/portal/PortalContext'
import { ROTULO_STATUS, CLASSE_STATUS, fmtKg, fmtDataBr, hojeISO, somarDias, emAlerta } from '@/core/parceiros'

// Painel do vendedor: pedidos novos, rupturas previstas em 7 dias, demanda
// prevista em 15 dias e clientes conectados.
export default function Painel() {
  const { papel } = usePortal()
  const { clientes, produtos, pedidos, estoque, loading } = useDadosFornecedor()
  if (loading) return <div className="page"><div className="spinner" style={{ width: 28, height: 28, margin: '48px auto' }} /></div>

  const hoje = hojeISO()
  const limite7 = somarDias(hoje, 7)
  const clientePorId = new Map(clientes.map(c => [c.id, c]))
  const produtoPorId = new Map(produtos.map(p => [p.id, p]))
  const novos = pedidos.filter(p => p.status === 'novo')
  const rupturas = estoque.filter(e => e.data_fim != null && e.data_fim <= limite7)
  const demanda15 = estoque.reduce((s, e) => s + (e.consumo_dia_kg ?? 0) * 15, 0)
  const ativos = clientes.filter(c => c.ativo)
  const abertos = pedidos.filter(p => ['novo', 'em_cotacao', 'cotado', 'aprovado'].includes(p.status)).slice(0, 8)
  const fimPorCliente = [...estoque].filter(e => e.data_fim != null && clientePorId.get(e.cliente_id)?.ativo)
    .sort((a, b) => (a.data_fim ?? '').localeCompare(b.data_fim ?? '')).slice(0, 8)

  const stat = (label: string, valor: string, sub: string, destaque?: boolean) => (
    <div className="stat-card">
      <div className="label">{label}</div>
      <div className="value" style={destaque ? { color: 'var(--red)' } : undefined}>{valor}</div>
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>{sub}</div>
    </div>
  )

  return (
    <div className="page">
      <PageHeader title="Painel" subtitle={papel === 'vendedor' ? 'Sua carteira de clientes' : 'Toda a carteira do fornecedor'} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 20 }}>
        {stat('Pedidos novos', String(novos.length), 'aguardando atendimento')}
        {stat('Rupturas em 7 dias', String(rupturas.length), 'produtos acabando nos clientes', rupturas.length > 0)}
        {stat('Demanda em 15 dias', `${(demanda15 / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} t`, 'consumo previsto da carteira')}
        {stat('Clientes conectados', String(ativos.length), `${ativos.filter(c => c.modo === 'confina').length} no Confina+ · ${ativos.filter(c => c.modo === 'estoque').length} só estoque`)}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 }}>
        <div className="card">
          <div className="flex-between" style={{ marginBottom: 12 }}>
            <strong>Pedidos e alertas em aberto</strong>
            <Link to="/pedidos" style={{ fontSize: 13, color: 'var(--green)' }}>Ver todos</Link>
          </div>
          {abertos.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Nenhum pedido em aberto.</div> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Cliente</th><th>Produto</th><th>Qtd</th><th>Entrega</th><th>Status</th></tr></thead>
              <tbody>{abertos.map(p => (
                <tr key={p.id}>
                  <td>{nomeCliente(clientePorId.get(p.cliente_id))}{p.origem === 'alerta' && <div style={{ fontSize: 11, color: 'var(--red)' }}>Alerta de estoque</div>}</td>
                  <td>{p.produto_nome ?? '—'}</td>
                  <td>{fmtKg(p.quantidade_kg)}</td>
                  <td>{fmtDataBr(p.data_entrega)}</td>
                  <td><span className={`badge ${CLASSE_STATUS[p.status]}`}>{ROTULO_STATUS[p.status]}</span></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>

        <div className="card">
          <div className="flex-between" style={{ marginBottom: 12 }}>
            <strong>Fim de estoque por cliente</strong>
            <Link to="/clientes" style={{ fontSize: 13, color: 'var(--green)' }}>Clientes</Link>
          </div>
          {fimPorCliente.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Sem previsão de estoque ainda.</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {fimPorCliente.map(e => {
                const prod = produtoPorId.get(e.produto_id)
                const alerta = prod ? emAlerta(prod, e) : false
                const dias = e.dias_cobertura ?? 0
                return (
                  <div key={`${e.cliente_id}-${e.produto_id}`}>
                    <div className="flex-between" style={{ fontSize: 13 }}>
                      <span><strong>{nomeCliente(clientePorId.get(e.cliente_id))}</strong> <span style={{ color: 'var(--text-3)' }}>{prod?.nome}</span></span>
                      <span style={{ color: alerta ? 'var(--red)' : 'var(--text-2)', fontWeight: 600 }}>{Math.floor(dias)} dias</span>
                    </div>
                    <div style={{ height: 6, background: 'var(--gray-100)', borderRadius: 4, marginTop: 4 }}>
                      <div style={{ width: `${Math.min(100, (dias / 30) * 100)}%`, height: '100%', borderRadius: 4, background: alerta ? 'var(--red)' : dias < 15 ? 'var(--amber)' : 'var(--green)' }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
