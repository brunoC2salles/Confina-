import { useState } from 'react'
import { useAnimais } from '@/hooks/useAnimais'
import { useLotes } from '@/hooks/useLotes'
import { useParceiros } from '@/hooks/useHooks'
import { useFaixas } from '@/hooks/useFaixas'
import { Modal, PageHeader, EmptyState } from '@/components/common/UI'
import { fmt, fmtNum, fmtData, calcularDias, obterRendimento, obterBonus } from '@/lib/calculations'

export default function Animais() {
  const { animais, animaisAtivos, loading, adicionarAnimal, registrarPesagem, registrarSaida, adicionarCustoVariavel } = useAnimais()
  const { lotesAtivos } = useLotes()
  const { parceiros } = useParceiros()
  const { rendimentos, bonus: bonusFaixas } = useFaixas()
  const [filtroLote, setFiltroLote] = useState('todos')
  const [showNovo, setShowNovo] = useState(false)
  const [showPesagem, setShowPesagem] = useState<string|null>(null)
  const [showSaida, setShowSaida] = useState<string|null>(null)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string|null>(null)

  const [fAnimal, setFAnimal] = useState({ identificacao: '', peso_entrada: '', data_entrada: new Date().toISOString().split('T')[0], origem: '', raca: '', idade_estimada: '', valor_compra: '', lote_atual_id: '', observacoes: '' })
  const [fPesagem, setFPesagem] = useState({ peso: '', data: new Date().toISOString().split('T')[0], observacoes: '' })
  const [fSaida, setFSaida] = useState({
    tipo: 'saida_venda' as const, data: new Date().toISOString().split('T')[0],
    peso_final: '', valor: '', destino_id: '', observacoes: '',
    comissoes: [] as Array<{ tipo: string; parceiro_id: string; percentual: number }>,
    encargos: [] as Array<{ descricao: string; percentual: number }>,
    custos_var: [] as Array<{ descricao: string; valor: number }>,
  })

  const animalSaida = animais.find(a => a.id === showSaida)
  const lista = filtroLote === 'todos' ? animaisAtivos : animaisAtivos.filter(a => a.lote_atual_id === filtroLote)

  // Cálculo em tempo real para a saída
  const venda = Number(fSaida.valor) || 0
  const pesoFinal = Number(fSaida.peso_final) || 0
  const rendPct = pesoFinal > 0 ? obterRendimento(pesoFinal, rendimentos) : 54
  const pesoCarcaca = pesoFinal * (rendPct / 100)
  const bonusPorKg = pesoFinal > 0 ? obterBonus(pesoFinal, bonusFaixas) : 0
  const valorBonus = pesoCarcaca * bonusPorKg
  const receitaBruta = venda + valorBonus
  const totalComissoes = fSaida.comissoes.reduce((t, c) => t + (receitaBruta * c.percentual / 100), 0)
  const totalEncargos = fSaida.encargos.reduce((t, e) => t + (receitaBruta * e.percentual / 100), 0)
  const receitaLiquida = receitaBruta - totalComissoes - totalEncargos
  const custoCompra = animalSaida?.valor_compra ?? 0
  const custosVarTotal = fSaida.custos_var.reduce((t, c) => t + c.valor, 0)
  const diasConf = animalSaida ? calcularDias(animalSaida.data_entrada, fSaida.data) : 0
  const lucro = receitaLiquida - custoCompra - custosVarTotal

  const handleAdicionarAnimal = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true); setErro(null)
    const { error } = await adicionarAnimal({ identificacao: fAnimal.identificacao, peso_entrada: Number(fAnimal.peso_entrada), data_entrada: fAnimal.data_entrada, origem: fAnimal.origem || undefined, raca: fAnimal.raca || undefined, idade_estimada: fAnimal.idade_estimada ? Number(fAnimal.idade_estimada) : undefined, valor_compra: Number(fAnimal.valor_compra), lote_atual_id: fAnimal.lote_atual_id, observacoes: fAnimal.observacoes || undefined })
    setSaving(false); if (error) { setErro(error); return }
    setShowNovo(false); setFAnimal({ identificacao: '', peso_entrada: '', data_entrada: new Date().toISOString().split('T')[0], origem: '', raca: '', idade_estimada: '', valor_compra: '', lote_atual_id: '', observacoes: '' })
  }

  const handlePesagem = async (e: React.FormEvent) => {
    e.preventDefault(); if (!showPesagem) return; setSaving(true)
    await registrarPesagem({ animal_id: showPesagem, peso: Number(fPesagem.peso), data: fPesagem.data, observacoes: fPesagem.observacoes || undefined })
    setSaving(false); setShowPesagem(null)
  }

  const handleSaida = async (e: React.FormEvent) => {
    e.preventDefault(); if (!showSaida) return; setSaving(true)
    await registrarSaida({
      animal_id: showSaida, tipo: fSaida.tipo, data: fSaida.data, peso_final: Number(fSaida.peso_final),
      valor: fSaida.valor ? Number(fSaida.valor) : undefined,
      destino_id: fSaida.destino_id || undefined,
      observacoes: fSaida.observacoes || undefined,
      comissoes: fSaida.comissoes.map(c => ({ tipo: c.tipo, parceiro_id: c.parceiro_id || undefined, percentual: c.percentual, valor_calculado: receitaBruta * c.percentual / 100 })),
      encargos: fSaida.encargos.map(e => ({ descricao: e.descricao, base_calculo: 'receita_bruta', percentual: e.percentual, valor_calculado: receitaBruta * e.percentual / 100 })),
    })
    setSaving(false); setShowSaida(null)
  }

  return (
    <div className="page">
      <PageHeader title="Animais" subtitle={`${animaisAtivos.length} animal(is) em confinamento`} action={<button className="btn btn-primary" onClick={() => setShowNovo(true)}>+ Adicionar animal</button>} />

      <div className="pill-wrap">
        {[{ id: 'todos', label: 'Todos' }, ...lotesAtivos.map(l => ({ id: l.id, label: l.nome_lote }))].map(f => (
          <button key={f.id} className={`pill${filtroLote === f.id ? ' active' : ''}`} onClick={() => setFiltroLote(f.id)}>{f.label}</button>
        ))}
      </div>

      {loading ? <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" style={{ width: 28, height: 28 }} /></div>
      : lista.length === 0 ? <div className="card"><EmptyState icon="◈" title="Nenhum animal encontrado" desc="Adicione animais a um lote para começar." action={<button className="btn btn-primary" onClick={() => setShowNovo(true)}>Adicionar animal</button>} /></div>
      : (
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
                          <button className="btn btn-secondary btn-sm" onClick={() => { setShowSaida(a.id); setFSaida(f => ({ ...f, comissoes: [], encargos: [], custos_var: [] })) }}>Saída</button>
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

      {/* Modal novo animal */}
      <Modal open={showNovo} onClose={() => setShowNovo(false)} title="Adicionar animal" subtitle="Dados de entrada" size="lg">
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
          <div className="form-group"><label className="form-label">Observações</label><input className="form-input" placeholder="Opcional" value={fAnimal.observacoes} onChange={e => setFAnimal(f => ({ ...f, observacoes: e.target.value }))} /></div>
          {erro && <div style={{ padding: 10, background: '#ffebee', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>{erro}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setShowNovo(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Adicionar'}</button>
          </div>
        </form>
      </Modal>

      {/* Modal pesagem */}
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

      {/* Modal saída completo */}
      <Modal open={!!showSaida} onClose={() => setShowSaida(null)} title="Registrar saída" subtitle={animalSaida ? `Animal: ${animalSaida.identificacao} — ${diasConf} dias em confinamento` : ''} size="lg">
        <form onSubmit={handleSaida} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-row-2">
            <div className="form-group"><label className="form-label">Tipo de saída</label><select className="form-input" value={fSaida.tipo} onChange={e => setFSaida(f => ({ ...f, tipo: e.target.value as typeof fSaida.tipo }))}><option value="saida_venda">Venda</option><option value="saida_abate">Abate</option><option value="saida_transferencia">Transferência</option><option value="saida_morte">Morte</option></select></div>
            <div className="form-group"><label className="form-label">Data</label><input className="form-input" type="date" value={fSaida.data} onChange={e => setFSaida(f => ({ ...f, data: e.target.value }))} required /></div>
          </div>
          <div className="form-row-2">
            <div className="form-group"><label className="form-label">Peso final (kg)</label><input className="form-input" type="number" placeholder="540" value={fSaida.peso_final} onChange={e => setFSaida(f => ({ ...f, peso_final: e.target.value }))} required min="1" /></div>
            {fSaida.tipo === 'saida_venda' && <div className="form-group"><label className="form-label">Valor de venda (R$)</label><input className="form-input" type="number" placeholder="7560" value={fSaida.valor} onChange={e => setFSaida(f => ({ ...f, valor: e.target.value }))} min="0" step="0.01" /></div>}
          </div>

          {pesoFinal > 0 && (
            <div style={{ padding: 12, background: '#fafafa', borderRadius: 8, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8, fontSize: 12 }}>
              <div><span style={{ color: '#9e9e9e' }}>Rendimento: </span><strong>{rendPct}%</strong></div>
              <div><span style={{ color: '#9e9e9e' }}>Peso carcaça: </span><strong>{fmtNum(pesoCarcaca)} kg</strong></div>
              <div><span style={{ color: '#9e9e9e' }}>Bônus: </span><strong>R$ {fmtNum(bonusPorKg, 2)}/kg</strong></div>
            </div>
          )}

          {/* Comissionamentos */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#555', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Comissionamentos</div>
            {fSaida.comissoes.map((c, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 80px 28px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <select className="form-input" value={c.tipo} onChange={e => setFSaida(f => ({ ...f, comissoes: f.comissoes.map((x, j) => j === i ? { ...x, tipo: e.target.value } : x) }))}><option value="corretor">Corretor</option><option value="operador">Operador</option><option value="outro">Outro</option></select>
                <select className="form-input" value={c.parceiro_id} onChange={e => setFSaida(f => ({ ...f, comissoes: f.comissoes.map((x, j) => j === i ? { ...x, parceiro_id: e.target.value } : x) }))}><option value="">— Parceiro —</option>{parceiros.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}</select>
                <div style={{ position: 'relative' }}><input className="form-input" type="number" step="0.1" placeholder="%" value={c.percentual} onChange={e => setFSaida(f => ({ ...f, comissoes: f.comissoes.map((x, j) => j === i ? { ...x, percentual: Number(e.target.value) } : x) }))} style={{ paddingRight: 24 }} /><span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#9e9e9e' }}>%</span></div>
                <button type="button" onClick={() => setFSaida(f => ({ ...f, comissoes: f.comissoes.filter((_, j) => j !== i) }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9e9e9e', fontSize: 16 }}>×</button>
              </div>
            ))}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFSaida(f => ({ ...f, comissoes: [...f.comissoes, { tipo: 'corretor', parceiro_id: '', percentual: 2 }] }))}>+ Adicionar comissão</button>
          </div>

          {/* Encargos */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: '#555', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.4px' }}>Encargos / Impostos</div>
            {fSaida.encargos.map((e, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 28px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <input className="form-input" placeholder="Ex: FUNRURAL" value={e.descricao} onChange={ev => setFSaida(f => ({ ...f, encargos: f.encargos.map((x, j) => j === i ? { ...x, descricao: ev.target.value } : x) }))} />
                <div style={{ position: 'relative' }}><input className="form-input" type="number" step="0.1" placeholder="%" value={e.percentual} onChange={ev => setFSaida(f => ({ ...f, encargos: f.encargos.map((x, j) => j === i ? { ...x, percentual: Number(ev.target.value) } : x) }))} style={{ paddingRight: 24 }} /><span style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', fontSize: 11, color: '#9e9e9e' }}>%</span></div>
                <button type="button" onClick={() => setFSaida(f => ({ ...f, encargos: f.encargos.filter((_, j) => j !== i) }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9e9e9e', fontSize: 16 }}>×</button>
              </div>
            ))}
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setFSaida(f => ({ ...f, encargos: [...f.encargos, { descricao: '', percentual: 0 }] }))}>+ Adicionar encargo</button>
          </div>

          {/* Resultado calculado */}
          {pesoFinal > 0 && venda > 0 && (
            <div className="result-box">
              <div className="result-row"><span className="result-label">Receita bruta</span><span className="result-val">{fmt(receitaBruta)}</span></div>
              {totalComissoes > 0 && <div className="result-row"><span className="result-label">Comissionamentos</span><span className="result-val" style={{ color: '#b91c1c' }}>- {fmt(totalComissoes)}</span></div>}
              {totalEncargos > 0 && <div className="result-row"><span className="result-label">Encargos</span><span className="result-val" style={{ color: '#b91c1c' }}>- {fmt(totalEncargos)}</span></div>}
              <div className="result-row"><span className="result-label">Custo de compra</span><span className="result-val" style={{ color: '#b91c1c' }}>- {fmt(custoCompra)}</span></div>
              <div className="result-divider" />
              <div className="result-total">
                <span className="result-total-label">Lucro estimado</span>
                <span className="result-total-val" style={{ color: lucro >= 0 ? '#2e7d32' : '#b91c1c' }}>{fmt(lucro)}</span>
              </div>
              <div className="result-row" style={{ marginTop: 4 }}><span className="result-label">Margem</span><span className="result-val">{receitaLiquida > 0 ? fmtNum((lucro / receitaLiquida) * 100, 1) : '—'}%</span></div>
            </div>
          )}

          <div className="form-group"><label className="form-label">Observações</label><input className="form-input" placeholder="Opcional" value={fSaida.observacoes} onChange={e => setFSaida(f => ({ ...f, observacoes: e.target.value }))} /></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setShowSaida(null)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Confirmar saída'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
