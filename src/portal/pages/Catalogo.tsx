import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal, PageHeader, EmptyState } from '@/components/common/UI'
import { useDadosFornecedor } from '@/portal/useDadosFornecedor'
import {
  ROTULO_CATEGORIA, CAMPOS_NUTRICIONAIS, fmtKg, custoKgMsDieta, pctMsMistura,
  type CategoriaProduto, type ProdutoFornecedor, type ItemDieta,
} from '@/core/parceiros'

const CATEGORIAS = Object.keys(ROTULO_CATEGORIA) as CategoriaProduto[]
const CICLOS: Array<[string, string]> = [['', 'Todos os ciclos'], ['1', 'Adaptação'], ['2', 'Crescimento'], ['3', 'Engorda'], ['4', 'Acabamento']]

interface InsumoPadrao { id: string; nome: string; categoria: string; pct_ms: number | null; preco_referencia: number | null }
interface LinhaItem { ref: string; nome: string; tipo: 'concentrado' | 'volumoso'; pct: string; ms: string; preco: string }

const vazio = {
  nome: '', categoria: 'racao' as CategoriaProduto, tipo_dieta: 'concentrado' as 'concentrado' | 'volumoso',
  embalagem: '', peso_embalagem_kg: '', pedido_minimo_kg: '', prazo_entrega_dias: '', regiao: '', pct_ms: '',
  visivel: true, dias_alerta: '7', kg_minimo_alerta: '', preco_kg: '',
  modo_dieta: 'receita' as 'pronta' | 'receita', descricao: '', ciclo_recomendado: '', gmd_esperado: '', gmd_esperado_concentrado: '',
  pct_consumo_pv_ms: '2.2', pct_concentrado: '100', pct_volumoso: '0',
  nutricional: {} as Record<string, string>,
}

const fmtReais = (v: number | null) => v == null ? '—' : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 4 })
const txt = (v: number | null | undefined) => v != null ? String(v) : ''

// Catálogo do fornecedor: produtos (o que os clientes veem e podem pedir) e
// dietas. Dieta pronta é vendida como produto (concentrado misturado);
// dieta receita é só a fórmula, com os produtos pedidos um a um. A
// composição aceita produtos do catálogo, insumos padrão do Confina+ e
// ingredientes livres; preços e custo ficam só para a equipe.
export default function Catalogo() {
  const { fornecedor, produtos, precos, loading, recarregar } = useDadosFornecedor()
  const [filtro, setFiltro] = useState<CategoriaProduto | 'todos'>('todos')
  const [editando, setEditando] = useState<ProdutoFornecedor | 'novo' | null>(null)
  const [form, setForm] = useState(vazio)
  const [itens, setItens] = useState<LinhaItem[]>([])
  const [insumos, setInsumos] = useState<InsumoPadrao[]>([])
  const [itensPorDieta, setItensPorDieta] = useState<Record<string, ItemDieta[]>>({})
  const [uso, setUso] = useState<Record<string, number>>({})
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const carregarDietas = useCallback(async () => {
    if (!fornecedor) return
    const ids = produtos.filter(p => p.categoria === 'dieta').map(p => p.id)
    const [{ data: its }, { data: u }] = await Promise.all([
      ids.length ? supabase.from('fornecedor_produto_itens').select('*').in('dieta_id', ids).order('ordem') : Promise.resolve({ data: [] }),
      supabase.rpc('uso_dietas_fornecedor', { fid: fornecedor.id }),
    ])
    const mapa: Record<string, ItemDieta[]> = {}
    for (const i of (its ?? []) as Array<ItemDieta & { dieta_id: string }>) (mapa[i.dieta_id] ??= []).push(i)
    setItensPorDieta(mapa)
    setUso(Object.fromEntries(((u ?? []) as Array<{ fornecedor_dieta_id: string; clientes: number }>).map(x => [x.fornecedor_dieta_id, Number(x.clientes)])))
  }, [fornecedor, produtos])
  useEffect(() => { carregarDietas() }, [carregarDietas])
  useEffect(() => {
    supabase.from('insumos_padrao').select('id, nome, categoria, pct_ms, preco_referencia').eq('ativo', true).order('nome')
      .then(({ data }) => setInsumos((data ?? []) as InsumoPadrao[]))
  }, [])

  const produtoPorId = useMemo(() => new Map(produtos.map(p => [p.id, p])), [produtos])
  const insumoPorId = useMemo(() => new Map(insumos.map(i => [i.id, i])), [insumos])
  const ingredientesCatalogo = produtos.filter(p => p.categoria !== 'dieta')

  const n = (s: string) => s.trim() === '' ? null : Number(s.replace(',', '.'))

  const paraItem = (l: LinhaItem, ordem: number): ItemDieta => {
    const [origem, id] = l.ref.split(':') as ['produto' | 'insumo_padrao' | 'livre', string]
    return {
      origem, produto_id: origem === 'produto' ? id : null, insumo_id: origem === 'insumo_padrao' ? id : null,
      nome: origem === 'livre' ? l.nome.trim() : null, tipo: l.tipo,
      pct_participacao: n(l.pct) ?? 0, pct_ms: n(l.ms), preco_kg: n(l.preco), ordem,
    }
  }
  const itensAtuais = itens.map(paraItem)
  const pctC = n(form.pct_concentrado) ?? 0
  const pctV = n(form.pct_volumoso) ?? 0
  const custo = custoKgMsDieta(pctC, pctV, itensAtuais)
  const soma = (tipo: 'concentrado' | 'volumoso') => itensAtuais.filter(i => i.tipo === tipo).reduce((s, i) => s + i.pct_participacao, 0)

  const abrir = (p: ProdutoFornecedor | 'novo') => {
    setErro(null)
    setEditando(p)
    if (p === 'novo') { setForm(vazio); setItens([]); return }
    setForm({
      nome: p.nome, categoria: p.categoria, tipo_dieta: p.tipo_dieta, embalagem: p.embalagem ?? '',
      peso_embalagem_kg: txt(p.peso_embalagem_kg), pedido_minimo_kg: txt(p.pedido_minimo_kg),
      prazo_entrega_dias: txt(p.prazo_entrega_dias), regiao: p.regiao ?? '', pct_ms: txt(p.pct_ms),
      visivel: p.visivel, dias_alerta: String(p.dias_alerta), kg_minimo_alerta: txt(p.kg_minimo_alerta), preco_kg: txt(precos[p.id]),
      modo_dieta: p.modo_dieta ?? 'receita', descricao: p.descricao ?? '', ciclo_recomendado: txt(p.ciclo_recomendado),
      gmd_esperado: txt(p.gmd_esperado), gmd_esperado_concentrado: txt(p.gmd_esperado_concentrado),
      pct_consumo_pv_ms: txt(p.pct_consumo_pv_ms ?? 2.2), pct_concentrado: txt(p.pct_concentrado ?? 100), pct_volumoso: txt(p.pct_volumoso ?? 0),
      nutricional: Object.fromEntries(Object.entries(p.nutricional ?? {}).map(([k, v]) => [k, v == null ? '' : String(v)])),
    })
    setItens((itensPorDieta[p.id] ?? []).map(i => ({
      ref: i.origem === 'produto' ? `produto:${i.produto_id}` : i.origem === 'insumo_padrao' ? `insumo_padrao:${i.insumo_id}` : 'livre:',
      nome: i.nome ?? '', tipo: i.tipo, pct: txt(i.pct_participacao), ms: txt(i.pct_ms), preco: txt(i.preco_kg),
    })))
  }

  const escolherIngrediente = (idx: number, ref: string) => {
    setItens(ls => ls.map((l, i) => {
      if (i !== idx) return l
      const [origem, id] = ref.split(':')
      if (origem === 'produto') { const p = produtoPorId.get(id); return { ...l, ref, ms: txt(p?.pct_ms), preco: l.preco || txt(precos[id]), nome: '' } }
      if (origem === 'insumo_padrao') { const ins = insumoPorId.get(id); return { ...l, ref, ms: txt(ins?.pct_ms), preco: l.preco || txt(ins?.preco_referencia), nome: '' } }
      return { ...l, ref }
    }))
  }
  const setItem = (idx: number, patch: Partial<LinhaItem>) => setItens(ls => ls.map((l, i) => i === idx ? { ...l, ...patch } : l))

  const validarDieta = (): string | null => {
    const pv = n(form.pct_consumo_pv_ms)
    if (!pv || pv <= 0 || pv > 10) return 'Consumo (% PV em MS) deve ser maior que 0 e até 10'
    if (Math.abs(pctC + pctV - 100) > 0.01) return '% concentrado + % volumoso deve somar 100'
    if (!((n(form.gmd_esperado) ?? 0) > 0)) return 'Informe o GMD esperado'
    for (const tipo of ['concentrado', 'volumoso'] as const) {
      const pct = tipo === 'concentrado' ? pctC : pctV
      if (pct > 0 && Math.abs(soma(tipo) - 100) > 0.01) return `Os ingredientes do ${tipo} devem somar 100% (atual ${soma(tipo).toFixed(2).replace('.', ',')})`
    }
    for (const i of itensAtuais) {
      if (i.origem === 'livre' && !i.nome) return 'Dê um nome ao ingrediente livre'
      if ((i.origem === 'produto' && !i.produto_id) || (i.origem === 'insumo_padrao' && !i.insumo_id)) return 'Escolha o ingrediente de cada linha'
      if (!(i.pct_participacao > 0)) return 'Cada ingrediente precisa de % maior que 0'
      if (!(Number(i.pct_ms) > 0 && Number(i.pct_ms) <= 100)) return 'Informe o % MS de cada ingrediente (entre 0 e 100)'
    }
    if (form.modo_dieta === 'pronta' && itensAtuais.length === 0) return 'Informe a composição da ração pronta'
    return null
  }

  const salvar = async () => {
    if (!fornecedor) return
    if (!form.nome.trim()) { setErro('Informe o nome'); return }
    const ehDieta = form.categoria === 'dieta'
    const pronta = ehDieta && form.modo_dieta === 'pronta'
    if (ehDieta) { const v = validarDieta(); if (v) { setErro(v); return } }
    const ladoVendido: 'concentrado' | 'volumoso' = pctC > 0 ? 'concentrado' : 'volumoso'
    const pctMs = ehDieta ? (pronta ? pctMsMistura(itensAtuais, ladoVendido) : null) : n(form.pct_ms)
    if (!ehDieta && pctMs != null && !(pctMs > 0 && pctMs <= 100)) { setErro('% MS deve estar entre 0 e 100'); return }
    const diasAlerta = n(form.dias_alerta)
    if (!ehDieta || pronta) { if (diasAlerta == null || diasAlerta < 0) { setErro('Informe os dias de alerta'); return } }
    const precoKg = !ehDieta || pronta ? n(form.preco_kg) : null
    if (precoKg != null && !(precoKg >= 0)) { setErro('Preço inválido'); return }
    const nutricional: Record<string, number | string> = {}
    for (const [k] of CAMPOS_NUTRICIONAIS) { const v = n(form.nutricional[k] ?? ''); if (v != null) nutricional[k] = v }
    if ((form.nutricional.ionoforo ?? '').trim()) nutricional.ionoforo = form.nutricional.ionoforo.trim()
    const vende = !ehDieta || pronta
    const linha = {
      fornecedor_id: fornecedor.id, nome: form.nome.trim(), categoria: form.categoria,
      tipo_dieta: ehDieta ? ladoVendido : form.tipo_dieta,
      embalagem: vende ? form.embalagem.trim() || null : null, peso_embalagem_kg: vende ? n(form.peso_embalagem_kg) : null,
      pedido_minimo_kg: vende ? n(form.pedido_minimo_kg) : null, prazo_entrega_dias: vende ? n(form.prazo_entrega_dias) : null,
      regiao: vende ? form.regiao.trim() || null : null, pct_ms: pctMs,
      visivel: form.visivel, dias_alerta: Math.round(diasAlerta ?? 7), kg_minimo_alerta: vende ? n(form.kg_minimo_alerta) : null,
      modo_dieta: ehDieta ? form.modo_dieta : null,
      descricao: ehDieta ? form.descricao.trim() || null : null,
      ciclo_recomendado: ehDieta ? n(form.ciclo_recomendado) : null,
      gmd_esperado: ehDieta ? n(form.gmd_esperado) : null,
      gmd_esperado_concentrado: ehDieta ? n(form.gmd_esperado_concentrado) : null,
      pct_consumo_pv_ms: ehDieta ? n(form.pct_consumo_pv_ms) : null,
      pct_concentrado: ehDieta ? pctC : null, pct_volumoso: ehDieta ? pctV : null,
      nutricional: ehDieta && Object.keys(nutricional).length > 0 ? nutricional : null,
    }
    setSalvando(true); setErro(null)
    let id = editando !== 'novo' && editando ? editando.id : null
    if (id) {
      const { error } = await supabase.from('fornecedor_produtos').update(linha).eq('id', id)
      if (error) { setSalvando(false); setErro(error.message); return }
    } else {
      const { data, error } = await supabase.from('fornecedor_produtos').insert(linha).select('id').single()
      if (error || !data) { setSalvando(false); setErro(error?.message ?? 'Erro ao salvar'); return }
      id = data.id as string
    }
    if (ehDieta || (editando !== 'novo' && editando?.categoria === 'dieta')) {
      const { error: eDel } = await supabase.from('fornecedor_produto_itens').delete().eq('dieta_id', id)
      if (eDel) { setSalvando(false); setErro(eDel.message); return }
      const validos = ehDieta ? itensAtuais.filter(i => (i.tipo === 'concentrado' ? pctC : pctV) > 0) : []
      if (validos.length > 0) {
        const { error } = await supabase.from('fornecedor_produto_itens').insert(validos.map(i => ({ ...i, dieta_id: id })))
        if (error) { setSalvando(false); setErro(error.message); return }
      }
    }
    const { error: ePreco } = precoKg != null
      ? await supabase.from('fornecedor_produto_precos').upsert({ produto_id: id, preco_kg: precoKg, atualizado_em: new Date().toISOString() })
      : await supabase.from('fornecedor_produto_precos').delete().eq('produto_id', id)
    if (ePreco) { setSalvando(false); setErro(ePreco.message); return }
    setSalvando(false)
    setEditando(null)
    recarregar()
  }

  const alternarVisivel = async (p: ProdutoFornecedor) => {
    const { error } = await supabase.from('fornecedor_produtos').update({ visivel: !p.visivel }).eq('id', p.id)
    if (error) { setErro(error.message); return }
    recarregar()
  }

  const excluir = async () => {
    if (editando === 'novo' || !editando) return
    if (!window.confirm(`Excluir ${editando.nome}? Estoques e pedidos ligados a ele perdem a referência ao produto.`)) return
    const { error } = await supabase.from('fornecedor_produtos').delete().eq('id', editando.id)
    if (error) { setErro(error.message.includes('foreign key') ? 'O produto está na composição de uma dieta. Retire-o da dieta antes de excluir, ou apenas oculte.' : error.message); return }
    setEditando(null)
    recarregar()
  }

  if (loading) return <div className="page"><div className="spinner" style={{ width: 28, height: 28, margin: '48px auto' }} /></div>
  const lista = filtro === 'todos' ? produtos : produtos.filter(p => p.categoria === filtro)
  const ehDieta = form.categoria === 'dieta'
  const vende = !ehDieta || form.modo_dieta === 'pronta'

  const secaoItens = (tipo: 'concentrado' | 'volumoso', pct: number) => pct > 0 && (
    <div style={{ marginBottom: 16 }}>
      <div className="flex-between" style={{ marginBottom: 6 }}>
        <strong style={{ fontSize: 13 }}>{tipo === 'concentrado' ? 'Concentrado' : 'Volumoso'} ({pct}% da MS){form.modo_dieta === 'pronta' && (tipo === 'concentrado' || pctC === 0) ? ' · vendido misturado' : ''}</strong>
        <span style={{ fontSize: 12, color: Math.abs(soma(tipo) - 100) > 0.01 ? 'var(--red)' : 'var(--green-dark)' }}>Soma {soma(tipo).toFixed(2).replace('.', ',')}%</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) 80px 80px 100px 90px 32px', gap: 6, fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>
        <span>Ingrediente</span><span>% part.</span><span>% MS</span><span>R$/kg (MN)</span><span>R$/kg MS</span><span />
      </div>
      {itens.map((l, idx) => {
        if (l.tipo !== tipo) return null
        const ms = n(l.ms); const preco = n(l.preco)
        return (
          <div key={idx} style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 1fr) 80px 80px 100px 90px 32px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <select className="form-input" value={l.ref} onChange={e => escolherIngrediente(idx, e.target.value)}>
                <option value="">Escolha</option>
                <optgroup label={`Produtos ${fornecedor?.nome ?? ''}`}>
                  {ingredientesCatalogo.map(p => <option key={p.id} value={`produto:${p.id}`}>{p.nome}</option>)}
                </optgroup>
                <optgroup label="Insumos padrão do Confina+">
                  {insumos.map(i => <option key={i.id} value={`insumo_padrao:${i.id}`}>{i.nome}</option>)}
                </optgroup>
                <optgroup label="Outro"><option value="livre:">Ingrediente livre (não vendido)</option></optgroup>
              </select>
              {l.ref === 'livre:' && <input className="form-input" placeholder="Nome do ingrediente" value={l.nome} onChange={e => setItem(idx, { nome: e.target.value })} />}
            </div>
            <input className="form-input" type="number" value={l.pct} onChange={e => setItem(idx, { pct: e.target.value })} />
            <input className="form-input" type="number" value={l.ms} onChange={e => setItem(idx, { ms: e.target.value })} />
            <input className="form-input" type="number" step="0.01" value={l.preco} onChange={e => setItem(idx, { preco: e.target.value })} />
            <span style={{ fontSize: 12 }}>{preco != null && ms ? fmtReais(preco / (ms / 100)) : '—'}</span>
            <button type="button" className="btn btn-ghost btn-icon" aria-label="Remover" onClick={() => setItens(ls => ls.filter((_, i) => i !== idx))}>×</button>
          </div>
        )
      })}
      <button type="button" className="btn btn-ghost btn-sm" onClick={() => setItens(ls => [...ls, { ref: '', nome: '', tipo, pct: '', ms: '', preco: '' }])}>+ Ingrediente</button>
    </div>
  )

  return (
    <div className="page">
      <PageHeader title="Produtos" subtitle="Produtos e dietas que os clientes veem e podem pedir"
        action={<button className="btn btn-primary" onClick={() => abrir('novo')}>+ Novo produto ou dieta</button>} />
      <div className="pill-wrap">
        <button className={`pill${filtro === 'todos' ? ' active' : ''}`} onClick={() => setFiltro('todos')}>Todos ({produtos.length})</button>
        {CATEGORIAS.filter(c => produtos.some(p => p.categoria === c)).map(c => (
          <button key={c} className={`pill${filtro === c ? ' active' : ''}`} onClick={() => setFiltro(c)}>{c === 'dieta' ? 'Dietas' : ROTULO_CATEGORIA[c]}</button>
        ))}
      </div>
      {erro && !editando && <div className="field-error" style={{ marginBottom: 12 }}>{erro}</div>}

      {lista.length === 0 ? <div className="card"><EmptyState icon="◻" title="Nenhum produto" desc="Cadastre rações, núcleos, minerais, grãos, farelos e dietas." /></div> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Produto</th><th>Categoria</th><th>Preço/kg</th><th>Embalagem</th><th>Pedido mín.</th><th>Prazo</th><th>Alerta</th><th>Visível</th><th></th></tr></thead>
          <tbody>{lista.map(p => {
            const its = itensPorDieta[p.id] ?? []
            const c = p.categoria === 'dieta' ? custoKgMsDieta(Number(p.pct_concentrado ?? 0), Number(p.pct_volumoso ?? 0), its) : null
            const receita = p.categoria === 'dieta' && p.modo_dieta === 'receita'
            return (
              <tr key={p.id}>
                <td>
                  <strong>{p.nome}</strong>
                  {p.categoria === 'dieta'
                    ? <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{its.length} ingrediente{its.length !== 1 ? 's' : ''} · {c != null ? `${fmtReais(c)}/kg MS` : 'custo incompleto'} · usada por {uso[p.id] ?? 0} cliente{(uso[p.id] ?? 0) !== 1 ? 's' : ''}</div>
                    : p.regiao && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.regiao}</div>}
                </td>
                <td>{p.categoria === 'dieta' ? (p.modo_dieta === 'pronta' ? 'Dieta pronta' : 'Dieta receita') : ROTULO_CATEGORIA[p.categoria]}</td>
                <td>{receita || precos[p.id] == null ? '—' : fmtReais(precos[p.id])}</td>
                <td>{receita ? '—' : p.embalagem ?? '—'}</td>
                <td>{!receita && p.pedido_minimo_kg != null ? fmtKg(p.pedido_minimo_kg) : '—'}</td>
                <td>{!receita && p.prazo_entrega_dias != null ? `${p.prazo_entrega_dias} dias` : '—'}</td>
                <td style={{ fontSize: 12 }}>{receita ? '—' : <>{`< ${p.dias_alerta} dias`}{p.kg_minimo_alerta != null && <div>ou {'<'} {fmtKg(p.kg_minimo_alerta)}</div>}</>}</td>
                <td><input type="checkbox" checked={p.visivel} onChange={() => alternarVisivel(p)} aria-label={`Visível: ${p.nome}`} /></td>
                <td style={{ textAlign: 'right' }}><button className="btn btn-ghost btn-sm" onClick={() => abrir(p)}>Editar</button></td>
              </tr>
            )
          })}</tbody>
        </table></div>
      )}

      {editando && (
        <Modal open onClose={() => setEditando(null)} title={editando === 'novo' ? 'Novo produto ou dieta' : `Editar ${editando.nome}`} size={ehDieta ? 'xl' : 'lg'}
          footer={<>
            {editando !== 'novo' && <button className="btn btn-ghost" style={{ marginRight: 'auto', color: 'var(--red)' }} onClick={excluir}>Excluir</button>}
            <button className="btn btn-ghost" onClick={() => setEditando(null)}>Cancelar</button>
            <button className="btn btn-primary" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando...' : 'Salvar'}</button>
          </>}>
          <div className="form-row-2">
            <div className="field"><label>Nome</label><input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
            <div className="field"><label>Categoria</label>
              <select value={form.categoria} onChange={e => { const c = e.target.value as CategoriaProduto; setForm({ ...form, categoria: c, tipo_dieta: c === 'volumoso' ? 'volumoso' : form.tipo_dieta }) }}>
                {CATEGORIAS.map(c => <option key={c} value={c}>{ROTULO_CATEGORIA[c]}</option>)}
              </select>
            </div>
          </div>

          {ehDieta && (
            <>
              <div className="field">
                <label>Tipo de dieta</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {([['pronta', 'Ração pronta', 'Vendida como produto: o cliente pede e controla o estoque da mistura'], ['receita', 'Receita', 'Só a fórmula: o cliente pede os produtos da composição um a um']] as const).map(([v, t, d]) => (
                    <button key={v} type="button" onClick={() => setForm({ ...form, modo_dieta: v })} className="card"
                      style={{ flex: '1 1 220px', textAlign: 'left', padding: 12, cursor: 'pointer', fontFamily: 'inherit', borderColor: form.modo_dieta === v ? 'var(--green)' : undefined, background: form.modo_dieta === v ? 'var(--green-light)' : undefined }}>
                      <strong style={{ fontSize: 13 }}>{t}</strong><div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{d}</div>
                    </button>
                  ))}
                </div>
              </div>
              <div className="form-row-3">
                <div className="field"><label>Ciclo recomendado</label>
                  <select value={form.ciclo_recomendado} onChange={e => setForm({ ...form, ciclo_recomendado: e.target.value })}>
                    {CICLOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                </div>
                <div className="field"><label>GMD esperado (kg/dia)</label><input type="number" value={form.gmd_esperado} onChange={e => setForm({ ...form, gmd_esperado: e.target.value })} /></div>
                <div className="field"><label>GMD do concentrado (opcional)</label><input type="number" value={form.gmd_esperado_concentrado} onChange={e => setForm({ ...form, gmd_esperado_concentrado: e.target.value })} /></div>
              </div>
              <div className="form-row-3">
                <div className="field"><label>Consumo (% PV em MS)</label><input type="number" value={form.pct_consumo_pv_ms} onChange={e => setForm({ ...form, pct_consumo_pv_ms: e.target.value })} /></div>
                <div className="field"><label>% concentrado</label><input type="number" value={form.pct_concentrado} onChange={e => setForm({ ...form, pct_concentrado: e.target.value, pct_volumoso: String(Math.max(0, 100 - (Number(e.target.value) || 0))) })} /></div>
                <div className="field"><label>% volumoso</label><input type="number" value={form.pct_volumoso} onChange={e => setForm({ ...form, pct_volumoso: e.target.value, pct_concentrado: String(Math.max(0, 100 - (Number(e.target.value) || 0))) })} /></div>
              </div>
              <div className="field"><label>Descrição e modo de uso</label><textarea value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} placeholder="Indicação, orientações de fornecimento" /></div>

              <strong style={{ display: 'block', fontSize: 14, margin: '8px 0 10px' }}>Composição</strong>
              {secaoItens('concentrado', pctC)}
              {secaoItens('volumoso', pctV)}
              <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', background: 'var(--gray-50)', borderRadius: 8, padding: '10px 12px', fontSize: 13, marginBottom: 16 }}>
                <span>Custo da dieta: <strong>{custo != null ? `${fmtReais(custo)}/kg MS` : 'informe preço e % MS de todos os itens'}</strong></span>
                {form.modo_dieta === 'pronta' && <span>% MS da mistura: <strong>{pctMsMistura(itensAtuais, pctC > 0 ? 'concentrado' : 'volumoso') ?? '—'}</strong></span>}
                <span style={{ color: 'var(--text-3)' }}>Preços e custo ficam só para a equipe; o cliente vê a composição e os níveis.</span>
              </div>

              <strong style={{ display: 'block', fontSize: 14, margin: '0 0 10px' }}>Níveis nutricionais (% da MS)</strong>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8, marginBottom: 8 }}>
                {CAMPOS_NUTRICIONAIS.map(([k, rot]) => (
                  <div key={k} className="field" style={{ marginBottom: 0 }}><label>{rot}</label>
                    <input type="number" value={form.nutricional[k] ?? ''} onChange={e => setForm({ ...form, nutricional: { ...form.nutricional, [k]: e.target.value } })} />
                  </div>
                ))}
              </div>
              <div className="field"><label>Ionóforo</label><input value={form.nutricional.ionoforo ?? ''} onChange={e => setForm({ ...form, nutricional: { ...form.nutricional, ionoforo: e.target.value } })} placeholder="Ex.: Monensina 25 mg/kg MS" /></div>
            </>
          )}

          {!ehDieta && (
            <div className="form-row-2">
              <div className="field"><label>Entra na dieta como</label>
                <select value={form.tipo_dieta} onChange={e => setForm({ ...form, tipo_dieta: e.target.value as 'concentrado' | 'volumoso' })}>
                  <option value="concentrado">Concentrado</option><option value="volumoso">Volumoso</option>
                </select>
              </div>
              <div className="field"><label>% MS</label><input type="number" value={form.pct_ms} onChange={e => setForm({ ...form, pct_ms: e.target.value })} placeholder="Ex.: 88" /></div>
            </div>
          )}

          {vende && (
            <>
              {ehDieta && <strong style={{ display: 'block', fontSize: 14, margin: '8px 0 10px' }}>Venda e estoque</strong>}
              <div className="form-row-2">
                <div className="field"><label>Preço de referência (R$/kg MN)</label><input type="number" step="0.01" value={form.preco_kg} onChange={e => setForm({ ...form, preco_kg: e.target.value })} placeholder="Usado no simulador" /></div>
                <div className="field" style={{ alignSelf: 'end', fontSize: 12, color: 'var(--text-3)' }}>Só a equipe vê. Entra no simulador, nas dietas e nos PDFs de simulação.</div>
              </div>
              <div className="form-row-3">
                <div className="field"><label>Embalagem</label><input value={form.embalagem} onChange={e => setForm({ ...form, embalagem: e.target.value })} placeholder="Saco 30 kg, granel" /></div>
                <div className="field"><label>Peso da embalagem (kg)</label><input type="number" value={form.peso_embalagem_kg} onChange={e => setForm({ ...form, peso_embalagem_kg: e.target.value })} /></div>
                <div className="field"><label>Pedido mínimo (kg)</label><input type="number" value={form.pedido_minimo_kg} onChange={e => setForm({ ...form, pedido_minimo_kg: e.target.value })} /></div>
              </div>
              <div className="form-row-2">
                <div className="field"><label>Prazo de entrega (dias)</label><input type="number" value={form.prazo_entrega_dias} onChange={e => setForm({ ...form, prazo_entrega_dias: e.target.value })} /></div>
                <div className="field"><label>Região atendida</label><input value={form.regiao} onChange={e => setForm({ ...form, regiao: e.target.value })} placeholder="Ex.: Fronteira Oeste" /></div>
              </div>
              <div className="form-row-2">
                <div className="field"><label>Alerta com menos de (dias de estoque)</label><input type="number" value={form.dias_alerta} onChange={e => setForm({ ...form, dias_alerta: e.target.value })} /></div>
                <div className="field"><label>Ou saldo abaixo de (kg, opcional)</label><input type="number" value={form.kg_minimo_alerta} onChange={e => setForm({ ...form, kg_minimo_alerta: e.target.value })} /></div>
              </div>
            </>
          )}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={form.visivel} onChange={e => setForm({ ...form, visivel: e.target.checked })} /> Visível para os clientes
          </label>
          {erro && <div className="field-error" style={{ marginTop: 8 }}>{erro}</div>}
        </Modal>
      )}
    </div>
  )
}
