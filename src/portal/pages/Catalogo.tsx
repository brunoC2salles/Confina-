import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Modal, PageHeader, EmptyState } from '@/components/common/UI'
import { useDadosFornecedor } from '@/portal/useDadosFornecedor'
import { ROTULO_CATEGORIA, fmtKg, type CategoriaProduto, type ProdutoFornecedor } from '@/core/parceiros'

const CATEGORIAS = Object.keys(ROTULO_CATEGORIA) as CategoriaProduto[]

const vazio = {
  nome: '', categoria: 'racao' as CategoriaProduto, tipo_dieta: 'concentrado' as 'concentrado' | 'volumoso',
  embalagem: '', peso_embalagem_kg: '', pedido_minimo_kg: '', prazo_entrega_dias: '', regiao: '', pct_ms: '',
  visivel: true, dias_alerta: '7', kg_minimo_alerta: '',
}

// Catálogo do fornecedor: o que os clientes veem e podem pedir, com regras
// de venda e configuração do alerta de estoque por produto.
export default function Catalogo() {
  const { fornecedor, produtos, loading, recarregar } = useDadosFornecedor()
  const [filtro, setFiltro] = useState<CategoriaProduto | 'todos'>('todos')
  const [editando, setEditando] = useState<ProdutoFornecedor | 'novo' | null>(null)
  const [form, setForm] = useState(vazio)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const abrir = (p: ProdutoFornecedor | 'novo') => {
    setErro(null)
    setEditando(p)
    if (p === 'novo') { setForm(vazio); return }
    setForm({
      nome: p.nome, categoria: p.categoria, tipo_dieta: p.tipo_dieta, embalagem: p.embalagem ?? '',
      peso_embalagem_kg: p.peso_embalagem_kg != null ? String(p.peso_embalagem_kg) : '',
      pedido_minimo_kg: p.pedido_minimo_kg != null ? String(p.pedido_minimo_kg) : '',
      prazo_entrega_dias: p.prazo_entrega_dias != null ? String(p.prazo_entrega_dias) : '',
      regiao: p.regiao ?? '', pct_ms: p.pct_ms != null ? String(p.pct_ms) : '',
      visivel: p.visivel, dias_alerta: String(p.dias_alerta), kg_minimo_alerta: p.kg_minimo_alerta != null ? String(p.kg_minimo_alerta) : '',
    })
  }

  const n = (s: string) => s.trim() === '' ? null : Number(s.replace(',', '.'))

  const salvar = async () => {
    if (!fornecedor) return
    if (!form.nome.trim()) { setErro('Informe o nome'); return }
    const pctMs = n(form.pct_ms)
    if (pctMs != null && !(pctMs > 0 && pctMs <= 100)) { setErro('% MS deve estar entre 0 e 100'); return }
    const diasAlerta = n(form.dias_alerta)
    if (diasAlerta == null || diasAlerta < 0) { setErro('Informe os dias de alerta'); return }
    const linha = {
      fornecedor_id: fornecedor.id, nome: form.nome.trim(), categoria: form.categoria, tipo_dieta: form.tipo_dieta,
      embalagem: form.embalagem.trim() || null, peso_embalagem_kg: n(form.peso_embalagem_kg), pedido_minimo_kg: n(form.pedido_minimo_kg),
      prazo_entrega_dias: n(form.prazo_entrega_dias), regiao: form.regiao.trim() || null, pct_ms: pctMs,
      visivel: form.visivel, dias_alerta: Math.round(diasAlerta), kg_minimo_alerta: n(form.kg_minimo_alerta),
    }
    setSalvando(true); setErro(null)
    const { error } = editando === 'novo'
      ? await supabase.from('fornecedor_produtos').insert(linha)
      : await supabase.from('fornecedor_produtos').update(linha).eq('id', (editando as ProdutoFornecedor).id)
    setSalvando(false)
    if (error) { setErro(error.message); return }
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
    if (error) { setErro(error.message.includes('foreign key') ? 'O produto está em uma dieta. Retire-o das dietas antes de excluir, ou apenas oculte.' : error.message); return }
    setEditando(null)
    recarregar()
  }

  if (loading) return <div className="page"><div className="spinner" style={{ width: 28, height: 28, margin: '48px auto' }} /></div>
  const lista = filtro === 'todos' ? produtos : produtos.filter(p => p.categoria === filtro)

  return (
    <div className="page">
      <PageHeader title="Produtos" subtitle="O que os clientes veem e podem pedir"
        action={<button className="btn btn-primary" onClick={() => abrir('novo')}>+ Novo produto</button>} />
      <div className="pill-wrap">
        <button className={`pill${filtro === 'todos' ? ' active' : ''}`} onClick={() => setFiltro('todos')}>Todos ({produtos.length})</button>
        {CATEGORIAS.filter(c => produtos.some(p => p.categoria === c)).map(c => (
          <button key={c} className={`pill${filtro === c ? ' active' : ''}`} onClick={() => setFiltro(c)}>{ROTULO_CATEGORIA[c]}</button>
        ))}
      </div>
      {erro && !editando && <div className="field-error" style={{ marginBottom: 12 }}>{erro}</div>}

      {lista.length === 0 ? <div className="card"><EmptyState icon="◻" title="Nenhum produto" desc="Cadastre rações, núcleos, minerais, grãos e farelos." /></div> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Produto</th><th>Categoria</th><th>Embalagem</th><th>Pedido mín.</th><th>Prazo</th><th>Alerta</th><th>Visível</th><th></th></tr></thead>
          <tbody>{lista.map(p => (
            <tr key={p.id}>
              <td><strong>{p.nome}</strong>{p.regiao && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.regiao}</div>}</td>
              <td>{ROTULO_CATEGORIA[p.categoria]}</td>
              <td>{p.embalagem ?? '—'}</td>
              <td>{p.pedido_minimo_kg != null ? fmtKg(p.pedido_minimo_kg) : '—'}</td>
              <td>{p.prazo_entrega_dias != null ? `${p.prazo_entrega_dias} dias` : '—'}</td>
              <td style={{ fontSize: 12 }}>{`< ${p.dias_alerta} dias`}{p.kg_minimo_alerta != null && <div>ou {'<'} {fmtKg(p.kg_minimo_alerta)}</div>}</td>
              <td><input type="checkbox" checked={p.visivel} onChange={() => alternarVisivel(p)} aria-label={`Visível: ${p.nome}`} /></td>
              <td style={{ textAlign: 'right' }}><button className="btn btn-ghost btn-sm" onClick={() => abrir(p)}>Editar</button></td>
            </tr>
          ))}</tbody>
        </table></div>
      )}

      {editando && (
        <Modal open onClose={() => setEditando(null)} title={editando === 'novo' ? 'Novo produto' : 'Editar produto'} size="lg"
          footer={<>
            {editando !== 'novo' && <button className="btn btn-ghost" style={{ marginRight: 'auto', color: 'var(--red)' }} onClick={excluir}>Excluir</button>}
            <button className="btn btn-ghost" onClick={() => setEditando(null)}>Cancelar</button>
            <button className="btn btn-primary" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando...' : 'Salvar'}</button>
          </>}>
          <div className="field"><label>Nome</label><input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
          <div className="form-row-3">
            <div className="field"><label>Categoria</label>
              <select value={form.categoria} onChange={e => { const c = e.target.value as CategoriaProduto; setForm({ ...form, categoria: c, tipo_dieta: c === 'volumoso' ? 'volumoso' : form.tipo_dieta }) }}>
                {CATEGORIAS.map(c => <option key={c} value={c}>{ROTULO_CATEGORIA[c]}</option>)}
              </select>
            </div>
            <div className="field"><label>Entra na dieta como</label>
              <select value={form.tipo_dieta} onChange={e => setForm({ ...form, tipo_dieta: e.target.value as 'concentrado' | 'volumoso' })}>
                <option value="concentrado">Concentrado</option><option value="volumoso">Volumoso</option>
              </select>
            </div>
            <div className="field"><label>% MS</label><input type="number" value={form.pct_ms} onChange={e => setForm({ ...form, pct_ms: e.target.value })} placeholder="Ex.: 88" /></div>
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
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <input type="checkbox" checked={form.visivel} onChange={e => setForm({ ...form, visivel: e.target.checked })} /> Visível para os clientes
          </label>
          {erro && <div className="field-error" style={{ marginTop: 8 }}>{erro}</div>}
        </Modal>
      )}
    </div>
  )
}
