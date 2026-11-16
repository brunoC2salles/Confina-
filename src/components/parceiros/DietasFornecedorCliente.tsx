import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { EmptyState } from '@/components/common/UI'
import { CATEGORIA_INGREDIENTE, type DietaPublicada, type VinculoCliente } from '@/core/parceiros'
import type { IngredienteProdutor } from '@/hooks/useDietas'

const cicloLabel = (n: number | null) =>
  n == null ? null : ({ 1: 'Adaptação', 2: 'Crescimento', 3: 'Engorda', 4: 'Acabamento' }[n] ?? `Ciclo ${n}`)

// Cada produto do fornecedor vira um ingrediente próprio do produtor, ligado
// ao produto (fornecedor_produto_id). É por ele que o estoque e o consumo do
// produto são acompanhados. Reaproveita o que já existe e reativa inativos.
async function garantirIngredientes(userId: string, d: DietaPublicada): Promise<{ error: string | null; ingredientes: IngredienteProdutor[] }> {
  const ids = Array.from(new Set(d.itens.map(i => i.produto_id)))
  const { data: existentes, error } = await supabase.from('ingredientes_produtor').select('*')
    .eq('user_id', userId).in('fornecedor_produto_id', ids)
  if (error) return { error: error.message, ingredientes: [] }
  const lista = (existentes ?? []) as Array<IngredienteProdutor & { fornecedor_produto_id: string }>
  const inativos = lista.filter(i => !i.ativo).map(i => i.id)
  if (inativos.length > 0) {
    const { error: e } = await supabase.from('ingredientes_produtor').update({ ativo: true }).in('id', inativos)
    if (e) return { error: e.message, ingredientes: [] }
  }
  const faltam = ids.filter(id => !lista.some(i => i.fornecedor_produto_id === id))
  let criados: Array<IngredienteProdutor & { fornecedor_produto_id: string }> = []
  if (faltam.length > 0) {
    const { data, error: e } = await supabase.from('ingredientes_produtor').insert(faltam.map(id => {
      const item = d.itens.find(i => i.produto_id === id)!
      return {
        user_id: userId, nome: item.produto_nome, categoria: CATEGORIA_INGREDIENTE[item.categoria] ?? 'subproduto',
        pct_ms: item.pct_ms, preco_kg: 0, ativo: true, fornecedor_produto_id: id,
      }
    })).select()
    if (e) return { error: e.message, ingredientes: [] }
    criados = (data ?? []) as typeof criados
  }
  const todos = [...lista.map(i => ({ ...i, ativo: true })), ...criados]
  // Na ordem dos itens da dieta.
  const ordenados = d.itens.map(i => todos.find(t => t.fornecedor_produto_id === i.produto_id)!).filter(Boolean)
  return { error: null, ingredientes: ordenados }
}

// Aba "Dietas <fornecedor>" na tela de Dietas: as dietas publicadas pelo
// fornecedor do produtor, como ponto de partida para as dietas dele.
export function DietasFornecedorCliente({ vinculo, onUsar }: {
  vinculo: VinculoCliente
  onUsar: (dieta: DietaPublicada & { id: string }, ingredientes: IngredienteProdutor[]) => void
}) {
  const { user } = useAuth()
  const [dietas, setDietas] = useState<Array<DietaPublicada & { id: string }>>([])
  const [loading, setLoading] = useState(true)
  const [preparando, setPreparando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('dietas_fornecedor_publicadas').then(({ data }) => {
      setDietas(((data ?? []) as Array<DietaPublicada & { id: string }>))
      setLoading(false)
    })
  }, [])

  const usar = async (d: DietaPublicada & { id: string }) => {
    if (!user) return
    setPreparando(d.id); setErro(null)
    const r = await garantirIngredientes(user.id, d)
    setPreparando(null)
    if (r.error) { setErro(r.error); return }
    onUsar(d, r.ingredientes)
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" style={{ width: 28, height: 28 }} /></div>
  if (dietas.length === 0) {
    return <div className="card"><EmptyState icon="◧" title={`Nenhuma dieta ${vinculo.fornecedor.nome} publicada`} desc="Quando o fornecedor publicar dietas, elas aparecem aqui." /></div>
  }

  return (
    <>
      <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>
        Dietas completas da {vinculo.fornecedor.nome}. Use como base e ajuste ao seu lote: cada produto passa a ter o estoque acompanhado em Compras.
      </div>
      {erro && <div className="field-error" style={{ marginBottom: 12 }}>{erro}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 12 }}>
        {dietas.map(d => (
          <div key={d.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <strong style={{ fontSize: 14 }}>{d.nome}</strong>
              <span className="badge badge-green" style={{ flexShrink: 0 }}>{vinculo.fornecedor.nome}</span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
              {[cicloLabel(d.ciclo_recomendado), d.gmd_esperado != null && `GMD ${String(d.gmd_esperado).replace('.', ',')} kg/dia`,
                `${String(d.pct_consumo_pv_ms).replace('.', ',')}% PV em MS`, `${d.pct_concentrado}% conc. / ${d.pct_volumoso}% vol.`].filter(Boolean).join(' · ')}
            </div>
            {d.descricao && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{d.descricao}</div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {d.itens.map(i => (
                <span key={`${i.tipo}-${i.produto_id}`} style={{ fontSize: 11, background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 20, padding: '2px 8px' }}>
                  {i.produto_nome} {String(i.pct_participacao).replace('.', ',')}%
                </span>
              ))}
            </div>
            <div style={{ marginTop: 'auto', paddingTop: 8 }}>
              <button className="btn btn-primary btn-sm" disabled={preparando === d.id} onClick={() => usar(d)}>
                {preparando === d.id ? 'Preparando...' : 'Usar como base'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
