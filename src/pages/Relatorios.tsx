import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { PageHeader } from '@/components/common/UI'
import { fmt, fmtNum, fmtData } from '@/lib/calculations'

type Periodo = 'semanal'|'quinzenal'|'mensal'|'trimestral'|'semestral'|'anual'
const diasPeriodo: Record<Periodo, number> = {
  semanal: 7, quinzenal: 15, mensal: 30, trimestral: 90, semestral: 180, anual: 365
}

interface Resumo {
  receita_bruta: number
  total_comissoes: number; total_encargos: number; receita_liquida: number
  custo_compra: number; custo_alimentacao: number
  custos_variaveis: number; custos_fixos: number; custo_total: number
  lucro_total: number; qtd_saidas: number; qtd_animais: number
  lucro_por_animal: number; margem_pct: number
}

export default function Relatorios() {
  const { user } = useAuth()
  const [periodo, setPeriodo] = useState<Periodo>('mensal')
  const [loading, setLoading] = useState(false)
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const getFim = () => new Date().toISOString().split('T')[0]
  const getInicio = () => {
    const d = new Date()
    d.setDate(d.getDate() - diasPeriodo[periodo])
    return d.toISOString().split('T')[0]
  }

  useEffect(() => {
    if (!user) return
    const load = async () => {
      setLoading(true)
      setErro(null)
      try {
        const [{ data: saidas, error: e1 }, { count: qtdAnimaisCount, error: e2 }] = await Promise.all([
          supabase.from('saidas_grupo').select('*')
            .eq('user_id', user.id).gte('data', getInicio()).lte('data', getFim()),
          supabase.from('movimentacoes_animais').select('id', { count: 'exact', head: true })
            .eq('user_id', user.id).not('saida_grupo_id', 'is', null)
            .gte('data', getInicio()).lte('data', getFim()),
        ])
        if (e1) throw e1
        if (e2) throw e2

        const ss = saidas ?? []
        const receita_bruta     = ss.reduce((t, s) => t + (s.receita_bruta ?? 0), 0)
        const total_comissoes   = ss.reduce((t, s) => t + (s.total_comissoes ?? 0), 0)
        const total_encargos    = ss.reduce((t, s) => t + (s.total_encargos ?? 0), 0)
        const receita_liquida   = ss.reduce((t, s) => t + (s.receita_liquida ?? 0), 0)
        const custo_compra      = ss.reduce((t, s) => t + (s.custo_compra_total ?? 0), 0)
        const custo_alimentacao = ss.reduce((t, s) => t + (s.custo_alimentacao_total ?? 0), 0)
        const custos_variaveis  = ss.reduce((t, s) => t + (s.custos_variaveis_total ?? 0), 0)
        const custos_fixos      = ss.reduce((t, s) => t + (s.custos_fixos_rateados ?? 0), 0)
        const custo_total       = custo_compra + custo_alimentacao + custos_variaveis + custos_fixos
        const lucro_total       = ss.reduce((t, s) => t + (s.lucro_total ?? 0), 0)
        const qtd_animais       = qtdAnimaisCount ?? 0
        const lucro_por_animal  = qtd_animais > 0 ? lucro_total / qtd_animais : 0
        const margem_pct        = receita_liquida > 0 ? (lucro_total / receita_liquida) * 100 : 0

        setResumo({
          receita_bruta, total_comissoes, total_encargos, receita_liquida,
          custo_compra, custo_alimentacao, custos_variaveis, custos_fixos, custo_total,
          lucro_total, qtd_saidas: ss.length, qtd_animais, lucro_por_animal, margem_pct,
        })
      } catch {
        setErro('Não foi possível carregar os relatórios. Verifique sua conexão.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [user, periodo])

  const Row = ({ label, value, neg, bold }: { label: string; value: string; neg?: boolean; bold?: boolean }) => (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'9px 0', borderBottom:'1px solid #f5f5f5', fontSize:13 }}>
      <span style={{ color:'#555' }}>{label}</span>
      <span style={{ fontWeight: bold ? 600 : 400, color: neg ? '#b91c1c' : undefined }}>{neg ? `- ${value}` : value}</span>
    </div>
  )

  const lucro = resumo?.lucro_total ?? 0

  const exportCSV = () => {
    if (!resumo) return
    const rows = [
      ['Métrica','Valor'],
      ['Período', `${fmtData(getInicio())} a ${fmtData(getFim())}`],
      ['Receita bruta', fmt(resumo.receita_bruta)],
      ['Comissionamentos', fmt(resumo.total_comissoes)],
      ['Encargos', fmt(resumo.total_encargos)],
      ['Receita líquida', fmt(resumo.receita_liquida)],
      ['Custo de compra', fmt(resumo.custo_compra)],
      ['Custo de alimentação', fmt(resumo.custo_alimentacao)],
      ['Custos variáveis', fmt(resumo.custos_variaveis)],
      ['Custos fixos rateados', fmt(resumo.custos_fixos)],
      ['Custo total', fmt(resumo.custo_total)],
      ['Lucro líquido', fmt(resumo.lucro_total)],
      ['Margem', `${fmtNum(resumo.margem_pct,1)}%`],
      ['Animais vendidos', String(resumo.qtd_animais)],
      ['Lucro por animal', resumo.qtd_animais > 0 ? fmt(resumo.lucro_por_animal) : '—'],
    ]
    const csv = rows.map(r => r.join(',')).join('\n')
    const a = document.createElement('a')
    a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv)
    a.download = `relatorio-${periodo}.csv`
    a.click()
  }

  return (
    <div className="page">
      <PageHeader title="Relatórios" subtitle="Consolidado financeiro por período"
        action={
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn btn-ghost" onClick={exportCSV} disabled={!resumo}>Exportar CSV</button>
            <button className="btn btn-primary" onClick={() => window.print()}>Exportar PDF</button>
          </div>
        }/>

      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:8, marginBottom:24 }}>
        {(Object.keys(diasPeriodo) as Periodo[]).map(p => (
          <button key={p} onClick={() => setPeriodo(p)}
            style={{ padding:'10px 8px', border:'1px solid', borderRadius:8, cursor:'pointer', textAlign:'center', background: periodo===p?'#e8f5e9':'#fff', borderColor: periodo===p?'#a5d6a7':'#e0e0e0', fontSize:12, fontWeight: periodo===p?500:400, color: periodo===p?'#1b5e20':'#555', fontFamily:'inherit', textTransform:'capitalize' }}>
            {p}
          </button>
        ))}
      </div>

      <div style={{ fontSize:12, color:'#9e9e9e', marginBottom:16 }}>
        Período: {fmtData(getInicio())} até {fmtData(getFim())}
        {resumo && <span style={{ marginLeft:16 }}>{resumo.qtd_saidas} saída{resumo.qtd_saidas !== 1 ? 's' : ''} · {resumo.qtd_animais} animal(is)</span>}
      </div>

      {erro && (
        <div style={{ padding:'12px 16px', background:'#ffebee', borderRadius:8, fontSize:13, color:'#b91c1c', border:'1px solid #ffcdd2', marginBottom:16 }}>
          {erro}
        </div>
      )}

      {loading ? (
        <div style={{ display:'flex', justifyContent:'center', padding:48 }}>
          <div className="spinner" style={{ width:28, height:28 }}/>
        </div>
      ) : !resumo || resumo.qtd_saidas === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">◧</div>
            <div className="empty-title">Nenhuma saída no período</div>
            <div className="empty-desc">Registre vendas de animais para ver o consolidado financeiro.</div>
          </div>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <div className="card">
            <div style={{ fontWeight:600, marginBottom:14 }}>Receitas</div>
            <Row label="Venda de animais (com bônus)" value={fmt(resumo.receita_bruta)}/>
            <div style={{ fontWeight:600, marginTop:16, marginBottom:10 }}>Deduções</div>
            <Row label="Comissionamentos" value={fmt(resumo.total_comissoes)} neg/>
            <Row label="Encargos e impostos" value={fmt(resumo.total_encargos)} neg/>
            <Row label="Receita líquida" value={fmt(resumo.receita_liquida)} bold/>
          </div>
          <div className="card">
            <div style={{ fontWeight:600, marginBottom:14 }}>Custos</div>
            <Row label="Compra de animais" value={fmt(resumo.custo_compra)} neg/>
            <Row label="Alimentação" value={fmt(resumo.custo_alimentacao)} neg/>
            <Row label="Custos variáveis" value={fmt(resumo.custos_variaveis)} neg/>
            <Row label="Custos fixos rateados" value={fmt(resumo.custos_fixos)} neg/>
            <Row label="Custo total" value={fmt(resumo.custo_total)} bold/>
            <div style={{ background: lucro >= 0 ? '#e8f5e9' : '#ffebee', borderRadius:8, padding:16, marginTop:16 }}>
              {[
                ['Lucro líquido', fmt(lucro)],
                ['Margem líquida', `${fmtNum(resumo.margem_pct, 1)}%`],
                ['Animais vendidos', `${resumo.qtd_animais}`],
                ['Lucro por animal', resumo.qtd_animais > 0 ? fmt(resumo.lucro_por_animal) : '—'],
              ].map(([l, v]) => (
                <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:13 }}>
                  <span style={{ color: lucro >= 0 ? '#2e7d32' : '#b91c1c' }}>{l}</span>
                  <span style={{ fontWeight:600, color: lucro >= 0 ? '#1b5e20' : '#b91c1c' }}>{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
