import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useLotes } from '@/hooks/useLotes'
import { supabase } from '@/lib/supabase'
import { fmt, fmtNum } from '@/lib/calculations'

const cicloLabel = (n: number) =>
  ({ 1: 'Adaptação', 2: 'Crescimento', 3: 'Engorda', 4: 'Acabamento' }[n] ?? `Ciclo ${n}`)

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { lotesAtivos, loading: loadLotes, erro: erroLotes } = useLotes()
  const nome = user?.user_metadata?.nome?.split(' ')[0] || 'produtor'

  const [metricas, setMetricas] = useState({
    totalAnimais: 0, pesoMedioGeral: 0, gmdMedioGeral: 0,
    receitaTotal: 0, custoTotal: 0, lucroTotal: 0, qtdVendidos: 0,
    custoAlimTotal: 0,
  })
  const [loadMetricas, setLoadMetricas] = useState(true)
  const [erroMetricas, setErroMetricas] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    const load = async () => {
      setLoadMetricas(true)
      setErroMetricas(null)
      try {
        const [{ data: lotes, error: e1 }, { data: saidas, error: e2 }] = await Promise.all([
          supabase.from('lotes').select('qtd_animais_atual,peso_medio_atual,gmd_atual,custo_alimentacao_acumulado,custo_alimentacao_dia').eq('user_id', user.id).eq('status', 'ativo'),
          supabase.from('saidas_lote').select('receita_liquida,custo_total,lucro_total,qtd_animais_saida').eq('user_id', user.id),
        ])
        if (e1) throw e1
        if (e2) throw e2

        const ls = lotes ?? []
        const ss = saidas ?? []
        const totalAnimais = ls.reduce((t, l) => t + (l.qtd_animais_atual ?? 0), 0)
        const pesoMedioGeral = totalAnimais > 0
          ? ls.reduce((t, l) => t + ((l.peso_medio_atual ?? 0) * (l.qtd_animais_atual ?? 0)), 0) / totalAnimais : 0
        const lotesComGmd = ls.filter(l => l.gmd_atual && l.gmd_atual > 0)
        const gmdMedioGeral = lotesComGmd.length > 0
          ? lotesComGmd.reduce((t, l) => t + (l.gmd_atual ?? 0), 0) / lotesComGmd.length : 0
        const custoAlimTotal = ls.reduce((t, l) => t + (l.custo_alimentacao_acumulado ?? 0), 0)
        const receitaTotal = ss.reduce((t, s) => t + (s.receita_liquida ?? 0), 0)
        const custoTotal   = ss.reduce((t, s) => t + (s.custo_total ?? 0), 0)
        const lucroTotal   = ss.reduce((t, s) => t + (s.lucro_total ?? 0), 0)
        const qtdVendidos  = ss.reduce((t, s) => t + (s.qtd_animais_saida ?? 0), 0)
        setMetricas({ totalAnimais, pesoMedioGeral, gmdMedioGeral, receitaTotal, custoTotal, lucroTotal, qtdVendidos, custoAlimTotal })
      } catch (e: any) {
        setErroMetricas('Não foi possível carregar as métricas. Verifique sua conexão.')
      } finally {
        setLoadMetricas(false)
      }
    }
    load()
  }, [user, lotesAtivos])

  const acoes = [
    { label: 'Registrar pesagem', sub: 'Atualizar peso do lote',     rota: '/lotes' },
    { label: 'Registrar saída',   sub: 'Venda ou abate do lote',     rota: '/lotes' },
    { label: 'Criar novo lote',   sub: 'Iniciar um novo ciclo',      rota: '/lotes' },
    { label: 'Projetar venda',    sub: 'Dia ideal e lucro estimado', rota: '/lotes' },
  ]

  const cards = [
    { label: 'Animais em confinamento', value: metricas.totalAnimais > 0 ? fmtNum(metricas.totalAnimais, 0) : '—' },
    { label: 'Peso médio geral',        value: metricas.pesoMedioGeral > 0 ? `${fmtNum(metricas.pesoMedioGeral, 0)} kg` : '—' },
    { label: 'GMD médio geral',         value: metricas.gmdMedioGeral > 0 ? `${fmtNum(metricas.gmdMedioGeral, 3)} kg/dia` : '—' },
    { label: 'Custo alim. acumulado',   value: metricas.custoAlimTotal > 0 ? fmt(metricas.custoAlimTotal) : '—' },
  ]

  const ErroCard = ({ msg }: { msg: string }) => (
    <div style={{ padding: '12px 16px', background: '#ffebee', borderRadius: 8, fontSize: 13, color: '#b91c1c', border: '1px solid #ffcdd2', marginBottom: 16 }}>
      {msg}
    </div>
  )

  return (
    <div className="page">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>Bom dia, {nome}</h1>
        <p style={{ fontSize: 13, color: '#9e9e9e', marginTop: 3 }}>Visão geral do confinamento</p>
      </div>

      <div style={{ fontSize: 10, color: '#bdbdbd', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 10 }}>Ações rápidas</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
        {acoes.map(a => (
          <button key={a.label} onClick={() => navigate(a.rota)}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: 16, background: '#fff', border: '1px solid #f0f0f0', borderRadius: 12, textAlign: 'left', transition: 'all 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', fontFamily: 'inherit' }}
            onMouseOver={e => { e.currentTarget.style.borderColor = '#a5d6a7'; e.currentTarget.style.background = '#f9fef9' }}
            onMouseOut={e => { e.currentTarget.style.borderColor = '#f0f0f0'; e.currentTarget.style.background = '#fff' }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: '#e8f5e9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, color: '#2e7d32', fontWeight: 700, lineHeight: 1 }}>+</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{a.label}</div>
              <div style={{ fontSize: 11, color: '#9e9e9e', marginTop: 2 }}>{a.sub}</div>
            </div>
          </button>
        ))}
      </div>

      {erroMetricas && <ErroCard msg={erroMetricas} />}

      {loadMetricas ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{ background: '#fafafa', borderRadius: 10, padding: 16, border: '1px solid #f0f0f0', height: 80 }}>
              <div style={{ width: 80, height: 12, background: '#e0e0e0', borderRadius: 4, marginBottom: 10 }}/>
              <div style={{ width: 60, height: 22, background: '#e0e0e0', borderRadius: 4 }}/>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 24 }}>
          {cards.map(m => (
            <div key={m.label} style={{ background: '#fafafa', borderRadius: 10, padding: 16, border: '1px solid #f0f0f0' }}>
              <div style={{ fontSize: 12, color: '#9e9e9e', marginBottom: 6 }}>{m.label}</div>
              <div style={{ fontSize: 22, fontWeight: 600 }}>{m.value}</div>
            </div>
          ))}
        </div>
      )}

      {metricas.qtdVendidos > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
          <div style={{ background: '#fafafa', borderRadius: 10, padding: 16, border: '1px solid #f0f0f0' }}>
            <div style={{ fontSize: 12, color: '#9e9e9e', marginBottom: 6 }}>Receita líquida acumulada</div>
            <div style={{ fontSize: 20, fontWeight: 600 }}>{fmt(metricas.receitaTotal)}</div>
          </div>
          <div style={{ background: '#fafafa', borderRadius: 10, padding: 16, border: '1px solid #f0f0f0' }}>
            <div style={{ fontSize: 12, color: '#9e9e9e', marginBottom: 6 }}>Custo total acumulado</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#b91c1c' }}>{fmt(metricas.custoTotal)}</div>
          </div>
          <div style={{ background: metricas.lucroTotal >= 0 ? '#e8f5e9' : '#ffebee', borderRadius: 10, padding: 16, border: `1px solid ${metricas.lucroTotal >= 0 ? '#a5d6a7' : '#ffcdd2'}` }}>
            <div style={{ fontSize: 12, color: '#9e9e9e', marginBottom: 6 }}>Lucro líquido — {metricas.qtdVendidos} animal(is) vendido(s)</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: metricas.lucroTotal >= 0 ? '#1b5e20' : '#b91c1c' }}>{fmt(metricas.lucroTotal)}</div>
          </div>
        </div>
      )}

      {erroLotes && <ErroCard msg="Não foi possível carregar os lotes. Verifique sua conexão." />}

      {loadLotes ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div className="spinner" style={{ width: 28, height: 28 }}/>
        </div>
      ) : lotesAtivos.length > 0 ? (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', fontWeight: 600, fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Lotes ativos</span>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/lotes')}>Ver todos</button>
          </div>
          <div className="table-wrap" style={{ borderRadius: 0, border: 'none' }}>
            <table>
              <thead>
                <tr>
                  <th>Lote</th><th>Ciclo</th><th>Animais</th>
                  <th>Peso médio</th><th>GMD</th>
                  <th>Custo alim./dia</th><th>Custo acumulado</th>
                </tr>
              </thead>
              <tbody>
                {lotesAtivos.map(l => (
                  <tr key={l.id} style={{ cursor: 'pointer' }} onClick={() => navigate('/lotes')}>
                    <td><strong>{l.nome_lote}</strong><div style={{ fontSize: 11, color: '#9e9e9e' }}>{l.codigo_lote}</div></td>
                    <td>
                      <div style={{ display: 'flex', gap: 3, marginBottom: 2 }}>
                        {[1,2,3,4].map(n => <div key={n} style={{ width: 20, height: 4, borderRadius: 2, background: n < l.ciclo_atual ? '#2e7d32' : n === l.ciclo_atual ? '#66bb6a' : '#e0e0e0' }}/>)}
                      </div>
                      <div style={{ fontSize: 11, color: '#9e9e9e' }}>{cicloLabel(l.ciclo_atual)}</div>
                    </td>
                    <td>{(l as any).qtd_animais_atual ?? (l as any).qtd_animais ?? '—'}</td>
                    <td>{(l as any).peso_medio_atual ? `${fmtNum((l as any).peso_medio_atual, 0)} kg` : '—'}</td>
                    <td>{(l as any).gmd_atual ? <span style={{ color: '#1b5e20', fontWeight: 500 }}>{fmtNum((l as any).gmd_atual, 3)} kg/dia</span> : '—'}</td>
                    <td style={{ color: '#b45309' }}>{(l as any).custo_alimentacao_dia > 0 ? fmt((l as any).custo_alimentacao_dia) : '—'}</td>
                    <td style={{ color: '#b45309' }}>{(l as any).custo_alimentacao_acumulado > 0 ? fmt((l as any).custo_alimentacao_acumulado) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">◈</div>
            <div className="empty-title">Nenhum lote ativo</div>
            <div className="empty-desc">Crie seu primeiro lote para começar o rastreamento.</div>
            <button className="btn btn-primary" onClick={() => navigate('/lotes')}>Criar primeiro lote</button>
          </div>
        </div>
      )}
    </div>
  )
}
