import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader, EmptyState } from '@/components/common/UI'
import { useDadosFornecedor } from '@/portal/useDadosFornecedor'
import type { DietaFornecedor, DietaPublicada, ItemDietaFornecedor } from '@/core/parceiros'

interface Form {
  nome: string; descricao: string; ciclo_recomendado: string; gmd_esperado: string; gmd_esperado_concentrado: string
  pct_consumo_pv_ms: string; pct_concentrado: string; pct_volumoso: string; itens: ItemDietaFornecedor[]
}
const vazio = (): Form => ({
  nome: '', descricao: '', ciclo_recomendado: '', gmd_esperado: '', gmd_esperado_concentrado: '',
  pct_consumo_pv_ms: '2.2', pct_concentrado: '100', pct_volumoso: '0', itens: [],
})
const CICLOS: Array<[string, string]> = [['', 'Todos os ciclos'], ['1', 'Adaptação'], ['2', 'Crescimento'], ['3', 'Engorda'], ['4', 'Acabamento']]

// Dietas do fornecedor: rascunho e publicação. Os clientes veem só a versão
// publicada; mudanças salvas depois ficam no rascunho até publicar de novo.
export default function DietasFornecedor() {
  const { fornecedor, produtos, loading } = useDadosFornecedor()
  const [dietas, setDietas] = useState<DietaFornecedor[]>([])
  const [uso, setUso] = useState<Record<string, number>>({})
  const [selecionada, setSelecionada] = useState<string | 'nova' | null>(null)
  const [form, setForm] = useState<Form>(vazio())
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!fornecedor) return
    const [{ data }, { data: u }] = await Promise.all([
      supabase.from('fornecedor_dietas').select('*, itens:fornecedor_dieta_itens(id, produto_id, tipo, pct_participacao)').eq('fornecedor_id', fornecedor.id).order('nome'),
      supabase.rpc('uso_dietas_fornecedor', { fid: fornecedor.id }),
    ])
    setDietas((data ?? []) as DietaFornecedor[])
    setUso(Object.fromEntries(((u ?? []) as Array<{ fornecedor_dieta_id: string; clientes: number }>).map(x => [x.fornecedor_dieta_id, Number(x.clientes)])))
  }, [fornecedor])
  useEffect(() => { carregar() }, [carregar])

  const abrir = (d: DietaFornecedor | 'nova') => {
    setErro(null); setOk(null)
    if (d === 'nova') { setSelecionada('nova'); setForm(vazio()); return }
    setSelecionada(d.id)
    setForm({
      nome: d.nome, descricao: d.descricao ?? '', ciclo_recomendado: d.ciclo_recomendado != null ? String(d.ciclo_recomendado) : '',
      gmd_esperado: d.gmd_esperado != null ? String(d.gmd_esperado) : '',
      gmd_esperado_concentrado: d.gmd_esperado_concentrado != null ? String(d.gmd_esperado_concentrado) : '',
      pct_consumo_pv_ms: String(d.pct_consumo_pv_ms), pct_concentrado: String(d.pct_concentrado), pct_volumoso: String(d.pct_volumoso),
      itens: (d.itens ?? []).map(i => ({ produto_id: i.produto_id, tipo: i.tipo, pct_participacao: Number(i.pct_participacao) })),
    })
  }

  const n = (s: string) => s.trim() === '' ? null : Number(s.replace(',', '.'))
  const pctC = n(form.pct_concentrado) ?? 0
  const pctV = n(form.pct_volumoso) ?? 0
  const soma = (tipo: 'concentrado' | 'volumoso') => form.itens.filter(i => i.tipo === tipo).reduce((s, i) => s + (Number(i.pct_participacao) || 0), 0)

  const validar = (publicar: boolean): string | null => {
    if (!form.nome.trim()) return 'Informe o nome'
    if (!publicar) return null
    const pv = n(form.pct_consumo_pv_ms)
    if (!pv || pv <= 0 || pv > 10) return '% do PV em MS deve ser maior que 0 e até 10'
    if (Math.abs(pctC + pctV - 100) > 0.01) return '% concentrado + % volumoso deve somar 100'
    if (!((n(form.gmd_esperado) ?? 0) > 0)) return 'Informe o GMD esperado'
    if (pctC > 0 && Math.abs(soma('concentrado') - 100) > 0.01) return `Os produtos do concentrado devem somar 100% (atual ${soma('concentrado').toFixed(2)})`
    if (pctV > 0 && Math.abs(soma('volumoso') - 100) > 0.01) return `Os produtos do volumoso devem somar 100% (atual ${soma('volumoso').toFixed(2)})`
    if (form.itens.some(i => !i.produto_id || !(i.pct_participacao > 0))) return 'Cada linha precisa de produto e % maior que 0'
    return null
  }

  const salvar = async (publicar: boolean) => {
    if (!fornecedor) return
    const v = validar(publicar)
    if (v) { setErro(v); return }
    setSalvando(true); setErro(null); setOk(null)
    const atual = dietas.find(d => d.id === selecionada)
    const campos = {
      fornecedor_id: fornecedor.id, nome: form.nome.trim(), descricao: form.descricao.trim() || null,
      ciclo_recomendado: n(form.ciclo_recomendado), gmd_esperado: n(form.gmd_esperado), gmd_esperado_concentrado: n(form.gmd_esperado_concentrado),
      pct_consumo_pv_ms: n(form.pct_consumo_pv_ms) ?? 2.2, pct_concentrado: pctC, pct_volumoso: pctV,
    }
    let id = selecionada !== 'nova' ? selecionada : null
    if (!id) {
      const { data, error } = await supabase.from('fornecedor_dietas').insert(campos).select('id').single()
      if (error || !data) { setSalvando(false); setErro(error?.message ?? 'Erro ao salvar'); return }
      id = data.id as string
    } else {
      const { error } = await supabase.from('fornecedor_dietas').update({ ...campos, alterada_apos_publicar: !!atual?.publicado && !publicar }).eq('id', id)
      if (error) { setSalvando(false); setErro(error.message); return }
    }
    const { error: eDel } = await supabase.from('fornecedor_dieta_itens').delete().eq('dieta_id', id)
    if (eDel) { setSalvando(false); setErro(eDel.message); return }
    const itens = form.itens.filter(i => i.produto_id && (i.tipo === 'concentrado' ? pctC > 0 : pctV > 0))
    if (itens.length > 0) {
      const { error } = await supabase.from('fornecedor_dieta_itens').insert(itens.map(i => ({ dieta_id: id, produto_id: i.produto_id, tipo: i.tipo, pct_participacao: i.pct_participacao })))
      if (error) { setSalvando(false); setErro(error.message); return }
    }
    if (publicar) {
      const publicado: DietaPublicada = {
        nome: campos.nome, descricao: campos.descricao, ciclo_recomendado: campos.ciclo_recomendado,
        gmd_esperado: campos.gmd_esperado, gmd_esperado_concentrado: campos.gmd_esperado_concentrado,
        pct_consumo_pv_ms: campos.pct_consumo_pv_ms, pct_concentrado: pctC, pct_volumoso: pctV,
        itens: itens.map(i => {
          const p = produtos.find(x => x.id === i.produto_id)!
          return { ...i, produto_nome: p.nome, pct_ms: p.pct_ms, categoria: p.categoria }
        }),
      }
      const { error } = await supabase.from('fornecedor_dietas').update({ publicado, publicada_em: new Date().toISOString(), alterada_apos_publicar: false }).eq('id', id)
      if (error) { setSalvando(false); setErro(error.message); return }
    }
    setSalvando(false)
    setOk(publicar ? 'Dieta publicada. Os clientes já veem esta versão.' : 'Rascunho salvo. Os clientes continuam vendo a última versão publicada.')
    setSelecionada(id)
    carregar()
  }

  const despublicar = async () => {
    if (!selecionada || selecionada === 'nova') return
    if (!window.confirm('Retirar a dieta dos clientes? Quem já criou uma dieta a partir dela continua com a sua cópia.')) return
    const { error } = await supabase.from('fornecedor_dietas').update({ publicado: null, publicada_em: null, alterada_apos_publicar: false }).eq('id', selecionada)
    if (error) { setErro(error.message); return }
    carregar()
  }

  const excluir = async () => {
    if (!selecionada || selecionada === 'nova') return
    if (!window.confirm('Excluir a dieta? As dietas dos clientes criadas a partir dela continuam existindo.')) return
    const { error } = await supabase.from('fornecedor_dietas').delete().eq('id', selecionada)
    if (error) { setErro(error.message); return }
    setSelecionada(null); carregar()
  }

  const setItem = (idx: number, patch: Partial<ItemDietaFornecedor>) =>
    setForm(f => ({ ...f, itens: f.itens.map((it, i) => i === idx ? { ...it, ...patch } : it) }))

  if (loading) return <div className="page"><div className="spinner" style={{ width: 28, height: 28, margin: '48px auto' }} /></div>
  const atual = dietas.find(d => d.id === selecionada)

  const secao = (tipo: 'concentrado' | 'volumoso', pct: number) => pct > 0 && (
    <div style={{ marginBottom: 16 }}>
      <div className="flex-between" style={{ marginBottom: 6 }}>
        <strong style={{ fontSize: 13 }}>{tipo === 'concentrado' ? 'Concentrado' : 'Volumoso'} ({pct}% da MS)</strong>
        <span style={{ fontSize: 12, color: Math.abs(soma(tipo) - 100) > 0.01 ? 'var(--red)' : 'var(--green-dark)' }}>Soma {soma(tipo).toFixed(2).replace('.', ',')}%</span>
      </div>
      {form.itens.map((it, idx) => it.tipo !== tipo ? null : (
        <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 36px', gap: 8, marginBottom: 6 }}>
          <select className="form-input" value={it.produto_id} onChange={e => setItem(idx, { produto_id: e.target.value })}>
            <option value="">Produto do catálogo</option>
            {produtos.map(p => <option key={p.id} value={p.id}>{p.nome}{p.pct_ms != null ? ` (${p.pct_ms}% MS)` : ''}</option>)}
          </select>
          <input className="form-input" type="number" value={it.pct_participacao || ''} placeholder="%" onChange={e => setItem(idx, { pct_participacao: Number(e.target.value) })} />
          <button type="button" className="btn btn-ghost btn-icon" aria-label="Remover" onClick={() => setForm(f => ({ ...f, itens: f.itens.filter((_, i) => i !== idx) }))}>×</button>
        </div>
      ))}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setForm(f => ({ ...f, itens: [...f.itens, { produto_id: '', tipo, pct_participacao: 0 }] }))}>+ Produto</button>
    </div>
  )

  return (
    <div className="page">
      <PageHeader title="Dietas" subtitle="Crie, atualize e publique as dietas que os clientes veem"
        action={<button className="btn btn-primary" onClick={() => abrir('nova')}>+ Nova dieta</button>} />
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(240px, 320px) 1fr', gap: 16, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {dietas.length === 0 && <div className="card"><EmptyState icon="◧" title="Nenhuma dieta" desc="Monte dietas com os produtos do catálogo." /></div>}
          {dietas.map(d => (
            <button key={d.id} type="button" onClick={() => abrir(d)} className="card"
              style={{ textAlign: 'left', cursor: 'pointer', padding: 14, fontFamily: 'inherit', borderColor: selecionada === d.id ? 'var(--green)' : undefined }}>
              <div className="flex-between" style={{ gap: 8 }}>
                <strong style={{ fontSize: 13 }}>{d.nome}</strong>
                <span className={`badge ${d.publicado ? (d.alterada_apos_publicar ? 'badge-amber' : 'badge-green') : 'badge-gray'}`}>
                  {d.publicado ? (d.alterada_apos_publicar ? 'Rascunho novo' : 'Publicada') : 'Rascunho'}
                </span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
                {(d.itens ?? []).length} produtos · usada por {uso[d.id] ?? 0} cliente{(uso[d.id] ?? 0) !== 1 ? 's' : ''}
              </div>
            </button>
          ))}
        </div>

        {selecionada ? (
          <div className="card">
            <div className="form-row-2">
              <div className="field"><label>Nome da dieta</label><input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
              <div className="field"><label>Ciclo recomendado</label>
                <select value={form.ciclo_recomendado} onChange={e => setForm({ ...form, ciclo_recomendado: e.target.value })}>
                  {CICLOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row-3">
              <div className="field"><label>GMD esperado (kg/dia)</label><input type="number" value={form.gmd_esperado} onChange={e => setForm({ ...form, gmd_esperado: e.target.value })} /></div>
              <div className="field"><label>GMD do concentrado (opcional)</label><input type="number" value={form.gmd_esperado_concentrado} onChange={e => setForm({ ...form, gmd_esperado_concentrado: e.target.value })} /></div>
              <div className="field"><label>Consumo (% PV em MS)</label><input type="number" value={form.pct_consumo_pv_ms} onChange={e => setForm({ ...form, pct_consumo_pv_ms: e.target.value })} /></div>
            </div>
            <div className="form-row-2">
              <div className="field"><label>% concentrado</label><input type="number" value={form.pct_concentrado} onChange={e => setForm({ ...form, pct_concentrado: e.target.value, pct_volumoso: String(Math.max(0, 100 - (Number(e.target.value) || 0))) })} /></div>
              <div className="field"><label>% volumoso</label><input type="number" value={form.pct_volumoso} onChange={e => setForm({ ...form, pct_volumoso: e.target.value, pct_concentrado: String(Math.max(0, 100 - (Number(e.target.value) || 0))) })} /></div>
            </div>
            <div className="field"><label>Descrição</label><textarea value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} placeholder="Indicação, níveis nutricionais, orientações de manejo" /></div>
            {produtos.length === 0 && <div style={{ fontSize: 13, color: 'var(--amber)', marginBottom: 12 }}>Cadastre produtos em Produtos para montar a composição.</div>}
            {secao('concentrado', pctC)}
            {secao('volumoso', pctV)}
            {erro && <div className="field-error" style={{ marginBottom: 12 }}>{erro}</div>}
            {ok && <div style={{ color: 'var(--green-dark)', fontSize: 13, marginBottom: 12 }}>{ok}</div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {atual && <button className="btn btn-ghost" style={{ marginRight: 'auto', color: 'var(--red)' }} onClick={excluir}>Excluir</button>}
              {atual?.publicado && <button className="btn btn-ghost" onClick={despublicar}>Retirar dos clientes</button>}
              <button className="btn btn-secondary" disabled={salvando} onClick={() => salvar(false)}>Salvar rascunho</button>
              <button className="btn btn-primary" disabled={salvando} onClick={() => salvar(true)}>{salvando ? 'Salvando...' : 'Publicar'}</button>
            </div>
          </div>
        ) : (
          <div className="card"><EmptyState icon="◧" title="Escolha uma dieta" desc="Ou crie uma nova com os produtos do catálogo." /></div>
        )}
      </div>
    </div>
  )
}
