import { useState, useEffect, useCallback, Fragment } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Modal, PageHeader, EmptyState } from '@/components/common/UI'
import { useParceiroCliente } from '@/hooks/useParceiroCliente'
import { ModalSolicitar } from '@/components/parceiros/ModalSolicitar'
import {
  carregarMovimentos, emAlerta, fmtKg, fmtDataBr, hojeISO, ROTULO_CATEGORIA,
  type MovimentoEstoque, type ProdutoFornecedor,
} from '@/core/parceiros'

const ROTULO_MOV: Record<MovimentoEstoque['tipo'], string> = { entrada: 'Entrada', baixa: 'Baixa (consumo)', ajuste: 'Ajuste de inventário' }

// Conta só de estoque: entradas, baixas e ajustes por produto do
// fornecedor, saldo, consumo médio da janela, previsão de fim e pedido em
// 1 clique.
export default function ClienteEstoque() {
  const { user } = useAuth()
  const { vinculo, estoque, loading, calculando, recalcular, alterarJanela } = useParceiroCliente()
  const [movs, setMovs] = useState<MovimentoEstoque[]>([])
  const [registrar, setRegistrar] = useState<{ produto: ProdutoFornecedor; tipo: MovimentoEstoque['tipo'] } | null>(null)
  const [form, setForm] = useState({ data: hojeISO(), quantidade: '', obs: '' })
  const [solicitar, setSolicitar] = useState<ProdutoFornecedor | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)
  const [janela, setJanela] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  const carregarMovs = useCallback(async () => { if (user) setMovs(await carregarMovimentos(user.id)) }, [user])
  useEffect(() => { carregarMovs() }, [carregarMovs])

  if (loading) return <div className="page"><div className="spinner" style={{ width: 28, height: 28, margin: '48px auto' }} /></div>
  if (!vinculo) return <div className="page"><EmptyState icon="◻" title="Conta sem fornecedor" desc="Aceite o convite do fornecedor para usar o estoque." /></div>

  const nomeF = vinculo.fornecedor.nome
  const comMov = new Set(movs.map(m => m.produto_id))
  const produtos = vinculo.produtos.filter(p => p.visivel || comMov.has(p.id))

  const salvarMov = async () => {
    if (!registrar || !user) return
    const q = Number(form.quantidade.replace(',', '.'))
    if (!(q >= 0) || form.quantidade.trim() === '' || (registrar.tipo !== 'ajuste' && q === 0)) { setMsg({ tipo: 'erro', texto: 'Informe a quantidade' }); return }
    if (!form.data || form.data > hojeISO()) { setMsg({ tipo: 'erro', texto: 'A data não pode ser futura' }); return }
    setSalvando(true); setMsg(null)
    const { error } = await supabase.from('estoque_movimentos').insert({
      user_id: user.id, produto_id: registrar.produto.id, tipo: registrar.tipo, data: form.data, quantidade_kg: q, observacoes: form.obs.trim() || null,
    })
    setSalvando(false)
    if (error) { setMsg({ tipo: 'erro', texto: error.message }); return }
    setRegistrar(null)
    await carregarMovs()
    await recalcular()
  }

  const excluirMov = async (m: MovimentoEstoque) => {
    if (!window.confirm(`Excluir ${ROTULO_MOV[m.tipo].toLowerCase()} de ${fmtKg(m.quantidade_kg)} em ${fmtDataBr(m.data)}?`)) return
    const { error } = await supabase.from('estoque_movimentos').delete().eq('id', m.id)
    if (error) { setMsg({ tipo: 'erro', texto: error.message }); return }
    await carregarMovs()
    await recalcular()
  }

  const salvarJanela = async () => {
    const n = Number(janela)
    if (!(n >= 1 && n <= 90)) { setMsg({ tipo: 'erro', texto: 'A janela deve ter entre 1 e 90 dias' }); return }
    const r = await alterarJanela(n)
    setJanela(null)
    if (r.error) setMsg({ tipo: 'erro', texto: r.error })
  }

  return (
    <div className="page">
      <PageHeader title="Estoque" subtitle={`Produtos ${nomeF}: saldo, consumo e previsão de fim`} />
      <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        Consumo médio calculado pelas baixas dos últimos {vinculo.cliente.janela_consumo_dias} dias.
        {janela == null
          ? <button className="btn btn-ghost btn-sm" onClick={() => setJanela(String(vinculo.cliente.janela_consumo_dias))}>Alterar</button>
          : <><input type="number" min={1} max={90} className="form-input" style={{ width: 70, height: 30 }} value={janela} onChange={e => setJanela(e.target.value)} />
              <button className="btn btn-primary btn-sm" onClick={salvarJanela}>Salvar</button></>}
        {calculando && <div className="spinner" style={{ width: 16, height: 16 }} />}
      </div>
      {msg && !registrar && <div style={{ fontSize: 13, marginBottom: 12, color: msg.tipo === 'erro' ? 'var(--red)' : 'var(--green-dark)' }}>{msg.texto}</div>}

      {produtos.length === 0 ? <div className="card"><EmptyState icon="◻" title="Nenhum produto" desc={`A ${nomeF} ainda não publicou produtos.`} /></div> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Produto</th><th>Saldo</th><th>Consumo médio</th><th>Fim previsto</th><th></th></tr></thead>
          <tbody>{produtos.map(p => {
            const e = estoque[p.id]
            const alerta = emAlerta(p, e)
            const lista = movs.filter(m => m.produto_id === p.id)
            return (
              <Fragment key={p.id}>
                <tr style={alerta ? { background: '#fff5f5' } : undefined}>
                  <td>
                    <button type="button" onClick={() => setAberto(aberto === p.id ? null : p.id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                      <strong>{p.nome}</strong>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{ROTULO_CATEGORIA[p.categoria]} · {lista.length} movimento{lista.length !== 1 ? 's' : ''}</div>
                    </button>
                  </td>
                  <td>{e ? fmtKg(e.saldo_kg) : <span style={{ color: 'var(--text-3)' }}>Sem movimentos</span>}</td>
                  <td>{e?.consumo_dia_kg ? `${fmtKg(e.consumo_dia_kg)}/dia` : '—'}</td>
                  <td>{fmtDataBr(e?.data_fim)}{e?.dias_cobertura != null && <span className={`badge ${alerta ? 'badge-red' : 'badge-green'}`} style={{ marginLeft: 8 }}>{Math.floor(e.dias_cobertura)} dias</span>}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setMsg(null); setForm({ data: hojeISO(), quantidade: '', obs: '' }); setRegistrar({ produto: p, tipo: 'entrada' }) }}>Entrada</button>
                    <button className="btn btn-ghost btn-sm" style={{ marginLeft: 6 }} onClick={() => { setMsg(null); setForm({ data: hojeISO(), quantidade: '', obs: '' }); setRegistrar({ produto: p, tipo: 'baixa' }) }}>Baixa</button>
                    <button className="btn btn-ghost btn-sm" style={{ marginLeft: 6 }} onClick={() => { setMsg(null); setForm({ data: hojeISO(), quantidade: '', obs: '' }); setRegistrar({ produto: p, tipo: 'ajuste' }) }}>Ajuste</button>
                    {p.visivel && <button className={`btn btn-sm ${alerta ? 'btn-primary' : 'btn-secondary'}`} style={{ marginLeft: 6 }} onClick={() => setSolicitar(p)}>Solicitar</button>}
                  </td>
                </tr>
                {aberto === p.id && (
                  <tr><td colSpan={5} style={{ background: 'var(--gray-50)' }}>
                    {lista.length === 0 ? <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Nenhum movimento.</span> : (
                      <table><tbody>{lista.slice(0, 50).map(m => (
                        <tr key={m.id}>
                          <td style={{ fontSize: 12 }}>{fmtDataBr(m.data)}</td>
                          <td style={{ fontSize: 12 }}>{ROTULO_MOV[m.tipo]}</td>
                          <td style={{ fontSize: 12 }}>{m.tipo === 'baixa' ? '-' : ''}{fmtKg(m.quantidade_kg)}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{m.observacoes ?? ''}</td>
                          <td style={{ textAlign: 'right' }}><button className="btn btn-ghost btn-sm" onClick={() => excluirMov(m)}>Excluir</button></td>
                        </tr>
                      ))}</tbody></table>
                    )}
                  </td></tr>
                )}
              </Fragment>
            )
          })}</tbody>
        </table></div>
      )}

      {registrar && (
        <Modal open onClose={() => setRegistrar(null)} title={ROTULO_MOV[registrar.tipo]} subtitle={registrar.produto.nome}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setRegistrar(null)}>Cancelar</button>
            <button className="btn btn-primary" disabled={salvando} onClick={salvarMov}>{salvando ? 'Salvando...' : 'Registrar'}</button>
          </>}>
          <div className="form-row-2">
            <div className="field"><label>Data</label><input type="date" max={hojeISO()} value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} /></div>
            <div className="field"><label>{registrar.tipo === 'ajuste' ? 'Saldo contado (kg)' : 'Quantidade (kg)'}</label><input type="number" min={0} value={form.quantidade} onChange={e => setForm({ ...form, quantidade: e.target.value })} /></div>
          </div>
          {registrar.tipo === 'ajuste' && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: -8, marginBottom: 12 }}>O saldo passa a ser o valor contado a partir desta data.</div>}
          <div className="field"><label>Observações</label><input value={form.obs} onChange={e => setForm({ ...form, obs: e.target.value })} /></div>
          {msg && <div style={{ fontSize: 13, color: msg.tipo === 'erro' ? 'var(--red)' : 'var(--green-dark)' }}>{msg.texto}</div>}
        </Modal>
      )}

      {solicitar && (
        <ModalSolicitar produto={solicitar} estoque={estoque[solicitar.id]} cliente={vinculo.cliente} fornecedorNome={nomeF}
          onClose={() => setSolicitar(null)}
          onCriado={(_p, aviso) => { setSolicitar(null); setMsg({ tipo: aviso ? 'erro' : 'ok', texto: aviso ?? `Solicitação enviada à ${nomeF}. Acompanhe em Pedidos.` }) }} />
      )}
    </div>
  )
}
