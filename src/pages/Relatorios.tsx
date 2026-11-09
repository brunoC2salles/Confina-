import { useState, useEffect } from 'react'
import { carregarResumoRelatorio, diasPeriodoRelatorio, type PeriodoRelatorio, type ResumoRelatorio } from '@/core/analises'
import { useAuth } from '@/contexts/AuthContext'
import { PageHeader } from '@/components/common/UI'
import { fmt, fmtNum, fmtData } from '@/lib/calculations'

type Periodo = PeriodoRelatorio
const diasPeriodo = diasPeriodoRelatorio

type Resumo = ResumoRelatorio

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
        setResumo(await carregarResumoRelatorio(user.id, getInicio(), getFim()))
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
      ['Custos operacionais rateados', fmt(resumo.custos_fixos)],
      ['Custo total', fmt(resumo.custo_total)],
      ['Lucro líquido', fmt(resumo.lucro_total)],
      ['Margem', `${fmtNum(resumo.margem_pct,1)}%`],
      ['Animais vendidos', String(resumo.qtd_animais)],
      ['Lucro por animal', resumo.qtd_animais > 0 ? fmt(resumo.lucro_por_animal) : '—'],
      ['Custo em pastagem', fmt(resumo.custo_pastagem)],
      ['Ganho de peso em pastagem (kg)', fmtNum(resumo.ganho_pastagem, 0)],
      ['Custo em confinamento', fmt(resumo.custo_confinamento)],
      ['Ganho de peso em confinamento (kg)', fmtNum(resumo.ganho_confinamento, 0)],
      ['Custo em misto', fmt(resumo.custo_misto)],
      ['Ganho de peso em misto (kg)', fmtNum(resumo.ganho_misto, 0)],
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
          <div style={{ display:'flex', gap:8, flexWrap: 'wrap' }} className="no-print">
            <button className="btn btn-ghost" onClick={exportCSV} disabled={!resumo}>Exportar CSV</button>
            <button className="btn btn-primary" onClick={() => window.print()} disabled={!resumo}>Exportar PDF</button>
          </div>
        }/>

      <div className="no-print" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(96px, 1fr))', gap:8, marginBottom:24 }}>
        {(Object.keys(diasPeriodo) as Periodo[]).map(p => (
          <button key={p} onClick={() => setPeriodo(p)}
            style={{ padding:'10px 8px', border:'1px solid', borderRadius:8, cursor:'pointer', textAlign:'center', background: periodo===p?'#e8f5e9':'#fff', borderColor: periodo===p?'#a5d6a7':'#e0e0e0', fontSize:12, fontWeight: periodo===p?500:400, color: periodo===p?'#1b5e20':'#555', fontFamily:'inherit', textTransform:'capitalize' }}>
            {p}
          </button>
        ))}
      </div>

      <div className="no-print" style={{ fontSize:12, color:'#9e9e9e', marginBottom:16 }}>
        Período: {fmtData(getInicio())} até {fmtData(getFim())}
        {resumo && <span style={{ marginLeft:16 }}>{resumo.qtd_saidas} saída{resumo.qtd_saidas !== 1 ? 's' : ''} · {resumo.qtd_animais} animal(is)</span>}
      </div>

      {erro && (
        <div className="no-print" style={{ padding:'12px 16px', background:'#ffebee', borderRadius:8, fontSize:13, color:'#b91c1c', border:'1px solid #ffcdd2', marginBottom:16 }}>
          {erro}
        </div>
      )}

      {loading ? (
        <div className="no-print" style={{ display:'flex', justifyContent:'center', padding:48 }}>
          <div className="spinner" style={{ width:28, height:28 }}/>
        </div>
      ) : !resumo || resumo.qtd_saidas === 0 ? (
        <div className="card no-print">
          <div className="empty">
            <div className="empty-icon">◧</div>
            <div className="empty-title">Nenhuma saída no período</div>
            <div className="empty-desc">Registre vendas de animais para ver o consolidado financeiro.</div>
          </div>
        </div>
      ) : (
        <>
          <div className="no-print" style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(280px, 1fr))', gap:16 }}>
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
              <Row label="Custos operacionais rateados" value={fmt(resumo.custos_fixos)} neg/>
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

          {(resumo.custo_pastagem > 0 || resumo.ganho_pastagem > 0 || resumo.custo_misto > 0 || resumo.ganho_misto > 0) && (
            <div className="no-print card" style={{ marginTop: 16 }}>
              <div style={{ fontWeight: 600, marginBottom: 14 }}>Pastagem x Confinamento x Misto no período</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
                <div>
                  <div style={{ fontSize: 12, color: '#9e9e9e', marginBottom: 4 }}>Pastagem</div>
                  <Row label="Custo" value={fmt(resumo.custo_pastagem)} />
                  <Row label="Ganho de peso" value={`${fmtNum(resumo.ganho_pastagem, 0)} kg`} />
                </div>
                <div>
                  <div style={{ fontSize: 12, color: '#9e9e9e', marginBottom: 4 }}>Confinamento</div>
                  <Row label="Custo" value={fmt(resumo.custo_confinamento)} />
                  <Row label="Ganho de peso" value={`${fmtNum(resumo.ganho_confinamento, 0)} kg`} />
                </div>
                {(resumo.custo_misto > 0 || resumo.ganho_misto > 0) && (
                  <div>
                    <div style={{ fontSize: 12, color: '#9e9e9e', marginBottom: 4 }}>Misto</div>
                    <Row label="Custo" value={fmt(resumo.custo_misto)} />
                    <Row label="Ganho de peso" value={`${fmtNum(resumo.ganho_misto, 0)} kg`} />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ─── Área de impressão: relatório formal, só logo + dados ─── */}
          <div className="print-area">
            <RelatorioImprimivel periodo={periodo} inicio={getInicio()} fim={getFim()} resumo={resumo} />
          </div>
        </>
      )}
    </div>
  )
}

function RelatorioImprimivel({ periodo, inicio, fim, resumo }: { periodo: Periodo; inicio: string; fim: string; resumo: Resumo }) {
  const periodoLabel = periodo.charAt(0).toUpperCase() + periodo.slice(1)
  return (
    <div style={{ fontFamily: 'Inter, sans-serif', color: '#111', maxWidth: 700, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <img src="/logo.png" alt="Confina+" style={{ height: 56, objectFit: 'contain' }} />
      </div>

      <h1 style={{ fontSize: 18, fontWeight: 700, textAlign: 'center', marginBottom: 4 }}>Relatório Financeiro — {periodoLabel}</h1>
      <p style={{ fontSize: 12, textAlign: 'center', color: '#555', marginBottom: 28 }}>
        Período de {fmtData(inicio)} a {fmtData(fim)} · {resumo.qtd_saidas} saída{resumo.qtd_saidas !== 1 ? 's' : ''} · {resumo.qtd_animais} animal(is)
      </p>

      <h2 style={{ fontSize: 14, fontWeight: 700, borderBottom: '1px solid #000', paddingBottom: 4, marginBottom: 10 }}>Receitas</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20, fontSize: 13 }}>
        <tbody>
          <LinhaRelatorio label="Venda de animais (com bônus)" valor={fmt(resumo.receita_bruta)} />
          <LinhaRelatorio label="Comissionamentos" valor={`- ${fmt(resumo.total_comissoes)}`} />
          <LinhaRelatorio label="Encargos e impostos" valor={`- ${fmt(resumo.total_encargos)}`} />
          <LinhaRelatorio label="Receita líquida" valor={fmt(resumo.receita_liquida)} negrito />
        </tbody>
      </table>

      <h2 style={{ fontSize: 14, fontWeight: 700, borderBottom: '1px solid #000', paddingBottom: 4, marginBottom: 10 }}>Custos</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 20, fontSize: 13 }}>
        <tbody>
          <LinhaRelatorio label="Compra de animais" valor={`- ${fmt(resumo.custo_compra)}`} />
          <LinhaRelatorio label="Alimentação" valor={`- ${fmt(resumo.custo_alimentacao)}`} />
          <LinhaRelatorio label="Custos variáveis" valor={`- ${fmt(resumo.custos_variaveis)}`} />
          <LinhaRelatorio label="Custos operacionais rateados" valor={`- ${fmt(resumo.custos_fixos)}`} />
          <LinhaRelatorio label="Custo total" valor={`- ${fmt(resumo.custo_total)}`} negrito />
        </tbody>
      </table>

      <h2 style={{ fontSize: 14, fontWeight: 700, borderBottom: '1px solid #000', paddingBottom: 4, marginBottom: 10 }}>Resultado</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <tbody>
          <LinhaRelatorio label="Lucro líquido" valor={fmt(resumo.lucro_total)} negrito />
          <LinhaRelatorio label="Margem líquida" valor={`${fmtNum(resumo.margem_pct, 1)}%`} />
          <LinhaRelatorio label="Animais vendidos" valor={String(resumo.qtd_animais)} />
          <LinhaRelatorio label="Lucro por animal" valor={resumo.qtd_animais > 0 ? fmt(resumo.lucro_por_animal) : '—'} />
        </tbody>
      </table>

      {(resumo.custo_pastagem > 0 || resumo.ganho_pastagem > 0 || resumo.custo_misto > 0 || resumo.ganho_misto > 0) && (
        <>
          <h2 style={{ fontSize: 14, fontWeight: 700, borderBottom: '1px solid #000', paddingBottom: 4, marginBottom: 10, marginTop: 20 }}>Pastagem x Confinamento x Misto</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              <LinhaRelatorio label="Custo em pastagem" valor={fmt(resumo.custo_pastagem)} />
              <LinhaRelatorio label="Ganho de peso em pastagem" valor={`${fmtNum(resumo.ganho_pastagem, 0)} kg`} />
              <LinhaRelatorio label="Custo em confinamento" valor={fmt(resumo.custo_confinamento)} />
              <LinhaRelatorio label="Ganho de peso em confinamento" valor={`${fmtNum(resumo.ganho_confinamento, 0)} kg`} />
              {(resumo.custo_misto > 0 || resumo.ganho_misto > 0) && (
                <>
                  <LinhaRelatorio label="Custo em misto" valor={fmt(resumo.custo_misto)} />
                  <LinhaRelatorio label="Ganho de peso em misto" valor={`${fmtNum(resumo.ganho_misto, 0)} kg`} />
                </>
              )}
            </tbody>
          </table>
        </>
      )}

      <p style={{ fontSize: 11, textAlign: 'center', color: '#999', marginTop: 32 }}>
        Emitido em {fmtData(new Date().toISOString().split('T')[0])}
      </p>
    </div>
  )
}

function LinhaRelatorio({ label, valor, negrito }: { label: string; valor: string; negrito?: boolean }) {
  return (
    <tr style={{ borderBottom: '1px solid #eee' }}>
      <td style={{ padding: '5px 6px', color: '#555' }}>{label}</td>
      <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: negrito ? 700 : 400 }}>{valor}</td>
    </tr>
  )
}
