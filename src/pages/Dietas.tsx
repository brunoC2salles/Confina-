import { useState, useMemo, useCallback } from 'react'
import {
  useDietas, calcularCustoKgMsLado, calcularCustoDia,
  type ComponenteDieta, type DietaBase, type IngredienteDisponivel,
} from '@/hooks/useDietas'
import { Modal, PageHeader, EmptyState } from '@/components/common/UI'
import { fmt } from '@/lib/calculations'
import { Link } from 'react-router-dom'

const cicloLabel = (n: number) =>
  ({ 1: 'Adaptação', 2: 'Crescimento', 3: 'Engorda', 4: 'Acabamento' }[n] ?? `Ciclo ${n}`)

const categoriaLabel: Record<string, string> = {
  volumoso: 'Volumoso',
  concentrado_energetico: 'Conc. Energético',
  concentrado_proteico: 'Conc. Proteico',
  mineral_aditivo: 'Mineral / Aditivo',
  subproduto: 'Subproduto',
}

// Componente do form guarda "keyDisponivel" = origem+id para lookup
type CompForm = Omit<ComponenteDieta, 'id' | 'dieta_id' | 'insumo' | 'ingrediente_produtor'> & {
  _key: string
  _nome: string
  _categoria: string
  _pct_ms_base: number | null // pct_ms do cadastro do ingrediente
}

interface FormDieta {
  nome: string
  descricao: string
  gmd_esperado: string
  ciclo_recomendado: string
  baseada_em: string
  pct_consumo_pv_ms: string
  pct_concentrado: string
  pct_volumoso: string
  custo_manual_ativo: boolean
  custo_manual_valor: string
  custo_manual_unidade: 'kg' | 'ton'
  componentes: CompForm[]
}

const emptyForm = (): FormDieta => ({
  nome: '', descricao: '', gmd_esperado: '', ciclo_recomendado: '',
  baseada_em: '',
  pct_consumo_pv_ms: '2.2',
  pct_concentrado: '100',
  pct_volumoso: '0',
  custo_manual_ativo: false,
  custo_manual_valor: '',
  custo_manual_unidade: 'ton',
  componentes: [],
})

const somaPct = (comps: CompForm[], tipo: 'concentrado' | 'volumoso') =>
  comps.filter(c => c.tipo === tipo).reduce((s, c) => s + (Number(c.pct_participacao) || 0), 0)

const keyDisp = (i: IngredienteDisponivel) => `${i.origem}:${i.id}`

export default function Dietas() {
  const {
    dietas, dietasBase, ingredientesDisponiveis, loading,
    criarDieta, atualizarDieta, excluirDieta,
  } = useDietas()

  const [showNova, setShowNova] = useState(false)
  const [showEditar, setShowEditar] = useState<string | null>(null)
  const [showDetalhe, setShowDetalhe] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [tab, setTab] = useState<'minhas' | 'base'>('minhas')
  const [form, setForm] = useState<FormDieta>(emptyForm())
  const [simPeso, setSimPeso] = useState('450')
  const [simQtd, setSimQtd] = useState('80')

  const dietaDetalhe = dietas.find(d => d.id === showDetalhe)

  const dispPorKey = useMemo(() => {
    const m: Record<string, IngredienteDisponivel> = {}
    ingredientesDisponiveis.forEach(i => { m[keyDisp(i)] = i })
    return m
  }, [ingredientesDisponiveis])

  const dispPorCategoria = useMemo(() => {
    const g: Record<string, IngredienteDisponivel[]> = {}
    ingredientesDisponiveis.forEach(i => { (g[i.categoria] ??= []).push(i) })
    return g
  }, [ingredientesDisponiveis])

  // ─── Manipulação de componentes ─────────────────────────────────────────────

  const addComponente = useCallback((tipo: 'concentrado' | 'volumoso', ing: IngredienteDisponivel) => {
    setForm(f => ({
      ...f,
      componentes: [...f.componentes, {
        _key: keyDisp(ing),
        _nome: ing.nome,
        _categoria: ing.categoria,
        _pct_ms_base: ing.pct_ms,
        tipo,
        origem_ingrediente: ing.origem,
        insumo_id: ing.origem === 'insumo_padrao' ? ing.id : null,
        ingrediente_produtor_id: ing.origem === 'ingrediente_produtor' ? ing.id : null,
        pct_participacao: 0,
        preco_kg: ing.preco_kg_padrao ?? 0,
        pct_ms_manual: null,
      }],
    }))
  }, [])

  const removeComponente = useCallback((idx: number) =>
    setForm(f => ({ ...f, componentes: f.componentes.filter((_, i) => i !== idx) })), [])

  const updateComponente = useCallback((idx: number, patch: Partial<CompForm>) =>
    setForm(f => ({
      ...f,
      componentes: f.componentes.map((c, i) => i === idx ? { ...c, ...patch } : c),
    })), [])

  // ─── Template base ──────────────────────────────────────────────────────────

  const carregarTemplate = useCallback((db: DietaBase) => {
    const comps: CompForm[] = (db.ingredientes ?? []).map(ing => {
      const disp = ingredientesDisponiveis.find(d => d.origem === 'insumo_padrao' && d.id === ing.insumo_id)
      return {
        _key: disp ? keyDisp(disp) : `insumo_padrao:${ing.insumo_id}`,
        _nome: disp?.nome ?? ing.insumo?.nome ?? '—',
        _categoria: disp?.categoria ?? ing.insumo?.categoria ?? 'concentrado_energetico',
        _pct_ms_base: disp?.pct_ms ?? ing.insumo?.pct_ms ?? null,
        tipo: (ing.tipo ?? 'concentrado') as 'concentrado' | 'volumoso',
        origem_ingrediente: 'insumo_padrao',
        insumo_id: ing.insumo_id,
        ingrediente_produtor_id: null,
        pct_participacao: ing.pct_participacao ?? 0,
        // preço default = preço de referência do insumo (ex: preço do PDF/base cadastrada),
        // o produtor pode editar depois com o que realmente pagou
        preco_kg: disp?.preco_kg_padrao ?? ing.insumo?.preco_referencia ?? 0,
        pct_ms_manual: null,
      }
    })

    // Se algum ingrediente do template não tem % MS cadastrado, o custo por
    // ingrediente (que depende de MS) não pode ser calculado — sugerimos ligar
    // o custo manual já preenchido com a média ponderada dos preços de
    // referência (equivalente ao custo "as-fed" da ração pronta, ex.: o
    // R$/ton informado na ficha de balanceamento do nutricionista).
    const faltaMs = comps.some(c => (c.pct_ms_manual ?? c._pct_ms_base) == null)
    const custoPorLado = (tipo: 'concentrado' | 'volumoso') =>
      comps.filter(c => c.tipo === tipo)
        .reduce((s, c) => s + (Number(c.preco_kg) || 0) * (Number(c.pct_participacao) || 0) / 100, 0)
    const pctC = db.pct_concentrado ?? 100
    const pctV = db.pct_volumoso ?? 0
    const custoAsFedPorKg = custoPorLado('concentrado') * (pctC / 100) + custoPorLado('volumoso') * (pctV / 100)

    setForm(f => ({
      ...f,
      baseada_em: db.id,
      nome: f.nome || `${db.nome} (cópia)`,
      gmd_esperado: db.gmd_esperado ? String(db.gmd_esperado) : f.gmd_esperado,
      ciclo_recomendado: db.ciclo_recomendado != null ? String(db.ciclo_recomendado) : f.ciclo_recomendado,
      descricao: f.descricao || db.descricao || '',
      pct_consumo_pv_ms: db.pct_consumo_pv_ms != null ? String(db.pct_consumo_pv_ms) : f.pct_consumo_pv_ms,
      pct_concentrado: db.pct_concentrado != null ? String(db.pct_concentrado) : f.pct_concentrado,
      pct_volumoso: db.pct_volumoso != null ? String(db.pct_volumoso) : f.pct_volumoso,
      custo_manual_ativo: faltaMs,
      custo_manual_valor: faltaMs ? (custoAsFedPorKg * 1000).toFixed(2) : f.custo_manual_valor,
      custo_manual_unidade: faltaMs ? 'ton' : f.custo_manual_unidade,
      componentes: comps,
    }))
  }, [ingredientesDisponiveis])

  // ─── Cálculos derivados do form ─────────────────────────────────────────────

  const componentesAsRef = useMemo<ComponenteDieta[]>(() =>
    form.componentes.map(c => ({
      tipo: c.tipo,
      origem_ingrediente: c.origem_ingrediente,
      insumo_id: c.insumo_id,
      ingrediente_produtor_id: c.ingrediente_produtor_id,
      pct_participacao: Number(c.pct_participacao) || 0,
      preco_kg: Number(c.preco_kg) || 0,
      pct_ms_manual: c.pct_ms_manual,
      insumo: c.origem_ingrediente === 'insumo_padrao' && c._pct_ms_base != null
        ? { id: c.insumo_id!, nome: c._nome, categoria: c._categoria, pct_ms: c._pct_ms_base, preco_referencia: 0, ativo: true }
        : null,
      ingrediente_produtor: c.origem_ingrediente === 'ingrediente_produtor' && c._pct_ms_base != null
        ? { id: c.ingrediente_produtor_id!, user_id: '', nome: c._nome, categoria: c._categoria, pct_ms: c._pct_ms_base, preco_kg: 0, ativo: true }
        : null,
    })), [form.componentes])

  const custoKgMsConc = useMemo(() =>
    calcularCustoKgMsLado(componentesAsRef.filter(c => c.tipo === 'concentrado')), [componentesAsRef])
  const custoKgMsVol = useMemo(() =>
    calcularCustoKgMsLado(componentesAsRef.filter(c => c.tipo === 'volumoso')), [componentesAsRef])

  const pctConc = Number(form.pct_concentrado) || 0
  const pctVol = Number(form.pct_volumoso) || 0
  const custoKgMsTotal: number | null = (custoKgMsConc != null && custoKgMsVol != null)
    ? custoKgMsConc * (pctConc / 100) + custoKgMsVol * (pctVol / 100)
    : null

  const somaConc = somaPct(form.componentes, 'concentrado')
  const somaVol = somaPct(form.componentes, 'volumoso')

  const custoDiaSim = useMemo(() => {
    if (custoKgMsTotal == null) return 0
    return calcularCustoDia(
      { pct_consumo_pv_ms: Number(form.pct_consumo_pv_ms) || 0, custo_kg_ms: custoKgMsTotal },
      Number(simPeso) || 0, Number(simQtd) || 0
    )
  }, [custoKgMsTotal, form.pct_consumo_pv_ms, simPeso, simQtd])

  // ─── Validação ──────────────────────────────────────────────────────────────

  const validarForm = (): string | null => {
    if (!form.nome.trim()) return 'Nome obrigatório'
    if (!form.gmd_esperado || Number(form.gmd_esperado) <= 0) return 'GMD esperado obrigatório'
    const pcpv = Number(form.pct_consumo_pv_ms)
    if (!pcpv || pcpv <= 0 || pcpv > 10) return '% consumo do PV em MS deve ser > 0 e ≤ 10'
    if (Math.abs(pctConc + pctVol - 100) > 0.01) return '% concentrado + % volumoso deve somar 100'
    if (pctConc > 0 && form.componentes.filter(c => c.tipo === 'concentrado').length === 0)
      return 'Adicione ingredientes ao concentrado'
    if (pctVol > 0 && form.componentes.filter(c => c.tipo === 'volumoso').length === 0)
      return 'Adicione ingredientes ao volumoso'
    if (pctConc > 0 && Math.abs(somaConc - 100) > 0.01)
      return `Soma dos % do concentrado deve ser 100 (atual: ${somaConc.toFixed(2)})`
    if (pctVol > 0 && Math.abs(somaVol - 100) > 0.01)
      return `Soma dos % do volumoso deve ser 100 (atual: ${somaVol.toFixed(2)})`
    for (const c of form.componentes) {
      if (c.pct_participacao <= 0) return `${c._nome}: % participação deve ser > 0`
      if (c.preco_kg < 0) return `${c._nome}: preço inválido`
      if (!form.custo_manual_ativo) {
        const pctMs = c.pct_ms_manual ?? c._pct_ms_base
        if (pctMs == null || pctMs <= 0) return `${c._nome}: % MS não informado — preencha no campo "% MS"`
      }
    }
    if (form.custo_manual_ativo && (!form.custo_manual_valor || Number(form.custo_manual_valor) <= 0))
      return 'Informe o custo manual da ração (deve ser maior que zero)'
    return null
  }

  const podeSalvar = validarForm() == null

  // ─── Salvar ─────────────────────────────────────────────────────────────────

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault()
    const v = validarForm()
    if (v) { setErro(v); return }
    setSaving(true); setErro(null)
    const payload = {
      nome: form.nome.trim(),
      descricao: form.descricao || undefined,
      gmd_esperado: Number(form.gmd_esperado),
      ciclo_recomendado: form.ciclo_recomendado ? Number(form.ciclo_recomendado) : undefined,
      baseada_em: form.baseada_em || undefined,
      pct_consumo_pv_ms: Number(form.pct_consumo_pv_ms),
      pct_concentrado: pctConc,
      pct_volumoso: pctVol,
      custo_manual_ativo: form.custo_manual_ativo,
      custo_manual_valor: form.custo_manual_ativo ? Number(form.custo_manual_valor) : null,
      custo_manual_unidade: form.custo_manual_ativo ? form.custo_manual_unidade : null,
      componentes: form.componentes.map(c => ({
        tipo: c.tipo,
        origem_ingrediente: c.origem_ingrediente,
        insumo_id: c.insumo_id,
        ingrediente_produtor_id: c.ingrediente_produtor_id,
        pct_participacao: Number(c.pct_participacao),
        preco_kg: Number(c.preco_kg),
        pct_ms_manual: c.pct_ms_manual,
      })),
    }
    const res = showEditar
      ? await atualizarDieta(showEditar, payload)
      : await criarDieta(payload)
    setSaving(false)
    if (res?.error) { setErro(res.error); return }
    setShowNova(false); setShowEditar(null); setForm(emptyForm())
  }

  const abrirEdicao = (id: string) => {
    const d = dietas.find(x => x.id === id)
    if (!d) return
    const comps: CompForm[] = (d.componentes ?? []).map(c => {
      const disp = c.origem_ingrediente === 'insumo_padrao'
        ? ingredientesDisponiveis.find(x => x.origem === 'insumo_padrao' && x.id === c.insumo_id)
        : ingredientesDisponiveis.find(x => x.origem === 'ingrediente_produtor' && x.id === c.ingrediente_produtor_id)
      return {
        _key: disp ? keyDisp(disp) : `${c.origem_ingrediente}:${c.insumo_id ?? c.ingrediente_produtor_id}`,
        _nome: disp?.nome ?? c.insumo?.nome ?? c.ingrediente_produtor?.nome ?? '—',
        _categoria: disp?.categoria ?? c.insumo?.categoria ?? c.ingrediente_produtor?.categoria ?? 'concentrado_energetico',
        _pct_ms_base: disp?.pct_ms ?? c.insumo?.pct_ms ?? c.ingrediente_produtor?.pct_ms ?? null,
        tipo: c.tipo,
        origem_ingrediente: c.origem_ingrediente,
        insumo_id: c.insumo_id ?? null,
        ingrediente_produtor_id: c.ingrediente_produtor_id ?? null,
        pct_participacao: c.pct_participacao,
        preco_kg: c.preco_kg,
        pct_ms_manual: c.pct_ms_manual,
      }
    })
    setForm({
      nome: d.nome,
      descricao: d.descricao ?? '',
      gmd_esperado: String(d.gmd_esperado),
      ciclo_recomendado: d.ciclo_recomendado != null ? String(d.ciclo_recomendado) : '',
      baseada_em: d.baseada_em ?? '',
      pct_consumo_pv_ms: String(d.pct_consumo_pv_ms),
      pct_concentrado: String(d.pct_concentrado),
      pct_volumoso: String(d.pct_volumoso),
      custo_manual_ativo: d.custo_manual_ativo ?? false,
      custo_manual_valor: d.custo_manual_valor != null ? String(d.custo_manual_valor) : '',
      custo_manual_unidade: d.custo_manual_unidade ?? 'ton',
      componentes: comps,
    })
    setShowEditar(id)
    setErro(null)
  }

  const fecharModal = () => {
    setShowNova(false); setShowEditar(null); setForm(emptyForm()); setErro(null)
  }

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="page">
      <PageHeader title="Dietas"
        subtitle={`${dietas.length} dieta${dietas.length !== 1 ? 's' : ''} cadastrada${dietas.length !== 1 ? 's' : ''}`}
        action={
          <button className="btn btn-primary" onClick={() => { setForm(emptyForm()); setErro(null); setShowNova(true) }}>
            + Nova dieta
          </button>
        } />

      <div className="tabs">
        <button className={`tab-btn${tab === 'minhas' ? ' active' : ''}`} onClick={() => setTab('minhas')}>
          Minhas dietas ({dietas.length})
        </button>
        <button className={`tab-btn${tab === 'base' ? ' active' : ''}`} onClick={() => setTab('base')}>
          Templates base ({dietasBase.length})
        </button>
      </div>

      {tab === 'minhas' && (
        loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
            <div className="spinner" style={{ width: 28, height: 28 }} />
          </div>
        ) : dietas.length === 0 ? (
          <div className="card">
            <EmptyState icon="◧" title="Nenhuma dieta cadastrada"
              desc="Crie uma dieta do zero ou use um template base como ponto de partida."
              action={<button className="btn btn-primary" onClick={() => { setForm(emptyForm()); setShowNova(true) }}>Criar dieta</button>} />
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
            {dietas.map(d => (
              <div key={d.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
                <div className="flex-between">
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{d.nome}</div>
                    <div style={{ fontSize: 11, color: '#9e9e9e', marginTop: 2 }}>
                      {d.ciclo_recomendado ? cicloLabel(d.ciclo_recomendado) : 'Todos os ciclos'}
                      {d.gmd_esperado ? ` · GMD est. ${d.gmd_esperado} kg/dia` : ''}
                    </div>
                  </div>
                  {d.baseada_em && <span style={{ fontSize: 10, background: '#e8f5e9', color: '#2e7d32', padding: '2px 8px', borderRadius: 20, border: '1px solid #a5d6a7', flexShrink: 0 }}>Template</span>}
                </div>
                <div style={{ display: 'flex', gap: 8, fontSize: 12, color: 'var(--gray-500)', flexWrap: 'wrap' }}>
                  <span>Consumo: <strong>{d.pct_consumo_pv_ms}% PV</strong></span>
                  <span>|</span>
                  <span>{d.pct_concentrado}% conc · {d.pct_volumoso}% vol</span>
                </div>
                {d.custo_kg_ms != null && (
                  <div style={{ fontSize: 12, color: '#2e7d32' }}>
                    Custo: <strong>{fmt(d.custo_kg_ms)}/kg MS</strong>
                  </div>
                )}
                {(d.componentes?.length ?? 0) > 0 && (
                  <div style={{ fontSize: 12, color: '#9e9e9e' }}>
                    {d.componentes!.length} ingrediente{d.componentes!.length !== 1 ? 's' : ''}
                  </div>
                )}
                {d.descricao && <div style={{ fontSize: 12, color: '#737370', lineHeight: 1.5 }}>{d.descricao}</div>}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: 'center' }}
                    onClick={() => setShowDetalhe(d.id)}>Ver detalhes</button>
                  <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: 'center' }}
                    onClick={() => abrirEdicao(d.id)}>Editar</button>
                  <button className="btn btn-ghost btn-sm" style={{ color: '#b91c1c' }}
                    onClick={() => { if (window.confirm(`Excluir "${d.nome}"?`)) excluirDieta(d.id) }}>Excluir</button>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {tab === 'base' && (
        dietasBase.length === 0 ? (
          <div className="card">
            <EmptyState icon="◧" title="Nenhum template disponível"
              desc="O administrador ainda não criou templates base." />
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
            {dietasBase.map(db => (
              <div key={db.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{db.nome}</div>
                  <div style={{ fontSize: 11, color: '#9e9e9e', marginTop: 2 }}>
                    {db.ciclo_recomendado ? cicloLabel(db.ciclo_recomendado) : 'Todos os ciclos'}
                    {db.gmd_esperado ? ` · GMD est. ${db.gmd_esperado} kg/dia` : ''}
                  </div>
                </div>
                {db.descricao && <div style={{ fontSize: 12, color: '#737370' }}>{db.descricao}</div>}
                {(db.ingredientes?.length ?? 0) > 0 && (
                  <div style={{ fontSize: 12, color: '#9e9e9e' }}>
                    {db.ingredientes!.length} ingrediente{db.ingredientes!.length !== 1 ? 's' : ''}
                  </div>
                )}
                <button className="btn btn-primary btn-sm" style={{ justifyContent: 'center' }}
                  onClick={() => { setForm(emptyForm()); carregarTemplate(db); setShowNova(true) }}>
                  Usar como base
                </button>
              </div>
            ))}
          </div>
        )
      )}

      {/* ─── MODAL CRIAR/EDITAR ─── */}
      <Modal open={showNova || !!showEditar} onClose={fecharModal}
        title={showEditar ? 'Editar dieta' : 'Nova dieta'} size="lg">
        <form onSubmit={handleSalvar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

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

          {/* Cabeçalho */}
          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">Nome da dieta</label>
              <input className="form-input" placeholder="Ex: Terneiros 200kg" value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">GMD esperado (kg/dia)</label>
              <input className="form-input" type="number" step="0.01" placeholder="1.4" value={form.gmd_esperado}
                onChange={e => setForm(f => ({ ...f, gmd_esperado: e.target.value }))} required />
            </div>
          </div>
          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">Ciclo recomendado</label>
              <select className="form-input" value={form.ciclo_recomendado}
                onChange={e => setForm(f => ({ ...f, ciclo_recomendado: e.target.value }))}>
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

          {/* Consumo e composição concentrado/volumoso */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>Consumo e composição</div>
            <div className="form-row-2" style={{ marginBottom: 10 }}>
              <div className="form-group">
                <label className="form-label">Consumo diário (% do peso vivo em MS)</label>
                <input className="form-input" type="number" step="0.01" placeholder="2.2"
                  value={form.pct_consumo_pv_ms}
                  onChange={e => setForm(f => ({ ...f, pct_consumo_pv_ms: e.target.value }))} required />
              </div>
              <div />
            </div>
            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label">% Concentrado</label>
                <input className="form-input" type="number" step="0.1" value={form.pct_concentrado}
                  onChange={e => setForm(f => ({
                    ...f,
                    pct_concentrado: e.target.value,
                    pct_volumoso: String(Math.max(0, 100 - (Number(e.target.value) || 0))),
                  }))} />
              </div>
              <div className="form-group">
                <label className="form-label">% Volumoso</label>
                <input className="form-input" type="number" step="0.1" value={form.pct_volumoso}
                  onChange={e => setForm(f => ({
                    ...f,
                    pct_volumoso: e.target.value,
                    pct_concentrado: String(Math.max(0, 100 - (Number(e.target.value) || 0))),
                  }))} />
              </div>
            </div>
            {Math.abs(pctConc + pctVol - 100) > 0.01 && (
              <div style={{ fontSize: 12, color: '#b91c1c', marginTop: 6 }}>
                Concentrado + Volumoso deve somar 100 (atual: {(pctConc + pctVol).toFixed(1)})
              </div>
            )}
          </div>

          {/* Custo manual (preço geral da ração) */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              <input type="checkbox" checked={form.custo_manual_ativo}
                onChange={e => setForm(f => ({ ...f, custo_manual_ativo: e.target.checked }))} />
              Usar custo manual (preço geral da ração)
            </label>
            <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4, marginBottom: form.custo_manual_ativo ? 10 : 0 }}>
              Use quando não tiver o % de Matéria Seca de cada ingrediente. O preço informado passa a valer para a ração inteira, no lugar do cálculo por ingrediente.
            </div>
            {form.custo_manual_ativo && (
              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Custo da ração</label>
                  <input className="form-input" type="number" step="0.01" placeholder="1036.84"
                    value={form.custo_manual_valor}
                    onChange={e => setForm(f => ({ ...f, custo_manual_valor: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Unidade</label>
                  <select className="form-input" value={form.custo_manual_unidade}
                    onChange={e => setForm(f => ({ ...f, custo_manual_unidade: e.target.value as 'kg' | 'ton' }))}>
                    <option value="kg">R$ por kg</option>
                    <option value="ton">R$ por tonelada</option>
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Seção Concentrado */}
          {pctConc > 0 && (
            <SecaoIngredientes
              titulo={`Concentrado (${pctConc}%)`}
              tipo="concentrado"
              componentes={form.componentes}
              dispPorCategoria={dispPorCategoria}
              dispPorKey={dispPorKey}
              soma={somaConc}
              custoKgMs={custoKgMsConc}
              onAdd={addComponente}
              onRemove={removeComponente}
              onUpdate={updateComponente}
            />
          )}

          {/* Seção Volumoso */}
          {pctVol > 0 && (
            <SecaoIngredientes
              titulo={`Volumoso (${pctVol}%)`}
              tipo="volumoso"
              componentes={form.componentes}
              dispPorCategoria={dispPorCategoria}
              dispPorKey={dispPorKey}
              soma={somaVol}
              custoKgMs={custoKgMsVol}
              onAdd={addComponente}
              onRemove={removeComponente}
              onUpdate={updateComponente}
            />
          )}

          {/* Simulação de custo */}
          {form.componentes.length > 0 && custoKgMsTotal != null && (
            <div style={{ background: 'var(--green-bg)', borderRadius: 8, padding: '12px 14px' }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#2e7d32', marginBottom: 8 }}>
                Simulação de custo — custo total: <strong>{fmt(custoKgMsTotal)}/kg MS</strong>
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <div style={{ flex: '1 1 120px', minWidth: 100 }}>
                  <label style={{ fontSize: 11, color: 'var(--gray-500)' }}>Peso médio (kg)</label>
                  <input className="form-input" type="number" value={simPeso}
                    onChange={e => setSimPeso(e.target.value)} style={{ marginTop: 2 }} />
                </div>
                <div style={{ flex: '1 1 120px', minWidth: 100 }}>
                  <label style={{ fontSize: 11, color: 'var(--gray-500)' }}>Qtd animais</label>
                  <input className="form-input" type="number" value={simQtd}
                    onChange={e => setSimQtd(e.target.value)} style={{ marginTop: 2 }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 13, flexWrap: 'wrap' }}>
                <div><span style={{ color: '#2e7d32' }}>Custo/dia (lote): </span><strong style={{ color: '#1b5e20' }}>{fmt(custoDiaSim)}</strong></div>
                <div><span style={{ color: '#2e7d32' }}>Por animal/dia: </span><strong style={{ color: '#1b5e20' }}>{Number(simQtd) > 0 ? fmt(custoDiaSim / Number(simQtd)) : '—'}</strong></div>
                <div><span style={{ color: '#2e7d32' }}>Custo 30d: </span><strong style={{ color: '#1b5e20' }}>{fmt(custoDiaSim * 30)}</strong></div>
              </div>
            </div>
          )}

          {erro && <div style={{ padding: 10, background: '#ffebee', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>{erro}</div>}

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={fecharModal}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !podeSalvar}>
              {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : (showEditar ? 'Salvar alterações' : 'Criar dieta')}
            </button>
          </div>
        </form>
      </Modal>

      {/* ─── MODAL DETALHE ─── */}
      <Modal open={!!showDetalhe} onClose={() => setShowDetalhe(null)}
        title={dietaDetalhe?.nome ?? ''} size="lg"
        subtitle={dietaDetalhe?.ciclo_recomendado ? cicloLabel(dietaDetalhe.ciclo_recomendado) : 'Todos os ciclos'}>
        {dietaDetalhe && (
          <ModalDetalhe dieta={dietaDetalhe} simPeso={simPeso} simQtd={simQtd}
            setSimPeso={setSimPeso} setSimQtd={setSimQtd} />
        )}
      </Modal>

      {/* Link Ingredientes (rodapé) */}
      <div style={{ marginTop: 24, fontSize: 12, color: 'var(--gray-500)' }}>
        Gerencie seus ingredientes personalizados e preços em <Link to="/ingredientes" style={{ color: '#2e7d32' }}>Ingredientes</Link>.
      </div>
    </div>
  )
}

// ─── Sub-componente: seção de ingredientes ────────────────────────────────────
// Layout responsivo: cada campo é um bloco flex com rótulo próprio. Em telas
// estreitas, os blocos quebram de linha automaticamente (flex-wrap) — sem
// depender de grid fixo nem de breakpoint específico.

function SecaoIngredientes({
  titulo, tipo, componentes, dispPorCategoria, dispPorKey, soma, custoKgMs,
  onAdd, onRemove, onUpdate,
}: {
  titulo: string
  tipo: 'concentrado' | 'volumoso'
  componentes: CompForm[]
  dispPorCategoria: Record<string, IngredienteDisponivel[]>
  dispPorKey: Record<string, IngredienteDisponivel>
  soma: number
  custoKgMs: number | null
  onAdd: (tipo: 'concentrado' | 'volumoso', ing: IngredienteDisponivel) => void
  onRemove: (idx: number) => void
  onUpdate: (idx: number, patch: Partial<CompForm>) => void
}) {
  const doTipo = componentes
    .map((c, idx) => ({ c, idx }))
    .filter(x => x.c.tipo === tipo)

  const jaAdicionados = new Set(doTipo.map(x => x.c._key))

  const fieldLabelStyle: React.CSSProperties = { fontSize: 10, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2, display: 'block' }

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {doTipo.map(({ c, idx }) => {
            const disp = dispPorKey[c._key]
            const pctMsBase = disp?.pct_ms ?? c._pct_ms_base
            const pctMsAtual = c.pct_ms_manual ?? pctMsBase
            const precisaManual = pctMsBase == null || pctMsBase <= 0
            return (
              <div key={idx} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', padding: '8px 8px 10px', background: 'var(--gray-50)', borderRadius: 8 }}>
                <div style={{ flex: '1 1 130px', minWidth: 110 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, overflowWrap: 'break-word' }}>{c._nome}</div>
                  <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>
                    {categoriaLabel[c._categoria] ?? c._categoria}
                    {c.origem_ingrediente === 'ingrediente_produtor' && ' · próprio'}
                  </div>
                </div>
                <div style={{ flex: '0 1 76px', minWidth: 68 }}>
                  <label style={fieldLabelStyle}>% Part.</label>
                  <input className="form-input" type="number" step="0.1"
                    value={c.pct_participacao || ''}
                    onChange={e => onUpdate(idx, { pct_participacao: Number(e.target.value) })}
                    style={{ fontSize: 13 }} placeholder="0" />
                </div>
                <div style={{ flex: '0 1 76px', minWidth: 68 }}>
                  <label style={fieldLabelStyle}>% MS</label>
                  <input className="form-input" type="number" step="0.1"
                    value={pctMsAtual ?? ''}
                    onChange={e => onUpdate(idx, { pct_ms_manual: e.target.value ? Number(e.target.value) : null })}
                    style={{ fontSize: 13, background: precisaManual ? '#fff8e1' : undefined }}
                    placeholder={precisaManual ? 'preencha' : ''} />
                </div>
                <div style={{ flex: '0 1 90px', minWidth: 78 }}>
                  <label style={fieldLabelStyle}>R$/kg MN</label>
                  <input className="form-input" type="number" step="0.0001"
                    value={c.preco_kg || ''}
                    onChange={e => onUpdate(idx, { preco_kg: Number(e.target.value) })}
                    style={{ fontSize: 13 }} placeholder="0" />
                </div>
                <button type="button" onClick={() => onRemove(idx)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9e9e9e', fontSize: 18, padding: '0 2px 6px', flexShrink: 0 }}>×</button>
              </div>
            )
          })}
        </div>
      )}

      {custoKgMs != null && doTipo.length > 0 && (
        <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 8, textAlign: 'right' }}>
          Custo do {tipo}: <strong style={{ color: '#2e7d32' }}>{fmt(custoKgMs)}/kg MS</strong>
        </div>
      )}

      <div style={{ marginTop: 10 }}>
        <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 4 }}>Adicionar ingrediente:</div>
        {Object.entries(dispPorCategoria).map(([cat, lista]) => {
          const disponiveis = lista.filter(i => !jaAdicionados.has(keyDisp(i)))
          if (disponiveis.length === 0) return null
          return (
            <div key={cat} style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 10, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>
                {categoriaLabel[cat] ?? cat}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {disponiveis.map(ing => (
                  <button key={keyDisp(ing)} type="button"
                    style={{ fontSize: 11, padding: '3px 8px', background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', color: 'var(--gray-600)' }}
                    onClick={() => onAdd(tipo, ing)}>
                    + {ing.nome}{ing.origem === 'ingrediente_produtor' ? ' *' : ''}
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

// ─── Sub-componente: modal detalhe ────────────────────────────────────────────

function ModalDetalhe({
  dieta, simPeso, simQtd, setSimPeso, setSimQtd,
}: {
  dieta: import('@/hooks/useDietas').Dieta
  simPeso: string; simQtd: string
  setSimPeso: (v: string) => void; setSimQtd: (v: string) => void
}) {
  const custoDia = useMemo(() =>
    calcularCustoDia(
      { pct_consumo_pv_ms: dieta.pct_consumo_pv_ms, custo_kg_ms: dieta.custo_kg_ms },
      Number(simPeso) || 0, Number(simQtd) || 0
    ), [dieta.pct_consumo_pv_ms, dieta.custo_kg_ms, simPeso, simQtd])

  const conc = (dieta.componentes ?? []).filter(c => c.tipo === 'concentrado')
  const vol = (dieta.componentes ?? []).filter(c => c.tipo === 'volumoso')

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ background: 'var(--green-bg)', borderRadius: 8, padding: '10px 14px', flex: 1, minWidth: 140 }}>
          <div style={{ fontSize: 11, color: 'var(--green)' }}>GMD esperado</div>
          <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--green-dark)' }}>{dieta.gmd_esperado} kg/dia</div>
        </div>
        <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '10px 14px', flex: 1, minWidth: 140 }}>
          <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>Consumo</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{dieta.pct_consumo_pv_ms}% PV em MS</div>
        </div>
        <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '10px 14px', flex: 1, minWidth: 140 }}>
          <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>Composição</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{dieta.pct_concentrado}% conc · {dieta.pct_volumoso}% vol</div>
        </div>
        {dieta.custo_kg_ms != null && (
          <div style={{ background: 'var(--green-bg)', borderRadius: 8, padding: '10px 14px', flex: 1, minWidth: 140 }}>
            <div style={{ fontSize: 11, color: 'var(--green)' }}>Custo/kg MS</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--green-dark)' }}>{fmt(dieta.custo_kg_ms)}</div>
          </div>
        )}
      </div>
      {dieta.descricao && <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>{dieta.descricao}</p>}

      {(['concentrado', 'volumoso'] as const).map(tp => {
        const lista = tp === 'concentrado' ? conc : vol
        const pct = tp === 'concentrado' ? dieta.pct_concentrado : dieta.pct_volumoso
        if (lista.length === 0 || pct === 0) return null
        return (
          <div key={tp} className="card" style={{ padding: 0 }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 500 }}>
              {tp === 'concentrado' ? 'Concentrado' : 'Volumoso'} ({pct}%)
            </div>
            <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table>
                <thead>
                  <tr><th>Ingrediente</th><th>Categoria</th><th>% Part.</th><th>% MS</th><th>R$/kg MN</th></tr>
                </thead>
                <tbody>
                  {lista.map((c, i) => {
                    const nome = c.insumo?.nome ?? c.ingrediente_produtor?.nome ?? '—'
                    const cat = c.insumo?.categoria ?? c.ingrediente_produtor?.categoria ?? '—'
                    const pctMs = c.pct_ms_manual ?? c.insumo?.pct_ms ?? c.ingrediente_produtor?.pct_ms ?? null
                    return (
                      <tr key={i}>
                        <td><strong>{nome}</strong>{c.origem_ingrediente === 'ingrediente_produtor' ? ' *' : ''}</td>
                        <td><span style={{ fontSize: 11, background: 'var(--gray-100)', padding: '2px 6px', borderRadius: 4 }}>{categoriaLabel[cat] ?? cat}</span></td>
                        <td>{c.pct_participacao}%</td>
                        <td>{pctMs != null ? `${pctMs}%` : '—'}</td>
                        <td>{fmt(c.preco_kg)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )
      })}

      <div style={{ background: 'var(--green-bg)', borderRadius: 8, padding: '12px 14px' }}>
        <div style={{ fontSize: 12, fontWeight: 500, color: '#2e7d32', marginBottom: 8 }}>Simulação de custo</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <div style={{ flex: '1 1 120px', minWidth: 100 }}>
            <label style={{ fontSize: 11, color: 'var(--gray-500)' }}>Peso médio (kg)</label>
            <input className="form-input" type="number" value={simPeso}
              onChange={e => setSimPeso(e.target.value)} style={{ marginTop: 2 }} />
          </div>
          <div style={{ flex: '1 1 120px', minWidth: 100 }}>
            <label style={{ fontSize: 11, color: 'var(--gray-500)' }}>Qtd animais</label>
            <input className="form-input" type="number" value={simQtd}
              onChange={e => setSimQtd(e.target.value)} style={{ marginTop: 2 }} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16, fontSize: 13, flexWrap: 'wrap' }}>
          <div><span style={{ color: '#2e7d32' }}>Custo/dia (lote): </span><strong style={{ color: '#1b5e20' }}>{fmt(custoDia)}</strong></div>
          <div><span style={{ color: '#2e7d32' }}>Por animal/dia: </span><strong style={{ color: '#1b5e20' }}>{Number(simQtd) > 0 ? fmt(custoDia / Number(simQtd)) : '—'}</strong></div>
          <div><span style={{ color: '#2e7d32' }}>Custo 30d: </span><strong style={{ color: '#1b5e20' }}>{fmt(custoDia * 30)}</strong></div>
        </div>
      </div>
    </div>
  )
}
