import { useState } from 'react'
import { useFaixas } from '@/hooks/useFaixas'
import { useAuth } from '@/contexts/AuthContext'
import { PageHeader } from '@/components/common/UI'
import type { RendimentoFaixa, BonusFaixa } from '@/types'

export default function Configuracoes() {
  const { user } = useAuth()
  const { rendimentos, bonus, salvarRendimentos, salvarBonus } = useFaixas()
  const [tab, setTab] = useState<'rendimento'|'bonus'|'perfil'>('rendimento')
  const [rend, setRend] = useState<RendimentoFaixa[]>([])
  const [bon, setBon] = useState<BonusFaixa[]>([])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Sincronizar estado local com dados do hook
  if (rend.length === 0 && rendimentos.length > 0) setRend(rendimentos)
  if (bon.length === 0 && bonus.length > 0) setBon(bonus)

  const handleSalvarRend = async () => {
    setSaving(true); await salvarRendimentos(rend); setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }
  const handleSalvarBonus = async () => {
    setSaving(true); await salvarBonus(bon); setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className="page">
      <PageHeader title="Configurações" subtitle="Tabelas de rendimento, bônus e perfil" />
      <div className="tabs">
        {([['rendimento','Rendimento carcaça'],['bonus','Bônus frigorífico'],['perfil','Perfil']] as const).map(([t,l]) => (
          <button key={t} className={`tab-btn${tab===t?' active':''}`} onClick={() => setTab(t)}>{l}</button>
        ))}
      </div>

      {tab === 'rendimento' && (
        <div className="card" style={{ maxWidth: 600 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Faixas de rendimento de carcaça</div>
          <div style={{ fontSize: 13, color: '#9e9e9e', marginBottom: 16 }}>Percentual do peso vivo que se converte em carcaça. Editável por faixa.</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
            {['Peso mín (kg)','Peso máx (kg)','Rendimento (%)'].map(l => <span key={l} style={{ fontSize: 11, color: '#9e9e9e', textTransform: 'uppercase' }}>{l}</span>)}
          </div>
          {(rend.length > 0 ? rend : rendimentos).map((f, i) => (
            <div key={f.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
              <input className="form-input" type="number" value={f.peso_min} onChange={e => setRend(r => r.map((x, j) => j === i ? { ...x, peso_min: Number(e.target.value) } : x))} />
              <input className="form-input" type="number" value={f.peso_max} onChange={e => setRend(r => r.map((x, j) => j === i ? { ...x, peso_max: Number(e.target.value) } : x))} />
              <input className="form-input" type="number" step="0.1" value={f.rendimento_percentual} onChange={e => setRend(r => r.map((x, j) => j === i ? { ...x, rendimento_percentual: Number(e.target.value) } : x))} />
            </div>
          ))}
          <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={handleSalvarRend} disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : saved ? 'Salvo!' : 'Salvar alterações'}
          </button>
        </div>
      )}

      {tab === 'bonus' && (
        <div className="card" style={{ maxWidth: 600 }}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>Bônus por faixa de peso vivo</div>
          <div style={{ fontSize: 13, color: '#9e9e9e', marginBottom: 16 }}>Valor adicional pago pelo frigorífico por kg de carcaça.</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
            {['Peso mín (kg)','Peso máx (kg)','Bônus (R$/kg)'].map(l => <span key={l} style={{ fontSize: 11, color: '#9e9e9e', textTransform: 'uppercase' }}>{l}</span>)}
          </div>
          {(bon.length > 0 ? bon : bonus).map((f, i) => (
            <div key={f.id} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, marginBottom: 8 }}>
              <input className="form-input" type="number" value={f.peso_min} onChange={e => setBon(b => b.map((x, j) => j === i ? { ...x, peso_min: Number(e.target.value) } : x))} />
              <input className="form-input" type="number" value={f.peso_max} onChange={e => setBon(b => b.map((x, j) => j === i ? { ...x, peso_max: Number(e.target.value) } : x))} />
              <input className="form-input" type="number" step="0.01" value={f.bonus_por_kg} onChange={e => setBon(b => b.map((x, j) => j === i ? { ...x, bonus_por_kg: Number(e.target.value) } : x))} />
            </div>
          ))}
          <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={handleSalvarBonus} disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : saved ? 'Salvo!' : 'Salvar alterações'}
          </button>
        </div>
      )}

      {tab === 'perfil' && (
        <div className="card" style={{ maxWidth: 480 }}>
          <div style={{ fontWeight: 600, marginBottom: 16 }}>Dados da conta</div>
          {[
            ['E-mail', user?.email ?? '—'],
            ['Nome', user?.user_metadata?.nome ?? '—'],
            ['Plano', 'Free'],
          ].map(([l, v]) => (
            <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #f5f5f5', fontSize: 13 }}>
              <span style={{ color: '#757575' }}>{l}</span>
              {l === 'Plano' ? <span className="badge badge-green">{v}</span> : <span style={{ fontWeight: 500 }}>{v}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
