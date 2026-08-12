import { useState, Fragment } from 'react'
import { useGruposConsumoRacao, useResumoGrupo, type GrupoConsumoComDieta } from '@/hooks/useGruposConsumoRacao'
import { Modal, PageHeader, EmptyState } from '@/components/common/UI'
import { fmt, fmtNum, fmtData } from '@/lib/calculations'

const formVazio = { nome: '', dieta_id: '', observacoes: '', loteIds: [] as string[] }
const formCompraVazio = { quantidade_kg: '', valor_total: '', data_compra: '', data_inicio_uso: '', parceiro_id: '', observacoes: '' }

export default function Compras() {
  const { grupos, lotesAtivos, dietas, fornecedores, loading, criarGrupo, excluirGrupo } = useGruposConsumoRacao()
  const [showNovo, setShowNovo] = useState(false)
  const [grupoSelecionado, setGrupoSelecionado] = useState<GrupoConsumoComDieta | null>(null)
  const [form, setForm] = useState(formVazio)
  const [saving, setSaving] = useState(false)

  const fecharNovo = () => { setShowNovo(false); setForm(formVazio) }

  const handleCriar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nome || !form.dieta_id) return
    setSaving(true)
    await criarGrupo({ nome: form.nome, dieta_id: form.dieta_id, observacoes: form.observacoes, loteIds: form.loteIds })
    setSaving(false)
    fecharNovo()
  }

  const toggleLote = (loteId: string) => {
    setForm(f => ({ ...f, loteIds: f.loteIds.includes(loteId) ? f.loteIds.filter(id => id !== loteId) : [...f.loteIds, loteId] }))
  }

  return (
    <div className="page">
      <PageHeader
        title="Compras"
        subtitle="Grupos de lotes que dividem a mesma leva de ração — rateio automático por consumo teórico"
        action={<button className="btn btn-primary" onClick={() => setShowNovo(true)}>+ Novo grupo</button>}
      />

      {loading
        ? <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" style={{ width: 28, height: 28 }} /></div>
        : grupos.length === 0
          ? <div className="card"><EmptyState icon="◻" title="Nenhum grupo de consumo" desc="Crie um grupo quando vários lotes dividirem a mesma leva de ração comprada."
              action={<button className="btn btn-primary" onClick={() => setShowNovo(true)}>Novo grupo</button>} /></div>
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {grupos.map(g => (
                <div key={g.id} className="card" style={{ cursor: 'pointer' }} onClick={() => setGrupoSelecionado(g)}>
                  <div className="flex-between">
                    <strong>{g.nome}</strong>
                    <span className={`badge ${g.status === 'ativo' ? 'badge-green' : 'badge-gray'}`}>{g.status === 'ativo' ? 'Ativo' : 'Encerrado'}</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#9e9e9e', marginTop: 4 }}>{g.dieta_nome ?? 'Dieta não encontrada'}</div>
                  {g.observacoes && <div style={{ fontSize: 12, color: '#bdbdbd', marginTop: 8 }}>{g.observacoes}</div>}
                </div>
              ))}
            </div>
          )
      }

      <Modal open={showNovo} onClose={fecharNovo} title="Novo grupo de consumo" size="lg">
        <form onSubmit={handleCriar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">Nome do grupo</label>
              <input className="form-input" placeholder="Ex: Currais Ciclo 2 — Terminação" value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">Dieta</label>
              <select className="form-input" value={form.dieta_id} onChange={e => setForm(f => ({ ...f, dieta_id: e.target.value }))} required>
                <option value="">Selecione</option>
                {dietas.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Lotes que compartilham essa leva de ração</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 8, padding: 10 }}>
              {lotesAtivos.length === 0 && <span style={{ fontSize: 13, color: '#9e9e9e' }}>Nenhum lote ativo.</span>}
              {lotesAtivos.map(l => (
                <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.loteIds.includes(l.id)} onChange={() => toggleLote(l.id)} />
                  {l.nome_lote} <span style={{ color: '#bdbdbd' }}>({l.codigo_lote})</span>
                </label>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Observações</label>
            <input className="form-input" placeholder="Opcional" value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={fecharNovo}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Criar grupo'}</button>
          </div>
        </form>
      </Modal>

      {grupoSelecionado && (
        <DetalheGrupo
          grupo={grupoSelecionado}
          lotesAtivos={lotesAtivos}
          fornecedores={fornecedores}
          onClose={() => setGrupoSelecionado(null)}
          onExcluir={async () => { await excluirGrupo(grupoSelecionado.id); setGrupoSelecionado(null) }}
        />
      )}
    </div>
  )
}

// ─── Detalhe do grupo: membros, saldo, compras, estatística ────────────────

function DetalheGrupo({ grupo, lotesAtivos, fornecedores, onClose, onExcluir }: {
  grupo: GrupoConsumoComDieta
  lotesAtivos: Array<{ id: string; nome_lote: string; codigo_lote: string }>
  fornecedores: Array<{ id: string; nome: string }>
  onClose: () => void
  onExcluir: () => void
}) {
  const {
    membros, compras, lotesInfo, saldo, loading,
    registrarCompra, adicionarLote, encerrarParticipacao, rankingPorCompra,
  } = useResumoGrupo(grupo.id)

  const [showCompra, setShowCompra] = useState(false)
  const [formCompra, setFormCompra] = useState(formCompraVazio)
  const [savingCompra, setSavingCompra] = useState(false)
  const [erroCompra, setErroCompra] = useState<string | null>(null)
  const [compraExpandida, setCompraExpandida] = useState<string | null>(null)
  const [showAddLote, setShowAddLote] = useState(false)
  const [loteParaAdicionar, setLoteParaAdicionar] = useState('')
  const [dataInicioLote, setDataInicioLote] = useState(new Date().toISOString().slice(0, 10))

  const loteIdsNoGrupo = new Set(membros.filter(m => !m.data_fim).map(m => m.lote_id))
  const lotesDisponiveis = lotesAtivos.filter(l => !loteIdsNoGrupo.has(l.id))

  const handleRegistrarCompra = async (e: React.FormEvent) => {
    e.preventDefault()
    setErroCompra(null)
    const quantidade_kg = Number(formCompra.quantidade_kg)
    const valor_total = Number(formCompra.valor_total)
    if (!quantidade_kg || !valor_total || !formCompra.data_compra || !formCompra.data_inicio_uso) return
    setSavingCompra(true)
    const { error } = await registrarCompra({
      quantidade_kg, valor_total, data_compra: formCompra.data_compra, data_inicio_uso: formCompra.data_inicio_uso,
      parceiro_id: formCompra.parceiro_id || null, observacoes: formCompra.observacoes,
    })
    setSavingCompra(false)
    if (error) { setErroCompra(error); return }
    setShowCompra(false)
    setFormCompra(formCompraVazio)
  }

  const handleAdicionarLote = async () => {
    if (!loteParaAdicionar) return
    await adicionarLote(loteParaAdicionar, dataInicioLote)
    setShowAddLote(false)
    setLoteParaAdicionar('')
  }

  return (
    <Modal open onClose={onClose} title={grupo.nome} subtitle={grupo.dieta_nome ?? undefined} size="xl">
      {loading
        ? <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><div className="spinner" style={{ width: 24, height: 24 }} /></div>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* Saldo */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Saldo</div>
              {!saldo
                ? <div style={{ fontSize: 13, color: '#9e9e9e' }}>Dieta sem %MS de consumo configurado — não é possível calcular saldo.</div>
                : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                    <MetricaCard label="Comprado" valor={`${fmtNum(saldo.totalCompradoKg, 0)} kg`} />
                    <MetricaCard label="Consumido (teórico)" valor={`${fmtNum(saldo.totalConsumidoTeoricoKg, 0)} kg`} />
                    <MetricaCard label="Saldo" valor={`${fmtNum(saldo.saldoKg, 0)} kg`} alerta={saldo.saldoKg < 0} />
                    <MetricaCard label="Custo médio/kg vigente" valor={saldo.custoMedioKgVigente != null ? fmt(saldo.custoMedioKgVigente) : '—'} />
                  </div>
                )}
              {saldo && saldo.saldoKg < 0 && (
                <div style={{ marginTop: 8, fontSize: 12, color: '#b91c1c', background: '#fef2f2', padding: '8px 12px', borderRadius: 8 }}>
                  Saldo negativo — o consumo teórico já passou do que foi comprado. Verifique se falta lançar uma compra.
                </div>
              )}
            </div>

            {/* Membros */}
            <div>
              <div className="flex-between" style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Lotes no grupo</div>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowAddLote(true)}>+ Adicionar lote</button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Lote</th><th>Desde</th><th>Até</th><th>Ações</th></tr></thead>
                  <tbody>
                    {membros.map(m => (
                      <tr key={m.id}>
                        <td>{lotesInfo[m.lote_id]?.nome_lote ?? m.lote_id}</td>
                        <td>{fmtData(m.data_inicio)}</td>
                        <td>{m.data_fim ? fmtData(m.data_fim) : <span className="badge badge-green">Ativo</span>}</td>
                        <td>
                          {!m.data_fim && (
                            <button className="btn btn-ghost btn-sm" style={{ color: '#b91c1c' }}
                              onClick={() => encerrarParticipacao(m.id, new Date().toISOString().slice(0, 10))}>
                              Encerrar participação
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {membros.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9e9e9e' }}>Nenhum lote neste grupo ainda.</td></tr>}
                  </tbody>
                </table>
              </div>

              {showAddLote && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 10 }}>
                  <div className="form-group" style={{ flex: '1 1 160px' }}>
                    <label className="form-label">Lote</label>
                    <select className="form-input" value={loteParaAdicionar} onChange={e => setLoteParaAdicionar(e.target.value)}>
                      <option value="">Selecione</option>
                      {lotesDisponiveis.map(l => <option key={l.id} value={l.id}>{l.nome_lote}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: '1 1 140px' }}>
                    <label className="form-label">Desde</label>
                    <input type="date" className="form-input" value={dataInicioLote} onChange={e => setDataInicioLote(e.target.value)} />
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={handleAdicionarLote}>Adicionar</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowAddLote(false)}>Cancelar</button>
                </div>
              )}
            </div>

            {/* Compras */}
            <div>
              <div className="flex-between" style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Compras</div>
                <button className="btn btn-primary btn-sm" onClick={() => setShowCompra(true)}>+ Registrar compra</button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Data compra</th><th>Início de uso</th><th>Quantidade</th><th>Valor</th><th>R$/kg</th><th></th></tr></thead>
                  <tbody>
                    {compras.map(c => (
                      <Fragment key={c.id}>
                        <tr>
                          <td>{fmtData(c.data_compra)}</td>
                          <td>{fmtData(c.data_inicio_uso)}</td>
                          <td>{fmtNum(c.quantidade_kg, 0)} kg</td>
                          <td>{fmt(c.valor_total)}</td>
                          <td>{fmt(c.valor_total / c.quantidade_kg)}</td>
                          <td>
                            <button className="btn btn-ghost btn-sm" onClick={() => setCompraExpandida(compraExpandida === c.id ? null : c.id)}>
                              {compraExpandida === c.id ? 'Ocultar' : 'Ver estatística'}
                            </button>
                          </td>
                        </tr>
                        {compraExpandida === c.id && (
                          <tr>
                            <td colSpan={6} style={{ background: '#fafafa' }}>
                              <RankingCompra ranking={rankingPorCompra(c.id)} lotesInfo={lotesInfo} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                    {compras.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#9e9e9e' }}>Nenhuma compra lançada ainda.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" style={{ color: '#b91c1c' }} onClick={onExcluir}>Excluir grupo</button>
            </div>
          </div>
        )}

      <Modal open={showCompra} onClose={() => { setShowCompra(false); setErroCompra(null) }} title="Registrar compra">
        <form onSubmit={handleRegistrarCompra} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">Quantidade (kg)</label>
              <input type="number" step="0.01" className="form-input" value={formCompra.quantidade_kg}
                onChange={e => setFormCompra(f => ({ ...f, quantidade_kg: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">Valor total</label>
              <input type="number" step="0.01" className="form-input" value={formCompra.valor_total}
                onChange={e => setFormCompra(f => ({ ...f, valor_total: e.target.value }))} required />
            </div>
          </div>
          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">Data da compra</label>
              <input type="date" className="form-input" value={formCompra.data_compra}
                onChange={e => setFormCompra(f => ({ ...f, data_compra: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">Início de uso</label>
              <input type="date" className="form-input" value={formCompra.data_inicio_uso}
                onChange={e => setFormCompra(f => ({ ...f, data_inicio_uso: e.target.value }))} required />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Fornecedor</label>
            <select className="form-input" value={formCompra.parceiro_id} onChange={e => setFormCompra(f => ({ ...f, parceiro_id: e.target.value }))}>
              <option value="">Não informado</option>
              {fornecedores.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Observações</label>
            <input className="form-input" placeholder="Opcional" value={formCompra.observacoes}
              onChange={e => setFormCompra(f => ({ ...f, observacoes: e.target.value }))} />
          </div>
          {erroCompra && <div style={{ fontSize: 12, color: '#b91c1c' }}>{erroCompra}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => { setShowCompra(false); setErroCompra(null) }}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={savingCompra}>{savingCompra ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Registrar compra'}</button>
          </div>
        </form>
      </Modal>
    </Modal>
  )
}

function MetricaCard({ label, valor, alerta }: { label: string; valor: string; alerta?: boolean }) {
  return (
    <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ fontSize: 11, color: '#9e9e9e' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: alerta ? '#b91c1c' : '#000' }}>{valor}</div>
    </div>
  )
}

function RankingCompra({ ranking, lotesInfo }: {
  ranking: Array<{ lote_id: string; kgConsumido: number; pctDoTotal: number }>
  lotesInfo: Record<string, { nome_lote: string; codigo_lote: string }>
}) {
  if (ranking.length === 0) return <div style={{ padding: 12, fontSize: 13, color: '#9e9e9e' }}>Sem consumo registrado neste período ainda.</div>
  return (
    <div style={{ padding: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Consumo por lote nesta compra</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {ranking.map(r => (
          <div key={r.lote_id} className="flex-between" style={{ fontSize: 13 }}>
            <span>{lotesInfo[r.lote_id]?.nome_lote ?? r.lote_id}</span>
            <span>{fmtNum(r.kgConsumido, 0)} kg <span style={{ color: '#9e9e9e' }}>({fmtNum(r.pctDoTotal, 1)}%)</span></span>
          </div>
        ))}
      </div>
    </div>
  )
}
