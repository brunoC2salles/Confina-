import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useAdmin, type InsumoPadrao, type DietaBase } from '@/hooks/useDietas'
import { supabase } from '@/lib/supabase'
import { Modal, PageHeader } from '@/components/common/UI'
import { fmt } from '@/lib/calculations'

const CATEGORIAS = [
  { value: 'volumoso', label: 'Volumoso' },
  { value: 'concentrado_energetico', label: 'Concentrado Energético' },
  { value: 'concentrado_proteico', label: 'Concentrado Proteico' },
  { value: 'mineral_aditivo', label: 'Mineral / Aditivo' },
  { value: 'subproduto', label: 'Subproduto' },
]
const categoriaLabel = (v: string) => CATEGORIAS.find(c => c.value === v)?.label ?? v

const cicloLabel = (n: number) =>
  ({ 1: 'Adaptação', 2: 'Crescimento', 3: 'Engorda', 4: 'Acabamento' } as Record<number, string>)[n] ?? `Ciclo ${n}`

// ─── Form de ingredientes de um template (concentrado ou volumoso) ────────────

interface IngredienteForm {
  insumo_id: string
  tipo: 'concentrado' | 'volumoso'
  pct_participacao: number
  _nome: string
  _categoria: string
}

function SecaoIngredientesTemplate({
  titulo, tipo, ingredientes, insumosPorCategoria, soma, onAdd, onRemove, onUpdate,
}: {
  titulo: string
  tipo: 'concentrado' | 'volumoso'
  ingredientes: IngredienteForm[]
  insumosPorCategoria: Record<string, InsumoPadrao[]>
  soma: number
  onAdd: (insumo: InsumoPadrao) => void
  onRemove: (idx: number) => void
  onUpdate: (idx: number, pct: number) => void
}) {
  const doTipo = ingredientes.map((c, idx) => ({ c, idx })).filter(x => x.c.tipo === tipo)
  const jaAdicionados = new Set(doTipo.map(x => x.c.insumo_id))

  return (
    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
      <div className="flex-between" style={{ marginBottom: 10 }}>
        <div style={{ fontSize: 13, fontWeight: 500 }}>{titulo}</div>
        <div style={{ fontSize: 12, color: Math.abs(soma - 100) < 0.01 ? '#2e7d32' : '#b91c1c' }}>
          Soma: {soma.toFixed(2)}% {Math.abs(soma - 100) < 0.01 ? 'OK' : '(precisa somar 100)'}
        </div>
      </div>

      {doTipo.length === 0 ? (
        <div style={{ padding: '10px 14px', background: 'var(--gray-50)', borderRadius: 8, fontSize: 12, color: 'var(--gray-500)', textAlign: 'center' }}>
          Nenhum ingrediente. Adicione abaixo.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {doTipo.map(({ c, idx }) => (
            <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1.6fr 100px 28px', gap: 6, alignItems: 'center' }}>
              <div style={{ fontSize: 13 }}>
                <div style={{ fontWeight: 500 }}>{c._nome}</div>
                <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>{categoriaLabel(c._categoria)}</div>
              </div>
              <input className="form-input" type="number" step="0.1" value={c.pct_participacao || ''}
                onChange={e => onUpdate(idx, Number(e.target.value))} style={{ fontSize: 13 }} placeholder="0" />
              <button type="button" onClick={() => onRemove(idx)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9e9e9e', fontSize: 18 }}>×</button>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 4 }}>Adicionar ingrediente:</div>
        {Object.entries(insumosPorCategoria).map(([cat, lista]) => {
          const disponiveis = lista.filter(i => !jaAdicionados.has(i.id))
          if (disponiveis.length === 0) return null
          return (
            <div key={cat} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>
                {categoriaLabel(cat)}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {disponiveis.map(ins => (
                  <button key={ins.id} type="button"
                    style={{ fontSize: 11, padding: '3px 8px', background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', color: 'var(--gray-600)' }}
                    onClick={() => onAdd(ins)}>
                    + {ins.nome}
                  </button>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Página principal ───────────────────────────────────────────────────────────

export default function Configuracoes() {
  const { user } = useAuth()
  const [isAdmin, setIsAdmin] = useState(false)

  useEffect(() => {
    if (!user) return
    supabase.from('profiles').select('role').eq('id', user.id).single()
      .then(({ data }) => { if (data?.role === 'admin') setIsAdmin(true) })
  }, [user])

  const { insumos, dietasBase, loading, criarInsumo, atualizarInsumo, criarDietaBase, atualizarDietaBase } = useAdmin()

  const [tab, setTab] = useState<'conta' | 'insumos' | 'dietas_base'>('conta')
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [filtroCat, setFiltroCat] = useState('todos')

  const insumosPorCategoria = useMemo(() => {
    const g: Record<string, InsumoPadrao[]> = {}
    for (const i of insumos) { if (i.ativo) (g[i.categoria] ??= []).push(i) }
    return g
  }, [insumos])

  // ─── Form: insumo ───────────────────────────────────────────────────────────

  const [showInsumo, setShowInsumo] = useState(false)
  const [editInsumo, setEditInsumo] = useState<InsumoPadrao | null>(null)
  const [fInsumo, setFInsumo] = useState({ nome: '', categoria: 'concentrado_energetico', pct_ms: '', preco_referencia: '' })

  const abrirNovoInsumo = () => {
    setEditInsumo(null)
    setFInsumo({ nome: '', categoria: 'concentrado_energetico', pct_ms: '', preco_referencia: '' })
    setErro(null)
    setShowInsumo(true)
  }

  const abrirEditarInsumo = (ins: InsumoPadrao) => {
    setEditInsumo(ins)
    setFInsumo({ nome: ins.nome, categoria: ins.categoria, pct_ms: ins.pct_ms != null ? String(ins.pct_ms) : '', preco_referencia: String(ins.preco_referencia) })
    setErro(null)
    setShowInsumo(true)
  }

  const handleSalvarInsumo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!fInsumo.nome.trim()) { setErro('Informe o nome'); return }
    setSaving(true); setErro(null)
    const payload = {
      nome: fInsumo.nome.trim(),
      categoria: fInsumo.categoria,
      pct_ms: fInsumo.pct_ms ? Number(fInsumo.pct_ms) : null,
      preco_referencia: Number(fInsumo.preco_referencia) || 0,
    }
    const result = editInsumo
      ? await atualizarInsumo(editInsumo.id, payload)
      : await criarInsumo(payload)
    setSaving(false)
    if (result?.error) { setErro(result.error); return }
    setShowInsumo(false); setEditInsumo(null)
  }

  // ─── Form: template de dieta base ──────────────────────────────────────────

  const [showDietaBase, setShowDietaBase] = useState(false)
  const [editDietaBase, setEditDietaBase] = useState<string | null>(null)
  const [fDietaBase, setFDietaBase] = useState({
    nome: '', descricao: '', gmd_esperado: '', ciclo_recomendado: '',
    pct_consumo_pv_ms: '', pct_concentrado: '60', pct_volumoso: '40',
    ingredientes: [] as IngredienteForm[],
  })

  const pctConc = Number(fDietaBase.pct_concentrado) || 0
  const pctVol = Number(fDietaBase.pct_volumoso) || 0
  const somaConc = fDietaBase.ingredientes.filter(i => i.tipo === 'concentrado').reduce((s, i) => s + (Number(i.pct_participacao) || 0), 0)
  const somaVol = fDietaBase.ingredientes.filter(i => i.tipo === 'volumoso').reduce((s, i) => s + (Number(i.pct_participacao) || 0), 0)

  const abrirNovoTemplate = () => {
    setEditDietaBase(null)
    setFDietaBase({ nome: '', descricao: '', gmd_esperado: '', ciclo_recomendado: '', pct_consumo_pv_ms: '', pct_concentrado: '60', pct_volumoso: '40', ingredientes: [] })
    setErro(null)
    setShowDietaBase(true)
  }

  const abrirEditarTemplate = (db: DietaBase) => {
    setEditDietaBase(db.id)
    setFDietaBase({
      nome: db.nome,
      descricao: db.descricao ?? '',
      gmd_esperado: db.gmd_esperado != null ? String(db.gmd_esperado) : '',
      ciclo_recomendado: db.ciclo_recomendado != null ? String(db.ciclo_recomendado) : '',
      pct_consumo_pv_ms: db.pct_consumo_pv_ms != null ? String(db.pct_consumo_pv_ms) : '',
      pct_concentrado: db.pct_concentrado != null ? String(db.pct_concentrado) : '60',
      pct_volumoso: db.pct_volumoso != null ? String(db.pct_volumoso) : '40',
      ingredientes: (db.ingredientes ?? []).map(i => ({
        insumo_id: i.insumo_id,
        tipo: (i.tipo ?? 'concentrado') as 'concentrado' | 'volumoso',
        pct_participacao: i.pct_participacao ?? 0,
        _nome: i.insumo?.nome ?? '—',
        _categoria: i.insumo?.categoria ?? '',
      })),
    })
    setErro(null)
    setShowDietaBase(true)
  }

  const adicionarIngrediente = (tipo: 'concentrado' | 'volumoso', ins: InsumoPadrao) => {
    setFDietaBase(f => ({
      ...f,
      ingredientes: [...f.ingredientes, { insumo_id: ins.id, tipo, pct_participacao: 0, _nome: ins.nome, _categoria: ins.categoria }],
    }))
  }
  const removerIngrediente = (idx: number) => setFDietaBase(f => ({ ...f, ingredientes: f.ingredientes.filter((_, i) => i !== idx) }))
  const atualizarIngrediente = (idx: number, pct: number) => setFDietaBase(f => ({
    ...f, ingredientes: f.ingredientes.map((x, i) => i === idx ? { ...x, pct_participacao: pct } : x),
  }))

  const validarTemplate = (): string | null => {
    if (!fDietaBase.nome.trim()) return 'Nome do template é obrigatório'
    if (Math.abs(pctConc + pctVol - 100) > 0.01) return '% concentrado + % volumoso deve somar 100'
    if (pctConc > 0 && Math.abs(somaConc - 100) > 0.01) return `Soma dos % do concentrado deve ser 100 (atual: ${somaConc.toFixed(2)})`
    if (pctVol > 0 && Math.abs(somaVol - 100) > 0.01) return `Soma dos % do volumoso deve ser 100 (atual: ${somaVol.toFixed(2)})`
    return null
  }
  const podeSalvarTemplate = validarTemplate() == null

  const handleSalvarDietaBase = async (e: React.FormEvent) => {
    e.preventDefault()
    const v = validarTemplate()
    if (v) { setErro(v); return }
    setSaving(true); setErro(null)
    const payload = {
      nome: fDietaBase.nome.trim(),
      descricao: fDietaBase.descricao || undefined,
      gmd_esperado: fDietaBase.gmd_esperado ? Number(fDietaBase.gmd_esperado) : undefined,
      ciclo_recomendado: fDietaBase.ciclo_recomendado ? Number(fDietaBase.ciclo_recomendado) : undefined,
      pct_consumo_pv_ms: fDietaBase.pct_consumo_pv_ms ? Number(fDietaBase.pct_consumo_pv_ms) : undefined,
      pct_concentrado: pctConc,
      pct_volumoso: pctVol,
      ingredientes: fDietaBase.ingredientes.map(i => ({ insumo_id: i.insumo_id, tipo: i.tipo, pct_participacao: Number(i.pct_participacao) })),
    }
    const result = editDietaBase
      ? await atualizarDietaBase(editDietaBase, payload)
      : await criarDietaBase(payload)
    setSaving(false)
    if (result?.error) { setErro(result.error); return }
    setShowDietaBase(false); setEditDietaBase(null)
  }

  const categorias = [...new Set(insumos.map(i => i.categoria))]
  const insumosFiltrados = filtroCat === 'todos' ? insumos : insumos.filter(i => i.categoria === filtroCat)

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
                  {c === 'todos' ? 'Todos' : categoriaLabel(c)}
                </button>
              ))}
            </div>
            <button className="btn btn-primary" onClick={abrirNovoInsumo}>+ Novo insumo</button>
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" style={{ width: 28, height: 28 }} /></div>
          ) : (
            <div className="card" style={{ padding: 0 }}>
              <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                <table>
                  <thead><tr><th>Nome</th><th>Categoria</th><th>% MS</th><th>Preço ref. (R$/kg)</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {insumosFiltrados.map(ins => (
                      <tr key={ins.id}>
                        <td><strong>{ins.nome}</strong></td>
                        <td><span style={{ fontSize: 11, background: 'var(--gray-100)', padding: '2px 6px', borderRadius: 4 }}>{categoriaLabel(ins.categoria)}</span></td>
                        <td>{ins.pct_ms != null ? `${ins.pct_ms}%` : '—'}</td>
                        <td>{fmt(ins.preco_referencia)}</td>
                        <td><span className={`badge ${ins.ativo ? 'badge-green' : 'badge-gray'}`}>{ins.ativo ? 'Ativo' : 'Inativo'}</span></td>
                        <td>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => abrirEditarInsumo(ins)}>Editar</button>
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
            <button className="btn btn-primary" onClick={abrirNovoTemplate}>+ Novo template</button>
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
                  <div style={{ fontSize: 12, color: '#9e9e9e' }}>
                    {db.pct_concentrado != null ? `${db.pct_concentrado}% concentrado / ${db.pct_volumoso}% volumoso` : 'Composição não definida'}
                    {' · '}{db.ingredientes?.length ?? 0} ingredientes
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => abrirEditarTemplate(db)}>Editar</button>
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

      {/* ─── Modal: insumo ─── */}
      <Modal open={showInsumo} onClose={() => { setShowInsumo(false); setEditInsumo(null) }}
        title={editInsumo ? 'Editar insumo' : 'Novo insumo'} size="sm">
        <form onSubmit={handleSalvarInsumo} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group"><label className="form-label">Nome</label>
            <input className="form-input" placeholder="Ex: Silagem de milho" value={fInsumo.nome} onChange={e => setFInsumo(f => ({ ...f, nome: e.target.value }))} required /></div>
          <div className="form-row-2">
            <div className="form-group"><label className="form-label">Categoria</label>
              <select className="form-input" value={fInsumo.categoria} onChange={e => setFInsumo(f => ({ ...f, categoria: e.target.value }))}>
                {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select></div>
            <div className="form-group"><label className="form-label">% MS (matéria seca)</label>
              <input className="form-input" type="number" step="0.1" placeholder="Ex: 32" value={fInsumo.pct_ms} onChange={e => setFInsumo(f => ({ ...f, pct_ms: e.target.value }))} /></div>
          </div>
          <div className="form-group"><label className="form-label">Preço de referência (R$/kg)</label>
            <input className="form-input" type="number" placeholder="0,00" step="0.0001" value={fInsumo.preco_referencia} onChange={e => setFInsumo(f => ({ ...f, preco_referencia: e.target.value }))} /></div>
          {erro && <div style={{ padding: 10, background: '#ffebee', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>{erro}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => { setShowInsumo(false); setEditInsumo(null) }}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : editInsumo ? 'Salvar' : 'Criar'}</button>
          </div>
        </form>
      </Modal>

      {/* ─── Modal: template de dieta base ─── */}
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
                {[1, 2, 3, 4, 5, 6, 7, 8].map(n => <option key={n} value={n}>Ciclo {n}{n <= 4 ? ` — ${cicloLabel(n)}` : ''}</option>)}
              </select></div>
            <div className="form-group"><label className="form-label">% consumo do PV em MS</label>
              <input className="form-input" type="number" step="0.01" placeholder="Ex: 2.3" value={fDietaBase.pct_consumo_pv_ms} onChange={e => setFDietaBase(f => ({ ...f, pct_consumo_pv_ms: e.target.value }))} /></div>
          </div>
          <div className="form-group"><label className="form-label">Descrição</label>
            <input className="form-input" placeholder="Orientações gerais..." value={fDietaBase.descricao} onChange={e => setFDietaBase(f => ({ ...f, descricao: e.target.value }))} /></div>

          <div className="form-row-2">
            <div className="form-group"><label className="form-label">% Concentrado</label>
              <input className="form-input" type="number" step="1" value={fDietaBase.pct_concentrado} onChange={e => setFDietaBase(f => ({ ...f, pct_concentrado: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">% Volumoso</label>
              <input className="form-input" type="number" step="1" value={fDietaBase.pct_volumoso} onChange={e => setFDietaBase(f => ({ ...f, pct_volumoso: e.target.value }))} /></div>
          </div>

          {pctConc > 0 && (
            <SecaoIngredientesTemplate titulo="Ingredientes do concentrado" tipo="concentrado"
              ingredientes={fDietaBase.ingredientes} insumosPorCategoria={insumosPorCategoria} soma={somaConc}
              onAdd={ins => adicionarIngrediente('concentrado', ins)} onRemove={removerIngrediente} onUpdate={atualizarIngrediente} />
          )}
          {pctVol > 0 && (
            <SecaoIngredientesTemplate titulo="Ingredientes do volumoso" tipo="volumoso"
              ingredientes={fDietaBase.ingredientes} insumosPorCategoria={insumosPorCategoria} soma={somaVol}
              onAdd={ins => adicionarIngrediente('volumoso', ins)} onRemove={removerIngrediente} onUpdate={atualizarIngrediente} />
          )}

          {erro && <div style={{ padding: 10, background: '#ffebee', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>{erro}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => { setShowDietaBase(false); setEditDietaBase(null) }}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !podeSalvarTemplate}>
              {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : editDietaBase ? 'Salvar' : 'Criar template'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
