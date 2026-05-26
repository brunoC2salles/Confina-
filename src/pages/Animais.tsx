import { useState } from 'react'
import { useAnimais } from '@/hooks/useAnimais'
import { useLotes } from '@/hooks/useLotes'
import { Modal, PageHeader, EmptyState } from '@/components/common/UI'
import { fmtData, fmt, calcularDias } from '@/lib/calculations'

export default function Animais() {
  const { animais, animaisAtivos, loading, adicionarAnimal, registrarPesagem, registrarSaida } = useAnimais()
  const { lotesAtivos } = useLotes()
  const [filtroLote, setFiltroLote] = useState('todos')
  const [showNovo, setShowNovo] = useState(false)
  const [showPesagem, setShowPesagem] = useState<string|null>(null)
  const [showSaida, setShowSaida] = useState<string|null>(null)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string|null>(null)

  const [fAnimal, setFAnimal] = useState({
    identificacao: '', peso_entrada: '', data_entrada: new Date().toISOString().split('T')[0],
    origem: '', raca: '', idade_estimada: '', valor_compra: '', lote_atual_id: '', observacoes: '',
  })
  const [fPesagem, setFPesagem] = useState({ peso: '', data: new Date().toISOString().split('T')[0], observacoes: '' })
  const [fSaida, setFSaida] = useState({ tipo: 'saida_venda' as const, data: new Date().toISOString().split('T')[0], peso_final: '', valor: '', observacoes: '' })

  const animalSaida = animais.find(a => a.id === showSaida)
  const lista = filtroLote === 'todos' ? animaisAtivos : animaisAtivos.filter(a => a.lote_atual_id === filtroLote)

  const handleAdicionarAnimal = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setErro(null)
    const { error } = await adicionarAnimal({
      identificacao: fAnimal.identificacao, peso_entrada: Number(fAnimal.peso_entrada),
      data_entrada: fAnimal.data_entrada, origem: fAnimal.origem || undefined,
      raca: fAnimal.raca || undefined, idade_estimada: fAnimal.idade_estimada ? Number(fAnimal.idade_estimada) : undefined,
      valor_compra: Number(fAnimal.valor_compra), lote_atual_id: fAnimal.lote_atual_id,
      observacoes: fAnimal.observacoes || undefined,
    })
    setSaving(false)
    if (error) { setErro(error); return }
    setShowNovo(false)
    setFAnimal({ identificacao: '', peso_entrada: '', data_entrada: new Date().toISOString().split('T')[0], origem: '', raca: '', idade_estimada: '', valor_compra: '', lote_atual_id: '', observacoes: '' })
  }

  const handlePesagem = async (e: React.FormEvent) => {
    e.preventDefault(); if (!showPesagem) return; setSaving(true)
    await registrarPesagem({ animal_id: showPesagem, peso: Number(fPesagem.peso), data: fPesagem.data, observacoes: fPesagem.observacoes || undefined })
    setSaving(false); setShowPesagem(null)
  }

  const handleSaida = async (e: React.FormEvent) => {
    e.preventDefault(); if (!showSaida) return; setSaving(true)
    await registrarSaida({ animal_id: showSaida, tipo: fSaida.tipo, data: fSaida.data, peso_final: Number(fSaida.peso_final), valor: fSaida.valor ? Number(fSaida.valor) : undefined, observacoes: fSaida.observacoes || undefined })
    setSaving(false); setShowSaida(null)
  }

  return (
    <div className="page">
      <div style={{ padding: '10px 16px', background: '#fff3e0', borderRadius: 8, border: '1px solid #ffe0b2', fontSize: 13, color: '#b45309', marginBottom: 20 }}>
        O rastreamento individual é opcional. A gestão principal do confinamento é feita por lote na página Lotes.
      </div>

      <PageHeader title="Animais individuais" subtitle={`${animaisAtivos.length} animal(is) cadastrado(s) individualmente`}
        action={<button className="btn btn-primary" onClick={() => setShowNovo(true)}>+ Adicionar animal</button>} />

      <div className="pill-wrap">
        {[{ id: 'todos', label: 'Todos' }, ...lotesAtivos.map(l => ({ id: l.id, label: l.nome_lote }))].map(f => (
          <button key={f.id} className={`pill${filtroLote === f.id ? ' active' : ''}`} onClick={() => setFiltroLote(f.id)}>{f.label}</button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" style={{ width: 28, height: 28 }} /></div>
      ) : lista.length === 0 ? (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">◈</div>
            <div className="empty-title">Nenhum animal individual cadastrado</div>
            <div className="empty-desc">Use esta seção apenas para animais que precisam de rastreio individual (ex: SISBOV).</div>
            <button className="btn btn-primary" onClick={() => setShowNovo(true)}>Adicionar animal</button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Identificação</th><th>Lote</th><th>Raça</th><th>Peso entrada</th><th>Data entrada</th><th>Dias</th><th>Valor compra</th><th>Ações</th></tr></thead>
              <tbody>
                {lista.map(a => {
                  const lote = lotesAtivos.find(l => l.id === a.lote_atual_id)
                  const dias = calcularDias(a.data_entrada, new Date().toISOString().split('T')[0])
                  return (
                    <tr key={a.id}>
                      <td><strong>{a.identificacao}</strong></td>
                      <td>{lote?.nome_lote ?? '—'}</td>
                      <td>{a.raca ?? '—'}</td>
                      <td>{a.peso_entrada} kg</td>
                      <td>{fmtData(a.data_entrada)}</td>
                      <td>{dias}d</td>
                      <td>{fmt(a.valor_compra)}</td>
                      <td>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => setShowPesagem(a.id)}>Pesagem</button>
                          <button className="btn btn-secondary btn-sm" onClick={() => setShowSaida(a.id)}>Saída</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={showNovo} onClose={() => setShowNovo(false)} title="Adicionar animal individual" size="lg">
        <form onSubmit={handleAdicionarAnimal} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-row-2">
            <div className="form-group"><label className="form-label">Brinco / Identificação</label><input className="form-input" placeholder="#4821" value={fAnimal.identificacao} onChange={e => setFAnimal(f => ({ ...f, identificacao: e.target.value }))} required /></div>
            <div className="form-group"><label className="form-label">Lote</label><select className="form-input" value={fAnimal.lote_atual_id} onChange={e => setFAnimal(f => ({ ...f, lote_atual_id: e.target.value }))} required><option value="">Selecione</option>{lotesAtivos.map(l => <option key={l.id} value={l.id}>{l.nome_lote}</option>)}</select></div>
          </div>
          <div className="form-row-3">
            <div className="form-group"><label className="form-label">Peso entrada (kg)</label><input className="form-input" type="number" placeholder="320" value={fAnimal.peso_entrada} onChange={e => setFAnimal(f => ({ ...f, peso_entrada: e.target.value }))} required min="1" /></div>
            <div className="form-group"><label className="form-label">Data de entrada</label><input className="form-input" type="date" value={fAnimal.data_entrada} onChange={e => setFAnimal(f => ({ ...f, data_entrada: e.target.value }))} required /></div>
            <div className="form-group"><label className="form-label">Valor de compra (R$)</label><input className="form-input" type="number" placeholder="2800" value={fAnimal.valor_compra} onChange={e => setFAnimal(f => ({ ...f, valor_compra: e.target.value }))} required min="0" step="0.01" /></div>
          </div>
          <div className="form-row-3">
            <div className="form-group"><label className="form-label">Raça</label><input className="form-input" placeholder="Nelore" value={fAnimal.raca} onChange={e => setFAnimal(f => ({ ...f, raca: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Origem</label><input className="form-input" placeholder="Fazenda" value={fAnimal.origem} onChange={e => setFAnimal(f => ({ ...f, origem: e.target.value }))} /></div>
            <div className="form-group"><label className="form-label">Idade (meses)</label><input className="form-input" type="number" placeholder="18" value={fAnimal.idade_estimada} onChange={e => setFAnimal(f => ({ ...f, idade_estimada: e.target.value }))} min="0" /></div>
          </div>
          {erro && <div style={{ padding: 10, background: '#ffebee', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>{erro}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setShowNovo(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Adicionar'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!showPesagem} onClose={() => setShowPesagem(null)} title="Registrar pesagem" size="sm">
        <form onSubmit={handlePesagem} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group"><label className="form-label">Peso atual (kg)</label><input className="form-input" type="number" placeholder="450" value={fPesagem.peso} onChange={e => setFPesagem(f => ({ ...f, peso: e.target.value }))} required min="1" /></div>
          <div className="form-group"><label className="form-label">Data</label><input className="form-input" type="date" value={fPesagem.data} onChange={e => setFPesagem(f => ({ ...f, data: e.target.value }))} required /></div>
          <div className="form-group"><label className="form-label">Observações</label><input className="form-input" placeholder="Opcional" value={fPesagem.observacoes} onChange={e => setFPesagem(f => ({ ...f, observacoes: e.target.value }))} /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setShowPesagem(null)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Salvar'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={!!showSaida} onClose={() => setShowSaida(null)} title="Registrar saída" subtitle={animalSaida ? `Animal: ${animalSaida.identificacao}` : ''} size="md">
        <form onSubmit={handleSaida} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-row-2">
            <div className="form-group"><label className="form-label">Tipo</label><select className="form-input" value={fSaida.tipo} onChange={e => setFSaida(f => ({ ...f, tipo: e.target.value as typeof fSaida.tipo }))}><option value="saida_venda">Venda</option><option value="saida_abate">Abate</option><option value="saida_transferencia">Transferência</option><option value="saida_morte">Morte</option></select></div>
            <div className="form-group"><label className="form-label">Data</label><input className="form-input" type="date" value={fSaida.data} onChange={e => setFSaida(f => ({ ...f, data: e.target.value }))} required /></div>
          </div>
          <div className="form-row-2">
            <div className="form-group"><label className="form-label">Peso final (kg)</label><input className="form-input" type="number" placeholder="540" value={fSaida.peso_final} onChange={e => setFSaida(f => ({ ...f, peso_final: e.target.value }))} required min="1" /></div>
            {fSaida.tipo === 'saida_venda' && <div className="form-group"><label className="form-label">Valor de venda (R$)</label><input className="form-input" type="number" placeholder="7560" value={fSaida.valor} onChange={e => setFSaida(f => ({ ...f, valor: e.target.value }))} min="0" step="0.01" /></div>}
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setShowSaida(null)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Confirmar'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
