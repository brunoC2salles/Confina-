import { useState } from 'react'
import { useLotes } from '@/hooks/useLotes'
import { useAnimais } from '@/hooks/useAnimais'
import { Modal, PageHeader, EmptyState } from '@/components/common/UI'
import { fmtData } from '@/lib/calculations'

const cicloLabel = (n: number) => ({ 1: 'Adaptação', 2: 'Crescimento', 3: 'Engorda', 4: 'Acabamento' }[n] ?? `Ciclo ${n}`)

export default function Lotes() {
  const { lotesAtivos, lotesEncerrados, loading, criarLote, encerrarLote, avancarCiclo, bifurcarLote } = useLotes()
  const [tab, setTab] = useState<'ativos'|'encerrados'>('ativos')
  const [showNovo, setShowNovo] = useState(false)
  const [showAvancar, setShowAvancar] = useState<string|null>(null)
  const [showBifurcar, setShowBifurcar] = useState<string|null>(null)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ nome_lote: '', codigo_lote: '', ciclo_inicial: 1 })
  const [formBif, setFormBif] = useState({ nome_lote: '', codigo_lote: '', ciclo_inicial: 1, criterio: 'peso', limite: '' })
  const [erro, setErro] = useState<string|null>(null)

  const loteParaAvancar = lotesAtivos.find(l => l.id === showAvancar)
  const loteParaBifurcar = lotesAtivos.find(l => l.id === showBifurcar)

  const handleCriar = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setErro(null)
    const { error } = await criarLote(form)
    setSaving(false)
    if (error) { setErro(error); return }
    setShowNovo(false); setForm({ nome_lote: '', codigo_lote: '', ciclo_inicial: 1 })
  }

  const lista = tab === 'ativos' ? lotesAtivos : lotesEncerrados

  return (
    <div className="page">
      <PageHeader title="Lotes" subtitle={`${lotesAtivos.length} lote${lotesAtivos.length !== 1 ? 's' : ''} ativo${lotesAtivos.length !== 1 ? 's' : ''}`}
        action={<button className="btn btn-primary" onClick={() => setShowNovo(true)}>+ Criar lote</button>} />

      <div className="tabs">
        <button className={`tab-btn ${tab === 'ativos' ? 'active' : ''}`} onClick={() => setTab('ativos')}>Ativos ({lotesAtivos.length})</button>
        <button className={`tab-btn ${tab === 'encerrados' ? 'active' : ''}`} onClick={() => setTab('encerrados')}>Encerrados ({lotesEncerrados.length})</button>
      </div>

      {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" style={{ width: 28, height: 28 }} /></div>
      : lista.length === 0 ? (
        <div className="card"><EmptyState icon="⊟" title={tab === 'ativos' ? 'Nenhum lote ativo' : 'Nenhum lote encerrado'} desc={tab === 'ativos' ? 'Crie seu primeiro lote para começar.' : ''}
          action={tab === 'ativos' ? <button className="btn btn-primary" onClick={() => setShowNovo(true)}>Criar lote</button> : undefined} /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {lista.map(lote => <LoteCard key={lote.id} lote={lote} onAvancar={() => setShowAvancar(lote.id)} onEncerrar={() => encerrarLote(lote.id)} onBifurcar={() => setShowBifurcar(lote.id)} />)}
        </div>
      )}

      {/* Modal criar lote */}
      <Modal open={showNovo} onClose={() => setShowNovo(false)} title="Criar novo lote" subtitle="Preencha os dados básicos">
        <form onSubmit={handleCriar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group"><label className="form-label">Nome do lote</label><input className="form-input" placeholder="Ex: Lote A-25" value={form.nome_lote} onChange={e => setForm(f => ({ ...f, nome_lote: e.target.value }))} required /></div>
          <div className="form-group"><label className="form-label">Código</label><input className="form-input" placeholder="Ex: LA2025" value={form.codigo_lote} onChange={e => setForm(f => ({ ...f, codigo_lote: e.target.value }))} required /></div>
          <div className="form-group"><label className="form-label">Ciclo inicial</label>
            <select className="form-input" value={form.ciclo_inicial} onChange={e => setForm(f => ({ ...f, ciclo_inicial: Number(e.target.value) }))}>
              {[1,2,3,4].map(n => <option key={n} value={n}>Ciclo {n} — {cicloLabel(n)}</option>)}
            </select>
          </div>
          {erro && <div style={{ padding: 10, background: '#ffebee', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>{erro}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setShowNovo(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Criar lote'}</button>
          </div>
        </form>
      </Modal>

      {/* Modal avançar ciclo */}
      <Modal open={!!showAvancar} onClose={() => setShowAvancar(null)} title="Avançar ciclo" size="sm"
        subtitle={loteParaAvancar ? `${loteParaAvancar.nome_lote} → Ciclo ${loteParaAvancar.ciclo_atual + 1}` : ''}>
        <p style={{ fontSize: 13, color: '#555', marginBottom: 20 }}>Os animais do lote avançarão para o próximo ciclo. Esta ação não pode ser desfeita.</p>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={() => setShowAvancar(null)}>Cancelar</button>
          <button className="btn btn-primary" disabled={saving} onClick={async () => {
            if (!loteParaAvancar) return; setSaving(true)
            await avancarCiclo(loteParaAvancar.id, loteParaAvancar.ciclo_atual + 1)
            setSaving(false); setShowAvancar(null)
          }}>{saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Confirmar'}</button>
        </div>
      </Modal>

      {/* Modal bifurcar */}
      <BifurcarModal open={!!showBifurcar} onClose={() => setShowBifurcar(null)} lote={loteParaBifurcar ?? null} onBifurcar={bifurcarLote} />
    </div>
  )
}

function LoteCard({ lote, onAvancar, onEncerrar, onBifurcar }: {
  lote: { id: string; nome_lote: string; codigo_lote: string; ciclo_atual: number; status: string; data_criacao: string }
  onAvancar: () => void; onEncerrar: () => void; onBifurcar: () => void
}) {
  const { animaisAtivos } = useAnimais(lote.id)
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="flex-between">
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>{lote.nome_lote}</div>
          <div style={{ fontSize: 11, color: '#9e9e9e', marginTop: 2 }}>{lote.codigo_lote}</div>
        </div>
        <span className={`badge ${lote.status === 'ativo' ? 'badge-green' : 'badge-gray'}`}>{lote.status === 'ativo' ? 'Ativo' : 'Encerrado'}</span>
      </div>
      <div>
        <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
          {[1,2,3,4].map(n => <div key={n} style={{ flex: 1, height: 4, borderRadius: 2, background: n < lote.ciclo_atual ? '#2e7d32' : n === lote.ciclo_atual ? '#66bb6a' : '#e0e0e0' }} />)}
        </div>
        <div style={{ fontSize: 11, color: '#9e9e9e' }}>Ciclo {lote.ciclo_atual} — {cicloLabel(lote.ciclo_atual)}</div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div style={{ background: '#fafafa', borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 11, color: '#9e9e9e' }}>Animais ativos</div>
          <div style={{ fontSize: 18, fontWeight: 600, marginTop: 2 }}>{animaisAtivos.length}</div>
        </div>
        <div style={{ background: '#fafafa', borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 11, color: '#9e9e9e' }}>Criado em</div>
          <div style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}>{fmtData(lote.data_criacao)}</div>
        </div>
      </div>
      {lote.status === 'ativo' && (
        <div style={{ display: 'flex', gap: 6 }}>
          {lote.ciclo_atual < 4 && <button className="btn btn-secondary btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={onAvancar}>Avançar ciclo</button>}
          <button className="btn btn-ghost btn-sm" style={{ flex: 1, justifyContent: 'center' }} onClick={onBifurcar}>Bifurcar</button>
          <button className="btn btn-ghost btn-sm" style={{ justifyContent: 'center', color: '#b91c1c' }} onClick={onEncerrar}>Encerrar</button>
        </div>
      )}
    </div>
  )
}

function BifurcarModal({ open, onClose, lote, onBifurcar }: {
  open: boolean; onClose: () => void
  lote: { id: string; nome_lote: string; ciclo_atual: number } | null
  onBifurcar: (input: { lote_origem_id: string; nome_lote: string; codigo_lote: string; ciclo_inicial: number; animal_ids: string[] }) => Promise<{ error: string | null }>
}) {
  const { animaisAtivos } = useAnimais(lote?.id)
  const [step, setStep] = useState<'config'|'animais'>('config')
  const [criterio, setCriterio] = useState<'peso'|'manual'>('peso')
  const [limitePeso, setLimitePeso] = useState('')
  const [selecionados, setSelecionados] = useState<string[]>([])
  const [nome, setNome] = useState(''); const [codigo, setCodigo] = useState('')
  const [saving, setSaving] = useState(false); const [erro, setErro] = useState<string|null>(null)

  const animaisFiltrados = criterio === 'peso' && limitePeso
    ? animaisAtivos.filter(a => a.peso_entrada >= Number(limitePeso))
    : criterio === 'manual' ? animaisAtivos : []

  const handleConfirm = async () => {
    if (!lote || !nome || !codigo) return
    const ids = criterio === 'manual' ? selecionados : animaisFiltrados.map(a => a.id)
    if (ids.length === 0) { setErro('Nenhum animal selecionado.'); return }
    setSaving(true)
    const { error } = await onBifurcar({ lote_origem_id: lote.id, nome_lote: nome, codigo_lote: codigo, ciclo_inicial: lote.ciclo_atual, animal_ids: ids })
    setSaving(false)
    if (error) { setErro(error); return }
    onClose(); setStep('config'); setNome(''); setCodigo(''); setSelecionados([])
  }

  if (!open || !lote) return null
  return (
    <Modal open={open} onClose={onClose} title="Bifurcar lote" subtitle={`Dividir ${lote.nome_lote} em dois lotes`} size="lg">
      {step === 'config' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-row-2">
            <div className="form-group"><label className="form-label">Nome do novo lote</label><input className="form-input" placeholder="Ex: Lote A2-25" value={nome} onChange={e => setNome(e.target.value)} /></div>
            <div className="form-group"><label className="form-label">Código</label><input className="form-input" placeholder="Ex: LA2025B" value={codigo} onChange={e => setCodigo(e.target.value)} /></div>
          </div>
          <div className="form-group"><label className="form-label">Critério de divisão</label>
            <select className="form-input" value={criterio} onChange={e => setCriterio(e.target.value as 'peso'|'manual')}>
              <option value="peso">Por peso — selecionar acima de X kg</option>
              <option value="manual">Manual — selecionar individualmente</option>
            </select>
          </div>
          {criterio === 'peso' && (
            <div className="form-group"><label className="form-label">Peso mínimo (kg)</label><input className="form-input" type="number" placeholder="Ex: 450" value={limitePeso} onChange={e => setLimitePeso(e.target.value)} /></div>
          )}
          <div style={{ padding: 12, background: '#fafafa', borderRadius: 8, fontSize: 13, color: '#555' }}>
            {criterio === 'peso' && limitePeso ? `${animaisFiltrados.length} animais serão movidos para o novo lote` : criterio === 'manual' ? `${animaisAtivos.length} animais disponíveis para seleção` : 'Configure o critério acima'}
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={() => setStep('animais')} disabled={!nome || !codigo}>Próximo</button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {criterio === 'manual' ? (
            <div style={{ maxHeight: 300, overflowY: 'auto' }}>
              {animaisAtivos.map(a => (
                <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid #f5f5f5', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selecionados.includes(a.id)} onChange={e => setSelecionados(s => e.target.checked ? [...s, a.id] : s.filter(id => id !== a.id))} />
                  <span style={{ fontSize: 13 }}>{a.identificacao} — {a.peso_entrada} kg entrada — {a.raca ?? '—'}</span>
                </label>
              ))}
            </div>
          ) : (
            <div style={{ padding: 12, background: '#e8f5e9', borderRadius: 8, fontSize: 13, color: '#1b5e20' }}>
              {animaisFiltrados.length} animais com peso ≥ {limitePeso} kg serão movidos para <strong>{nome}</strong>.
            </div>
          )}
          {erro && <div style={{ padding: 10, background: '#ffebee', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>{erro}</div>}
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setStep('config')}>Voltar</button>
            <button className="btn btn-primary" onClick={handleConfirm} disabled={saving}>
              {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Confirmar bifurcação'}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
