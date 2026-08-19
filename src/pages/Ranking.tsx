import { useState, useEffect, useMemo, useCallback } from 'react'
import { useLotes, useCustoEngine, buscarPorIds } from '@/hooks/useLotes'
import { useFaixas } from '@/hooks/useFaixas'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { PageHeader, EmptyState } from '@/components/common/UI'
import { fmt, fmtNum, fmtData, obterRendimento, obterBonus } from '@/lib/calculations'

type Criterio = 'rendimento' | 'ganho' | 'custo_kg' | 'lucro' | 'peso'
const CRITERIOS: Array<{ value: Criterio; label: string }> = [
  { value: 'lucro',    label: 'Lucro' },
  { value: 'peso',     label: 'Peso' },
  { value: 'ganho',    label: 'Ganho de peso' },
  { value: 'custo_kg', label: 'Custo por kg ganho' },
  { value: 'rendimento', label: 'Rendimento' },
]

// Título do PDF por critério e sentido da ordenação (aprovado com Bruno).
const TITULOS_RANKING: Record<Criterio, { desc: string; asc: string }> = {
  peso:       { desc: 'Ranking dos mais pesados', asc: 'Ranking dos mais leves' },
  ganho:      { desc: 'Ranking dos que mais ganharam peso', asc: 'Ranking dos que menos ganharam peso' },
  custo_kg:   { desc: 'Ranking dos mais caros (custo/kg)', asc: 'Ranking dos mais baratos (custo/kg)' },
  rendimento: { desc: 'Ranking dos de maior rendimento', asc: 'Ranking dos de menor rendimento' },
  lucro:      { desc: 'Ranking dos mais lucrativos', asc: 'Ranking dos menos lucrativos' },
}

const hojeStr = () => new Date().toISOString().split('T')[0]

// Ordenação numérica natural do brinco (texto), ex: "9" antes de "10".
const compararBrincoNatural = (a: string, b: string) =>
  (a ?? '').localeCompare(b ?? '', 'pt-BR', { numeric: true, sensitivity: 'base' })

interface LinhaAtivo {
  animal_id: string
  codigo: string
  brinco: string
  loteId: string
  loteNome: string
  pesoEntrada: number
  pesoAtual: number
  ganho: number
  diasConfinamento: number
  rendPct: number
  custoAcumulado: number
  custoPorKg: number | null
  valorCompra: number
  lucroProjetado: number | null
}

interface LinhaVendido {
  animal_id: string
  codigo: string
  brinco: string
  loteId: string | null
  loteNome: string
  data: string
  pesoEntrada: number
  pesoVenda: number
  ganho: number
  rendPct: number
  custoAtribuido: number
  custoPorKg: number | null
  lucro: number
}

export default function Ranking() {
  const { user } = useAuth()
  const { lotes } = useLotes()
  const { calcularEmLote } = useCustoEngine()
  const { rendimentos, bonus } = useFaixas()

  const [tab, setTab] = useState<'ativos' | 'vendidos'>('ativos')
  const [loteFiltro, setLoteFiltro] = useState('todos')
  const [criterio, setCriterio] = useState<Criterio>('ganho')
  const [ordemDesc, setOrdemDesc] = useState(true)
  const [topN, setTopN] = useState('')

  const [preco, setPreco] = useState('')
  const [pctComissao, setPctComissao] = useState('2')
  const [pctEncargo, setPctEncargo] = useState('1.5')

  const [ativos, setAtivos] = useState<LinhaAtivo[]>([])
  const [vendidos, setVendidos] = useState<LinhaVendido[]>([])
  const [loadingAtivos, setLoadingAtivos] = useState(true)
  const [loadingVendidos, setLoadingVendidos] = useState(true)

  const [selecionadosAtivos, setSelecionadosAtivos] = useState<Set<string>>(new Set())
  const [selecionadosVendidos, setSelecionadosVendidos] = useState<Set<string>>(new Set())

  const carregarAtivos = useCallback(async () => {
    if (!user) return
    setLoadingAtivos(true)
    const { data: animaisData } = await supabase
      .from('animais').select('id, codigo, brinco, peso_entrada, valor_compra, lote_atual_id, data_entrada')
      .eq('user_id', user.id).eq('status', 'ativo')

    const lista = (animaisData ?? []) as Array<{ id: string; codigo: string; brinco: string; peso_entrada: number; valor_compra: number; lote_atual_id: string; data_entrada: string }>
    if (lista.length === 0) { setAtivos([]); setLoadingAtivos(false); return }

    const [custos, custosVarData] = await Promise.all([
      calcularEmLote(lista.map(a => a.id), hojeStr()),
      buscarPorIds<{ animal_id: string; valor: number }>(lista.map(a => a.id), (idsChunk, from, to) =>
        supabase.from('custos_variaveis_animal').select('animal_id, valor').in('animal_id', idsChunk).range(from, to)),
    ])
    const custosVarPorAnimal: Record<string, number> = {}
    for (const c of custosVarData) {
      custosVarPorAnimal[c.animal_id] = (custosVarPorAnimal[c.animal_id] ?? 0) + c.valor
    }

    const linhas: LinhaAtivo[] = lista.map(a => {
      const r = custos[a.id]
      const pesoAtual = r?.peso ?? a.peso_entrada
      const ganho = pesoAtual - a.peso_entrada
      const custoAcumulado = (r?.custoAcumulado ?? 0) + (custosVarPorAnimal[a.id] ?? 0)
      const rendPct = obterRendimento(pesoAtual, rendimentos)
      const custoPorKg = ganho > 0 ? custoAcumulado / ganho : null
      return {
        animal_id: a.id, codigo: a.codigo, brinco: a.brinco,
        loteId: a.lote_atual_id, loteNome: lotes.find(l => l.id === a.lote_atual_id)?.nome_lote ?? '—',
        pesoEntrada: a.peso_entrada, pesoAtual, ganho,
        diasConfinamento: r?.diasConfinamento ?? 0,
        rendPct, custoAcumulado, custoPorKg,
        valorCompra: a.valor_compra, lucroProjetado: null,
      }
    })
    setAtivos(linhas)
    setLoadingAtivos(false)
  }, [user, calcularEmLote, lotes, rendimentos])

  const carregarVendidos = useCallback(async () => {
    if (!user) return
    setLoadingVendidos(true)
    const { data: movsData } = await supabase
      .from('movimentacoes_animais')
      .select('animal_id, data, peso, custo_atribuido, lucro, lote_origem_id, animais(codigo, brinco, peso_entrada)')
      .eq('user_id', user.id).not('lucro', 'is', null)
      .in('tipo', ['saida_venda', 'saida_abate', 'saida_transferencia', 'saida_morte'])

    const movs = (movsData ?? []) as any[]
    const loteIds = Array.from(new Set(movs.map(m => m.lote_origem_id).filter(Boolean)))
    const { data: lotesData } = loteIds.length > 0
      ? await supabase.from('lotes').select('id, nome_lote').in('id', loteIds)
      : { data: [] }
    const nomePorLote: Record<string, string> = {}
    for (const l of (lotesData ?? []) as Array<{ id: string; nome_lote: string }>) nomePorLote[l.id] = l.nome_lote

    const linhas: LinhaVendido[] = movs
      .filter(m => m.animais && m.peso != null)
      .map(m => {
        const pesoEntrada = m.animais.peso_entrada as number
        const ganho = m.peso - pesoEntrada
        const rendPct = obterRendimento(m.peso, rendimentos)
        const custoPorKg = ganho > 0 && m.custo_atribuido != null ? m.custo_atribuido / ganho : null
        return {
          animal_id: m.animal_id, codigo: m.animais.codigo, brinco: m.animais.brinco,
          loteId: m.lote_origem_id ?? null,
          loteNome: m.lote_origem_id ? (nomePorLote[m.lote_origem_id] ?? '—') : '—',
          data: m.data, pesoEntrada, pesoVenda: m.peso, ganho, rendPct,
          custoAtribuido: m.custo_atribuido ?? 0, custoPorKg, lucro: m.lucro ?? 0,
        }
      })
    setVendidos(linhas)
    setLoadingVendidos(false)
  }, [user, rendimentos])

  useEffect(() => { carregarAtivos() }, [carregarAtivos])
  useEffect(() => { carregarVendidos() }, [carregarVendidos])

  const ativosComLucro = useMemo(() => {
    if (!preco || Number(preco) <= 0) return ativos
    const p = Number(preco)
    const pc = Number(pctComissao) || 0
    const pe = Number(pctEncargo) || 0
    return ativos.map(a => {
      const pesoCarcaca = a.pesoAtual * (a.rendPct / 100)
      const valorBonus = pesoCarcaca * obterBonus(a.pesoAtual, bonus)
      const receitaBruta = a.pesoAtual * p + valorBonus
      const receitaLiquida = receitaBruta * (1 - pc / 100 - pe / 100)
      const custoTotal = a.valorCompra + a.custoAcumulado
      return { ...a, lucroProjetado: receitaLiquida - custoTotal }
    })
  }, [ativos, preco, pctComissao, pctEncargo, bonus])

  const ativosFiltrados = loteFiltro === 'todos' ? ativosComLucro : ativosComLucro.filter(a => a.loteId === loteFiltro)
  const vendidosFiltrados = loteFiltro === 'todos' ? vendidos : vendidos.filter(v => v.loteId === loteFiltro)

  const criteriosDisponiveis = tab === 'ativos'
    ? CRITERIOS.filter(c => c.value !== 'lucro' || preco)
    : CRITERIOS

  useEffect(() => {
    if (tab === 'ativos' && criterio === 'lucro' && !preco) setCriterio('ganho')
  }, [tab, preco, criterio])

  const ativosOrdenados = useMemo(() => {
    const arr = [...ativosFiltrados]
    const key = (a: LinhaAtivo) => criterio === 'rendimento' ? a.rendPct : criterio === 'peso' ? a.pesoAtual : criterio === 'ganho' ? a.ganho : criterio === 'custo_kg' ? (a.custoPorKg ?? -Infinity) : (a.lucroProjetado ?? -Infinity)
    arr.sort((a, b) => (key(b) - key(a)) * (ordemDesc ? 1 : -1))
    return arr
  }, [ativosFiltrados, criterio, ordemDesc])

  const vendidosOrdenados = useMemo(() => {
    const arr = [...vendidosFiltrados]
    const key = (v: LinhaVendido) => criterio === 'rendimento' ? v.rendPct : criterio === 'peso' ? v.pesoVenda : criterio === 'ganho' ? v.ganho : criterio === 'custo_kg' ? (v.custoPorKg ?? -Infinity) : v.lucro
    arr.sort((a, b) => (key(b) - key(a)) * (ordemDesc ? 1 : -1))
    return arr
  }, [vendidosFiltrados, criterio, ordemDesc])

  // Filtro "Top N": limita a lista já ordenada aos N primeiros colocados.
  const topNNumero = useMemo(() => {
    const n = parseInt(topN, 10)
    return topN.trim() !== '' && !isNaN(n) && n > 0 ? n : null
  }, [topN])

  const ativosParaExibir = useMemo(
    () => topNNumero != null ? ativosOrdenados.slice(0, topNNumero) : ativosOrdenados,
    [ativosOrdenados, topNNumero]
  )
  const vendidosParaExibir = useMemo(
    () => topNNumero != null ? vendidosOrdenados.slice(0, topNNumero) : vendidosOrdenados,
    [vendidosOrdenados, topNNumero]
  )

  const loading = tab === 'ativos' ? loadingAtivos : loadingVendidos
  const listaVazia = tab === 'ativos' ? ativosParaExibir.length === 0 : vendidosParaExibir.length === 0

  // ─── Seleção de animais para exportação ────────────────────────────────
  const toggleSelecionadoAtivo = (id: string) => {
    setSelecionadosAtivos(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  const toggleSelecionadoVendido = (id: string) => {
    setSelecionadosVendidos(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const todosAtivosVisiveisSelecionados = ativosParaExibir.length > 0 && ativosParaExibir.every(a => selecionadosAtivos.has(a.animal_id))
  const todosVendidosVisiveisSelecionados = vendidosParaExibir.length > 0 && vendidosParaExibir.every(v => selecionadosVendidos.has(v.animal_id))

  const toggleSelecionarTodosAtivos = () => {
    setSelecionadosAtivos(prev => {
      const next = new Set(prev)
      const ids = ativosParaExibir.map(a => a.animal_id)
      if (todosAtivosVisiveisSelecionados) ids.forEach(id => next.delete(id))
      else ids.forEach(id => next.add(id))
      return next
    })
  }
  const toggleSelecionarTodosVendidos = () => {
    setSelecionadosVendidos(prev => {
      const next = new Set(prev)
      const ids = vendidosParaExibir.map(v => v.animal_id)
      if (todosVendidosVisiveisSelecionados) ids.forEach(id => next.delete(id))
      else ids.forEach(id => next.add(id))
      return next
    })
  }

  // ─── Dados para o PDF: apenas selecionados, ordenados por brinco ──────
  const ativosParaPdf = useMemo(
    () => ativosOrdenados.filter(a => selecionadosAtivos.has(a.animal_id)).sort((a, b) => compararBrincoNatural(a.brinco, b.brinco)),
    [ativosOrdenados, selecionadosAtivos]
  )
  const vendidosParaPdf = useMemo(
    () => vendidosOrdenados.filter(v => selecionadosVendidos.has(v.animal_id)).sort((a, b) => compararBrincoNatural(a.brinco, b.brinco)),
    [vendidosOrdenados, selecionadosVendidos]
  )

  const tituloPdf = TITULOS_RANKING[criterio][ordemDesc ? 'desc' : 'asc']
  const qtdSelecionados = tab === 'ativos' ? selecionadosAtivos.size : selecionadosVendidos.size
  const podeExportar = qtdSelecionados > 0

  return (
    <div className="page">
      <PageHeader title="Ranking" subtitle="Desempenho dos animais por rendimento, ganho de peso e lucro" />

      <div className="tabs">
        <button className={`tab-btn${tab === 'ativos' ? ' active' : ''}`} onClick={() => setTab('ativos')}>Ativos</button>
        <button className={`tab-btn${tab === 'vendidos' ? ' active' : ''}`} onClick={() => setTab('vendidos')}>Vendidos</button>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
        <div className="form-group" style={{ minWidth: 200 }}>
          <label className="form-label">Filtrar por lote</label>
          <select className="form-input" value={loteFiltro} onChange={e => setLoteFiltro(e.target.value)}>
            <option value="todos">Todos os lotes</option>
            {lotes.map(l => <option key={l.id} value={l.id}>{l.nome_lote}</option>)}
          </select>
        </div>
        <div className="form-group" style={{ minWidth: 200 }}>
          <label className="form-label">Ordenar por</label>
          <select className="form-input" value={criterio} onChange={e => setCriterio(e.target.value as Criterio)}>
            {criteriosDisponiveis.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <button className="btn btn-ghost" onClick={() => setOrdemDesc(v => !v)}>
          {ordemDesc ? 'Maior primeiro' : 'Menor primeiro'}
        </button>
        <div className="form-group" style={{ minWidth: 140 }}>
          <label className="form-label">Top N (opcional)</label>
          <input
            className="form-input" type="number" min="1" placeholder="Todos"
            value={topN} onChange={e => setTopN(e.target.value)}
          />
        </div>
        <button
          className="btn btn-primary"
          disabled={!podeExportar}
          onClick={() => window.print()}
        >
          Exportar PDF{qtdSelecionados > 0 ? ` (${qtdSelecionados})` : ''}
        </button>
      </div>

      {tab === 'ativos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
            Informe um preço esperado para incluir o lucro projetado no ranking dos animais ativos (ainda não vendidos).
          </div>
          <div className="form-row-3">
            <div className="form-group">
              <label className="form-label">Preço esperado (R$/kg vivo)</label>
              <input className="form-input" type="number" step="0.01" value={preco} onChange={e => setPreco(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">% comissão</label>
              <input className="form-input" type="number" step="0.1" value={pctComissao} onChange={e => setPctComissao(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">% encargo</label>
              <input className="form-input" type="number" step="0.1" value={pctEncargo} onChange={e => setPctEncargo(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div className="spinner" style={{ width: 28, height: 28 }} />
        </div>
      ) : listaVazia ? (
        <div className="card">
          <EmptyState icon="◆" title={tab === 'ativos' ? 'Nenhum animal ativo' : 'Nenhuma venda registrada'} />
        </div>
      ) : tab === 'ativos' ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input type="checkbox" checked={todosAtivosVisiveisSelecionados} onChange={toggleSelecionarTodosAtivos} />
                  </th>
                  <th>#</th><th>Código</th><th>Lote</th><th>Peso atual</th><th>Ganho de peso</th>
                  <th>Custo/kg ganho</th><th>Lucro projetado</th>
                </tr>
              </thead>
              <tbody>
                {ativosParaExibir.map((a, idx) => (
                  <tr key={a.animal_id}>
                    <td>
                      <input type="checkbox" checked={selecionadosAtivos.has(a.animal_id)} onChange={() => toggleSelecionadoAtivo(a.animal_id)} />
                    </td>
                    <td>{idx + 1}</td>
                    <td><strong>{a.codigo}</strong></td>
                    <td>{a.loteNome}</td>
                    <td>{fmtNum(a.pesoAtual, 1)} kg</td>
                    <td>{fmtNum(a.ganho, 1)} kg</td>
                    <td>{a.custoPorKg != null ? `${fmt(a.custoPorKg)}/kg` : '—'}</td>
                    <td style={{ color: a.lucroProjetado == null ? undefined : a.lucroProjetado >= 0 ? '#2e7d32' : '#b91c1c' }}>
                      {a.lucroProjetado != null ? fmt(a.lucroProjetado) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 36 }}>
                    <input type="checkbox" checked={todosVendidosVisiveisSelecionados} onChange={toggleSelecionarTodosVendidos} />
                  </th>
                  <th>#</th><th>Código</th><th>Lote de origem</th><th>Data</th><th>Peso na venda</th>
                  <th>Ganho de peso</th><th>Custo/kg ganho</th><th>Lucro</th>
                </tr>
              </thead>
              <tbody>
                {vendidosParaExibir.map((v, idx) => (
                  <tr key={v.animal_id}>
                    <td>
                      <input type="checkbox" checked={selecionadosVendidos.has(v.animal_id)} onChange={() => toggleSelecionadoVendido(v.animal_id)} />
                    </td>
                    <td>{idx + 1}</td>
                    <td><strong>{v.codigo}</strong></td>
                    <td>{v.loteNome}</td>
                    <td>{v.data}</td>
                    <td>{fmtNum(v.pesoVenda, 1)} kg</td>
                    <td>{fmtNum(v.ganho, 1)} kg</td>
                    <td>{v.custoPorKg != null ? `${fmt(v.custoPorKg)}/kg` : '—'}</td>
                    <td style={{ color: v.lucro >= 0 ? '#2e7d32' : '#b91c1c' }}>{fmt(v.lucro)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─── Área de impressão: ranking exportado, ordenado por brinco ───── */}
      <div className="print-area">
        <RankingPdfImprimivel
          titulo={tituloPdf}
          tab={tab}
          ativos={ativosParaPdf}
          vendidos={vendidosParaPdf}
        />
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// PDF DO RANKING — layout formal, ordenado por brinco, só aparece na impressão
// ═══════════════════════════════════════════════════════════════════════════

function RankingPdfImprimivel({
  titulo, tab, ativos, vendidos,
}: {
  titulo: string
  tab: 'ativos' | 'vendidos'
  ativos: LinhaAtivo[]
  vendidos: LinhaVendido[]
}) {
  return (
    <div style={{ fontFamily: 'Inter, sans-serif', color: '#111', maxWidth: 700, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <img src="/logo.png" alt="Confina+" style={{ height: 56, objectFit: 'contain' }} />
      </div>

      <h1 style={{ fontSize: 18, fontWeight: 700, textAlign: 'center', marginBottom: 4 }}>{titulo}</h1>
      <p style={{ fontSize: 12, textAlign: 'center', color: '#555', marginBottom: 28 }}>
        Emitido em {fmtData(new Date().toISOString().split('T')[0])} · Ordenado por brinco
      </p>

      {tab === 'ativos' ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #000' }}>
              <th style={{ textAlign: 'left', padding: '4px 6px' }}>Brinco</th>
              <th style={{ textAlign: 'left', padding: '4px 6px' }}>Código</th>
              <th style={{ textAlign: 'left', padding: '4px 6px' }}>Lote</th>
              <th style={{ textAlign: 'right', padding: '4px 6px' }}>Peso atual</th>
              <th style={{ textAlign: 'right', padding: '4px 6px' }}>Ganho de peso</th>
              <th style={{ textAlign: 'right', padding: '4px 6px' }}>Custo/kg ganho</th>
              <th style={{ textAlign: 'right', padding: '4px 6px' }}>Lucro projetado</th>
            </tr>
          </thead>
          <tbody>
            {ativos.map(a => (
              <tr key={a.animal_id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '4px 6px' }}>{a.brinco}</td>
                <td style={{ padding: '4px 6px' }}>{a.codigo}</td>
                <td style={{ padding: '4px 6px' }}>{a.loteNome}</td>
                <td style={{ textAlign: 'right', padding: '4px 6px' }}>{fmtNum(a.pesoAtual, 1)} kg</td>
                <td style={{ textAlign: 'right', padding: '4px 6px' }}>{fmtNum(a.ganho, 1)} kg</td>
                <td style={{ textAlign: 'right', padding: '4px 6px' }}>{a.custoPorKg != null ? `${fmt(a.custoPorKg)}/kg` : '—'}</td>
                <td style={{ textAlign: 'right', padding: '4px 6px' }}>{a.lucroProjetado != null ? fmt(a.lucroProjetado) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #000' }}>
              <th style={{ textAlign: 'left', padding: '4px 6px' }}>Brinco</th>
              <th style={{ textAlign: 'left', padding: '4px 6px' }}>Código</th>
              <th style={{ textAlign: 'left', padding: '4px 6px' }}>Lote de origem</th>
              <th style={{ textAlign: 'left', padding: '4px 6px' }}>Data</th>
              <th style={{ textAlign: 'right', padding: '4px 6px' }}>Peso na venda</th>
              <th style={{ textAlign: 'right', padding: '4px 6px' }}>Ganho de peso</th>
              <th style={{ textAlign: 'right', padding: '4px 6px' }}>Custo/kg ganho</th>
              <th style={{ textAlign: 'right', padding: '4px 6px' }}>Lucro</th>
            </tr>
          </thead>
          <tbody>
            {vendidos.map(v => (
              <tr key={v.animal_id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '4px 6px' }}>{v.brinco}</td>
                <td style={{ padding: '4px 6px' }}>{v.codigo}</td>
                <td style={{ padding: '4px 6px' }}>{v.loteNome}</td>
                <td style={{ padding: '4px 6px' }}>{v.data}</td>
                <td style={{ textAlign: 'right', padding: '4px 6px' }}>{fmtNum(v.pesoVenda, 1)} kg</td>
                <td style={{ textAlign: 'right', padding: '4px 6px' }}>{fmtNum(v.ganho, 1)} kg</td>
                <td style={{ textAlign: 'right', padding: '4px 6px' }}>{v.custoPorKg != null ? `${fmt(v.custoPorKg)}/kg` : '—'}</td>
                <td style={{ textAlign: 'right', padding: '4px 6px' }}>{fmt(v.lucro)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
