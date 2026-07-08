import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useLotes } from '@/hooks/useLotes'
import { supabase } from '@/lib/supabase'
import { fmt, fmtNum } from '@/lib/calculations'

const cicloLabel = (n: number) =>
  ({ 1: 'Adaptação', 2: 'Crescimento', 3: 'Engorda', 4: 'Acabamento' } as Record<number, string>)[n] ?? `Ciclo ${n}`

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { lotesAtivos, resumo, loading: loadLotes } = useLotes()
  const nome = user?.user_metadata?.nome?.split(' ')[0] || 'produtor'

  const [metricas, setMetricas] = useState({
    totalAnimais: 0, pesoMedioGeral: 0,
    receitaTotal: 0, custoTotal: 0, lucroTotal: 0, qtdVendidos: 0,
    valorCompraTotal: 0,
    custoPastagemTotal: 0, custoConfinamentoTotal: 0,
    ganhoPastagemTotal: 0, ganhoConfinamentoTotal: 0,
  })
  const [loadMetricas, setLoadMetricas] = useState(true)
  const [erroMetricas, setErroMetricas] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    const load = async () => {
      setLoadMetricas(true)
      setErroMetricas(null)
      try {
        const [{ data: animais, error: e1 }, { data: saidas, error: e2 }, { count: qtdVendidos, error: e3 }] = await Promise.all([
          supabase.from('animais').select('peso_entrada, valor_compra').eq('user_id', user.id).eq('status', 'ativo'),
          supabase.from('saidas_grupo').select('receita_liquida, custo_compra_total, custo_alimentacao_total, custos_variaveis_total, custos_fixos_rateados, lucro_total, custo_alimentacao_pastagem_total, custo_alimentacao_confinamento_total, custo_operacional_pastagem_total, custo_operacional_confinamento_total, ganho_peso_pastagem_total, ganho_peso_confinamento_total').eq('user_id', user.id),
          supabase.from('movimentacoes_animais').select('id', { count: 'exact', head: true }).eq('user_id', user.id).not('saida_grupo_id', 'is', null),
        ])
        if (e1) throw e1
        if (e2) throw e2
        if (e3) throw e3

        const as_ = animais ?? []
        const ss = saidas ?? []
        const totalAnimais = as_.length
        const pesoMedioGeral = totalAnimais > 0 ? as_.reduce((t, a) => t + a.peso_entrada, 0) / totalAnimais : 0
        const valorCompraTotal = as_.reduce((t, a) => t + a.valor_compra, 0)

        const receitaTotal = ss.reduce((t, s) => t + (s.receita_liquida ?? 0), 0)
        const custoTotal = ss.reduce((t, s) => t +
          (s.custo_compra_total ?? 0) + (s.custo_alimentacao_total ?? 0) +
          (s.custos_variaveis_total ?? 0) + (s.custos_fixos_rateados ?? 0), 0)
        const lucroTotal = ss.reduce((t, s) => t + (s.lucro_total ?? 0), 0)

        const custoPastagemTotal = ss.reduce((t, s) => t + (s.custo_alimentacao_pastagem_total ?? 0) + (s.custo_operacional_pastagem_total ?? 0), 0)
        const custoConfinamentoTotal = ss.reduce((t, s) => t + (s.custo_alimentacao_confinamento_total ?? 0) + (s.custo_operacional_confinamento_total ?? 0), 0)
        const ganhoPastagemTotal = ss.reduce((t, s) => t + (s.ganho_peso_pastagem_total ?? 0), 0)
        const ganhoConfinamentoTotal = ss.reduce((t, s) => t + (s.ganho_peso_confinamento_total ?? 0), 0)

        setMetricas({
          totalAnimais, pesoMedioGeral, receitaTotal, custoTotal, lucroTotal, qtdVendidos: qtdVendidos ?? 0, valorCompraTotal,
          custoPastagemTotal, custoConfinamentoTotal, ganhoPastagemTotal, ganhoConfinamentoTotal,
        })
      } catch {
        setErroMetricas('Não foi possível carregar as métricas. Verifique sua conexão.')
      } finally {
        setLoadMetricas(false)
      }
    }
    load()
  }, [user, lotesAtivos])

  const acoes = [
    { label: 'Registrar pesagem', sub: 'Atualizar peso de um animal',  rota: '/lotes' },
    { label: 'Registrar venda',   sub: 'Venda, abate ou saída',        rota: '/lotes' },
    { label: 'Criar novo lote',   sub: 'Iniciar um novo confinamento', rota: '/lotes' },
    { label: 'Ver projeção',      sub: 'Dia ideal e lucro estimado',   rota: '/lotes' },
  ]

  const cardsAtivos = [
    metricas.totalAnimais > 0 && { label: 'Animais em confinamento', value: fmtNum(metricas.totalAnimais, 0) },
    metricas.pesoMedioGeral > 0 && { label: 'Peso médio de entrada', value: `${fmtNum(metricas.pesoMedioGeral, 0)} kg` },
    metricas.valorCompraTotal > 0 && { label: 'Valor de compra investido', value: fmt(metricas.valorCompraTotal) },
  ].filter(Boolean) as { label: string; value: string }[]

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

      {!loadMetricas && cardsAtivos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cardsAtivos.length},1fr)`, gap: 12, marginBottom: 24 }}>
          {cardsAtivos.map(m => (
            <div key={m.label} style={{ background: '#fafafa', borderRadius: 10, padding: 16, border: '1px solid #f0f0f0' }}>
              <div style={{ fontSize: 12, color: '#9e9e9e', marginBottom: 6 }}>{m.label}</div>
              <div style={{ fontSize: 22, fontWeight: 600 }}>{m.value}</div>
            </div>
          ))}
        </div>
      )}

      {!loadMetricas && metricas.qtdVendidos > 0 && (
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

      {/* Só aparece se houver animais vendidos que passaram por algum ciclo
          marcado como pastagem — senão a quebra fica sempre zerada e é ruído. */}
      {!loadMetricas && (metricas.custoPastagemTotal > 0 || metricas.ganhoPastagemTotal > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 24 }}>
          <div style={{ background: '#fafafa', borderRadius: 10, padding: 16, border: '1px solid #f0f0f0' }}>
            <div style={{ fontSize: 12, color: '#9e9e9e', marginBottom: 6 }}>Pastagem — custo e ganho (vendidos)</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{fmt(metricas.custoPastagemTotal)}</div>
            <div style={{ fontSize: 12, color: '#9e9e9e', marginTop: 2 }}>{fmtNum(metricas.ganhoPastagemTotal, 0)} kg ganhos</div>
          </div>
          <div style={{ background: '#fafafa', borderRadius: 10, padding: 16, border: '1px solid #f0f0f0' }}>
            <div style={{ fontSize: 12, color: '#9e9e9e', marginBottom: 6 }}>Confinamento — custo e ganho (vendidos)</div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>{fmt(metricas.custoConfinamentoTotal)}</div>
            <div style={{ fontSize: 12, color: '#9e9e9e', marginTop: 2 }}>{fmtNum(metricas.ganhoConfinamentoTotal, 0)} kg ganhos</div>
          </div>
        </div>
      )}

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
                  <th>Lote</th><th>Ciclo</th><th>Animais ativos</th><th>Peso médio de entrada</th>
                </tr>
              </thead>
              <tbody>
                {lotesAtivos.map(l => {
                  const r = resumo[l.id] ?? { qtdAtiva: 0, pesoMedioEntrada: 0 }
                  return (
                    <tr key={l.id} style={{ cursor: 'pointer' }} onClick={() => navigate('/lotes')}>
                      <td><strong>{l.nome_lote}</strong><div style={{ fontSize: 11, color: '#9e9e9e' }}>{l.codigo_lote}</div></td>
                      <td>
                        <div style={{ display: 'flex', gap: 3, marginBottom: 2 }}>
                          {Array.from({ length: l.num_ciclos }, (_, i) => i + 1).map(n => (
                            <div key={n} style={{ width: 20, height: 4, borderRadius: 2, background: n < l.ciclo_atual ? '#2e7d32' : n === l.ciclo_atual ? '#66bb6a' : '#e0e0e0' }}/>
                          ))}
                        </div>
                        <div style={{ fontSize: 11, color: '#9e9e9e' }}>{cicloLabel(l.ciclo_atual)}</div>
                      </td>
                      <td>{r.qtdAtiva}</td>
                      <td>{r.qtdAtiva > 0 ? `${fmtNum(r.pesoMedioEntrada, 0)} kg` : '—'}</td>
                    </tr>
                  )
                })}
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
