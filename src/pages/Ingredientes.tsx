import { useState, useMemo } from 'react'
import { useIngredientesProdutor } from '@/hooks/useIngredientesProdutor'
import { Modal, PageHeader, EmptyState } from '@/components/common/UI'
import { fmt } from '@/lib/calculations'

const CATEGORIAS = [
  { value: 'volumoso', label: 'Volumoso' },
  { value: 'concentrado_energetico', label: 'Concentrado Energético' },
  { value: 'concentrado_proteico', label: 'Concentrado Proteico' },
  { value: 'mineral_aditivo', label: 'Mineral / Aditivo' },
  { value: 'subproduto', label: 'Subproduto' },
]
const categoriaLabel = (v: string) => CATEGORIAS.find(c => c.value === v)?.label ?? v

interface FormIngrediente {
  nome: string
  categoria: string
  pct_ms: string
  preco_kg: string
}
const emptyForm = (): FormIngrediente => ({ nome: '', categoria: 'concentrado_energetico', pct_ms: '', preco_kg: '' })

export default function Ingredientes() {
  const {
    ingredientes, insumosPadrao, precos, loading,
    criarIngrediente, atualizarIngrediente, excluirIngrediente,
    upsertPrecoProdutor, removerPrecoProdutor,
  } = useIngredientesProdutor()

  const [tab, setTab] = useState<'meus' | 'precos'>('meus')
  const [showForm, setShowForm] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [form, setForm] = useState<FormIngrediente>(emptyForm())
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [precoEdit, setPrecoEdit] = useState<Record<string, string>>({})

  const precoPorInsumo = useMemo(() => {
    const m: Record<string, number> = {}
    precos.forEach(p => { m[p.insumo_id] = p.preco_kg })
    return m
  }, [precos])

  const abrirNovo = () => {
    setEditandoId(null); setForm(emptyForm()); setErro(null); setShowForm(true)
  }

  const abrirEdicao = (id: string) => {
    const ing = ingredientes.find(x => x.id === id)
    if (!ing) return
    setEditandoId(id)
    setForm({
      nome: ing.nome,
      categoria: ing.categoria,
      pct_ms: ing.pct_ms != null ? String(ing.pct_ms) : '',
      preco_kg: String(ing.preco_kg),
    })
    setErro(null); setShowForm(true)
  }

  const fecharForm = () => { setShowForm(false); setEditandoId(null); setForm(emptyForm()); setErro(null) }

  const salvar = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setErro(null)
    const payload = {
      nome: form.nome.trim(),
      categoria: form.categoria,
      pct_ms: form.pct_ms ? Number(form.pct_ms) : null,
      preco_kg: Number(form.preco_kg),
    }
    if (!payload.nome) { setErro('Nome obrigatório'); setSaving(false); return }
    if (payload.pct_ms != null && (payload.pct_ms <= 0 || payload.pct_ms > 100)) {
      setErro('% MS deve estar entre 0 e 100'); setSaving(false); return
    }
    if (isNaN(payload.preco_kg) || payload.preco_kg < 0) {
      setErro('Preço inválido'); setSaving(false); return
    }
    const res = editandoId
      ? await atualizarIngrediente(editandoId, payload)
      : await criarIngrediente(payload)
    setSaving(false)
    if (res?.error) { setErro(res.error); return }
    fecharForm()
  }

  const toggleAtivo = async (id: string, ativo: boolean) => {
    await atualizarIngrediente(id, { ativo: !ativo })
  }

  const excluir = async (id: string, nome: string) => {
    if (!window.confirm(`Excluir "${nome}"? Dietas que usam este ingrediente perderão a referência.`)) return
    await excluirIngrediente(id)
  }

  const salvarPreco = async (insumo_id: string) => {
    const valor = precoEdit[insumo_id]
    if (valor === undefined || valor === '') return
    const num = Number(valor)
    if (isNaN(num) || num < 0) return
    await upsertPrecoProdutor(insumo_id, num)
    setPrecoEdit(pe => { const c = { ...pe }; delete c[insumo_id]; return c })
  }

  const limparPreco = async (insumo_id: string) => {
    await removerPrecoProdutor(insumo_id)
  }

  const ingredientesAgrupados = useMemo(() => {
    const g: Record<string, typeof ingredientes> = {}
    ingredientes.forEach(i => { (g[i.categoria] ??= []).push(i) })
    return g
  }, [ingredientes])

  const insumosAgrupados = useMemo(() => {
    const g: Record<string, typeof insumosPadrao> = {}
    insumosPadrao.forEach(i => { (g[i.categoria] ??= []).push(i) })
    return g
  }, [insumosPadrao])

  return (
    <div className="page">
      <PageHeader title="Ingredientes"
        subtitle="Gerencie ingredientes personalizados e preços dos ingredientes da base"
        action={tab === 'meus' ? (
          <button className="btn btn-primary" onClick={abrirNovo}>+ Novo ingrediente</button>
        ) : null} />

      <div className="tabs">
        <button className={`tab-btn${tab === 'meus' ? ' active' : ''}`} onClick={() => setTab('meus')}>
          Meus ingredientes ({ingredientes.length})
        </button>
        <button className={`tab-btn${tab === 'precos' ? ' active' : ''}`} onClick={() => setTab('precos')}>
          Meus preços da base ({precos.length})
        </button>
      </div>

      {loading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div className="spinner" style={{ width: 28, height: 28 }} />
        </div>
      )}

      {!loading && tab === 'meus' && (
        ingredientes.length === 0 ? (
          <div className="card">
            <EmptyState
              icon="◆"
              title="Nenhum ingrediente personalizado"
              desc="Cadastre ingredientes que não estão na base padrão para usar nas suas dietas."
              action={<button className="btn btn-primary" onClick={abrirNovo}>Cadastrar ingrediente</button>} />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {Object.entries(ingredientesAgrupados).map(([cat, lista]) => (
              <div key={cat} className="card" style={{ padding: 0 }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 500, color: 'var(--gray-600)' }}>
                  {categoriaLabel(cat)}
                </div>
                <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th>% MS</th>
                        <th>Preço (R$/kg)</th>
                        <th>Status</th>
                        <th style={{ width: 180 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lista.map(ing => (
                        <tr key={ing.id}>
                          <td><strong>{ing.nome}</strong></td>
                          <td>{ing.pct_ms != null ? `${ing.pct_ms}%` : <span style={{ color: '#b91c1c' }}>não informado</span>}</td>
                          <td>{fmt(ing.preco_kg)}</td>
                          <td>
                            <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10,
                              background: ing.ativo ? '#e8f5e9' : '#f5f5f5',
                              color: ing.ativo ? '#2e7d32' : '#9e9e9e' }}>
                              {ing.ativo ? 'Ativo' : 'Inativo'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-ghost btn-sm" onClick={() => abrirEdicao(ing.id)}>Editar</button>
                              <button className="btn btn-ghost btn-sm" onClick={() => toggleAtivo(ing.id, ing.ativo)}>
                                {ing.ativo ? 'Desativar' : 'Ativar'}
                              </button>
                              <button className="btn btn-ghost btn-sm" style={{ color: '#b91c1c' }}
                                onClick={() => excluir(ing.id, ing.nome)}>Excluir</button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {!loading && tab === 'precos' && (
        insumosPadrao.length === 0 ? (
          <div className="card">
            <EmptyState icon="◆" title="Nenhum ingrediente na base"
              desc="O administrador ainda não cadastrou ingredientes na base padrão." />
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ padding: '10px 14px', background: 'var(--gray-50)', borderRadius: 8, fontSize: 12, color: 'var(--gray-500)' }}>
              Defina seu preço para cada ingrediente da base. O preço aqui salvo é usado como referência ao criar dietas. Deixe em branco para não ter preço próprio.
            </div>
            {Object.entries(insumosAgrupados).map(([cat, lista]) => (
              <div key={cat} className="card" style={{ padding: 0 }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 13, fontWeight: 500, color: 'var(--gray-600)' }}>
                  {categoriaLabel(cat)}
                </div>
                <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
                  <table>
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th>% MS (base)</th>
                        <th>Meu preço (R$/kg)</th>
                        <th style={{ width: 200 }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lista.map(ins => {
                        const precoAtual = precoPorInsumo[ins.id]
                        const emEdicao = precoEdit[ins.id]
                        const valorInput = emEdicao !== undefined ? emEdicao : (precoAtual != null ? String(precoAtual) : '')
                        return (
                          <tr key={ins.id}>
                            <td><strong>{ins.nome}</strong></td>
                            <td>{ins.pct_ms != null ? `${ins.pct_ms}%` : <span style={{ color: '#9e9e9e' }}>—</span>}</td>
                            <td>
                              <input className="form-input" type="number" step="0.0001"
                                placeholder="Sem preço"
                                value={valorInput}
                                onChange={e => setPrecoEdit(pe => ({ ...pe, [ins.id]: e.target.value }))}
                                style={{ maxWidth: 140, fontSize: 13 }} />
                            </td>
                            <td>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-ghost btn-sm" onClick={() => salvarPreco(ins.id)}
                                  disabled={emEdicao === undefined || emEdicao === ''}>Salvar</button>
                                {precoAtual != null && (
                                  <button className="btn btn-ghost btn-sm" style={{ color: '#b91c1c' }}
                                    onClick={() => limparPreco(ins.id)}>Remover</button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      <Modal open={showForm} onClose={fecharForm}
        title={editandoId ? 'Editar ingrediente' : 'Novo ingrediente'}>
        <form onSubmit={salvar} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Nome</label>
            <input className="form-input" placeholder="Ex: Farelo de milho"
              value={form.nome}
              onChange={e => setForm(f => ({ ...f, nome: e.target.value }))}
              required />
          </div>
          <div className="form-group">
            <label className="form-label">Categoria</label>
            <select className="form-input" value={form.categoria}
              onChange={e => setForm(f => ({ ...f, categoria: e.target.value }))}>
              {CATEGORIAS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>
          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">% Matéria Seca (opcional)</label>
              <input className="form-input" type="number" step="0.01"
                placeholder="Ex: 88"
                value={form.pct_ms}
                onChange={e => setForm(f => ({ ...f, pct_ms: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Preço (R$/kg)</label>
              <input className="form-input" type="number" step="0.0001"
                placeholder="Ex: 0.85"
                value={form.preco_kg}
                onChange={e => setForm(f => ({ ...f, preco_kg: e.target.value }))}
                required />
            </div>
          </div>
          {erro && <div style={{ padding: 10, background: '#ffebee', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>{erro}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={fecharForm}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : (editandoId ? 'Salvar alterações' : 'Cadastrar')}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
