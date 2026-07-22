import { useState, useEffect, useCallback, useMemo } from 'react'
import { useLotes } from '@/hooks/useLotes'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { PageHeader, EmptyState } from '@/components/common/UI'
import { fmtNum } from '@/lib/calculations'

// ─── Página "Fazenda Hoje" ──────────────────────────────────────────────────────
// Foto do momento atual: quantos animais ativos existem, por lote, por ciclo
// (ciclo atual do lote em que o animal está) e por fornecedor da leva de
// compra. Não é histórico — é sempre a situação de agora.

interface AnimalHoje {
  id: string
  codigo: string
  brinco: string
  peso_entrada: number
  lote_id: string | null
  fornecedor: string
}

interface LinhaHoje extends AnimalHoje {
  loteNome: string
  cicloNumero: number | null
  cicloNome: string
}

export default function FazendaHoje() {
  const { user } = useAuth()
  const { lotes, lotesAtivos, ciclosPorLote, loading: loadingLotes } = useLotes()

  const [animais, setAnimais] = useState<AnimalHoje[]>([])
  const [loading, setLoading] = useState(true)

  const [filtroLote, setFiltroLote] = useState('todos')
  const [filtroCiclo, setFiltroCiclo] = useState('todos')
  const [filtroFornecedor, setFiltroFornecedor] = useState('todos')

  const carregar = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('animais')
      .select('id, codigo, brinco, peso_entrada, lote_atual_id, compras(origem_texto, parceiros(nome))')
      .eq('user_id', user.id).eq('status', 'ativo')

    const lista: AnimalHoje[] = (data ?? []).map((a: any) => ({
      id: a.id,
      codigo: a.codigo,
      brinco: a.brinco,
      peso_entrada: a.peso_entrada,
      lote_id: a.lote_atual_id,
      fornecedor: a.compras?.parceiros?.nome ?? a.compras?.origem_texto ?? 'Não informado',
    }))
    setAnimais(lista)
    setLoading(false)
  }, [user])

  useEffect(() => { carregar() }, [carregar])

  // Ciclo "de agora" de um lote é o ciclo_atual do lote — a mesma noção usada
  // no resto do app (Lotes.tsx, motor de custo). Não é histórico por animal.
  const cicloDoLote = useCallback((loteId: string | null) => {
    if (!loteId) return null
    const lote = lotes.find(l => l.id === loteId)
    if (!lote) return null
    const ciclo = (ciclosPorLote[loteId] ?? []).find(c => c.numero === lote.ciclo_atual)
    return { numero: lote.ciclo_atual, nome: ciclo?.nome ?? `Ciclo ${lote.ciclo_atual}` }
  }, [lotes, ciclosPorLote])

  const linhas: LinhaHoje[] = useMemo(() => animais.map(a => {
    const lote = lotes.find(l => l.id === a.lote_id)
    const ciclo = cicloDoLote(a.lote_id)
    return {
      ...a,
      loteNome: lote?.nome_lote ?? '— (sem lote)',
      cicloNumero: ciclo?.numero ?? null,
      cicloNome: ciclo?.nome ?? '—',
    }
  }), [animais, lotes, cicloDoLote])

  const fornecedores = useMemo(
    () => Array.from(new Set(linhas.map(l => l.fornecedor))).sort(),
    [linhas]
  )

  const ciclosDisponiveis = useMemo(() => {
    const base = filtroLote === 'todos' ? linhas : linhas.filter(l => l.lote_id === filtroLote)
    return Array.from(new Set(base.map(l => l.cicloNumero).filter((n): n is number => n != null)))
      .sort((a, b) => a - b)
  }, [linhas, filtroLote])

  const filtradas = useMemo(() => linhas.filter(l =>
    (filtroLote === 'todos' || l.lote_id === filtroLote) &&
    (filtroCiclo === 'todos' || String(l.cicloNumero) === filtroCiclo) &&
    (filtroFornecedor === 'todos' || l.fornecedor === filtroFornecedor)
  ), [linhas, filtroLote, filtroCiclo, filtroFornecedor])

  const grupos = useMemo(() => {
    const mapa: Record<string, { loteId: string; loteNome: string; cicloNumero: number | null; cicloNome: string; qtd: number }> = {}
    for (const l of filtradas) {
      const chave = `${l.lote_id ?? 'sem-lote'}__${l.cicloNumero}`
      if (!mapa[chave]) {
        mapa[chave] = { loteId: l.lote_id ?? '', loteNome: l.loteNome, cicloNumero: l.cicloNumero, cicloNome: l.cicloNome, qtd: 0 }
      }
      mapa[chave].qtd++
    }
    return Object.values(mapa).sort((a, b) =>
      a.loteNome.localeCompare(b.loteNome) || (a.cicloNumero ?? 0) - (b.cicloNumero ?? 0)
    )
  }, [filtradas])

  const limparFiltros = () => { setFiltroLote('todos'); setFiltroCiclo('todos'); setFiltroFornecedor('todos') }

  if (loading || loadingLotes) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-400)' }}>Carregando...</div>
  }

  return (
    <div>
      <PageHeader title="Fazenda Hoje" subtitle="Situação atual dos animais ativos — por lote, ciclo e fornecedor" />

      <div className="card" style={{ marginBottom: 20, display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div className="form-group" style={{ minWidth: 200 }}>
          <label className="form-label">Lote</label>
          <select className="form-input" value={filtroLote}
            onChange={e => { setFiltroLote(e.target.value); setFiltroCiclo('todos') }}>
            <option value="todos">Todos os lotes</option>
            {lotesAtivos.map(l => <option key={l.id} value={l.id}>{l.nome_lote}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ minWidth: 140 }}>
          <label className="form-label">Ciclo</label>
          <select className="form-input" value={filtroCiclo} onChange={e => setFiltroCiclo(e.target.value)}>
            <option value="todos">Todos os ciclos</option>
            {ciclosDisponiveis.map(n => <option key={n} value={String(n)}>Ciclo {n}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ minWidth: 220 }}>
          <label className="form-label">Fornecedor</label>
          <select className="form-input" value={filtroFornecedor} onChange={e => setFiltroFornecedor(e.target.value)}>
            <option value="todos">Todos os fornecedores</option>
            {fornecedores.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        {(filtroLote !== 'todos' || filtroCiclo !== 'todos' || filtroFornecedor !== 'todos') && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={limparFiltros}>Limpar filtros</button>
        )}
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
          {filtradas.length} animal{filtradas.length !== 1 ? 'is' : ''} ativo{filtradas.length !== 1 ? 's' : ''} nesse filtro
        </div>
        {grupos.length === 0 ? (
          <EmptyState title="Nenhum animal encontrado" desc="Ajuste os filtros acima." />
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Lote</th><th>Ciclo</th><th style={{ textAlign: 'right' }}>Qtd. animais</th></tr></thead>
              <tbody>
                {grupos.map(g => (
                  <tr key={`${g.loteId}-${g.cicloNumero}`} style={{ cursor: 'pointer' }}
                    onClick={() => { setFiltroLote(g.loteId || 'todos'); setFiltroCiclo(g.cicloNumero != null ? String(g.cicloNumero) : 'todos') }}>
                    <td>{g.loteNome}</td>
                    <td>{g.cicloNome}</td>
                    <td style={{ textAlign: 'right' }}>{g.qtd}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Animais</div>
        {filtradas.length === 0 ? (
          <EmptyState title="Nenhum animal" />
        ) : (
          <div className="table-wrap" style={{ maxHeight: 480, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th>Código</th><th>Brinco</th><th>Lote</th><th>Ciclo</th><th>Fornecedor</th>
                  <th style={{ textAlign: 'right' }}>Peso entrada (kg)</th>
                </tr>
              </thead>
              <tbody>
                {filtradas.map(a => (
                  <tr key={a.id}>
                    <td>{a.codigo}</td>
                    <td>{a.brinco}</td>
                    <td>{a.loteNome}</td>
                    <td>{a.cicloNome}</td>
                    <td>{a.fornecedor}</td>
                    <td style={{ textAlign: 'right' }}>{fmtNum(a.peso_entrada, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
