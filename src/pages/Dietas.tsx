import { useState, useMemo, useCallback } from 'react'
import { useDietas } from '@/hooks/useDietas'
import { Modal, PageHeader, EmptyState } from '@/components/common/UI'
import { fmt, fmtNum } from '@/lib/calculations'
import type { ComponenteDieta, DietaBase } from '@/hooks/useDietas'

const cicloLabel = (n: number) =>
  ({ 1: 'Adaptação', 2: 'Crescimento', 3: 'Engorda', 4: 'Acabamento' }[n] ?? `Ciclo ${n}`)

const categoriaLabel: Record<string, string> = {
  volumoso: 'Volumoso',
  concentrado_energetico: 'Conc. Energético',
  concentrado_proteico: 'Conc. Proteico',
  mineral_aditivo: 'Mineral / Aditivo',
  subproduto: 'Subproduto',
}

const unidadeLabel = (u: string) => u === 'pct_pc' ? '% PC' : 'kg/animal/dia'

const emptyForm = () => ({
  nome: '', gmd_esperado: '', ciclo_recomendado: '' as any,
  descricao: '', baseada_em: '', componentes: [] as ComponenteDieta[],
})

export default function Dietas() {
  const { dietas, dietasBase, insumos, loading, criarDieta, atualizarDieta, excluirDieta, calcularCustoDia } = useDietas()
  const [showNova, setShowNova] = useState(false)
  const [showEditar, setShowEditar] = useState<string | null>(null)
  const [showDetalhe, setShowDetalhe] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [tab, setTab] = useState<'minhas' | 'base'>('minhas')
  // Simulação fora do form para não re-renderizar inputs
  const [simPeso, setSimPeso] = useState('450')
  const [simQtd, setSimQtd] = useState('80')

  const [form, setForm] = useState(emptyForm())
  const dietaDetalhe = dietas.find(d => d.id === showDetalhe)

  const categorias = useMemo(() => [...new Set(insumos.map(i => i.categoria))], [insumos])

  const insumoPorId = useMemo(() => {
    const m: Record<string, typeof insumos[0]> = {}
    insumos.forEach(i => { m[i.id] = i })
    return m
  }, [insumos])

  const addComponente = useCallback((insumo_id: string) => {
    const insumo = insumos.find(i => i.id === insumo_id)
    if (!insumo) return
    setForm(f => ({
      ...f,
      componentes: [...f.componentes, {
        insumo_id, quantidade: 5,
        unidade: insumo.unidade_padrao as any,
        preco_kg: insumo.preco_referencia ?? 0,
      }],
    }))
  }, [insumos])

  const removeComponente = useCallback((idx: number) =>
    setForm(f => ({ ...f, componentes: f.componentes.filter((_, i) => i !== idx) })), [])

  const updateComponente = useCallback((idx: number, field: string, value: any) =>
    setForm(f => ({ ...f, componentes: f.componentes.map((c, i) => i === idx ? { ...c, [field]: value } : c) })), [])

  const carregarTemplate = useCallback((db: DietaBase) => {
    const ingredientes = db.ingredientes ?? []
    setForm(f => ({
      ...f,
      baseada_em: db.id,
      nome: f.nome || `${db.nome} (cópia)`,
      gmd_esperado: db.gmd_esperado ? String(db.gmd_esperado) : f.gmd_esperado,
      ciclo_recomendado: db.ciclo_recomendado ?? f.ciclo_recomendado,
      descricao: f.descricao || db.descricao || '',
      componentes: ingredientes.map(i => ({
        insumo_id: i.insumo_id, quantidade: i.quantidade,
        unidade: i.unidade as any, preco_kg: i.insumo?.preco_referencia ?? 0,
      })),
    }))
  }, [])

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setErro(null)
    const payload = {
      nome: form.nome, gmd_esperado: Number(form.gmd_esperado),
      ciclo_recomendado: form.ciclo_recomendado ? Number(form.ciclo_recomendado) : undefined,
      descricao: form.descricao || undefined,
      baseada_em: form.baseada_em || undefined,
      componentes: form.componentes,
    }
    const result = showEditar
      ? await atualizarDieta(showEditar, payload)
      : await criarDieta(payload)
    setSaving(false)
    if (result?.error) { setErro(result.error); return }
    setShowNova(false); setShowEditar(null); setForm(emptyForm())
  }

  // Custo simulado — calculado separado para não afetar inputs
  const custoDiaForm = useMemo(() =>
    calcularCustoDia(form.componentes, Number(simPeso), Number(simQtd)),
    [form.componentes, simPeso, simQtd, calcularCustoDia]
  )

  const custoDiaDetalhe = useMemo(() =>
    dietaDetalhe?.componentes
      ? calcularCustoDia(dietaDetalhe.componentes, Number(simPeso), Number(simQtd))
      : 0,
    [dietaDetalhe, simPeso, simQtd, calcularCustoDia]
  )

  const fecharModal = () => { setShowNova(false); setShowEditar(null); setForm(emptyForm()); setErro(null) }

  return (
    <div className="page">
      <PageHeader title="Dietas"
        subtitle={`${dietas.length} dieta${dietas.length !== 1 ? 's' : ''} cadastrada${dietas.length !== 1 ? 's' : ''}`}
        action={<button className="btn btn-primary" onClick={() => { setForm(emptyForm()); setShowNova(true) }}>+ Nova dieta</button>} />

      <div className="tabs">
        <button className={`tab-btn${tab === 'minhas' ? ' active' : ''}`} onClick={() => setTab('minhas')}>Minhas dietas ({dietas.length})</button>
        <button className={`tab-btn${tab === 'base' ? ' active' : ''}`} onClick={() => setTab('base')}>Templates base ({dietasBase.length})</button>
      </div>

      {tab === 'minhas' && (
        loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" style={{ width: 28, height: 28 }} /></div>
        ) : dietas.length === 0 ? (
          <div className="card">
            <EmptyState icon="◧" title="Nenhuma dieta cadastrada"
              desc="Crie uma dieta do zero ou use um template base como ponto de partida."
              action={<button className="btn btn-primary" onClick={() => { setForm(emptyForm()); setShowNova(true) }}>Criar dieta</button>} />
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 12 }}>
            {dietas.map(d => (
              <div key={d.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="flex-between">
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{d.nome}</div>
                    <div style={{ fontSize: 11, color: '#9e9e9e', marginTop: 2 }}>
                      {d.ciclo_recomendado ? cicloLabel(d.ciclo_recomendado) : 'Todos os ciclos'}
                      {d.gmd_esperado ? ` · GMD est. ${d.gmd_esperado} kg/dia` : ''}
                    </div>
                  </div>
                  {d.baseada_em && <span style={{ fontSize: 10, background: '#e8f5e9', color: '#2e7d32', padding: '2px 8px', borderRadius: 20, border: '1px solid #a5d6a7' }}>Template</span>}
                </div>
                {(d.componentes?.length ?? 0) > 0 && (
                  <div style={{ fontSize: 12, color: '#9e9e9e' }}>{d.componentes!.length} ingrediente{d.componentes!.length !== 1 ? 's' : ''}</div>
                )}
                {d.descricao && <div style={{ fontSize: 12, color: '#737370', lineHeight: 1.5 }}>{d.descricao}</div>}
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setShowDetalhe(d.id)}>Ver detalhes</button>
                  <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => {
                    setForm({ nome: d.nome, gmd_esperado: String(d.gmd_esperado), ciclo_recomendado: d.ciclo_recomendado ?? '', descricao: d.descricao ?? '', baseada_em: d.baseada_em ?? '', componentes: d.componentes ?? [] })
                    setShowEditar(d.id)
                  }}>Editar</button>
                  <button className="btn btn-ghost btn-sm" style={{ color: '#b91c1c' }} onClick={() => { if (window.confirm(`Excluir "${d.nome}"?`)) excluirDieta(d.id) }}>Excluir</button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'base' && (
        dietasBase.length === 0 ? (
          <div className="card"><EmptyState icon="◧" title="Nenhum template disponível" desc="O administrador ainda não criou templates base." /></div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 12 }}>
            {dietasBase.map(db => (
              <div key={db.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{db.nome}</div>
                  <div style={{ fontSize: 11, color: '#9e9e9e', marginTop: 2 }}>
                    {db.ciclo_recomendado ? cicloLabel(db.ciclo_recomendado) : 'Todos os ciclos'}
                    {db.gmd_esperado ? ` · GMD est. ${db.gmd_esperado} kg/dia` : ''}
                  </div>
                </div>
                {db.descricao && <div style={{ fontSize: 12, color: '#737370' }}>{db.descricao}</div>}
                {(db.ingredientes?.length ?? 0) > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    {db.ingredientes!.slice(0, 4).map((ing, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0', borderBottom: '1px solid #f5f5f5' }}>
                        <span>{ing.insumo?.nome ?? '—'}</span>
                        <span style={{ color: '#9e9e9e' }}>{ing.quantidade} {unidadeLabel(ing.unidade)}</span>
                      </div>
                    ))}
                    {db.ingredientes!.length > 4 && <div style={{ fontSize: 11, color: '#9e9e9e' }}>+ {db.ingredientes!.length - 4} ingredientes</div>}
                  </div>
                )}
                <button className="btn btn-primary btn-sm" style={{ justifyContent: 'center' }} onClick={() => { setForm(emptyForm()); carregarTemplate(db); setShowNova(true) }}>
                  Usar como base
                </button>
              </div>
            ))}
          </div>
        )
      )}

      {/* ── MODAL CRIAR/EDITAR ── */}
      <Modal open={showNova || !!showEditar} onClose={fecharModal}
        title={showEditar ? 'Editar dieta' : 'Nova dieta'} size="lg">
        <form onSubmit={handleSalvar} style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '75vh', overflowY: 'auto', paddingRight: 4 }}>

          {!showEditar && form.componentes.length === 0 && dietasBase.length > 0 && (
            <div style={{ padding: '12px 14px', background: 'var(--green-bg)', borderRadius: 8, fontSize: 13 }}>
              <div style={{ fontWeight: 500, color: '#1b5e20', marginBottom: 8 }}>Partir de um template base</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {dietasBase.map(db => (
                  <button key={db.id} type="button"
                    style={{ fontSize: 12, padding: '4px 10px', background: '#fff', border: '1px solid #a5d6a7', borderRadius: 6, cursor: 'pointer', color: '#2e7d32' }}
                    onClick={() => carregarTemplate(db)}>
                    {db.nome}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">Nome da dieta</label>
              <input className="form-input" placeholder="Ex: Dieta Engorda Ciclo 3" value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">GMD esperado (kg/dia)</label>
              <input className="form-input" type="number" placeholder="1.4" step="0.01" value={form.gmd_esperado}
                onChange={e => setForm(f => ({ ...f, gmd_esperado: e.target.value }))} required />
            </div>
          </div>
          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">Ciclo recomendado</label>
              <select className="form-input" value={form.ciclo_recomendado} onChange={e => setForm(f => ({ ...f, ciclo_recomendado: e.target.value }))}>
                <option value="">Todos os ciclos</option>
                {[1, 2, 3, 4].map(n => <option key={n} value={n}>Ciclo {n} — {cicloLabel(n)}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Descrição</label>
              <input className="form-input" placeholder="Opcional" value={form.descricao}
                onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} />
            </div>
          </div>

          <div style={{ fontWeight: 500, fontSize: 13, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
            Ingredientes ({form.componentes.length})
          </div>

          {form.componentes.length === 0 ? (
            <div style={{ padding: '12px 14px', background: 'var(--gray-50)', borderRadius: 8, fontSize: 13, color: 'var(--gray-500)', textAlign: 'center' }}>
              Selecione ingredientes abaixo
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {form.componentes.map((c, i) => {
                const ins = c.insumo_id ? insumoPorId[c.insumo_id] : null
                return (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 130px 90px 28px', gap: 6, alignItems: 'center' }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>
                      {ins?.nome ?? c.nome_ingrediente ?? '—'}
                      <span style={{ fontSize: 11, color: 'var(--gray-400)', marginLeft: 6 }}>{ins ? categoriaLabel[ins.categoria] : ''}</span>
                    </div>
                    <input className="form-input" type="number" step="0.01" placeholder="Qtd"
                      value={c.quantidade}
                      onChange={e => updateComponente(i, 'quantidade', Number(e.target.value))}
                      style={{ fontSize: 13 }} />
                    <select className="form-input" value={c.unidade}
                      onChange={e => updateComponente(i, 'unidade', e.target.value)}
                      style={{ fontSize: 12 }}>
                      <option value="kg_animal_dia">kg/animal/dia</option>
                      <option value="pct_pc">% PC</option>
                    </select>
                    <div style={{ position: 'relative' }}>
                      <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#9e9e9e' }}>R$</span>
                      <input className="form-input" type="number" step="0.0001"
                        value={c.preco_kg}
                        onChange={e => updateComponente(i, 'preco_kg', Number(e.target.value))}
                        style={{ paddingLeft: 26, fontSize: 13 }} />
                    </div>
                    <button type="button" onClick={() => removeComponente(i)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9e9e9e', fontSize: 18 }}>×</button>
                  </div>
                )
              })}
            </div>
          )}

          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ fontSize: 12, color: 'var(--gray-500)', marginBottom: 8 }}>Adicionar ingrediente:</div>
            {categorias.map(cat => (
              <div key={cat} style={{ marginBottom: 10 }}>
                <div style={{ fontSize: 11, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 4 }}>{categoriaLabel[cat]}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {insumos.filter(i => i.categoria === cat && !form.componentes.find(c => c.insumo_id === i.id)).map(ins => (
                    <button key={ins.id} type="button"
                      style={{ fontSize: 11, padding: '3px 8px', background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', color: 'var(--gray-600)' }}
                      onClick={() => addComponente(ins.id)}>
                      + {ins.nome}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Simulação — inputs separados, não causam re-render do form */}
          {form.componentes.length > 0 && (
            <div style={{ background: 'var(--green-bg)', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#2e7d32', marginBottom: 8 }}>Simulação de custo</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: 'var(--gray-500)' }}>Peso médio (kg)</label>
                  <input className="form-input" type="number" value={simPeso} onChange={e => setSimPeso(e.target.value)} style={{ marginTop: 2 }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: 'var(--gray-500)' }}>Qtd animais</label>
                  <input className="form-input" type="number" value={simQtd} onChange={e => setSimQtd(e.target.value)} style={{ marginTop: 2 }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 13, flexWrap: 'wrap' }}>
                <div><span style={{ color: '#2e7d32' }}>Custo/dia (lote): </span><strong style={{ color: '#1b5e20' }}>{fmt(custoDiaForm)}</strong></div>
                <div><span style={{ color: '#2e7d32' }}>Por animal/dia: </span><strong style={{ color: '#1b5e20' }}>{Number(simQtd) > 0 ? fmt(custoDiaForm / Number(simQtd)) : '—'}</strong></div>
                <div><span style={{ color: '#2e7d32' }}>Custo 30d: </span><strong style={{ color: '#1b5e20' }}>{fmt(custoDiaForm * 30)}</strong></div>
              </div>
            </div>
          )}

          {erro && <div style={{ padding: 10, background: '#ffebee', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>{erro}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={fecharModal}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : showEditar ? 'Salvar alterações' : 'Criar dieta'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL DETALHE ── */}
      <Modal open={!!showDetalhe} onClose={() => setShowDetalhe(null)} title={dietaDetalhe?.nome ?? ''} size="lg"
        subtitle={dietaDetalhe?.ciclo_recomendado ? cicloLabel(dietaDetalhe.ciclo_recomendado) : 'Todos os ciclos'}>
        {dietaDetalhe && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ background: 'var(--green-bg)', borderRadius: 8, padding: '10px 14px', flex: 1 }}>
                <div style={{ fontSize: 11, color: 'var(--green)' }}>GMD esperado</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--green-dark)' }}>{dietaDetalhe.gmd_esperado} kg/dia</div>
              </div>
              <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '10px 14px', flex: 1 }}>
                <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>Ingredientes</div>
                <div style={{ fontSize: 20, fontWeight: 600 }}>{dietaDetalhe.componentes?.length ?? 0}</div>
              </div>
            </div>
            {dietaDetalhe.descricao && <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>{dietaDetalhe.descricao}</p>}
            {(dietaDetalhe.componentes?.length ?? 0) > 0 && (
              <div className="card" style={{ padding: 0 }}>
                <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                  <table>
                    <thead><tr><th>Ingrediente</th><th>Categoria</th><th>Quantidade</th><th>Unidade</th><th>R$/kg</th></tr></thead>
                    <tbody>
                      {dietaDetalhe.componentes!.map((c, i) => {
                        const ins = c.insumo_id ? insumoPorId[c.insumo_id] : null
                        return (
                          <tr key={i}>
                            <td><strong>{ins?.nome ?? c.nome_ingrediente ?? '—'}</strong></td>
                            <td><span style={{ fontSize: 11, background: 'var(--gray-100)', padding: '2px 6px', borderRadius: 4 }}>{ins ? categoriaLabel[ins.categoria] : '—'}</span></td>
                            <td>{fmtNum(c.quantidade, 4)}</td>
                            <td>{unidadeLabel(c.unidade)}</td>
                            <td>{fmt(c.preco_kg)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            <div style={{ background: 'var(--green-bg)', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#2e7d32', marginBottom: 8 }}>Simulação de custo</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: 'var(--gray-500)' }}>Peso médio (kg)</label>
                  <input className="form-input" type="number" value={simPeso} onChange={e => setSimPeso(e.target.value)} style={{ marginTop: 2 }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 11, color: 'var(--gray-500)' }}>Qtd animais</label>
                  <input className="form-input" type="number" value={simQtd} onChange={e => setSimQtd(e.target.value)} style={{ marginTop: 2 }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 13, flexWrap: 'wrap' }}>
                <div><span style={{ color: '#2e7d32' }}>Custo/dia (lote): </span><strong style={{ color: '#1b5e20' }}>{fmt(custoDiaDetalhe)}</strong></div>
                <div><span style={{ color: '#2e7d32' }}>Por animal/dia: </span><strong style={{ color: '#1b5e20' }}>{Number(simQtd) > 0 ? fmt(custoDiaDetalhe / Number(simQtd)) : '—'}</strong></div>
                <div><span style={{ color: '#2e7d32' }}>Custo 30d: </span><strong style={{ color: '#1b5e20' }}>{fmt(custoDiaDetalhe * 30)}</strong></div>
                <div><span style={{ color: '#2e7d32' }}>Custo 30d/animal: </span><strong style={{ color: '#1b5e20' }}>{Number(simQtd) > 0 ? fmt(custoDiaDetalhe / Number(simQtd) * 30) : '—'}</strong></div>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
