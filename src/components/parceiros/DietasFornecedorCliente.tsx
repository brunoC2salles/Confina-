import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { EmptyState } from '@/components/common/UI'
import { CATEGORIA_INGREDIENTE, CAMPOS_NUTRICIONAIS, type CategoriaProduto, type DietaPublicada, type VinculoCliente } from '@/core/parceiros'
import type { IngredienteProdutor } from '@/hooks/useDietas'

const cicloLabel = (n: number | null) =>
  n == null ? null : ({ 1: 'Adaptação', 2: 'Crescimento', 3: 'Engorda', 4: 'Acabamento' }[n] ?? `Ciclo ${n}`)
const num = (v: number | null | undefined) => v == null ? '' : String(v).replace('.', ',')

// Item da dieta já resolvido para o cadastro do produtor: ou um ingrediente
// próprio (ligado ao produto do fornecedor, ou criado para o ingrediente
// livre) ou um insumo padrão do Confina+.
export interface ItemPreparado {
  tipo: 'concentrado' | 'volumoso'
  pct_participacao: number
  pct_ms: number | null
  nome: string
  categoria: string
  ingrediente: IngredienteProdutor | null
  insumo_id: string | null
}

type IngLigado = IngredienteProdutor & { fornecedor_produto_id: string | null }
const normalizar = (s: string) => s.trim().toLowerCase()

// Prepara a dieta para o cadastro do produtor:
// - produto do fornecedor: ingrediente próprio ligado ao produto
//   (fornecedor_produto_id), por onde o estoque é acompanhado;
// - insumo padrão: usado direto;
// - ingrediente livre: ingrediente próprio comum (reaproveita pelo nome).
// Na dieta pronta, o lado vendido misturado (concentrado, ou o volumoso
// quando não há concentrado) vira um único ingrediente ligado à própria
// dieta; o outro lado entra item a item. Reativa ingredientes inativos.
async function prepararItens(userId: string, d: DietaPublicada): Promise<{ error: string | null; itens: ItemPreparado[] }> {
  const ladoPronto: 'concentrado' | 'volumoso' | null = d.modo_dieta === 'pronta' ? ((d.pct_concentrado ?? 0) > 0 ? 'concentrado' : 'volumoso') : null
  const itensDieta = d.itens.filter(i => i.tipo !== ladoPronto)

  // Produtos ligados: os itens de produto e, na pronta, a própria dieta.
  const ligados = new Map<string, { nome: string; categoria: string; pct_ms: number | null }>()
  for (const i of itensDieta) if (i.origem === 'produto' && i.produto_id) {
    ligados.set(i.produto_id, { nome: i.nome, categoria: CATEGORIA_INGREDIENTE[(i.categoria ?? 'outro') as CategoriaProduto] ?? 'subproduto', pct_ms: i.pct_ms })
  }
  if (ladoPronto) ligados.set(d.id, { nome: d.nome, categoria: ladoPronto === 'volumoso' ? 'volumoso' : CATEGORIA_INGREDIENTE.dieta, pct_ms: d.pct_ms })
  const livres = itensDieta.filter(i => i.origem === 'livre')

  const { data: existentes, error } = await supabase.from('ingredientes_produtor').select('*').eq('user_id', userId)
  if (error) return { error: error.message, itens: [] }
  const lista = (existentes ?? []) as IngLigado[]
  const porProduto = new Map(lista.filter(i => i.fornecedor_produto_id).map(i => [i.fornecedor_produto_id as string, i]))
  const porNome = new Map(lista.filter(i => !i.fornecedor_produto_id).map(i => [normalizar(i.nome), i]))

  const usados: IngLigado[] = []
  for (const id of ligados.keys()) { const i = porProduto.get(id); if (i) usados.push(i) }
  for (const l of livres) { const i = porNome.get(normalizar(l.nome)); if (i) usados.push(i) }
  const inativos = Array.from(new Set(usados.filter(i => !i.ativo).map(i => i.id)))
  if (inativos.length > 0) {
    const { error: e } = await supabase.from('ingredientes_produtor').update({ ativo: true }).in('id', inativos)
    if (e) return { error: e.message, itens: [] }
    for (const i of usados) i.ativo = true
  }

  const novos: Array<Record<string, unknown>> = []
  for (const [id, info] of ligados) if (!porProduto.has(id)) {
    novos.push({ user_id: userId, nome: info.nome, categoria: info.categoria, pct_ms: info.pct_ms, preco_kg: 0, ativo: true, fornecedor_produto_id: id })
  }
  const nomesNovos = new Set<string>()
  for (const l of livres) {
    const k = normalizar(l.nome)
    if (porNome.has(k) || nomesNovos.has(k)) continue
    nomesNovos.add(k)
    novos.push({ user_id: userId, nome: l.nome.trim(), categoria: l.tipo === 'volumoso' ? 'volumoso' : 'concentrado_energetico', pct_ms: l.pct_ms, preco_kg: 0, ativo: true })
  }
  if (novos.length > 0) {
    const { data, error: e } = await supabase.from('ingredientes_produtor').insert(novos).select()
    if (e) return { error: e.message, itens: [] }
    for (const i of (data ?? []) as IngLigado[]) {
      if (i.fornecedor_produto_id) porProduto.set(i.fornecedor_produto_id, i)
      else porNome.set(normalizar(i.nome), i)
    }
  }

  const itens: ItemPreparado[] = []
  if (ladoPronto) {
    const ing = porProduto.get(d.id)!
    itens.push({ tipo: ladoPronto, pct_participacao: 100, pct_ms: d.pct_ms, nome: ing.nome, categoria: ing.categoria, ingrediente: ing, insumo_id: null })
  }
  for (const i of itensDieta) {
    if (i.origem === 'insumo_padrao' && i.insumo_id) {
      itens.push({ tipo: i.tipo, pct_participacao: i.pct_participacao, pct_ms: i.pct_ms, nome: i.nome, categoria: i.categoria ?? 'concentrado_energetico', ingrediente: null, insumo_id: i.insumo_id })
      continue
    }
    const ing = i.origem === 'produto' && i.produto_id ? porProduto.get(i.produto_id) : porNome.get(normalizar(i.nome))
    if (!ing) continue
    itens.push({ tipo: i.tipo, pct_participacao: i.pct_participacao, pct_ms: i.pct_ms, nome: ing.nome, categoria: ing.categoria, ingrediente: ing, insumo_id: null })
  }
  return { error: null, itens }
}

// Aba "Dietas <fornecedor>" na tela de Dietas: as dietas visíveis do
// fornecedor do produtor, com composição e níveis (sem preço), como ponto de
// partida para as dietas dele.
export function DietasFornecedorCliente({ vinculo, onUsar }: {
  vinculo: VinculoCliente
  onUsar: (dieta: DietaPublicada, itens: ItemPreparado[]) => void
}) {
  const { user } = useAuth()
  const [dietas, setDietas] = useState<DietaPublicada[]>([])
  const [loading, setLoading] = useState(true)
  const [preparando, setPreparando] = useState<string | null>(null)
  const [aberta, setAberta] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    supabase.rpc('dietas_fornecedor_publicadas').then(({ data }) => {
      setDietas((data ?? []) as DietaPublicada[])
      setLoading(false)
    })
  }, [])

  const usar = async (d: DietaPublicada) => {
    if (!user) return
    setPreparando(d.id); setErro(null)
    const r = await prepararItens(user.id, d)
    setPreparando(null)
    if (r.error) { setErro(r.error); return }
    onUsar(d, r.itens)
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" style={{ width: 28, height: 28 }} /></div>
  if (dietas.length === 0) {
    return <div className="card"><EmptyState icon="◧" title={`Nenhuma dieta ${vinculo.fornecedor.nome} disponível`} desc="Quando o fornecedor disponibilizar dietas, elas aparecem aqui." /></div>
  }

  return (
    <>
      <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 12 }}>
        Dietas da {vinculo.fornecedor.nome}. Use como base e ajuste ao seu lote: os produtos da {vinculo.fornecedor.nome} passam a ter o estoque acompanhado em Compras.
      </div>
      {erro && <div className="field-error" style={{ marginBottom: 12 }}>{erro}</div>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 12 }}>
        {dietas.map(d => {
          const niveis = CAMPOS_NUTRICIONAIS.filter(([k]) => d.nutricional?.[k] != null)
          const expandida = aberta === d.id
          return (
            <div key={d.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <strong style={{ fontSize: 14 }}>{d.nome}</strong>
                <span className="badge badge-green" style={{ flexShrink: 0 }}>{d.modo_dieta === 'pronta' ? 'Ração pronta' : 'Receita'}</span>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-2)' }}>
                {[cicloLabel(d.ciclo_recomendado), d.gmd_esperado != null && `GMD ${num(d.gmd_esperado)} kg/dia`,
                  d.pct_consumo_pv_ms != null && `${num(d.pct_consumo_pv_ms)}% PV em MS`, `${num(d.pct_concentrado)}% conc. / ${num(d.pct_volumoso)}% vol.`,
                  d.modo_dieta === 'pronta' && d.embalagem].filter(Boolean).join(' · ')}
              </div>
              {d.descricao && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{d.descricao}</div>}
              {niveis.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {niveis.map(([k, rot]) => (
                    <span key={k} style={{ fontSize: 11, background: 'var(--green-light)', color: 'var(--green-dark)', borderRadius: 20, padding: '2px 8px' }}>
                      {rot.replace(' (%)', '')} {num(d.nutricional?.[k] as number)}%
                    </span>
                  ))}
                  {d.nutricional?.ionoforo && <span style={{ fontSize: 11, background: 'var(--green-light)', color: 'var(--green-dark)', borderRadius: 20, padding: '2px 8px' }}>{d.nutricional.ionoforo}</span>}
                </div>
              )}
              {expandida ? (
                <table style={{ fontSize: 12, width: '100%' }}>
                  <thead><tr><th style={{ textAlign: 'left' }}>Ingrediente</th><th style={{ textAlign: 'right' }}>%</th><th style={{ textAlign: 'right' }}>% MS</th></tr></thead>
                  <tbody>
                    {(['concentrado', 'volumoso'] as const).flatMap(tipo => d.itens.filter(i => i.tipo === tipo).map((i, idx) => (
                      <tr key={`${tipo}-${idx}`}>
                        <td>{i.nome}<span style={{ color: 'var(--text-3)' }}> · {tipo === 'concentrado' ? 'conc.' : 'vol.'}</span></td>
                        <td style={{ textAlign: 'right' }}>{num(i.pct_participacao)}</td>
                        <td style={{ textAlign: 'right' }}>{num(i.pct_ms)}</td>
                      </tr>
                    )))}
                  </tbody>
                </table>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {d.itens.map((i, idx) => (
                    <span key={idx} style={{ fontSize: 11, background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 20, padding: '2px 8px' }}>
                      {i.nome} {num(i.pct_participacao)}%
                    </span>
                  ))}
                </div>
              )}
              <div style={{ marginTop: 'auto', paddingTop: 8, display: 'flex', gap: 8 }}>
                <button className="btn btn-primary btn-sm" disabled={preparando === d.id} onClick={() => usar(d)}>
                  {preparando === d.id ? 'Preparando...' : 'Usar como base'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={() => setAberta(expandida ? null : d.id)}>{expandida ? 'Resumo' : 'Ver composição'}</button>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
