import { useState, useEffect, useMemo, useCallback } from 'react'
import { useLotes, useCustoEngine, buscarPorIds } from '@/hooks/useLotes'
import { useFaixas } from '@/hooks/useFaixas'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { PageHeader, EmptyState } from '@/components/common/UI'
import { fmt, fmtNum, obterRendimento, obterBonus } from '@/lib/calculations'

type Criterio = 'rendimento' | 'ganho' | 'custo_kg' | 'lucro' | 'peso'
const CRITERIOS: Array<{ value: Criterio; label: string }> = [
  { value: 'lucro',    label: 'Lucro' },
  { value: 'peso',     label: 'Peso' },
  { value: 'ganho',    label: 'Ganho de peso' },
  { value: 'custo_kg', label: 'Custo por kg ganho' },
  { value: 'rendimento', label: 'Rendimento' },
]

const hojeStr = () => new Date().toISOString().split('T')[0]

interface LinhaAtivo {
  animal_id: string
  codigo: string
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

  const [preco, setPreco] = useState('')
  const [pctComissao, setPctComissao] = useState('2')
  const [pctEncargo, setPctEncargo] = useState('1.5')

  const [ativos, setAtivos] = useState<LinhaAtivo[]>([])
  const [vendidos, setVendidos] = useState<LinhaVendido[]>([])
  const [loadingAtivos, setLoadingAtivos] = useState(true)
  const [loadingVendidos, setLoadingVendidos] = useState(true)

  const carregarAtivos = useCallback(async () => {
    if (!user) return
    setLoadingAtivos(true)
    const { data: animaisData } = await supabase
      .from('animais').select('id, codigo, peso_entrada, valor_compra, lote_atual_id, data_entrada')
      .eq('user_id', user.id).eq('status', 'ativo')

    const lista = (animaisData ?? []) as Array<{ id: string; codigo: string; peso_entrada: number; valor_compra: number; lote_atual_id: string; data_entrada: string }>
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
        animal_id: a.id, codigo: a.codigo,
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
      .select('animal_id, data, peso, custo_atribuido, lucro, lote_origem_id, animais(codigo, peso_entrada)')
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
          animal_id: m.animal_id, codigo: m.animais.codigo,
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

  const loading = tab === 'ativos' ? loadingAtivos : loadingVendidos
  const listaVazia = tab === 'ativos' ? ativosOrdenados.length === 0 : vendidosOrdenados.length === 0

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
                  <th>#</th><th>Código</th><th>Lote</th><th>Peso atual</th><th>Ganho de peso</th>
                  <th>Custo/kg ganho</th><th>Lucro projetado</th>
                </tr>
              </thead>
              <tbody>
                {ativosOrdenados.map((a, idx) => (
                  <tr key={a.animal_id}>
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
                  <th>#</th><th>Código</th><th>Lote de origem</th><th>Data</th><th>Peso na venda</th>
                  <th>Ganho de peso</th><th>Custo/kg ganho</th><th>Lucro</th>
                </tr>
              </thead>
              <tbody>
                {vendidosOrdenados.map((v, idx) => (
                  <tr key={v.animal_id}>
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
    </div>
  )
}
