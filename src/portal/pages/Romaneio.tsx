import { useSearchParams, Link } from 'react-router-dom'
import { useDadosFornecedor, nomeCliente } from '@/portal/useDadosFornecedor'
import { rotaDoPedido, fmtKg, fmtDataBr, hojeISO, linkMapsCliente } from '@/core/parceiros'

const CSS = `
.rom { max-width: 1000px; margin: 0 auto; padding: 32px 28px; font-family: Inter, sans-serif; color: #111; }
.rom-acoes { display: flex; gap: 8px; justify-content: flex-end; margin-bottom: 20px; }
.rom-topo { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; border-bottom: 2px solid #1b5e20; padding-bottom: 16px; margin-bottom: 20px; }
.rom-topo h1 { font-family: Syne, sans-serif; font-size: 26px; margin: 0 0 6px; color: #1b5e20; }
.rom-topo p { margin: 2px 0; font-size: 15px; }
.rom-resumo { text-align: right; font-size: 15px; }
.rom-resumo strong { font-size: 22px; display: block; }
.rom table { width: 100%; border-collapse: collapse; font-size: 14px; }
.rom th { text-align: left; background: #f3f6f2; padding: 10px 8px; font-size: 12px; text-transform: uppercase; letter-spacing: .04em; border-bottom: 1px solid #cfd8cc; }
.rom td { padding: 12px 8px; border-bottom: 1px solid #e3e8e1; vertical-align: top; }
.rom td.qtd { white-space: nowrap; font-weight: 600; }
.rom .assin { display: grid; grid-template-columns: 1fr 1fr; gap: 48px; margin-top: 56px; font-size: 13px; color: #444; }
.rom .assin div { border-top: 1px solid #555; padding-top: 6px; }
.rom .end { font-size: 13px; }
.rom .end a { color: #1b5e20; font-weight: 600; text-decoration: underline; }
.rom .rodape { margin-top: 28px; font-size: 11px; color: #777; }
@media print {
  .rom-acoes { display: none; }
  .rom { padding: 0; max-width: none; }
  tr { break-inside: avoid; }
  @page { size: A4; margin: 14mm; }
}
`

// Romaneio de uma carga (data + rota): tela e PDF pelo "Imprimir" do
// navegador (escolher "Salvar como PDF").
export default function Romaneio() {
  const [params] = useSearchParams()
  const data = params.get('data') ?? hojeISO()
  const rotaId = params.get('rota') ?? 'sem-rota'
  const { fornecedor, clientes, pedidos, rotas, capacidadeKg, loading } = useDadosFornecedor()

  if (loading) return <div className="loading-screen"><div className="spinner" style={{ width: 28, height: 28 }} /></div>

  const rota = rotas.find(r => r.id === rotaId) ?? null
  const clientePorId = new Map(clientes.map(c => [c.id, c]))
  const hoje = hojeISO()
  const itens = pedidos.filter(p => {
    if (p.status !== 'aprovado' || !p.data_entrega) return false
    const d = p.data_entrega < hoje ? hoje : p.data_entrega
    if (d !== data) return false
    const r = rotaDoPedido(p, clientePorId.get(p.cliente_id), rotas)
    return (r?.id ?? 'sem-rota') === rotaId
  }).sort((a, b) => (clientePorId.get(a.cliente_id)?.municipio ?? '').localeCompare(clientePorId.get(b.cliente_id)?.municipio ?? ''))
  const total = itens.reduce((s, p) => s + Number(p.quantidade_kg ?? 0), 0)

  return (
    <div className="rom">
      <style>{CSS}</style>
      <div className="rom-acoes">
        <Link className="btn btn-ghost" to="/entregas">Voltar</Link>
        <button className="btn btn-primary" onClick={() => window.print()}>Baixar PDF / imprimir</button>
      </div>
      <div className="rom-topo">
        <div>
          <h1>Romaneio de entrega</h1>
          <p><strong>{fornecedor?.nome}</strong></p>
          <p>Rota: {rota?.nome ?? 'Sem rota'}</p>
          <p>Data: {fmtDataBr(data)}</p>
        </div>
        <div className="rom-resumo">
          <strong>{fmtKg(total)}</strong>
          {itens.length} entrega{itens.length !== 1 ? 's' : ''} · capacidade {fmtKg(capacidadeKg)}
          {total > capacidadeKg && <div style={{ color: '#b91c1c', fontWeight: 600 }}>Acima da capacidade</div>}
        </div>
      </div>
      {itens.length === 0 ? <p>Nenhuma entrega aprovada para esta data e rota.</p> : (
        <table>
          <thead><tr><th>Nº</th><th>Fazenda e contato</th><th>Endereço de entrega</th><th>Produto</th><th>Quantidade</th><th>Observações</th></tr></thead>
          <tbody>{itens.map(p => {
            const c = clientePorId.get(p.cliente_id)
            return (
              <tr key={p.id}>
                <td>#{p.numero}</td>
                <td><strong>{nomeCliente(c)}</strong><div>{[c?.responsavel, c?.telefone].filter(Boolean).join(' · ')}</div></td>
                <td className="end">
                  {c?.endereco_entrega && <div>{c.endereco_entrega}</div>}
                  <div>{[c?.municipio, c?.uf].filter(Boolean).join('/') || (c?.endereco_entrega ? '' : '—')}</div>
                  {(() => {
                    const link = linkMapsCliente(c)
                    return link ? <a href={link} target="_blank" rel="noreferrer">Abrir no Google Maps</a> : null
                  })()}
                </td>
                <td>{p.produto_nome ?? '—'}</td>
                <td className="qtd">{fmtKg(p.quantidade_kg)}</td>
                <td>{p.observacoes ?? ''}</td>
              </tr>
            )
          })}</tbody>
        </table>
      )}
      <div className="assin"><div>Motorista</div><div>Conferência na saída</div></div>
      <div className="rodape">Gerado pelo portal de parceiros Confina+ em {new Date().toLocaleString('pt-BR')}</div>
    </div>
  )
}
