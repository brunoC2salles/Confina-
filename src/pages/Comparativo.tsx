import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useLotes, useCustoEngine } from '@/hooks/useLotes'
import { useFaixas } from '@/hooks/useFaixas'
import { supabase } from '@/lib/supabase'
import { PageHeader, EmptyState } from '@/components/common/UI'
import { fmt, fmtNum, obterRendimento, obterBonus } from '@/lib/calculations'

const hojeStr = () => new Date().toISOString().split('T')[0]

// ─── Linha: lotes com animais ainda ativos (peso/GMD/custo atuais, lucro é projeção) ─
interface LinhaAtivo {
  loteId: string
  loteNome: string
  status: string
  qtd: number
  pesoMedio: number
  gmdMedio: number
  custoPorKg: number | null
  valorCompraTotal: number
  custoAcumuladoTotal: number
  lucroProjetado: number | null
  margemProjetada: number | null
}

// ─── Linha: lotes com vendas já registradas (dados realizados, não projetados) ───
interface LinhaVendido {
  loteId: string
  loteNome: string
  qtd: number
  pesoMedioVenda: number
  gmdMedio: number
  custoPorKg: number | null
  lucroTotal: number
  margemPct: number | null
  lucroPorAnimal: number
}

export default function Comparativo() {
  const { user } = useAuth()
  const { lotes } = useLotes()
  const { calcularEmLote } = useCustoEngine()
  const { rendimentos, bonus } = useFaixas()

  const [tab, setTab] = useState<'ativos' | 'vendidos'>('ativos')
  const [ativos, setAtivos] = useState<LinhaAtivo[]>([])
  const [vendidos, setVendidos] = useState<LinhaVendido[]>([])
  const [loadingAtivos, setLoadingAtivos] = useState(true)
  const [loadingVendidos, setLoadingVendidos] = useState(true)

  const [preco, setPreco] = useState('')
  const [pctComissao, setPctComissao] = useState('2')
  const [pctEncargo, setPctEncargo] = useState('1.5')

  const nomePorLote = useMemo(() => {
    const m: Record<string, { nome: string; status: string }> = {}
    for (const l of lotes) m[l.id] = { nome: l.nome_lote, status: l.status }
    return m
  }, [lotes])

  // ─── Lotes com animais ativos: peso/GMD/custo são o estado atual; lucro e
  // margem só aparecem se um preço esperado for informado (projeção, igual à
  // do Ranking) — sem preço, ficam em branco em vez de inventar um valor. ───
  const carregarAtivos = useCallback(async () => {
    if (!user) return
    setLoadingAtivos(true)
    const { data: animaisData } = await supabase
      .from('animais').select('id, peso_entrada, valor_compra, lote_atual_id')
      .eq('user_id', user.id).eq('status', 'ativo')

    const lista = (animaisData ?? []) as Array<{ id: string; peso_entrada: number; valor_compra: number; lote_atual_id: string }>
    if (lista.length === 0) { setAtivos([]); setLoadingAtivos(false); return }

    const [resultados, { data: custosVarData }] = await Promise.all([
      calcularEmLote(lista.map(a => a.id), hojeStr()),
      supabase.from('custos_variaveis_animal').select('animal_id, valor').in('animal_id', lista.map(a => a.id)),
    ])
    const custosVarPorAnimal: Record<string, number> = {}
    for (const c of (custosVarData ?? []) as Array<{ animal_id: string; valor: number }>) {
      custosVarPorAnimal[c.animal_id] = (custosVarPorAnimal[c.animal_id] ?? 0) + c.valor
    }

    const p = Number(preco) || 0
    const pc = Number(pctComissao) || 0
    const pe = Number(pctEncargo) || 0

    const grupos: Record<string, {
      qtd: number; pesoSoma: number; gmdSoma: number; ganhoSoma: number
      custoAlimSoma: number; custoOpSoma: number; custoVarSoma: number
      valorCompraSoma: number; receitaLiquidaSoma: number; custoTotalSoma: number
    }> = {}

    for (const a of lista) {
      const r = resultados[a.id]
      if (!r) continue
      const g = grupos[a.lote_atual_id] ??= {
        qtd: 0, pesoSoma: 0, gmdSoma: 0, ganhoSoma: 0,
        custoAlimSoma: 0, custoOpSoma: 0, custoVarSoma: 0,
        valorCompraSoma: 0, receitaLiquidaSoma: 0, custoTotalSoma: 0,
      }
      const custoVar = custosVarPorAnimal[a.id] ?? 0
      const custoTotalAnimal = r.custoAcumulado + custoVar + a.valor_compra
      const ganho = r.peso - a.peso_entrada

      g.qtd += 1
      g.pesoSoma += r.peso
      g.gmdSoma += r.gmdMedio
      g.ganhoSoma += ganho
      g.custoAlimSoma += r.custoAlimentacao
      g.custoOpSoma += r.custoOperacional
      g.custoVarSoma += custoVar
      g.valorCompraSoma += a.valor_compra
      g.custoTotalSoma += custoTotalAnimal

      if (p > 0) {
        const rendPct = obterRendimento(r.peso, rendimentos)
        const pesoCarcaca = r.peso * (rendPct / 100)
        const valorBonus = pesoCarcaca * obterBonus(r.peso, bonus)
        const receitaBruta = r.peso * p + valorBonus
        g.receitaLiquidaSoma += receitaBruta * (1 - pc / 100 - pe / 100)
      }
    }

    const linhas: LinhaAtivo[] = Object.entries(grupos).map(([loteId, g]) => {
      const lucroProjetado = p > 0 ? g.receitaLiquidaSoma - g.custoTotalSoma : null
      return {
        loteId, loteNome: nomePorLote[loteId]?.nome ?? '—', status: nomePorLote[loteId]?.status ?? '—',
        qtd: g.qtd,
        pesoMedio: g.qtd > 0 ? g.pesoSoma / g.qtd : 0,
        gmdMedio: g.qtd > 0 ? g.gmdSoma / g.qtd : 0,
        custoPorKg: g.ganhoSoma > 0 ? (g.custoAlimSoma + g.custoOpSoma) / g.ganhoSoma : null,
        valorCompraTotal: g.valorCompraSoma,
        custoAcumuladoTotal: g.custoAlimSoma + g.custoOpSoma + g.custoVarSoma,
        lucroProjetado,
        margemProjetada: p > 0 && g.receitaLiquidaSoma > 0 ? (lucroProjetado! / g.receitaLiquidaSoma) * 100 : null,
      }
    })
    setAtivos(linhas)
    setLoadingAtivos(false)
  }, [user, calcularEmLote, nomePorLote, preco, pctComissao, pctEncargo, rendimentos, bonus])

  // ─── Lotes com vendas registradas: dados realizados (peso na venda, custo e
  // lucro já liquidados na hora da venda), não é projeção. Um lote pode
  // aparecer aqui mesmo ainda ativo, se já teve alguma venda parcial. ───
  const carregarVendidos = useCallback(async () => {
    if (!user) return
    setLoadingVendidos(true)
    const { data: movsData } = await supabase
      .from('movimentacoes_animais')
      .select('data, peso, valor, custo_atribuido, lucro, lote_origem_id, animais(peso_entrada, data_entrada)')
      .eq('user_id', user.id).not('lucro', 'is', null)
      .in('tipo', ['saida_venda', 'saida_abate', 'saida_transferencia', 'saida_morte'])

    const movs = (movsData ?? []) as any[]

    const grupos: Record<string, {
      qtd: number; pesoSoma: number; ganhoSoma: number; diasSoma: number
      custoSoma: number; lucroSoma: number; receitaSoma: number
    }> = {}

    for (const m of movs) {
      if (!m.lote_origem_id || !m.animais || m.peso == null) continue
      const g = grupos[m.lote_origem_id] ??= { qtd: 0, pesoSoma: 0, ganhoSoma: 0, diasSoma: 0, custoSoma: 0, lucroSoma: 0, receitaSoma: 0 }
      const pesoEntrada = m.animais.peso_entrada as number
      const dataEntrada = m.animais.data_entrada as string
      const ganho = m.peso - pesoEntrada
      const dias = Math.max(0, Math.floor((new Date(m.data).getTime() - new Date(dataEntrada).getTime()) / 86400000))

      g.qtd += 1
      g.pesoSoma += m.peso
      g.ganhoSoma += ganho
      g.diasSoma += dias
      g.custoSoma += m.custo_atribuido ?? 0
      g.lucroSoma += m.lucro ?? 0
      g.receitaSoma += m.valor ?? 0
    }

    const linhas: LinhaVendido[] = Object.entries(grupos).map(([loteId, g]) => ({
      loteId, loteNome: nomePorLote[loteId]?.nome ?? '—',
      qtd: g.qtd,
      pesoMedioVenda: g.qtd > 0 ? g.pesoSoma / g.qtd : 0,
      gmdMedio: g.diasSoma > 0 ? g.ganhoSoma / g.diasSoma : 0,
      custoPorKg: g.ganhoSoma > 0 ? g.custoSoma / g.ganhoSoma : null,
      lucroTotal: g.lucroSoma,
      margemPct: g.receitaSoma > 0 ? (g.lucroSoma / g.receitaSoma) * 100 : null,
      lucroPorAnimal: g.qtd > 0 ? g.lucroSoma / g.qtd : 0,
    }))
    setVendidos(linhas)
    setLoadingVendidos(false)
  }, [user, nomePorLote])

  useEffect(() => { carregarAtivos() }, [carregarAtivos])
  useEffect(() => { carregarVendidos() }, [carregarVendidos])

  const loading = tab === 'ativos' ? loadingAtivos : loadingVendidos
  const listaVazia = tab === 'ativos' ? ativos.length === 0 : vendidos.length === 0

  return (
    <div className="page">
      <PageHeader title="Comparativo de lotes" subtitle="Lotes lado a lado — peso médio, GMD, custo/kg ganho, lucro e margem" />

      <div className="tabs">
        <button className={`tab-btn${tab === 'ativos' ? ' active' : ''}`} onClick={() => setTab('ativos')}>Com animais ativos</button>
        <button className={`tab-btn${tab === 'vendidos' ? ' active' : ''}`} onClick={() => setTab('vendidos')}>Com vendas registradas</button>
      </div>

      {tab === 'ativos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
            Peso, GMD e custo/kg são o estado atual dos lotes. Lucro e margem só aparecem se você informar um preço esperado — sem preço, essas colunas ficam em branco (projeção, não realizado).
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
          <EmptyState icon="◨" title={tab === 'ativos' ? 'Nenhum lote com animais ativos' : 'Nenhuma venda registrada ainda'} />
        </div>
      ) : tab === 'ativos' ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Lote</th><th>Animais</th><th>Peso médio</th><th>GMD</th>
                  <th>Custo/kg ganho</th><th>Valor investido</th><th>Lucro projetado</th><th>Margem projetada</th>
                </tr>
              </thead>
              <tbody>
                {ativos.map(l => (
                  <tr key={l.loteId}>
                    <td><strong>{l.loteNome}</strong></td>
                    <td>{l.qtd}</td>
                    <td>{fmtNum(l.pesoMedio, 1)} kg</td>
                    <td>{fmtNum(l.gmdMedio, 2)} kg/dia</td>
                    <td>{l.custoPorKg != null ? `${fmt(l.custoPorKg)}/kg` : '—'}</td>
                    <td>{fmt(l.valorCompraTotal)}</td>
                    <td style={{ color: l.lucroProjetado == null ? undefined : l.lucroProjetado >= 0 ? '#2e7d32' : '#b91c1c' }}>
                      {l.lucroProjetado != null ? fmt(l.lucroProjetado) : '—'}
                    </td>
                    <td>{l.margemProjetada != null ? `${fmtNum(l.margemProjetada, 1)}%` : '—'}</td>
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
                  <th>Lote</th><th>Animais vendidos</th><th>Peso médio na venda</th><th>GMD</th>
                  <th>Custo/kg ganho</th><th>Lucro total</th><th>Margem</th><th>Lucro por animal</th>
                </tr>
              </thead>
              <tbody>
                {vendidos.map(l => (
                  <tr key={l.loteId}>
                    <td><strong>{l.loteNome}</strong></td>
                    <td>{l.qtd}</td>
                    <td>{fmtNum(l.pesoMedioVenda, 1)} kg</td>
                    <td>{fmtNum(l.gmdMedio, 2)} kg/dia</td>
                    <td>{l.custoPorKg != null ? `${fmt(l.custoPorKg)}/kg` : '—'}</td>
                    <td style={{ color: l.lucroTotal >= 0 ? '#2e7d32' : '#b91c1c' }}>{fmt(l.lucroTotal)}</td>
                    <td>{l.margemPct != null ? `${fmtNum(l.margemPct, 1)}%` : '—'}</td>
                    <td>{fmt(l.lucroPorAnimal)}</td>
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
