import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader, EmptyState } from '@/components/common/UI'
import { useDadosFornecedor } from '@/portal/useDadosFornecedor'


// Quanto entregar nos próximos 15 ou 30 dias: consumo médio atual de cada
// cliente x dias, somado por produto ou por dieta do fornecedor.
export default function Demanda() {
  const { fornecedor, clientes, produtos, estoque, loading } = useDadosFornecedor()
  const [dias, setDias] = useState<15 | 30>(15)
  const [visao, setVisao] = useState<'produto' | 'dieta'>('produto')
  const [itensDieta, setItensDieta] = useState<Record<string, string[]>>({})
  const dietas = produtos.filter(p => p.categoria === 'dieta' && p.visivel)
  const chaveDietas = dietas.map(d => d.id).join(',')

  // Produtos do catálogo que compõem cada dieta; a dieta pronta conta o
  // próprio produto (a mistura vendida).
  useEffect(() => {
    if (!fornecedor || !chaveDietas) { setItensDieta({}); return }
    supabase.from('fornecedor_produto_itens').select('dieta_id, produto_id').in('dieta_id', chaveDietas.split(',')).not('produto_id', 'is', null)
      .then(({ data }) => {
        const mapa: Record<string, string[]> = {}
        for (const i of (data ?? []) as Array<{ dieta_id: string; produto_id: string }>) (mapa[i.dieta_id] ??= []).push(i.produto_id)
        setItensDieta(mapa)
      })
  }, [fornecedor, chaveDietas])

  if (loading) return <div className="page"><div className="spinner" style={{ width: 28, height: 28, margin: '48px auto' }} /></div>

  const ativos = new Set(clientes.filter(c => c.ativo).map(c => c.id))
  const linhas = estoque.filter(e => ativos.has(e.cliente_id) && (e.consumo_dia_kg ?? 0) > 0)

  const porProduto = produtos.map(p => {
    const doProduto = linhas.filter(l => l.produto_id === p.id)
    return { id: p.id, nome: p.nome, kg: doProduto.reduce((s, l) => s + (l.consumo_dia_kg ?? 0) * dias, 0), clientes: doProduto.length }
  }).filter(x => x.kg > 0).sort((a, b) => b.kg - a.kg)

  // Por dieta: clientes que usam a dieta (ciclo atual de algum lote) e o
  // consumo deles dos produtos que compõem a dieta.
  const porDieta = dietas.map(d => {
    const produtosDaDieta = new Set(d.modo_dieta === 'pronta' ? [d.id, ...(itensDieta[d.id] ?? [])] : (itensDieta[d.id] ?? []))
    const usam = clientes.filter(c => ativos.has(c.id) && (c.dietas_em_uso ?? []).includes(d.id))
    const ids = new Set(usam.map(c => c.id))
    const kg = linhas.filter(l => ids.has(l.cliente_id) && produtosDaDieta.has(l.produto_id)).reduce((s, l) => s + (l.consumo_dia_kg ?? 0) * dias, 0)
    return { id: d.id, nome: d.nome, kg, clientes: usam.length, cabecas: usam.reduce((s, c) => s + (c.cabecas ?? 0), 0) }
  }).filter(x => x.clientes > 0).sort((a, b) => b.kg - a.kg)

  const itens = visao === 'produto' ? porProduto : porDieta
  const maximo = Math.max(1, ...itens.map(i => i.kg))
  const total = porProduto.reduce((s, i) => s + i.kg, 0)
  const t = (kg: number) => `${(kg / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} t`

  return (
    <div className="page">
      <PageHeader title="Previsão de demanda" subtitle="Consumo previsto da carteira, base para produção, estoque e logística" />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        <div className="pill-wrap" style={{ marginBottom: 0 }}>
          {([15, 30] as const).map(n => <button key={n} className={`pill${dias === n ? ' active' : ''}`} onClick={() => setDias(n)}>{n} dias</button>)}
        </div>
        <div className="pill-wrap" style={{ marginBottom: 0 }}>
          <button className={`pill${visao === 'produto' ? ' active' : ''}`} onClick={() => setVisao('produto')}>Por produto</button>
          <button className={`pill${visao === 'dieta' ? ' active' : ''}`} onClick={() => setVisao('dieta')}>Por dieta</button>
        </div>
      </div>

      <div className="card">
        <div className="flex-between" style={{ marginBottom: 16 }}>
          <strong>Abastecimento necessário nos próximos {dias} dias</strong>
          <span style={{ fontSize: 13, color: 'var(--text-2)' }}>Total da carteira: <strong>{t(total)}</strong></span>
        </div>
        {itens.length === 0
          ? <EmptyState icon="◻" title="Sem consumo previsto" desc={visao === 'dieta' ? 'Nenhum cliente usa uma dieta visível no ciclo atual dos lotes.' : 'Os clientes ainda não têm consumo registrado dos produtos.'} />
          : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {itens.map(i => (
                <div key={i.id} style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 220px) 1fr 90px 110px', gap: 12, alignItems: 'center', fontSize: 13 }}>
                  <strong style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.nome}</strong>
                  <div style={{ height: 10, background: 'var(--gray-100)', borderRadius: 5 }}>
                    <div style={{ width: `${(i.kg / maximo) * 100}%`, height: '100%', background: 'var(--green)', borderRadius: 5 }} />
                  </div>
                  <span style={{ fontWeight: 600, textAlign: 'right' }}>{t(i.kg)}</span>
                  <span style={{ color: 'var(--text-3)', textAlign: 'right' }}>{i.clientes} cliente{i.clientes !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          )}
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 16 }}>
          Consumo médio atual de cada cliente multiplicado pelos dias. Clientes do Confina+: consumo das dietas dos lotes; contas só de estoque: média das baixas.
        </div>
      </div>
    </div>
  )
}
