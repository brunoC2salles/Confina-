import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useLotes } from '@/hooks/useLotes'
import { useAnimais } from '@/hooks/useAnimais'
import { fmt, fmtNum, calcularDias } from '@/lib/calculations'

const cicloLabel = (n: number) => ({ 1: 'Adaptação', 2: 'Crescimento', 3: 'Engorda', 4: 'Acabamento' }[n] ?? `Ciclo ${n}`)

export default function Dashboard() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const { lotesAtivos, loading: loadLotes } = useLotes()
  const { animaisAtivos, loading: loadAnimais } = useAnimais()
  const nome = user?.user_metadata?.nome?.split(' ')[0] || 'produtor'

  const acoes = [
    { label: 'Registrar pesagem', sub: 'Atualizar peso de animal',     rota: '/animais' },
    { label: 'Registrar saída',   sub: 'Venda ou abate de animal',     rota: '/animais' },
    { label: 'Criar novo lote',   sub: 'Iniciar um novo ciclo',        rota: '/lotes'   },
    { label: 'Bifurcar lote',     sub: 'Dividir animais por critério', rota: '/lotes'   },
  ]

  const metricas = [
    { label: 'Animais em confinamento', value: animaisAtivos.length, suffix: '' },
    { label: 'Lotes ativos',            value: lotesAtivos.length,   suffix: '' },
    { label: 'Peso médio estimado',     value: animaisAtivos.length > 0 ? fmtNum(animaisAtivos.reduce((t, a) => t + a.peso_entrada, 0) / animaisAtivos.length, 0) : '—', suffix: animaisAtivos.length > 0 ? ' kg' : '' },
    { label: 'Dias médios de confinamento', value: animaisAtivos.length > 0 ? fmtNum(animaisAtivos.reduce((t, a) => t + calcularDias(a.data_entrada, new Date().toISOString().split('T')[0]), 0) / animaisAtivos.length, 0) : '—', suffix: animaisAtivos.length > 0 ? 'd' : '' },
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
            <div style={{ width: 40, height: 40, borderRadius: 8, background: '#e8f5e9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: '#2e7d32' }}>+</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{a.label}</div>
              <div style={{ fontSize: 11, color: '#9e9e9e', marginTop: 2 }}>{a.sub}</div>
            </div>
          </button>
        ))}
      </div>

      {/* Métricas */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {metricas.map(m => (
          <div key={m.label} style={{ background: '#fafafa', borderRadius: 10, padding: 16, border: '1px solid #f0f0f0' }}>
            <div style={{ fontSize: 12, color: '#9e9e9e', marginBottom: 6 }}>{m.label}</div>
            <div style={{ fontSize: 22, fontWeight: 600 }}>{m.value}{m.suffix}</div>
          </div>
        ))}
      </div>

      {/* Lotes ativos */}
      {loadLotes || loadAnimais ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" style={{ width: 28, height: 28 }} /></div>
      ) : lotesAtivos.length > 0 ? (
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', fontWeight: 600, fontSize: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Lotes ativos</span>
            <button className="btn btn-ghost btn-sm" onClick={() => navigate('/lotes')}>Ver todos</button>
          </div>
          <div className="table-wrap" style={{ borderRadius: 0, border: 'none' }}>
            <table>
              <thead><tr><th>Lote</th><th>Ciclo</th><th>Progresso</th><th>Animais</th><th>Status</th></tr></thead>
              <tbody>
                {lotesAtivos.map(l => (
                  <tr key={l.id} style={{ cursor: 'pointer' }} onClick={() => navigate('/lotes')}>
                    <td><strong>{l.nome_lote}</strong><div style={{ fontSize: 11, color: '#9e9e9e' }}>{l.codigo_lote}</div></td>
                    <td>Ciclo {l.ciclo_atual} — {cicloLabel(l.ciclo_atual)}</td>
                    <td>
                      <div style={{ display: 'flex', gap: 3 }}>
                        {[1,2,3,4].map(n => <div key={n} style={{ width: 28, height: 4, borderRadius: 2, background: n < l.ciclo_atual ? '#2e7d32' : n === l.ciclo_atual ? '#66bb6a' : '#e0e0e0' }} />)}
                      </div>
                    </td>
                    <td>{animaisAtivos.filter(a => a.lote_atual_id === l.id).length}</td>
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
