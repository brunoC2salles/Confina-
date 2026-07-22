import { useState, useEffect, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLotes } from '@/hooks/useLotes'
import { useDietas } from '@/hooks/useDietas'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { PageHeader, EmptyState } from '@/components/common/UI'
import { fmtData } from '@/lib/calculations'

// ─── Página "Fazenda Hoje" ──────────────────────────────────────────────────────
// Foto do momento atual: quantos animais ativos existem, por lote, por ciclo
// (ciclo atual do lote em que o animal está), por dieta em uso e por fornecedor
// da leva de compra. Não é histórico — é sempre a situação de agora.

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
  tipoCiclo: string | null
  dietaId: string | null
  dietaNome: string
  dataPrevistaFim: string | null
}

const addDias = (dataStr: string, dias: number): string => {
  const d = new Date(dataStr + 'T00:00:00')
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

export default function FazendaHoje() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { lotes, lotesAtivos, ciclosPorLote, loading: loadingLotes } = useLotes()
  const { dietas, loading: loadingDietas } = useDietas()

  const [animais, setAnimais] = useState<AnimalHoje[]>([])
  const [loading, setLoading] = useState(true)

  const [filtroLote, setFiltroLote] = useState('todos')
  const [filtroCiclo, setFiltroCiclo] = useState('todos')
  const [filtroFornecedor, setFiltroFornecedor] = useState('todos')
  const [filtroDieta, setFiltroDieta] = useState('todos')
  const [busca, setBusca] = useState('')

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

  const dietaNomePorId = useMemo(() => {
    const mapa: Record<string, string> = {}
    for (const d of dietas) mapa[d.id] = d.nome
    return mapa
  }, [dietas])

  // Ciclo "de agora" de um lote é o ciclo_atual do lote — a mesma noção usada
  // no resto do app (Lotes.tsx, motor de custo). Não é histórico por animal.
  // A data prevista de fim é calculada (data_inicio + dias_planejados) pois o
  // ciclo só ganha data_fim real quando é encerrado.
  const cicloAtualDoLote = useCallback((loteId: string | null) => {
    if (!loteId) return null
    const lote = lotes.find(l => l.id === loteId)
    if (!lote) return null
    const ciclo = (ciclosPorLote[loteId] ?? []).find(c => c.numero === lote.ciclo_atual)
    const dataPrevistaFim = ciclo?.data_inicio && ciclo?.dias_planejados
      ? addDias(ciclo.data_inicio, ciclo.dias_planejados)
      : null
    return {
      numero: lote.ciclo_atual,
      nome: ciclo?.nome ?? `Ciclo ${lote.ciclo_atual}`,
      tipoCiclo: ciclo?.tipo_ciclo ?? null,
      dietaId: ciclo?.dieta_id ?? null,
      dataPrevistaFim,
    }
  }, [lotes, ciclosPorLote])

  const linhas: LinhaHoje[] = useMemo(() => animais.map(a => {
    const lote = lotes.find(l => l.id === a.lote_id)
    const ciclo = cicloAtualDoLote(a.lote_id)
    return {
      ...a,
      loteNome: lote?.nome_lote ?? '— (sem lote)',
      cicloNumero: ciclo?.numero ?? null,
      cicloNome: ciclo?.nome ?? '—',
      tipoCiclo: ciclo?.tipoCiclo ?? null,
      dietaId: ciclo?.dietaId ?? null,
      dietaNome: ciclo?.dietaId ? (dietaNomePorId[ciclo.dietaId] ?? 'Dieta removida') : 'Sem dieta / Pastagem',
      dataPrevistaFim: ciclo?.dataPrevistaFim ?? null,
    }
  }), [animais, lotes, cicloAtualDoLote, dietaNomePorId])

  const fornecedores = useMemo(
    () => Array.from(new Set(linhas.map(l => l.fornecedor))).sort(),
    [linhas]
  )

  const ciclosDisponiveis = useMemo(() => {
    const base = filtroLote === 'todos' ? linhas : linhas.filter(l => l.lote_id === filtroLote)
    return Array.from(new Set(base.map(l => l.cicloNumero).filter((n): n is number => n != null)))
      .sort((a, b) => a - b)
  }, [linhas, filtroLote])

  const dietasDisponiveis = useMemo(() => {
    const mapa: Record<string, string> = {}
    for (const l of linhas) mapa[l.dietaId ?? 'sem-dieta'] = l.dietaNome
    return Object.entries(mapa).sort((a, b) => a[1].localeCompare(b[1]))
  }, [linhas])

  const filtradas = useMemo(() => linhas.filter(l =>
    (filtroLote === 'todos' || l.lote_id === filtroLote) &&
    (filtroCiclo === 'todos' || String(l.cicloNumero) === filtroCiclo) &&
    (filtroFornecedor === 'todos' || l.fornecedor === filtroFornecedor) &&
    (filtroDieta === 'todos' || (l.dietaId ?? 'sem-dieta') === filtroDieta)
  ), [linhas, filtroLote, filtroCiclo, filtroFornecedor, filtroDieta])

  // Cards por ciclo: agrupados por lote + ciclo, pois a data prevista e o tipo
  // de ciclo variam entre lotes mesmo quando o número do ciclo é o mesmo.
  const gruposCiclo = useMemo(() => {
    const mapa: Record<string, {
      loteId: string; loteNome: string; cicloNumero: number | null; cicloNome: string
      tipoCiclo: string | null; dataPrevistaFim: string | null; qtd: number
    }> = {}
    for (const l of filtradas) {
      const chave = `${l.lote_id ?? 'sem-lote'}__${l.cicloNumero}`
      if (!mapa[chave]) {
        mapa[chave] = {
          loteId: l.lote_id ?? '', loteNome: l.loteNome, cicloNumero: l.cicloNumero, cicloNome: l.cicloNome,
          tipoCiclo: l.tipoCiclo, dataPrevistaFim: l.dataPrevistaFim, qtd: 0,
        }
      }
      mapa[chave].qtd++
    }
    return Object.values(mapa).sort((a, b) =>
      a.loteNome.localeCompare(b.loteNome) || (a.cicloNumero ?? 0) - (b.cicloNumero ?? 0)
    )
  }, [filtradas])

  // Cards por dieta: só dietas que têm algum animal ativo consumindo agora
  // (dieta do ciclo atual do lote de cada animal).
  const gruposDieta = useMemo(() => {
    const mapa: Record<string, { dietaId: string | null; dietaNome: string; qtd: number }> = {}
    for (const l of filtradas) {
      const chave = l.dietaId ?? 'sem-dieta'
      if (!mapa[chave]) mapa[chave] = { dietaId: l.dietaId, dietaNome: l.dietaNome, qtd: 0 }
      mapa[chave].qtd++
    }
    return Object.values(mapa).sort((a, b) => b.qtd - a.qtd)
  }, [filtradas])

  const resultadosBusca = useMemo(() => {
    const termo = busca.trim().toLowerCase()
    if (!termo) return []
    return linhas
      .filter(l =>
        l.codigo.toLowerCase().includes(termo) ||
        l.brinco.toLowerCase().includes(termo) ||
        l.loteNome.toLowerCase().includes(termo))
      .slice(0, 30)
  }, [linhas, busca])

  const limparFiltros = () => {
    setFiltroLote('todos'); setFiltroCiclo('todos'); setFiltroFornecedor('todos'); setFiltroDieta('todos')
  }
  const filtrosAtivos = filtroLote !== 'todos' || filtroCiclo !== 'todos' || filtroFornecedor !== 'todos' || filtroDieta !== 'todos'

  if (loading || loadingLotes || loadingDietas) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--gray-400)' }}>Carregando...</div>
  }

  return (
    <div className="page">
      <PageHeader title="Fazenda Hoje" subtitle="Situação atual dos animais ativos — por lote, ciclo, dieta e fornecedor" />

      <div className="card" style={{ marginBottom: 20 }}>
        <div className="form-group">
          <label className="form-label">Procura rápida</label>
          <input className="form-input" placeholder="Digite o código, o brinco do animal ou o nome do lote"
            value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        {busca.trim() !== '' && (
          resultadosBusca.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 12 }}>Nenhum animal encontrado.</div>
          ) : (
            <div className="table-wrap" style={{ marginTop: 12, maxHeight: 320, overflowY: 'auto' }}>
              <table>
                <thead><tr><th>Código</th><th>Brinco</th><th>Lote</th><th>Ciclo</th></tr></thead>
                <tbody>
                  {resultadosBusca.map(a => (
                    <tr key={a.id} style={{ cursor: a.lote_id ? 'pointer' : 'default' }}
                      onClick={() => { if (a.lote_id) navigate(`/lotes?detalhe=${a.lote_id}&animal=${a.id}`) }}>
                      <td><strong>{a.codigo}</strong></td>
                      <td>{a.brinco}</td>
                      <td>{a.loteNome}</td>
                      <td>{a.cicloNome}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

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
        <div className="form-group" style={{ minWidth: 200 }}>
          <label className="form-label">Dieta</label>
          <select className="form-input" value={filtroDieta} onChange={e => setFiltroDieta(e.target.value)}>
            <option value="todos">Todas as dietas</option>
            {dietasDisponiveis.map(([valor, nome]) => <option key={valor} value={valor}>{nome}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ minWidth: 220 }}>
          <label className="form-label">Fornecedor</label>
          <select className="form-input" value={filtroFornecedor} onChange={e => setFiltroFornecedor(e.target.value)}>
            <option value="todos">Todos os fornecedores</option>
            {fornecedores.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        {filtrosAtivos && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={limparFiltros}>Limpar filtros</button>
        )}
      </div>

      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>
        {filtradas.length} animal{filtradas.length !== 1 ? 'is' : ''} ativo{filtradas.length !== 1 ? 's' : ''} nesse filtro
      </div>

      {filtradas.length === 0 ? (
        <div className="card" style={{ marginBottom: 20 }}>
          <EmptyState title="Nenhum animal encontrado" desc="Ajuste os filtros acima." />
        </div>
      ) : (
        <>
          <div style={{ fontSize: 10, color: 'var(--gray-400)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 10 }}>
            Por lote e ciclo
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(240px,1fr))', gap: 12, marginBottom: 24 }}>
            {gruposCiclo.map(g => (
              <div key={`${g.loteId}-${g.cicloNumero}`} className="card"
                style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4 }}
                onClick={() => { setFiltroLote(g.loteId || 'todos'); setFiltroCiclo(g.cicloNumero != null ? String(g.cicloNumero) : 'todos') }}>
                <div className="flex-between" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{g.loteNome}</div>
                    <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 2 }}>{g.cicloNome}</div>
                  </div>
                  {g.tipoCiclo && (
                    <span className={`badge ${g.tipoCiclo === 'confinamento' ? 'badge-green' : 'badge-amber'}`}>
                      {g.tipoCiclo === 'confinamento' ? 'Confinamento' : 'Pastagem'}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 30, fontWeight: 700, color: 'var(--green-dark)', marginTop: 8 }}>{g.qtd}</div>
                <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>animal{g.qtd !== 1 ? 'is' : ''} ativo{g.qtd !== 1 ? 's' : ''}</div>
                {g.dataPrevistaFim && (
                  <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                    Previsto até {fmtData(g.dataPrevistaFim)}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ fontSize: 10, color: 'var(--gray-400)', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 10 }}>
            Por dieta em uso
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(200px,1fr))', gap: 12, marginBottom: 20 }}>
            {gruposDieta.map(g => (
              <div key={g.dietaId ?? 'sem-dieta'} className="card"
                style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4 }}
                onClick={() => setFiltroDieta(g.dietaId ?? 'sem-dieta')}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{g.dietaNome}</div>
                <div style={{ fontSize: 30, fontWeight: 700, color: 'var(--green-dark)', marginTop: 8 }}>{g.qtd}</div>
                <div style={{ fontSize: 11, color: 'var(--gray-500)' }}>animal{g.qtd !== 1 ? 'is' : ''} nessa dieta</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
