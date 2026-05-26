import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useAdmin } from '@/hooks/useDietas'
import { Modal, PageHeader } from '@/components/common/UI'
import { fmt } from '@/lib/calculations'
import type { Insumo } from '@/hooks/useDietas'

const categoriaLabel: Record<string, string> = {
  volumoso: 'Volumoso',
  concentrado_energetico: 'Conc. Energético',
  concentrado_proteico: 'Conc. Proteico',
  mineral_aditivo: 'Mineral / Aditivo',
  subproduto: 'Subproduto',
}

const cicloLabel = (n: number) =>
  ({ 1: 'Adaptação', 2: 'Crescimento', 3: 'Engorda', 4: 'Acabamento' }[n] ?? `Ciclo ${n}`)

export default function Configuracoes() {
  const { user } = useAuth()
  const isAdmin = (user?.user_metadata?.role === 'admin') || ((user as any)?.role === 'admin')
  const { insumos, dietasBase, loading, criarInsumo, atualizarInsumo, criarDietaBase, atualizarDietaBase } = useAdmin()

  const [tab, setTab] = useState<'conta' | 'insumos' | 'dietas_base'>('conta')
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [filtroCat, setFiltroCat] = useState('todos')

  const [showInsumo, setShowInsumo] = useState(false)
  const [editInsumo, setEditInsumo] = useState<Insumo | null>(null)
  const [fInsumo, setFInsumo] = useState({ nome: '', categoria: 'volumoso', unidade_padrao: 'kg_animal_dia', preco_referencia: '', observacao: '' })

  const [showDietaBase, setShowDietaBase] = useState(false)
  const [editDietaBase, setEditDietaBase] = useState<string | null>(null)
  const [fDietaBase, setFDietaBase] = useState({
    nome: '', ciclo_recomendado: '' as any, descricao: '', gmd_esperado: '',
    ingredientes: [] as Array<{ insumo_id: string; quantidade: number; unidade: string; observacao: string }>,
  })

  const categorias = [...new Set(insumos.map(i => i.categoria))]
  const insumosFiltrados = filtroCat === 'todos' ? insumos : insumos.filter(i => i.categoria === filtroCat)

  const handleSalvarInsumo = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setErro(null)
    const payload = { ...fInsumo, preco_referencia: Number(fInsumo.preco_referencia) || 0, ativo: true }
    const result = editInsumo
      ? await atualizarInsumo(editInsumo.id, payload)
      : await criarInsumo(payload as any)
    setSaving(false)
    if (result?.error) { setErro(result.error); return }
    setShowInsumo(false); setEditInsumo(null)
    setFInsumo({ nome: '', categoria: 'volumoso', unidade_padrao: 'kg_animal_dia', preco_referencia: '', observacao: '' })
  }

  const handleSalvarDietaBase = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setErro(null)
    const payload = {
      nome: fDietaBase.nome,
      ciclo_recomendado: fDietaBase.ciclo_recomendado ? Number(fDietaBase.ciclo_recomendado) : undefined,
      descricao: fDietaBase.descricao || undefined,
      gmd_esperado: fDietaBase.gmd_esperado ? Number(fDietaBase.gmd_esperado) : undefined,
      ingredientes: fDietaBase.ingredientes,
    }
    const result = editDietaBase
      ? await atualizarDietaBase(editDietaBase, payload)
      : await criarDietaBase(payload)
    setSaving(false)
    if (result?.error) { setErro(result.error); return }
    setShowDietaBase(false); setEditDietaBase(null)
    setFDietaBase({ nome: '', ciclo_recomendado: '', descricao: '', gmd_esperado: '', ingredientes: [] })
  }

  return (
    <div className="page">
      <PageHeader title="Configurações" subtitle="Conta, insumos e templates de dieta" />

      <div className="tabs">
        <button className={`tab-btn${tab === 'conta' ? ' active' : ''}`} onClick={() => setTab('conta')}>Conta</button>
        {isAdmin && <>
          <button className={`tab-btn${tab === 'insumos' ? ' active' : ''}`} onClick={() => setTab('insumos')}>Insumos ({insumos.length})</button>
          <button className={`tab-btn${tab === 'dietas_base' ? ' active' : ''}`} onClick={() => setTab('dietas_base')}>Templates base ({dietasBase.length})</button>
        </>}
      </div>

      {tab === 'conta' && (
        <div className="card" style={{ maxWidth: 480 }}>
          <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 16 }}>Informações da conta</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[
              ['E-mail', user?.email],
              ['Nome', user?.user_metadata?.nome ?? '—'],
              ['Perfil', user?.user_metadata?.role ?? 'produtor'],
            ].map(([label, value]) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                <span style={{ color: 'var(--gray-500)' }}>{label}</span>
                <span style={{ fontWeight: 500, textTransform: label === 'Perfil' ? 'capitalize' : undefined }}>{value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === 'insumos' && isAdmin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {['todos', ...categorias].map(c => (
                <button key={c} className={`pill${filtroCat === c ? ' active' : ''}`} onClick={() => setFiltroCat(c)}>
                  {c === 'todos' ? 'Todos' : categoriaLabel[c]}
                </button>
              ))}
            </div>
            <button className="btn btn-primary" onClick={() => { setEditInsumo(null); setShowInsumo(true) }}>+ Novo insumo</button>
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" style={{ width: 28, height: 28 }} /></div>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                <table>
                  <thead><tr><th>Nome</th><th>Categoria</th><th>Unidade padrão</th><th>Preço ref.</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {insumosFiltrados.map(ins => (
                      <tr key={ins.id}>
                        <td>
                          <strong>{ins.nome}</strong>
                          {ins.observacao && <div style={{ fontSize: 11, color: '#9e9e9e' }}>{ins.observacao}</div>}
                        </td>
                        <td><span style={{ fontSize: 11, background: 'var(--gray-100)', padding: '2px 6px', borderRadius: 4 }}>{categoriaLabel[ins.categoria]}</span></td>
                        <td style={{ fontSize: 12 }}>{ins.unidade_padrao === 'pct_pc' ? '% PC' : 'kg/animal/dia'}</td>
                        <td>{fmt(ins.preco_referencia)}</td>
                        <td><span className={`badge ${ins.ativo ? 'badge-green' : 'badge-gray'}`}>{ins.ativo ? 'Ativo' : 'Inativo'}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => {
                              setEditInsumo(ins)
                              setFInsumo({ nome: ins.nome, categoria: ins.categoria, unidade_padrao: ins.unidade_padrao, preco_referencia: String(ins.preco_referencia), observacao: ins.observacao ?? '' })
                              setShowInsumo(true)
                            }}>Editar</button>
                            <button className="btn btn-ghost btn-sm" style={{ color: ins.ativo ? '#b91c1c' : 'var(--green)' }}
                              onClick={() => atualizarInsumo(ins.id, { ativo: !ins.ativo })}>
                              {ins.ativo ? 'Desativar' : 'Ativar'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === 'dietas_base' && isAdmin && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" onClick={() => { setEditDietaBase(null); setFDietaBase({ nome: '', ciclo_recomendado: '', descricao: '', gmd_esperado: '', ingredientes: [] }); setShowDietaBase(true) }}>+ Novo template</button>
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" style={{ width: 28, height: 28 }} /></div>
          ) : dietasBase.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ fontSize: 14, color: 'var(--gray-500)' }}>Nenhum template criado ainda.</div>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 12 }}>
              {dietasBase.map(db => (
                <div key={db.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div className="flex-between">
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 600 }}>{db.nome}</div>
                      <div style={{ fontSize: 11, color: '#9e9e9e', marginTop: 2 }}>
                        {db.ciclo_recomendado ? cicloLabel(db.ciclo_recomendado) : 'Todos os ciclos'}
                        {db.gmd_esperado ? ` · GMD ${db.gmd_esperado} kg/dia` : ''}
                      </div>
                    </div>
                    <span className={`badge ${db.ativo ? 'badge-green' : 'badge-gray'}`}>{db.ativo ? 'Ativo' : 'Inativo'}</span>
                  </div>
                  {db.descricao && <div style={{ fontSize: 12, color: '#737370' }}>{db.descricao}</div>}
                  <div style={{ fontSize: 12, color: '#9e9e9e' }}>{db.ingredientes?.length ?? 0} ingredientes</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => {
                      setEditDietaBase(db.id)
                      setFDietaBase({
                        nome: db.nome, ciclo_recomendado: db.ciclo_recomendado ?? '',
                        descricao: db.descricao ?? '', gmd_esperado: db.gmd_esperado ? String(db.gmd_esperado) : '',
                        ingredientes: (db.ingredientes ?? []).map(i => ({ insumo_id: i.insumo_id, quantidade: i.quantidade, unidade: i.unidade, observacao: i.observacao ?? '' })),
                      })
                      setShowDietaBase(true)
                    }}>Editar</button>
                    <button className="btn btn-ghost btn-sm" style={{ color: db.ativo ? '#b91c1c' : 'var(--green)' }}
                      onClick={() => atualizarDietaBase(db.id, { ativo: !db.ativo })}>
                      {db.ativo ? 'Desativar' : 'Ativar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <Modal open={showInsumo} onClose={() => { setShowInsumo(false); setEditInsumo(null) }}
        title={editInsumo ? 'Editar insumo' : 'Novo insumo'} size="sm">
        <form onSubmit={handleSalvarInsumo} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group"><label className="form-label">Nome</label>
            <input className="form-input" placeholder="Ex: Silagem de milho" value={fInsumo.nome} onChange={e => setFInsumo(f => ({ ...f, nome: e.target.value }))} required /></div>
          <div className="form-row-2">
            <div className="form-group"><label className="form-label">Categoria</label>
              <select className="form-input" value={fInsumo.categoria} onChange={e => setFInsumo(f => ({ ...f, categoria: e.target.value }))}>
                {Object.entries(categoriaLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select></div>
            <div className="form-group"><label className="form-label">Unidade padrão</label>
              <select className="form-input" value={fInsumo.unidade_padrao} onChange={e => setFInsumo(f => ({ ...f, unidade_padrao: e.target.value }))}>
                <option value="kg_animal_dia">kg / animal / dia</option>
                <option value="pct_pc">% do Peso Corporal</option>
              </select></div>
          </div>
          <div className="form-group"><label className="form-label">Preço de referência (R$/kg)</label>
            <input className="form-input" type="number" placeholder="0,00" step="0.0001" value={fInsumo.preco_referencia} onChange={e => setFInsumo(f => ({ ...f, preco_referencia: e.target.value }))} /></div>
          <div className="form-group"><label className="form-label">Observação</label>
            <input className="form-input" placeholder="Ex: Base seca, restrições..." value={fInsumo.observacao} onChange={e => setFInsumo(f => ({ ...f, observacao: e.target.value }))} /></div>
          {erro && <div style={{ padding: 10, background: '#ffebee', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>{erro}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => { setShowInsumo(false); setEditInsumo(null) }}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : editInsumo ? 'Salvar' : 'Criar'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={showDietaBase} onClose={() => { setShowDietaBase(false); setEditDietaBase(null) }}
        title={editDietaBase ? 'Editar template base' : 'Novo template base'} size="lg">
        <form onSubmit={handleSalvarDietaBase} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-row-2">
            <div className="form-group"><label className="form-label">Nome do template</label>
              <input className="form-input" placeholder="Ex: Dieta Engorda Nelore Ciclo 3" value={fDietaBase.nome} onChange={e => setFDietaBase(f => ({ ...f, nome: e.target.value }))} required /></div>
            <div className="form-group"><label className="form-label">GMD esperado (kg/dia)</label>
              <input className="form-input" type="number" placeholder="1.4" step="0.01" value={fDietaBase.gmd_esperado} onChange={e => setFDietaBase(f => ({ ...f, gmd_esperado: e.target.value }))} /></div>
          </div>
          <div className="form-row-2">
            <div className="form-group"><label className="form-label">Ciclo recomendado</label>
              <select className="form-input" value={fDietaBase.ciclo_recomendado} onChange={e => setFDietaBase(f => ({ ...f, ciclo_recomendado: e.target.value }))}>
                <option value="">Todos os ciclos</option>
                {[1, 2, 3, 4].map(n => <option key={n} value={n}>Ciclo {n} — {cicloLabel(n)}</option>)}
              </select></div>
            <div className="form-group"><label className="form-label">Descrição</label>
              <input className="form-input" placeholder="Orientações gerais..." value={fDietaBase.descricao} onChange={e => setFDietaBase(f => ({ ...f, descricao: e.target.value }))} /></div>
          </div>

          <div style={{ fontWeight: 500, fontSize: 13, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
            Ingredientes ({fDietaBase.ingredientes.length})
          </div>

          {fDietaBase.ingredientes.map((ing, i) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 130px 1fr 28px', gap: 6, alignItems: 'center' }}>
              <select className="form-input" value={ing.insumo_id} onChange={e => setFDietaBase(f => ({ ...f, ingredientes: f.ingredientes.map((x, j) => j === i ? { ...x, insumo_id: e.target.value } : x) }))}>
                <option value="">Selecione...</option>
                {categorias.map(cat => (
                  <optgroup key={cat} label={categoriaLabel[cat]}>
                    {insumos.filter(ins => ins.categoria === cat).map(ins => <option key={ins.id} value={ins.id}>{ins.nome}</option>)}
                  </optgroup>
                ))}
              </select>
              <input className="form-input" type="number" step="0.01" placeholder="Qtd" value={ing.quantidade}
                onChange={e => setFDietaBase(f => ({ ...f, ingredientes: f.ingredientes.map((x, j) => j === i ? { ...x, quantidade: Number(e.target.value) } : x) }))} />
              <select className="form-input" value={ing.unidade} onChange={e => setFDietaBase(f => ({ ...f, ingredientes: f.ingredientes.map((x, j) => j === i ? { ...x, unidade: e.target.value } : x) }))} style={{ fontSize: 12 }}>
                <option value="kg_animal_dia">kg/animal/dia</option>
                <option value="pct_pc">% PC</option>
              </select>
              <input className="form-input" placeholder="Observação" value={ing.observacao}
                onChange={e => setFDietaBase(f => ({ ...f, ingredientes: f.ingredientes.map((x, j) => j === i ? { ...x, observacao: e.target.value } : x) }))} style={{ fontSize: 12 }} />
              <button type="button" onClick={() => setFDietaBase(f => ({ ...f, ingredientes: f.ingredientes.filter((_, j) => j !== i) }))}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9e9e9e', fontSize: 18 }}>×</button>
            </div>
          ))}

          <button type="button" className="btn btn-ghost btn-sm"
            onClick={() => setFDietaBase(f => ({ ...f, ingredientes: [...f.ingredientes, { insumo_id: '', quantidade: 5, unidade: 'kg_animal_dia', observacao: '' }] }))}>
            + Adicionar ingrediente
          </button>

          {erro && <div style={{ padding: 10, background: '#ffebee', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>{erro}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => { setShowDietaBase(false); setEditDietaBase(null) }}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : editDietaBase ? 'Salvar' : 'Criar template'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
