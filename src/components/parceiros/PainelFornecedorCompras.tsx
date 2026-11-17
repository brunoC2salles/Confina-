import { useState, useEffect, useRef } from 'react'
import { useParceiroCliente } from '@/hooks/useParceiroCliente'
import { ModalSolicitar } from '@/components/parceiros/ModalSolicitar'
import { PedidosCliente } from '@/components/parceiros/PedidosCliente'
import { EnderecoEntrega } from '@/components/parceiros/EnderecoEntrega'
import { emAlerta, vendavel, fmtKg, fmtDataBr, ROTULO_CATEGORIA, type ProdutoFornecedor } from '@/core/parceiros'
import { Modal } from '@/components/common/UI'

// Compras > Ração, para o produtor vinculado a um fornecedor: previsão de
// fim de estoque dos produtos do fornecedor usados nas dietas, alerta e
// pedido de cotação em 1 clique, e os pedidos feitos.
export function PainelFornecedorCompras({ versaoEstoque }: { versaoEstoque?: number }) {
  const { vinculo, pedidos, estoque, loading, calculando, recalcular, recarregarPedidos, alterarJanela } = useParceiroCliente()
  const [solicitar, setSolicitar] = useState<ProdutoFornecedor | null>(null)
  const [catalogo, setCatalogo] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [janela, setJanela] = useState<string | null>(null)
  // Fornecimento registrado ou excluído na página muda o consumo.
  const ultimaVersao = useRef(versaoEstoque)
  useEffect(() => {
    if (versaoEstoque !== ultimaVersao.current) { ultimaVersao.current = versaoEstoque; recalcular() }
  }, [versaoEstoque, recalcular])

  if (loading || !vinculo) return null
  const nomeF = vinculo.fornecedor.nome
  const usados = vinculo.produtos.filter(p => estoque[p.id])
  const emAlertaLista = usados.filter(p => emAlerta(p, estoque[p.id]))
  const visiveis = vinculo.produtos.filter(p => p.visivel && vendavel(p))
  const salvarJanela = async () => {
    const n = Number(janela)
    if (!(n >= 1 && n <= 90)) { setAviso('A janela de consumo deve ter entre 1 e 90 dias'); return }
    const r = await alterarJanela(n)
    setJanela(null)
    if (r.error) setAviso(r.error)
  }

  return (
    <div className="card" style={{ marginBottom: 24 }}>
      <div className="flex-between" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Produtos {nomeF}</div>
          <div style={{ fontSize: 13, color: 'var(--text-2)' }}>
            Previsão de fim de estoque pelo consumo médio dos últimos {vinculo.cliente.janela_consumo_dias} dias
            {janela == null
              ? <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 8, height: 26 }} onClick={() => setJanela(String(vinculo.cliente.janela_consumo_dias))}>Alterar</button>
              : <span style={{ marginLeft: 8, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
                  <input type="number" min={1} max={90} value={janela} onChange={e => setJanela(e.target.value)} className="form-input" style={{ width: 70, height: 28 }} />
                  <button type="button" className="btn btn-primary btn-sm" style={{ height: 28 }} onClick={salvarJanela}>Salvar</button>
                </span>}
          </div>
        </div>
        <button className="btn btn-secondary" onClick={() => setCatalogo(true)}>Catálogo {nomeF}</button>
      </div>

      {aviso && <div style={{ background: '#fef3c7', color: 'var(--amber)', borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 12 }}>{aviso}</div>}
      {emAlertaLista.length > 0 && (
        <div style={{ background: '#fee2e2', color: 'var(--red)', borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 12 }}>
          {emAlertaLista.length === 1 ? '1 produto acaba' : `${emAlertaLista.length} produtos acabam`} em menos de {Math.min(...emAlertaLista.map(p => p.dias_alerta))} dias ou estão abaixo do mínimo.
        </div>
      )}

      {calculando && usados.length === 0
        ? <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><div className="spinner" style={{ width: 24, height: 24 }} /></div>
        : usados.length === 0
          ? <div style={{ fontSize: 13, color: 'var(--text-3)' }}>
              Use uma dieta {nomeF} (em Dietas) e registre as compras dos produtos como ingrediente para acompanhar o estoque aqui.
            </div>
          : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Produto</th><th>Saldo</th><th>Consumo médio</th><th>Fim previsto</th><th></th></tr></thead>
                <tbody>
                  {usados.map(p => {
                    const e = estoque[p.id]
                    const alerta = emAlerta(p, e)
                    return (
                      <tr key={p.id} style={alerta ? { background: '#fff5f5' } : undefined}>
                        <td><strong>{p.nome}</strong><div style={{ fontSize: 11, color: 'var(--text-3)' }}>{ROTULO_CATEGORIA[p.categoria]}</div></td>
                        <td>{e.saldo_kg == null ? <span style={{ color: 'var(--text-3)' }}>Sem compras registradas</span> : fmtKg(e.saldo_kg)}</td>
                        <td>{e.consumo_dia_kg ? `${fmtKg(e.consumo_dia_kg)}/dia` : '—'}</td>
                        <td>
                          {fmtDataBr(e.data_fim)}
                          {e.dias_cobertura != null && <span className={`badge ${alerta ? 'badge-red' : 'badge-green'}`} style={{ marginLeft: 8 }}>{Math.floor(e.dias_cobertura)} dias</span>}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {p.visivel && <button className={`btn btn-sm ${alerta ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSolicitar(p)}>Solicitar à {nomeF}</button>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}

      <div style={{ margin: '20px 0 0', padding: '12px 0 0', borderTop: '1px solid var(--border)' }}>
        <EnderecoEntrega cliente={vinculo.cliente} />
      </div>

      <div style={{ fontSize: 14, fontWeight: 600, margin: '20px 0 8px' }}>Meus pedidos à {nomeF}</div>
      <PedidosCliente vinculo={vinculo} pedidos={pedidos} onAlterado={() => recarregarPedidos()} />

      {catalogo && (
        <Modal open onClose={() => setCatalogo(false)} title={`Catálogo ${nomeF}`} size="lg">
          {visiveis.length === 0
            ? <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Nenhum produto disponível.</div>
            : <div className="table-wrap"><table>
                <thead><tr><th>Produto</th><th>Categoria</th><th>Embalagem</th><th>Prazo</th><th></th></tr></thead>
                <tbody>{visiveis.map(p => (
                  <tr key={p.id}>
                    <td>{p.nome}</td><td>{ROTULO_CATEGORIA[p.categoria]}</td><td>{p.embalagem ?? '—'}</td>
                    <td>{p.prazo_entrega_dias != null ? `${p.prazo_entrega_dias} dias` : '—'}</td>
                    <td style={{ textAlign: 'right' }}><button className="btn btn-ghost btn-sm" onClick={() => { setCatalogo(false); setSolicitar(p) }}>Solicitar</button></td>
                  </tr>
                ))}</tbody>
              </table></div>}
        </Modal>
      )}

      {solicitar && (
        <ModalSolicitar produto={solicitar} estoque={estoque[solicitar.id]} cliente={vinculo.cliente} fornecedorNome={nomeF}
          onClose={() => setSolicitar(null)}
          onCriado={(_p, a) => { setSolicitar(null); setAviso(a ?? `Solicitação enviada à ${nomeF}.`); recarregarPedidos() }} />
      )}
    </div>
  )
}
