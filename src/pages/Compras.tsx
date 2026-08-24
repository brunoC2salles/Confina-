import { useState, Fragment } from 'react'
import { useGruposConsumoRacao, useResumoGrupo, type GrupoConsumoComDieta } from '@/hooks/useGruposConsumoRacao'
import { useComprasMedicamento } from '@/hooks/useComprasMedicamento'
import { useComprasOutros } from '@/hooks/useComprasOutros'
import { Modal, PageHeader, EmptyState } from '@/components/common/UI'
import { fmt, fmtNum, fmtData } from '@/lib/calculations'

const formVazio = { nome: '', dieta_id: '', observacoes: '', loteIds: [] as string[] }
const formCompraVazio = { quantidade_kg: '', valor_total: '', data_compra: '', data_inicio_uso: '', parceiro_id: '', observacoes: '' }
const hojeStr = () => new Date().toISOString().slice(0, 10)

export default function Compras() {
  const { grupos, lotesAtivos, dietas, fornecedores, loading, criarGrupo, excluirGrupo } = useGruposConsumoRacao()
  const [aba, setAba] = useState<'racao' | 'medicamentos' | 'outros'>('racao')
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
        subtitle="Rações, medicamentos e outras compras rateadas entre os animais"
        action={aba === 'racao' ? <button className="btn btn-primary" onClick={() => setShowNovo(true)}>+ Novo grupo</button> : undefined}
      />

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {(['racao', 'medicamentos', 'outros'] as const).map(a => (
          <button key={a} type="button" onClick={() => setAba(a)}
            style={{ padding: '8px 16px', borderRadius: 6, fontSize: 13, border: '1px solid var(--border)', cursor: 'pointer',
              background: aba === a ? '#2e7d32' : '#fff', color: aba === a ? '#fff' : 'var(--gray-600)' }}>
            {a === 'racao' ? 'Ração' : a === 'medicamentos' ? 'Medicamentos' : 'Outros'}
          </button>
        ))}
      </div>

      {aba === 'racao' && (
      <>
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
      </>
      )}

      {aba === 'medicamentos' && <AbaMedicamentos />}

      {aba === 'outros' && <AbaOutros />}
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
    membros, compras, lotesInfo, saldo, loading, mostrarAlertaSaldo, custoConfirmadoKg,
    registrarCompra, editarCompra, confirmarSaldoAtual, limparConfirmacaoSaldo, adicionarLote, encerrarParticipacao, rankingPorCompra,
  } = useResumoGrupo(grupo.id)

  const [showCompra, setShowCompra] = useState(false)
  const [formCompra, setFormCompra] = useState(formCompraVazio)
  const [savingCompra, setSavingCompra] = useState(false)
  const [erroCompra, setErroCompra] = useState<string | null>(null)
  const [compraExpandida, setCompraExpandida] = useState<string | null>(null)
  const [showAddLote, setShowAddLote] = useState(false)
  const [loteParaAdicionar, setLoteParaAdicionar] = useState('')
  const [dataInicioLote, setDataInicioLote] = useState(new Date().toISOString().slice(0, 10))
  const [compraEditando, setCompraEditando] = useState<string | null>(null)
  const [formEdicao, setFormEdicao] = useState({ quantidade_kg: '', valor_total: '' })
  const [savingEdicao, setSavingEdicao] = useState(false)
  const [erroEdicao, setErroEdicao] = useState<string | null>(null)
  const [confirmandoSaldo, setConfirmandoSaldo] = useState(false)

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

  const abrirEdicao = (compraId: string, quantidade_kg: number, valor_total: number) => {
    setCompraEditando(compraId)
    setFormEdicao({ quantidade_kg: String(quantidade_kg), valor_total: String(valor_total) })
    setErroEdicao(null)
  }

  const handleSalvarEdicao = async (compraId: string) => {
    setErroEdicao(null)
    const quantidade_kg = Number(formEdicao.quantidade_kg)
    const valor_total = Number(formEdicao.valor_total)
    if (!quantidade_kg || !valor_total) return
    setSavingEdicao(true)
    const { error } = await editarCompra(compraId, { quantidade_kg, valor_total })
    setSavingEdicao(false)
    if (error) { setErroEdicao(error); return }
    setCompraEditando(null)
  }

  const handleConfirmarSaldoAtual = async () => {
    setConfirmandoSaldo(true)
    await confirmarSaldoAtual()
    setConfirmandoSaldo(false)
  }

  const handleLimparConfirmacao = async () => {
    setConfirmandoSaldo(true)
    await limparConfirmacaoSaldo()
    setConfirmandoSaldo(false)
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
                    <MetricaCard label="Saldo" valor={`${fmtNum(saldo.saldoKg, 0)} kg`} alerta={mostrarAlertaSaldo}
                      alertaTitulo="Saldo negativo — o consumo teórico já passou do que foi comprado. Lance uma nova compra, edite uma existente, ou use “Confirmar saldo atual” se esse já for o valor final." />
                    <MetricaCard label="Custo médio/kg vigente" valor={saldo.custoMedioKgVigente != null ? fmt(saldo.custoMedioKgVigente) : '—'} />
                  </div>
                )}
              {saldo && Math.round(saldo.saldoKg) !== 0 && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                  {custoConfirmadoKg == null ? (
                    <button className="btn btn-ghost btn-sm" onClick={handleConfirmarSaldoAtual} disabled={confirmandoSaldo}>
                      {confirmandoSaldo ? 'Confirmando...' : 'Confirmar saldo atual'}
                    </button>
                  ) : (
                    <>
                      <span style={{ fontSize: 12, color: '#9e9e9e' }}>
                        Custo médio confirmado manualmente — quantidade e valor das compras não foram alterados.
                      </span>
                      <button className="btn btn-ghost btn-sm" onClick={handleLimparConfirmacao} disabled={confirmandoSaldo}>
                        Recalcular pelo teórico
                      </button>
                    </>
                  )}
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
                        {compraEditando === c.id ? (
                          <tr>
                            <td>{fmtData(c.data_compra)}</td>
                            <td>{fmtData(c.data_inicio_uso)}</td>
                            <td>
                              <input type="number" step="0.01" className="form-input" style={{ width: 110 }}
                                value={formEdicao.quantidade_kg} onChange={e => setFormEdicao(f => ({ ...f, quantidade_kg: e.target.value }))} />
                            </td>
                            <td>
                              <input type="number" step="0.01" className="form-input" style={{ width: 110 }}
                                value={formEdicao.valor_total} onChange={e => setFormEdicao(f => ({ ...f, valor_total: e.target.value }))} />
                            </td>
                            <td>
                              {Number(formEdicao.quantidade_kg) > 0
                                ? fmt(Number(formEdicao.valor_total) / Number(formEdicao.quantidade_kg))
                                : '—'}
                            </td>
                            <td style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-primary btn-sm" onClick={() => handleSalvarEdicao(c.id)} disabled={savingEdicao}>
                                {savingEdicao ? '...' : 'Salvar'}
                              </button>
                              <button className="btn btn-ghost btn-sm" onClick={() => setCompraEditando(null)}>Cancelar</button>
                            </td>
                          </tr>
                        ) : (
                          <tr>
                            <td>{fmtData(c.data_compra)}</td>
                            <td>{fmtData(c.data_inicio_uso)}</td>
                            <td>{fmtNum(c.quantidade_kg, 0)} kg</td>
                            <td>{fmt(c.valor_total)}</td>
                            <td>{fmt(c.valor_total / c.quantidade_kg)}</td>
                            <td style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-ghost btn-sm" onClick={() => abrirEdicao(c.id, c.quantidade_kg, c.valor_total)}>
                                Editar
                              </button>
                              <button className="btn btn-ghost btn-sm" onClick={() => setCompraExpandida(compraExpandida === c.id ? null : c.id)}>
                                {compraExpandida === c.id ? 'Ocultar' : 'Ver estatística'}
                              </button>
                            </td>
                          </tr>
                        )}
                        {compraEditando === c.id && erroEdicao && (
                          <tr>
                            <td colSpan={6} style={{ fontSize: 12, color: '#b91c1c', paddingTop: 0 }}>{erroEdicao}</td>
                          </tr>
                        )}
                        {compraExpandida === c.id && compraEditando !== c.id && (
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

function MetricaCard({ label, valor, alerta, alertaTitulo }: { label: string; valor: string; alerta?: boolean; alertaTitulo?: string }) {
  return (
    <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ fontSize: 11, color: '#9e9e9e' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600 }}>
        {valor}
        {alerta && <span title={alertaTitulo} style={{ color: '#b91c1c', marginLeft: 3, cursor: 'default' }}>*</span>}
      </div>
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

// ═══════════════════════════════════════════════════════════════════════════
// MEDICAMENTOS — compra única rateada por cabeça entre os animais ativos de
// um ciclo (cruza qualquer lote). Ver useComprasMedicamento.ts.
// ═══════════════════════════════════════════════════════════════════════════

const formMedicamentoVazio = {
  descricao: '', ciclo_alvo: '', data_compra: hojeStr(), data_aplicacao: hojeStr(),
  valor_total: '', parceiro_id: '', observacoes: '',
}

function AbaMedicamentos() {
  const { compras, fornecedores, loading, distribuicaoPorCiclo, registrarCompra, excluirCompra, buscarDistribuicaoPorLote } = useComprasMedicamento()
  const [showNovo, setShowNovo] = useState(false)
  const [form, setForm] = useState(formMedicamentoVazio)
  const [ciclos, setCiclos] = useState<Record<number, number>>({})
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ quantidade: number; valorPorAnimal: number } | null>(null)
  const [compraExpandida, setCompraExpandida] = useState<string | null>(null)
  const [distribuicaoLote, setDistribuicaoLote] = useState<Record<string, Array<{ lote_id: string; nome_lote: string; codigo_lote: string; quantidade: number }>>>({})

  const abrirNovo = async () => {
    setForm(formMedicamentoVazio)
    setErro(null)
    setResultado(null)
    setShowNovo(true)
    setCiclos(await distribuicaoPorCiclo())
  }

  const fecharNovo = () => { setShowNovo(false); setForm(formMedicamentoVazio); setResultado(null) }

  const quantidadePrevista = form.ciclo_alvo ? (ciclos[Number(form.ciclo_alvo)] ?? 0) : 0
  const valorPorAnimalPrevisto = quantidadePrevista > 0 && Number(form.valor_total) > 0
    ? Number(form.valor_total) / quantidadePrevista : 0

  const handleRegistrar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    if (!form.descricao || !form.ciclo_alvo || !form.valor_total || !form.data_compra || !form.data_aplicacao) return
    setSaving(true)
    const res = await registrarCompra({
      descricao: form.descricao, ciclo_alvo: Number(form.ciclo_alvo),
      data_compra: form.data_compra, data_aplicacao: form.data_aplicacao,
      valor_total: Number(form.valor_total), parceiro_id: form.parceiro_id || undefined,
      observacoes: form.observacoes || undefined,
    })
    setSaving(false)
    if (res.error) { setErro(res.error); return }
    setResultado({ quantidade: res.quantidade ?? 0, valorPorAnimal: res.valorPorAnimal ?? 0 })
  }

  const toggleExpandir = async (compraId: string) => {
    if (compraExpandida === compraId) { setCompraExpandida(null); return }
    setCompraExpandida(compraId)
    if (!distribuicaoLote[compraId]) {
      const dist = await buscarDistribuicaoPorLote(compraId)
      setDistribuicaoLote(d => ({ ...d, [compraId]: dist }))
    }
  }

  const handleExcluir = async (compraId: string) => {
    if (!confirm('Excluir esta compra? Os lançamentos de custo gerados por ela em cada animal também serão removidos.')) return
    await excluirCompra(compraId)
  }

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: '#9e9e9e' }}>
          Compra única rateada em partes iguais entre os animais ativos de um ciclo — cruza qualquer lote.
        </div>
        <button className="btn btn-primary" onClick={abrirNovo}>+ Nova compra</button>
      </div>

      {loading
        ? <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" style={{ width: 28, height: 28 }} /></div>
        : compras.length === 0
          ? <div className="card"><EmptyState icon="" title="Nenhuma compra de medicamento" desc="Registre uma compra aplicada a todos os animais de um ciclo — o valor é dividido igualmente entre eles."
              action={<button className="btn btn-primary" onClick={abrirNovo}>Nova compra</button>} /></div>
          : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Descrição</th><th>Ciclo</th><th>Data aplicação</th>
                    <th>Animais</th><th>Valor total</th><th>Valor/animal</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {compras.map(c => (
                    <Fragment key={c.id}>
                      <tr>
                        <td><strong>{c.descricao}</strong></td>
                        <td>{c.ciclo_alvo}</td>
                        <td>{fmtData(c.data_aplicacao)}</td>
                        <td>{c.quantidade_animais}</td>
                        <td>{fmt(c.valor_total)}</td>
                        <td>{fmt(c.valor_por_animal)}</td>
                        <td style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => toggleExpandir(c.id)}>
                            {compraExpandida === c.id ? 'Ocultar' : 'Ver lotes'}
                          </button>
                          <button className="btn btn-ghost btn-sm" style={{ color: '#b91c1c' }} onClick={() => handleExcluir(c.id)}>Excluir</button>
                        </td>
                      </tr>
                      {compraExpandida === c.id && (
                        <tr>
                          <td colSpan={7} style={{ background: '#fafafa' }}>
                            <div style={{ padding: 12 }}>
                              {c.observacoes && <div style={{ fontSize: 12, color: '#9e9e9e', marginBottom: 8 }}>{c.observacoes}</div>}
                              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Animais atingidos por lote</div>
                              {!distribuicaoLote[c.id]
                                ? <div style={{ fontSize: 13, color: '#9e9e9e' }}>Carregando...</div>
                                : distribuicaoLote[c.id].length === 0
                                  ? <div style={{ fontSize: 13, color: '#9e9e9e' }}>Nenhum animal encontrado (podem ter sido movidos ou vendidos depois).</div>
                                  : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                      {distribuicaoLote[c.id].map(l => (
                                        <div key={l.lote_id} className="flex-between" style={{ fontSize: 13 }}>
                                          <span>{l.nome_lote} <span style={{ color: '#bdbdbd' }}>({l.codigo_lote})</span></span>
                                          <span>{l.quantidade} animais</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )
      }

      <Modal open={showNovo} onClose={fecharNovo} title="Nova compra de medicamento" size="lg">
        {resultado ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: 14, background: 'var(--green-bg)', borderRadius: 8 }}>
              <div style={{ fontSize: 13, color: 'var(--green)' }}>Compra registrada</div>
              <div style={{ fontSize: 15, marginTop: 4 }}>
                {resultado.quantidade} animais · {fmt(resultado.valorPorAnimal)} por animal
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={fecharNovo}>Fechar</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleRegistrar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group">
              <label className="form-label">Descrição</label>
              <input className="form-input" placeholder="Ex: Vacinação — Vermífugo" value={form.descricao}
                onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} required />
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label">Ciclo alvo (todos os lotes)</label>
                <select className="form-input" value={form.ciclo_alvo} onChange={e => setForm(f => ({ ...f, ciclo_alvo: e.target.value }))} required>
                  <option value="">Selecione</option>
                  {Object.keys(ciclos).sort((a, b) => Number(a) - Number(b)).map(n => (
                    <option key={n} value={n}>Ciclo {n} — {ciclos[Number(n)]} animais</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Valor total (R$)</label>
                <input className="form-input" type="number" step="0.01" value={form.valor_total}
                  onChange={e => setForm(f => ({ ...f, valor_total: e.target.value }))} required />
              </div>
            </div>

            {quantidadePrevista > 0 && Number(form.valor_total) > 0 && (
              <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                {quantidadePrevista} animais elegíveis agora → {fmt(valorPorAnimalPrevisto)} por animal.
                A quantidade final é recalculada na confirmação.
              </div>
            )}

            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label">Data da compra</label>
                <input className="form-input" type="date" value={form.data_compra}
                  onChange={e => setForm(f => ({ ...f, data_compra: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Data de aplicação</label>
                <input className="form-input" type="date" value={form.data_aplicacao}
                  onChange={e => setForm(f => ({ ...f, data_aplicacao: e.target.value }))} required />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Fornecedor</label>
              <select className="form-input" value={form.parceiro_id} onChange={e => setForm(f => ({ ...f, parceiro_id: e.target.value }))}>
                <option value="">Não informado</option>
                {fornecedores.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Observações</label>
              <input className="form-input" placeholder="Opcional" value={form.observacoes}
                onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
            </div>

            {erro && <div style={{ fontSize: 12, color: '#b91c1c' }}>{erro}</div>}

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={fecharNovo}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Registrar compra'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// OUTROS — mesma lógica de MEDICAMENTOS: compra única rateada por cabeça
// entre os animais ativos de um ciclo (cruza qualquer lote), para lançamentos
// que não são ração nem medicamento. Ver useComprasOutros.ts.
// ═══════════════════════════════════════════════════════════════════════════

const formOutrosVazio = {
  descricao: '', ciclo_alvo: '', data_compra: hojeStr(), data_aplicacao: hojeStr(),
  valor_total: '', parceiro_id: '', observacoes: '',
}

function AbaOutros() {
  const { compras, fornecedores, loading, distribuicaoPorCiclo, registrarCompra, excluirCompra, buscarDistribuicaoPorLote } = useComprasOutros()
  const [showNovo, setShowNovo] = useState(false)
  const [form, setForm] = useState(formOutrosVazio)
  const [ciclos, setCiclos] = useState<Record<number, number>>({})
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ quantidade: number; valorPorAnimal: number } | null>(null)
  const [compraExpandida, setCompraExpandida] = useState<string | null>(null)
  const [distribuicaoLote, setDistribuicaoLote] = useState<Record<string, Array<{ lote_id: string; nome_lote: string; codigo_lote: string; quantidade: number }>>>({})

  const abrirNovo = async () => {
    setForm(formOutrosVazio)
    setErro(null)
    setResultado(null)
    setShowNovo(true)
    setCiclos(await distribuicaoPorCiclo())
  }

  const fecharNovo = () => { setShowNovo(false); setForm(formOutrosVazio); setResultado(null) }

  const quantidadePrevista = form.ciclo_alvo ? (ciclos[Number(form.ciclo_alvo)] ?? 0) : 0
  const valorPorAnimalPrevisto = quantidadePrevista > 0 && Number(form.valor_total) > 0
    ? Number(form.valor_total) / quantidadePrevista : 0

  const handleRegistrar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    if (!form.descricao || !form.ciclo_alvo || !form.valor_total || !form.data_compra || !form.data_aplicacao) return
    setSaving(true)
    const res = await registrarCompra({
      descricao: form.descricao, ciclo_alvo: Number(form.ciclo_alvo),
      data_compra: form.data_compra, data_aplicacao: form.data_aplicacao,
      valor_total: Number(form.valor_total), parceiro_id: form.parceiro_id || undefined,
      observacoes: form.observacoes || undefined,
    })
    setSaving(false)
    if (res.error) { setErro(res.error); return }
    setResultado({ quantidade: res.quantidade ?? 0, valorPorAnimal: res.valorPorAnimal ?? 0 })
  }

  const toggleExpandir = async (compraId: string) => {
    if (compraExpandida === compraId) { setCompraExpandida(null); return }
    setCompraExpandida(compraId)
    if (!distribuicaoLote[compraId]) {
      const dist = await buscarDistribuicaoPorLote(compraId)
      setDistribuicaoLote(d => ({ ...d, [compraId]: dist }))
    }
  }

  const handleExcluir = async (compraId: string) => {
    if (!confirm('Excluir esta compra? Os lançamentos de custo gerados por ela em cada animal também serão removidos.')) return
    await excluirCompra(compraId)
  }

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: '#9e9e9e' }}>
          Compra única rateada em partes iguais entre os animais ativos de um ciclo — cruza qualquer lote.
          Use para lançamentos que não são ração nem medicamento (descreva o que é na descrição).
        </div>
        <button className="btn btn-primary" onClick={abrirNovo}>+ Nova compra</button>
      </div>

      {loading
        ? <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" style={{ width: 28, height: 28 }} /></div>
        : compras.length === 0
          ? <div className="card"><EmptyState icon="" title="Nenhuma compra em Outros" desc="Registre uma compra aplicada a todos os animais de um ciclo — o valor é dividido igualmente entre eles."
              action={<button className="btn btn-primary" onClick={abrirNovo}>Nova compra</button>} /></div>
          : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Descrição</th><th>Ciclo</th><th>Data aplicação</th>
                    <th>Animais</th><th>Valor total</th><th>Valor/animal</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {compras.map(c => (
                    <Fragment key={c.id}>
                      <tr>
                        <td><strong>{c.descricao}</strong></td>
                        <td>{c.ciclo_alvo}</td>
                        <td>{fmtData(c.data_aplicacao)}</td>
                        <td>{c.quantidade_animais}</td>
                        <td>{fmt(c.valor_total)}</td>
                        <td>{fmt(c.valor_por_animal)}</td>
                        <td style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => toggleExpandir(c.id)}>
                            {compraExpandida === c.id ? 'Ocultar' : 'Ver lotes'}
                          </button>
                          <button className="btn btn-ghost btn-sm" style={{ color: '#b91c1c' }} onClick={() => handleExcluir(c.id)}>Excluir</button>
                        </td>
                      </tr>
                      {compraExpandida === c.id && (
                        <tr>
                          <td colSpan={7} style={{ background: '#fafafa' }}>
                            <div style={{ padding: 12 }}>
                              {c.observacoes && <div style={{ fontSize: 12, color: '#9e9e9e', marginBottom: 8 }}>{c.observacoes}</div>}
                              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Animais atingidos por lote</div>
                              {!distribuicaoLote[c.id]
                                ? <div style={{ fontSize: 13, color: '#9e9e9e' }}>Carregando...</div>
                                : distribuicaoLote[c.id].length === 0
                                  ? <div style={{ fontSize: 13, color: '#9e9e9e' }}>Nenhum animal encontrado (podem ter sido movidos ou vendidos depois).</div>
                                  : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                      {distribuicaoLote[c.id].map(l => (
                                        <div key={l.lote_id} className="flex-between" style={{ fontSize: 13 }}>
                                          <span>{l.nome_lote} <span style={{ color: '#bdbdbd' }}>({l.codigo_lote})</span></span>
                                          <span>{l.quantidade} animais</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )
      }

      <Modal open={showNovo} onClose={fecharNovo} title="Nova compra — Outros" size="lg">
        {resultado ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: 14, background: 'var(--green-bg)', borderRadius: 8 }}>
              <div style={{ fontSize: 13, color: 'var(--green)' }}>Compra registrada</div>
              <div style={{ fontSize: 15, marginTop: 4 }}>
                {resultado.quantidade} animais · {fmt(resultado.valorPorAnimal)} por animal
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={fecharNovo}>Fechar</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleRegistrar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group">
              <label className="form-label">Descrição</label>
              <input className="form-input" placeholder="Ex: Sal mineral extra — lote 3" value={form.descricao}
                onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} required />
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label">Ciclo alvo (todos os lotes)</label>
                <select className="form-input" value={form.ciclo_alvo} onChange={e => setForm(f => ({ ...f, ciclo_alvo: e.target.value }))} required>
                  <option value="">Selecione</option>
                  {Object.keys(ciclos).sort((a, b) => Number(a) - Number(b)).map(n => (
                    <option key={n} value={n}>Ciclo {n} — {ciclos[Number(n)]} animais</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Valor total (R$)</label>
                <input className="form-input" type="number" step="0.01" value={form.valor_total}
                  onChange={e => setForm(f => ({ ...f, valor_total: e.target.value }))} required />
              </div>
            </div>

            {quantidadePrevista > 0 && Number(form.valor_total) > 0 && (
              <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                {quantidadePrevista} animais elegíveis agora → {fmt(valorPorAnimalPrevisto)} por animal.
                A quantidade final é recalculada na confirmação.
              </div>
            )}

            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label">Data da compra</label>
                <input className="form-input" type="date" value={form.data_compra}
                  onChange={e => setForm(f => ({ ...f, data_compra: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Data de aplicação</label>
                <input className="form-input" type="date" value={form.data_aplicacao}
                  onChange={e => setForm(f => ({ ...f, data_aplicacao: e.target.value }))} required />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Fornecedor</label>
              <select className="form-input" value={form.parceiro_id} onChange={e => setForm(f => ({ ...f, parceiro_id: e.target.value }))}>
                <option value="">Não informado</option>
                {fornecedores.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Observações</label>
              <input className="form-input" placeholder="Opcional" value={form.observacoes}
                onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
            </div>

            {erro && <div style={{ fontSize: 12, color: '#b91c1c' }}>{erro}</div>}

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={fecharNovo}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Registrar compra'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
