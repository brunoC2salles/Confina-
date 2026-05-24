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
  const { lotesAtivos, loading: loadLotes } = useLotes()
  const nome = user?.user_metadata?.nome?.split(' ')[0] || 'produtor'

  const [metricas, setMetricas] = useState({
    totalAnimais: 0,
    pesoMedioGeral: 0,
    gmdMedioGeral: 0,
    receitaTotal: 0,
    custoTotal: 0,
    lucroTotal: 0,
    qtdVendidos: 0,
  })
  const [loadMetricas, setLoadMetricas] = useState(true)

  useEffect(() => {
    if (!user) return
    const load = async () => {
      setLoadMetricas(true)

      // Busca dados dos lotes ativos
      const { data: lotes } = await supabase
        .from('lotes')
        .select('qtd_animais_atual, peso_medio_atual, gmd_atual, valor_total_lote')
        .eq('user_id', user.id)
        .eq('status', 'ativo')

      // Busca saídas para resultado financeiro
      const { data: saidas } = await supabase
        .from('saidas_lote')
        .select('receita_liquida, custo_total, lucro_total, qtd_animais_saida')
        .eq('user_id', user.id)

      const ls = lotes ?? []
      const ss = saidas ?? []

      const totalAnimais = ls.reduce((t, l) => t + (l.qtd_animais_atual ?? 0), 0)

      // Peso médio ponderado
      const pesoMedioGeral = totalAnimais > 0
        ? ls.reduce((t, l) => t + ((l.peso_medio_atual ?? 0) * (l.qtd_animais_atual ?? 0)), 0) / totalAnimais
        : 0

      // GMD médio dos lotes com GMD calculado
      const lotesComGmd = ls.filter(l => l.gmd_atual && l.gmd_atual > 0)
      const gmdMedioGeral = lotesComGmd.length > 0
        ? lotesComGmd.reduce((t, l) => t + (l.gmd_atual ?? 0), 0) / lotesComGmd.length
        : 0

      const receitaTotal = ss.reduce((t, s) => t + (s.receita_liquida ?? 0), 0)
      const custoTotal = ss.reduce((t, s) => t + (s.custo_total ?? 0), 0)
      const lucroTotal = ss.reduce((t, s) => t + (s.lucro_total ?? 0), 0)
      const qtdVendidos = ss.reduce((t, s) => t + (s.qtd_animais_saida ?? 0), 0)

      setMetricas({ totalAnimais, pesoMedioGeral, gmdMedioGeral, receitaTotal, custoTotal, lucroTotal, qtdVendidos })
      setLoadMetricas(false)
    }
    load()
  }, [user, lotesAtivos])

  const acoes = [
    { label: 'Registrar pesagem', sub: 'Atualizar peso do lote',       rota: '/lotes' },
    { label: 'Registrar saída',   sub: 'Venda ou abate do lote',       rota: '/lotes' },
    { label: 'Criar novo lote',   sub: 'Iniciar um novo ciclo',        rota: '/lotes' },
    { label: 'Bifurcar lote',     sub: 'Dividir animais por critério', rota: '/lotes' },
  ]

  const cards = [
    { label: 'Animais em confinamento', value: metricas.totalAnimais > 0 ? fmtNum(metricas.totalAnimais, 0) : '—' },
    { label: 'Peso médio geral',        value: metricas.pesoMedioGeral > 0 ? `${fmtNum(metricas.pesoMedioGeral, 0)} kg` : '—' },
    { label: 'GMD médio geral',         value: metricas.gmdMedioGeral > 0 ? `${fmtNum(metricas.gmdMedioGeral, 3)} kg/dia` : '—' },
    { label: 'Resultado acumulado',     value: metricas.lucroTotal !== 0 ? fmt(metricas.lucroTotal) : '—', destaque: metricas.lucroTotal > 0 },
  ]

  return (
    <div className="page">
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 600 }}>Bom dia, {nome}</h1>
        <p style={{ fontSize: 13, color: '#9e9e9e', marginTop: 3 }}>Visão geral do confinamento</p>
      </div>

      {/* Ações rápidas */}
      <div style={{ fontSize: 10, color: '#bdbdbd', letterSpacing: '0.6px', textTransform: 'uppercase', marginBottom: 10 }}>Ações rápidas</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {acoes.map(a => (
          <button key={a.label} onClick={() => navigate(a.rota)}
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10, cursor: 'pointer', padding: 16, background: '#fff', border: '1px solid #f0f0f0', borderRadius: 12, textAlign: 'left', transition: 'all 0.15s', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', fontFamily: 'inherit' }}
            onMouseOver={e => { e.currentTarget.style.borderColor = '#a5d6a7'; e.currentTarget.style.background = '#f9fef9' }}
            onMouseOut={e => { e.currentTarget.style.borderColor = '#f0f0f0'; e.currentTarget.style.background = '#fff' }}>
            <div style={{ width: 40, height: 40, borderRadius: 8, background: '#e8f5e9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#2e7d32', fontWeight: 700 }}>+</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{a.label}</div>
              <div style={{ fontSize: 11, color: '#9e9e9e', marginTop: 2 }}>{a.sub}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Métricas reais */}
      {loadMetricas ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {[1,2,3,4].map(i => (
            <div key={i} style={{ background: '#fafafa', borderRadius: 10, padding: 16, border: '1px solid #f0f0f0', height: 80 }}>
              <div style={{ width: 80, height: 12, background: '#e0e0e0', borderRadius: 4, marginBottom: 10 }} />
              <div style={{ width: 60, height: 22, background: '#e0e0e0', borderRadius: 4 }} />
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
          {cards.map(m => (
            <div key={m.label} style={{ background: (m as any).destaque ? '#e8f5e9' : '#fafafa', borderRadius: 10, padding: 16, border: `1px solid ${(m as any).destaque ? '#a5d6a7' : '#f0f0f0'}` }}>
              <div style={{ fontSize: 12, color: '#9e9e9e', marginBottom: 6 }}>{m.label}</div>
              <div style={{ fontSize: 22, fontWeight: 600, color: (m as any).destaque ? '#1b5e20' : '#111' }}>{m.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Resumo financeiro se houver saídas */}
      {metricas.qtdVendidos > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 24 }}>
          <div style={{ background: '#fafafa', borderRadius: 10, padding: 16, border: '1px solid #f0f0f0' }}>
            <div style={{ fontSize: 12, color: '#9e9e9e', marginBottom: 6 }}>Receita total (saídas)</div>
            <div style={{ fontSize: 20, fontWeight: 600 }}>{fmt(metricas.receitaTotal)}</div>
          </div>
          <div style={{ background: '#fafafa', borderRadius: 10, padding: 16, border: '1px solid #f0f0f0' }}>
            <div style={{ fontSize: 12, color: '#9e9e9e', marginBottom: 6 }}>Custo total (saídas)</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#b91c1c' }}>{fmt(metricas.custoTotal)}</div>
          </div>
          <div style={{ background: metricas.lucroTotal >= 0 ? '#e8f5e9' : '#ffebee', borderRadius: 10, padding: 16, border: `1px solid ${metricas.lucroTotal >= 0 ? '#a5d6a7' : '#ffcdd2'}` }}>
            <div style={{ fontSize: 12, color: '#9e9e9e', marginBottom: 6 }}>Lucro líquido — {metricas.qtdVendidos} animais vendidos</div>
            <div style={{ fontSize: 20, fontWeight: 600, color: metricas.lucroTotal >= 0 ? '#1b5e20' : '#b91c1c' }}>{fmt(metricas.lucroTotal)}</div>
          </div>
        </div>
      )}

      {/* Tabela lotes ativos */}
      {loadLotes ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div className="spinner" style={{ width: 28, height: 28 }} />
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
                  <th>Lote</th>
                  <th>Ciclo</th>
                  <th>Progresso</th>
                  <th>Animais</th>
                  <th>Peso médio</th>
                  <th>GMD</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {lotesAtivos.map(l => (
                  <tr key={l.id} style={{ cursor: 'pointer' }} onClick={() => navigate('/lotes')}>
                    <td>
                      <strong>{l.nome_lote}</strong>
                      <div style={{ fontSize: 11, color: '#9e9e9e' }}>{l.codigo_lote}</div>
                    </td>
                    <td>Ciclo {l.ciclo_atual} — {cicloLabel(l.ciclo_atual)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 3 }}>
                        {[1,2,3,4].map(n => (
                          <div key={n} style={{ width: 28, height: 4, borderRadius: 2, background: n < l.ciclo_atual ? '#2e7d32' : n === l.ciclo_atual ? '#66bb6a' : '#e0e0e0' }} />
                        ))}
                      </div>
                    </td>
                    <td>{(l as any).qtd_animais_atual ?? (l as any).qtd_animais ?? '—'}</td>
                    <td>{(l as any).peso_medio_atual ? `${fmtNum((l as any).peso_medio_atual, 0)} kg` : '—'}</td>
                    <td>
                      {(l as any).gmd_atual
                        ? <span style={{ color: '#1b5e20', fontWeight: 500 }}>{fmtNum((l as any).gmd_atual, 3)} kg/dia</span>
                        : '—'}
                    </td>
                    <td><span className="badge badge-green">Ativo</span></td>
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
            <div className="empty-title">Nenhum dado ainda</div>
            <div className="empty-desc">Crie seu primeiro lote para começar o rastreamento.</div>
            <button className="btn btn-primary" onClick={() => navigate('/lotes')}>Criar primeiro lote</button>
          </div>
        </div>
      )}
    </div>
  )
}
