import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { PageHeader } from '@/components/common/UI'
import { fmt, fmtData } from '@/lib/calculations'

type Periodo = 'semanal'|'quinzenal'|'mensal'|'trimestral'|'semestral'|'anual'
const diasPeriodo: Record<Periodo, number> = { semanal: 7, quinzenal: 15, mensal: 30, trimestral: 90, semestral: 180, anual: 365 }

interface Resumo {
  receita_vendas: number; valor_bonus: number; total_comissoes: number; total_encargos: number
  custo_compra: number; custo_alimentacao: number; custos_variaveis: number; custos_fixos: number
  qtd_vendidos: number
}

export default function Relatorios() {
  const { user } = useAuth()
  const [periodo, setPeriodo] = useState<Periodo>('mensal')
  const [loading, setLoading] = useState(false)
  const [resumo, setResumo] = useState<Resumo | null>(null)

  const getFim = () => new Date().toISOString().split('T')[0]
  const getInicio = () => {
    const d = new Date(); d.setDate(d.getDate() - diasPeriodo[periodo]); return d.toISOString().split('T')[0]
  }

  useEffect(() => {
    if (!user) return
    const load = async () => {
      setLoading(true)
      const inicio = getInicio(); const fim = getFim()
      const [movs, comissoes, encargos, custosVar] = await Promise.all([
        supabase.from('movimentacoes_animais').select('valor, tipo, animal_id').eq('user_id', user.id).in('tipo', ['saida_venda','saida_abate']).gte('data', inicio).lte('data', fim),
        supabase.from('comissoes_venda').select('valor_calculado').eq('user_id', user.id).gte('created_at', inicio).lte('created_at', fim),
        supabase.from('encargos_venda').select('valor_calculado').eq('user_id', user.id).gte('created_at', inicio).lte('created_at', fim),
        supabase.from('custos_variaveis_animal').select('valor').eq('user_id', user.id).gte('data_lancamento', inicio).lte('data_lancamento', fim),
      ])
      const saidas = movs.data ?? []
      const animalIds = [...new Set(saidas.map(s => s.animal_id).filter(Boolean))]
      let custoCompra = 0
      if (animalIds.length > 0) {
        const { data } = await supabase.from('animais').select('valor_compra').in('id', animalIds)
        custoCompra = (data ?? []).reduce((t, a) => t + (a.valor_compra ?? 0), 0)
      }
      setResumo({
        receita_vendas: saidas.reduce((t, s) => t + (s.valor ?? 0), 0),
        valor_bonus: 0,
        total_comissoes: (comissoes.data ?? []).reduce((t, c) => t + c.valor_calculado, 0),
        total_encargos: (encargos.data ?? []).reduce((t, e) => t + e.valor_calculado, 0),
        custo_compra: custoCompra,
        custo_alimentacao: 0,
        custos_variaveis: (custosVar.data ?? []).reduce((t, c) => t + c.valor, 0),
        custos_fixos: 0,
        qtd_vendidos: saidas.length,
      })
      setLoading(false)
    }
    load()
  }, [user, periodo])

  const rb = (resumo?.receita_vendas ?? 0) + (resumo?.valor_bonus ?? 0)
  const ded = (resumo?.total_comissoes ?? 0) + (resumo?.total_encargos ?? 0)
  const rl = rb - ded
  const tc = (resumo?.custo_compra ?? 0) + (resumo?.custo_alimentacao ?? 0) + (resumo?.custos_variaveis ?? 0) + (resumo?.custos_fixos ?? 0)
  const lucro = rl - tc
  const margem = rl > 0 ? (lucro / rl) * 100 : 0

  const Row = ({ label, value, neg, bold }: { label: string; value: string; neg?: boolean; bold?: boolean }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '9px 0', borderBottom: '1px solid #f5f5f5', fontSize: 13 }}>
      <span style={{ color: '#555' }}>{label}</span>
      <span style={{ fontWeight: bold ? 600 : 400, color: neg ? '#b91c1c' : undefined }}>{neg ? `- ${value}` : value}</span>
    </div>
  )

  return (
    <div className="page">
      <PageHeader title="Relatórios" subtitle="Consolidado financeiro por período"
        action={<button className="btn btn-primary" onClick={() => window.print()}>Exportar PDF</button>} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 8, marginBottom: 24 }}>
        {(Object.keys(diasPeriodo) as Periodo[]).map(p => (
          <button key={p} onClick={() => setPeriodo(p)}
            style={{ padding: '10px 8px', border: '1px solid', borderRadius: 8, cursor: 'pointer', textAlign: 'center', background: periodo === p ? '#e8f5e9' : '#fff', borderColor: periodo === p ? '#a5d6a7' : '#e0e0e0', fontSize: 12, fontWeight: periodo === p ? 500 : 400, color: periodo === p ? '#1b5e20' : '#555', fontFamily: 'inherit' }}>
            <div style={{ textTransform: 'capitalize' }}>{p}</div>
          </button>
        ))}
      </div>

      <div style={{ fontSize: 12, color: '#9e9e9e', marginBottom: 16 }}>Período: {fmtData(getInicio())} até {fmtData(getFim())}</div>

      {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" style={{ width: 28, height: 28 }} /></div>
      : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 14 }}>Receitas</div>
            <Row label="Venda de animais" value={fmt(resumo?.receita_vendas ?? 0)} />
            <Row label="Bônus frigorífico" value={fmt(resumo?.valor_bonus ?? 0)} />
            <Row label="Total receitas brutas" value={fmt(rb)} bold />
            <div style={{ fontWeight: 600, marginTop: 16, marginBottom: 10 }}>Deduções</div>
            <Row label="Comissionamentos" value={fmt(resumo?.total_comissoes ?? 0)} neg />
            <Row label="Encargos e impostos" value={fmt(resumo?.total_encargos ?? 0)} neg />
            <Row label="Receita líquida" value={fmt(rl)} bold />
          </div>

          <div className="card">
            <div style={{ fontWeight: 600, marginBottom: 14 }}>Custos</div>
            <Row label="Compra de animais" value={fmt(resumo?.custo_compra ?? 0)} neg />
            <Row label="Alimentação" value={fmt(resumo?.custo_alimentacao ?? 0)} neg />
            <Row label="Custos variáveis (animais)" value={fmt(resumo?.custos_variaveis ?? 0)} neg />
            <Row label="Custos fixos (lotes)" value={fmt(resumo?.custos_fixos ?? 0)} neg />
            <Row label="Total custos" value={fmt(tc)} bold />

            <div style={{ background: lucro >= 0 ? '#e8f5e9' : '#ffebee', borderRadius: 8, padding: 16, marginTop: 16 }}>
              {[
                ['Lucro líquido', fmt(lucro)],
                ['Margem líquida', `${margem.toFixed(1)}%`],
                ['Animais vendidos', `${resumo?.qtd_vendidos ?? 0}`],
                ['Lucro médio/animal', resumo?.qtd_vendidos ? fmt(lucro / resumo.qtd_vendidos) : '—'],
              ].map(([l, v]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 13 }}>
                  <span style={{ color: lucro >= 0 ? '#2e7d32' : '#b91c1c' }}>{l}</span>
                  <span style={{ fontWeight: 600, color: lucro >= 0 ? '#1b5e20' : '#b91c1c' }}>{v}</span>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
              <button className="btn btn-primary btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => window.print()}>PDF</button>
              <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={() => {
                const rows = [['Métrica','Valor'],['Receita vendas',fmt(resumo?.receita_vendas??0)],['Total receitas brutas',fmt(rb)],['Deduções',fmt(ded)],['Receita líquida',fmt(rl)],['Total custos',fmt(tc)],['Lucro líquido',fmt(lucro)],['Margem',`${margem.toFixed(1)}%`]]
                const csv = rows.map(r => r.join(',')).join('\n')
                const a = document.createElement('a'); a.href = 'data:text/csv;charset=utf-8,' + encodeURIComponent(csv); a.download = `relatorio-${periodo}.csv`; a.click()
              }}>CSV</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
