import { useState } from 'react'
import { useLotes } from '@/hooks/useLotes'
import { useDietas } from '@/hooks/useHooks'
import { Modal, PageHeader, EmptyState } from '@/components/common/UI'
import { fmtData, fmt, fmtNum } from '@/lib/calculations'

const cicloLabel = (n: number) =>
  ({ 1: 'Adaptação', 2: 'Crescimento', 3: 'Engorda', 4: 'Acabamento' }[n] ?? `Ciclo ${n}`)

const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

export default function Lotes() {
  const { lotesAtivos, lotesEncerrados, loading, criarLote, encerrarLote, excluirLote, avancarCiclo, bifurcarLote, registrarPesagem, buscarPesagens, buscarSaidas } = useLotes()
  const { templates } = useDietas()
  const [tab, setTab] = useState<'ativos'|'encerrados'>('ativos')
  const [showNovo, setShowNovo] = useState(false)
  const [showAvancar, setShowAvancar] = useState<string|null>(null)
  const [showBifurcar, setShowBifurcar] = useState<string|null>(null)
  const [showPesagem, setShowPesagem] = useState<string|null>(null)
  const [showDetalhe, setShowDetalhe] = useState<string|null>(null)
  const [saving, setSaving] = useState(false)
  const [step, setStep] = useState(1)
  const [erro, setErro] = useState<string|null>(null)

  const [form, setForm] = useState({
    nome_lote: '', codigo_lote: '', ciclo_inicial: 1,
    qtd_animais: '', data_entrada: new Date().toISOString().split('T')[0],
    peso_medio_entrada: '', valor_pago_kg: '', valor_total_lote: '',
    origem_fazenda: '', origem_municipio: '', origem_estado: '',
    raca_predominante: '', dieta_id: '', observacoes: '',
  })

  const [fPesagem, setFPesagem] = useState({
    data: new Date().toISOString().split('T')[0], peso_medio: '', qtd_animais: '', observacoes: '',
  })

  const [fBif, setFBif] = useState({
    nome_lote: '', codigo_lote: '', ciclo_inicial: 1,
    data_bifurcacao: new Date().toISOString().split('T')[0],
    qtd_animais_transferidos: '', peso_medio_saida: '',
    motivo: 'peso' as const, dieta_id: '', observacoes: '',
  })

  const loteAvancar = lotesAtivos.find(l => l.id === showAvancar)
  const loteBifurcar = lotesAtivos.find(l => l.id === showBifurcar)

  const resetForm = () => {
    setForm({ nome_lote: '', codigo_lote: '', ciclo_inicial: 1, qtd_animais: '', data_entrada: new Date().toISOString().split('T')[0], peso_medio_entrada: '', valor_pago_kg: '', valor_total_lote: '', origem_fazenda: '', origem_municipio: '', origem_estado: '', raca_predominante: '', dieta_id: '', observacoes: '' })
    setStep(1); setErro(null)
  }

  const handleCriar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (step < 3) { setStep(s => s + 1); return }
    setSaving(true); setErro(null)
    const { error } = await criarLote({
      nome_lote: form.nome_lote, codigo_lote: form.codigo_lote,
      ciclo_inicial: Number(form.ciclo_inicial),
      qtd_animais: Number(form.qtd_animais),
      data_entrada: form.data_entrada,
      peso_medio_entrada: Number(form.peso_medio_entrada),
      valor_pago_kg: form.valor_pago_kg ? Number(form.valor_pago_kg) : undefined,
      valor_total_lote: form.valor_total_lote ? Number(form.valor_total_lote) : undefined,
      origem_fazenda: form.origem_fazenda || undefined,
      origem_municipio: form.origem_municipio || undefined,
      origem_estado: form.origem_estado || undefined,
      raca_predominante: form.raca_predominante || undefined,
      dieta_id: form.dieta_id || undefined,
      observacoes: form.observacoes || undefined,
    })
    setSaving(false)
    if (error) { setErro(error); return }
    setShowNovo(false); resetForm()
  }

  const handlePesagem = async (e: React.FormEvent) => {
    e.preventDefault(); if (!showPesagem) return
    const lote = lotesAtivos.find(l => l.id === showPesagem)
    setSaving(true)
    await registrarPesagem({
      lote_id: showPesagem,
      data: fPesagem.data,
      peso_medio: Number(fPesagem.peso_medio),
      qtd_animais: fPesagem.qtd_animais ? Number(fPesagem.qtd_animais) : (lote as any)?.qtd_animais_atual ?? 0,
      observacoes: fPesagem.observacoes || undefined,
    })
    setSaving(false); setShowPesagem(null)
    setFPesagem({ data: new Date().toISOString().split('T')[0], peso_medio: '', qtd_animais: '', observacoes: '' })
  }

  const handleBifurcar = async (e: React.FormEvent) => {
    e.preventDefault(); if (!showBifurcar) return
    setSaving(true); setErro(null)
    const { error } = await bifurcarLote({
      lote_origem_id: showBifurcar,
      nome_lote: fBif.nome_lote, codigo_lote: fBif.codigo_lote,
      ciclo_inicial: fBif.ciclo_inicial,
      data_bifurcacao: fBif.data_bifurcacao,
      qtd_animais_transferidos: Number(fBif.qtd_animais_transferidos),
      peso_medio_saida: fBif.peso_medio_saida ? Number(fBif.peso_medio_saida) : undefined,
      motivo: fBif.motivo,
      dieta_id: fBif.dieta_id || undefined,
      observacoes: fBif.observacoes || undefined,
    })
    setSaving(false)
    if (error) { setErro(error); return }
    setShowBifurcar(null)
  }

  const lista = tab === 'ativos' ? lotesAtivos : lotesEncerrados
  const stepLabel = ['Identificação', 'Entrada e valores', 'Origem e dieta']

  return (
    <div className="page">
      <PageHeader
        title="Lotes"
        subtitle={`${lotesAtivos.length} lote${lotesAtivos.length !== 1 ? 's' : ''} ativo${lotesAtivos.length !== 1 ? 's' : ''}`}
        action={<button className="btn btn-primary" onClick={() => { resetForm(); setShowNovo(true) }}>+ Criar lote</button>}
      />

      <div className="tabs">
        <button className={`tab-btn${tab==='ativos'?' active':''}`} onClick={() => setTab('ativos')}>Ativos ({lotesAtivos.length})</button>
        <button className={`tab-btn${tab==='encerrados'?' active':''}`} onClick={() => setTab('encerrados')}>Encerrados ({lotesEncerrados.length})</button>
      </div>

      {loading ? (
        <div style={{display:'flex',justifyContent:'center',padding:48}}><div className="spinner" style={{width:28,height:28}}/></div>
      ) : lista.length === 0 ? (
        <div className="card">
          <EmptyState icon="⊟" title={tab==='ativos'?'Nenhum lote ativo':'Nenhum lote encerrado'}
            desc={tab==='ativos'?'Crie seu primeiro lote para começar.':''}
            action={tab==='ativos'?<button className="btn btn-primary" onClick={()=>{resetForm();setShowNovo(true)}}>Criar lote</button>:undefined}/>
        </div>
      ) : (
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))',gap:12}}>
          {lista.map(lote => (
            <LoteCard key={lote.id} lote={lote as any}
              onAvancar={() => setShowAvancar(lote.id)}
              onEncerrar={() => encerrarLote(lote.id)}
              onExcluir={() => excluirLote(lote.id)}
              onBifurcar={() => { setShowBifurcar(lote.id); setErro(null) }}
              onPesagem={() => setShowPesagem(lote.id)}
              onDetalhe={() => setShowDetalhe(lote.id)}/>
          ))}
        </div>
      )}

      {/* MODAL CRIAR LOTE */}
      <Modal open={showNovo} onClose={() => setShowNovo(false)} title="Criar novo lote"
        subtitle={`Passo ${step} de 3 — ${stepLabel[step-1]}`} size="lg">
        <form onSubmit={handleCriar} style={{display:'flex',flexDirection:'column',gap:14}}>
          <div style={{display:'flex',gap:6,marginBottom:8}}>
            {[1,2,3].map(s => (
              <div key={s} style={{flex:1,height:3,borderRadius:2,background:s<=step?'var(--green)':'var(--border)'}}/>
            ))}
          </div>

          {step === 1 && <>
            <div className="form-row-2">
              <div className="form-group"><label className="form-label">Nome do lote</label>
                <input className="form-input" placeholder="Ex: Lote A-25" value={form.nome_lote} onChange={e=>setForm(f=>({...f,nome_lote:e.target.value}))} required/></div>
              <div className="form-group"><label className="form-label">Código</label>
                <input className="form-input" placeholder="Ex: LA2025" value={form.codigo_lote} onChange={e=>setForm(f=>({...f,codigo_lote:e.target.value}))} required/></div>
            </div>
            <div className="form-row-2">
              <div className="form-group"><label className="form-label">Ciclo inicial</label>
                <select className="form-input" value={form.ciclo_inicial} onChange={e=>setForm(f=>({...f,ciclo_inicial:Number(e.target.value)}))}>
                  {[1,2,3,4].map(n=><option key={n} value={n}>Ciclo {n} — {cicloLabel(n)}</option>)}
                </select></div>
              <div className="form-group"><label className="form-label">Data de entrada</label>
                <input className="form-input" type="date" value={form.data_entrada} onChange={e=>setForm(f=>({...f,data_entrada:e.target.value}))} required/></div>
            </div>
          </>}

          {step === 2 && <>
            <div className="form-row-2">
              <div className="form-group"><label className="form-label">Número de animais</label>
                <input className="form-input" type="number" placeholder="80" min="1" value={form.qtd_animais} onChange={e=>setForm(f=>({...f,qtd_animais:e.target.value}))} required/></div>
              <div className="form-group"><label className="form-label">Peso médio de entrada (kg)</label>
                <input className="form-input" type="number" placeholder="380" step="0.1" value={form.peso_medio_entrada} onChange={e=>setForm(f=>({...f,peso_medio_entrada:e.target.value}))} required/></div>
            </div>
            <div style={{padding:'10px 14px',background:'var(--gray-50)',borderRadius:8,fontSize:12,color:'var(--gray-500)',marginBottom:4}}>
              Informe o valor pago por kg vivo, o valor total do lote, ou ambos.
            </div>
            <div className="form-row-2">
              <div className="form-group"><label className="form-label">Valor pago por kg vivo (R$)</label>
                <input className="form-input" type="number" placeholder="210,00" step="0.01" value={form.valor_pago_kg} onChange={e=>{
                  const vkg = e.target.value
                  setForm(f=>({...f,valor_pago_kg:vkg,valor_total_lote:vkg&&f.peso_medio_entrada&&f.qtd_animais?String((Number(vkg)*Number(f.peso_medio_entrada)*Number(f.qtd_animais)).toFixed(2)):''}))
                }}/></div>
              <div className="form-group"><label className="form-label">Valor total do lote (R$)</label>
                <input className="form-input" type="number" placeholder="638.400,00" step="0.01" value={form.valor_total_lote} onChange={e=>{
                  const vtl = e.target.value
                  setForm(f=>({...f,valor_total_lote:vtl,valor_pago_kg:vtl&&f.peso_medio_entrada&&f.qtd_animais?String((Number(vtl)/(Number(f.peso_medio_entrada)*Number(f.qtd_animais))).toFixed(4)):''}))
                }}/></div>
            </div>
            {form.qtd_animais && form.peso_medio_entrada && form.valor_pago_kg && (
              <div style={{padding:'10px 14px',background:'var(--green-bg)',borderRadius:8,fontSize:13,color:'var(--green-dark)'}}>
                Peso total: <strong>{fmtNum(Number(form.qtd_animais)*Number(form.peso_medio_entrada),0)} kg</strong>
                {' · '}Valor total: <strong>{fmt(Number(form.valor_total_lote)||Number(form.valor_pago_kg)*Number(form.peso_medio_entrada)*Number(form.qtd_animais))}</strong>
              </div>
            )}
          </>}

          {step === 3 && <>
            <div className="form-row-2">
              <div className="form-group"><label className="form-label">Raça predominante</label>
                <input className="form-input" placeholder="Ex: Nelore" value={form.raca_predominante} onChange={e=>setForm(f=>({...f,raca_predominante:e.target.value}))}/></div>
              <div className="form-group"><label className="form-label">Estado de origem</label>
                <select className="form-input" value={form.origem_estado} onChange={e=>setForm(f=>({...f,origem_estado:e.target.value}))}>
                  <option value="">— Selecione —</option>
                  {ESTADOS.map(uf=><option key={uf} value={uf}>{uf}</option>)}
                </select></div>
            </div>
            <div className="form-row-2">
              <div className="form-group"><label className="form-label">Fazenda de origem</label>
                <input className="form-input" placeholder="Nome da fazenda" value={form.origem_fazenda} onChange={e=>setForm(f=>({...f,origem_fazenda:e.target.value}))}/></div>
              <div className="form-group"><label className="form-label">Município de origem</label>
                <input className="form-input" placeholder="Cidade" value={form.origem_municipio} onChange={e=>setForm(f=>({...f,origem_municipio:e.target.value}))}/></div>
            </div>
            <div className="form-group"><label className="form-label">Dieta inicial (opcional)</label>
              <select className="form-input" value={form.dieta_id} onChange={e=>setForm(f=>({...f,dieta_id:e.target.value}))}>
                <option value="">— Selecionar depois —</option>
                {templates.map(d=><option key={d.id} value={d.id}>{d.nome} (GMD est. {d.gmd_esperado} kg/dia)</option>)}
              </select></div>
            <div className="form-group"><label className="form-label">Observações</label>
              <input className="form-input" placeholder="Opcional" value={form.observacoes} onChange={e=>setForm(f=>({...f,observacoes:e.target.value}))}/></div>
          </>}

          {erro && <div style={{padding:10,background:'#ffebee',borderRadius:8,color:'#b91c1c',fontSize:13}}>{erro}</div>}
          <div className="modal-actions">
            {step > 1 && <button type="button" className="btn btn-ghost" onClick={()=>setStep(s=>s-1)}>Voltar</button>}
            <button type="button" className="btn btn-ghost" onClick={()=>setShowNovo(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving?<span className="spinner" style={{width:14,height:14}}/>:step<3?'Próximo':'Criar lote'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL PESAGEM */}
      <Modal open={!!showPesagem} onClose={()=>setShowPesagem(null)} title="Registrar pesagem do lote" size="sm"
        subtitle={lotesAtivos.find(l=>l.id===showPesagem)?.nome_lote}>
        <form onSubmit={handlePesagem} style={{display:'flex',flexDirection:'column',gap:14}}>
          <div className="form-group"><label className="form-label">Data da pesagem</label>
            <input className="form-input" type="date" value={fPesagem.data} onChange={e=>setFPesagem(f=>({...f,data:e.target.value}))} required/></div>
          <div className="form-row-2">
            <div className="form-group"><label className="form-label">Peso médio (kg)</label>
              <input className="form-input" type="number" placeholder="420" step="0.1" value={fPesagem.peso_medio} onChange={e=>setFPesagem(f=>({...f,peso_medio:e.target.value}))} required/></div>
            <div className="form-group"><label className="form-label">Qtd animais pesados</label>
              <input className="form-input" type="number" placeholder="Opcional" value={fPesagem.qtd_animais} onChange={e=>setFPesagem(f=>({...f,qtd_animais:e.target.value}))}/></div>
          </div>
          <div className="form-group"><label className="form-label">Observações</label>
            <input className="form-input" placeholder="Opcional" value={fPesagem.observacoes} onChange={e=>setFPesagem(f=>({...f,observacoes:e.target.value}))}/></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={()=>setShowPesagem(null)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving?<span className="spinner" style={{width:14,height:14}}/>:'Salvar pesagem'}
            </button>
          </div>
        </form>
      </Modal>

      {/* MODAL AVANÇAR CICLO */}
      <Modal open={!!showAvancar} onClose={()=>setShowAvancar(null)} title="Avançar ciclo" size="sm"
        subtitle={loteAvancar?`${loteAvancar.nome_lote} — Ciclo ${loteAvancar.ciclo_atual} para ${loteAvancar.ciclo_atual+1}`:''}>
        <p style={{fontSize:13,color:'#555',marginBottom:20}}>Todos os animais do lote avançarão para o próximo ciclo. Esta ação não pode ser desfeita.</p>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={()=>setShowAvancar(null)}>Cancelar</button>
          <button className="btn btn-primary" disabled={saving} onClick={async()=>{
            if(!loteAvancar)return; setSaving(true)
            await avancarCiclo(loteAvancar.id, loteAvancar.ciclo_atual+1)
            setSaving(false); setShowAvancar(null)
          }}>{saving?<span className="spinner" style={{width:14,height:14}}/>:'Confirmar'}</button>
        </div>
      </Modal>

      {/* MODAL BIFURCAR */}
      <Modal open={!!showBifurcar} onClose={()=>setShowBifurcar(null)} title="Bifurcar lote" size="lg"
        subtitle={loteBifurcar?`Dividindo ${loteBifurcar.nome_lote} — ${(loteBifurcar as any).qtd_animais_atual ?? (loteBifurcar as any).qtd_animais} animais disponíveis`:''}>
        <form onSubmit={handleBifurcar} style={{display:'flex',flexDirection:'column',gap:14}}>
          <div style={{padding:'10px 14px',background:'var(--gray-50)',borderRadius:8,fontSize:12,color:'var(--gray-500)'}}>
            Os animais transferidos formarão um novo sublote. O lote original continuará com o restante.
          </div>
          <div className="form-row-2">
            <div className="form-group"><label className="form-label">Nome do sublote</label>
              <input className="form-input" placeholder="Ex: Lote A2-25" value={fBif.nome_lote} onChange={e=>setFBif(f=>({...f,nome_lote:e.target.value}))} required/></div>
            <div className="form-group"><label className="form-label">Código do sublote</label>
              <input className="form-input" placeholder="Ex: LA2025B" value={fBif.codigo_lote} onChange={e=>setFBif(f=>({...f,codigo_lote:e.target.value}))} required/></div>
          </div>
          <div className="form-row-2">
            <div className="form-group"><label className="form-label">Data da bifurcação</label>
              <input className="form-input" type="date" value={fBif.data_bifurcacao} onChange={e=>setFBif(f=>({...f,data_bifurcacao:e.target.value}))} required/></div>
            <div className="form-group"><label className="form-label">Ciclo do sublote</label>
              <select className="form-input" value={fBif.ciclo_inicial} onChange={e=>setFBif(f=>({...f,ciclo_inicial:Number(e.target.value)}))}>
                {[1,2,3,4].map(n=><option key={n} value={n}>Ciclo {n} — {cicloLabel(n)}</option>)}
              </select></div>
          </div>
          <div className="form-row-2">
            <div className="form-group"><label className="form-label">Qtd de animais transferidos</label>
              <input className="form-input" type="number" placeholder="40" min="1" value={fBif.qtd_animais_transferidos} onChange={e=>setFBif(f=>({...f,qtd_animais_transferidos:e.target.value}))} required/></div>
            <div className="form-group"><label className="form-label">Peso médio na transferência (kg)</label>
              <input className="form-input" type="number" placeholder="420" step="0.1" value={fBif.peso_medio_saida} onChange={e=>setFBif(f=>({...f,peso_medio_saida:e.target.value}))}/></div>
          </div>
          <div className="form-row-2">
            <div className="form-group"><label className="form-label">Motivo da bifurcação</label>
              <select className="form-input" value={fBif.motivo} onChange={e=>setFBif(f=>({...f,motivo:e.target.value as any}))}>
                <option value="peso">Por peso</option>
                <option value="gmd">Por GMD</option>
                <option value="sanitario">Sanitário</option>
                <option value="outro">Outro</option>
              </select></div>
            <div className="form-group"><label className="form-label">Dieta do sublote</label>
              <select className="form-input" value={fBif.dieta_id} onChange={e=>setFBif(f=>({...f,dieta_id:e.target.value}))}>
                <option value="">Herdar do lote origem</option>
                {templates.map(d=><option key={d.id} value={d.id}>{d.nome}</option>)}
              </select></div>
          </div>
          <div className="form-group"><label className="form-label">Observações</label>
            <input className="form-input" placeholder="Opcional" value={fBif.observacoes} onChange={e=>setFBif(f=>({...f,observacoes:e.target.value}))}/></div>
          {fBif.qtd_animais_transferidos && loteBifurcar && (
            <div style={{padding:'10px 14px',background:'var(--green-bg)',borderRadius:8,fontSize:13,color:'var(--green-dark)'}}>
              Lote origem ficará com: <strong>{Math.max(0,((loteBifurcar as any).qtd_animais_atual||(loteBifurcar as any).qtd_animais||0)-Number(fBif.qtd_animais_transferidos))} animais</strong>
            </div>
          )}
          {erro && <div style={{padding:10,background:'#ffebee',borderRadius:8,color:'#b91c1c',fontSize:13}}>{erro}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={()=>setShowBifurcar(null)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving?<span className="spinner" style={{width:14,height:14}}/>:'Confirmar bifurcação'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function LoteCard({ lote, onAvancar, onEncerrar, onExcluir, onBifurcar, onPesagem, onDetalhe }: {
  lote: any; onAvancar:()=>void; onEncerrar:()=>void; onExcluir:()=>void
  onBifurcar:()=>void; onPesagem:()=>void; onDetalhe:()=>void
}) {
  const qtd = lote.qtd_animais_atual ?? lote.qtd_animais ?? '—'
  const pesoAtual = lote.peso_medio_atual ?? lote.peso_medio_entrada
  const gmd = lote.gmd_atual
  const dias = lote.dias_confinamento ?? 0

  return (
    <div className="card" style={{display:'flex',flexDirection:'column',gap:12}}>
      <div className="flex-between">
        <div>
          <div style={{fontSize:15,fontWeight:600}}>{lote.nome_lote}</div>
          <div style={{fontSize:11,color:'#9e9e9e',marginTop:2}}>{lote.codigo_lote} · {lote.raca_predominante || 'Raça não informada'}</div>
        </div>
        <span className={`badge ${lote.status==='ativo'?'badge-green':'badge-gray'}`}>
          {lote.status==='ativo'?'Ativo':'Encerrado'}
        </span>
      </div>

      <div>
        <div style={{display:'flex',gap:4,marginBottom:4}}>
          {[1,2,3,4].map(n=><div key={n} style={{flex:1,height:4,borderRadius:2,background:n<lote.ciclo_atual?'#2e7d32':n===lote.ciclo_atual?'#66bb6a':'#e0e0e0'}}/>)}
        </div>
        <div style={{fontSize:11,color:'#9e9e9e'}}>Ciclo {lote.ciclo_atual} — {cicloLabel(lote.ciclo_atual)} · {dias}d de confinamento</div>
      </div>

      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8}}>
        <div style={{background:'#fafafa',borderRadius:8,padding:'8px 10px'}}>
          <div style={{fontSize:11,color:'#9e9e9e'}}>Animais</div>
          <div style={{fontSize:17,fontWeight:600}}>{qtd}</div>
        </div>
        <div style={{background:'#fafafa',borderRadius:8,padding:'8px 10px'}}>
          <div style={{fontSize:11,color:'#9e9e9e'}}>Peso médio</div>
          <div style={{fontSize:17,fontWeight:600}}>{pesoAtual?`${fmtNum(pesoAtual,0)} kg`:'—'}</div>
        </div>
        <div style={{background:gmd?'#e8f5e9':'#fafafa',borderRadius:8,padding:'8px 10px'}}>
          <div style={{fontSize:11,color:'#9e9e9e'}}>GMD</div>
          <div style={{fontSize:17,fontWeight:600,color:gmd?'#1b5e20':'#111'}}>{gmd?`${fmtNum(gmd,3)} kg`:'—'}</div>
        </div>
      </div>

      {lote.origem_fazenda && (
        <div style={{fontSize:12,color:'#9e9e9e'}}>
          Origem: {lote.origem_fazenda}{lote.origem_municipio?` · ${lote.origem_municipio}`:''}{lote.origem_estado?`/${lote.origem_estado}`:''}
        </div>
      )}

      {lote.status === 'ativo' && (
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          <button className="btn btn-primary btn-sm" style={{flex:1,justifyContent:'center'}} onClick={onPesagem}>Pesagem</button>
          {lote.ciclo_atual < 4 && <button className="btn btn-secondary btn-sm" style={{flex:1,justifyContent:'center'}} onClick={onAvancar}>Avançar ciclo</button>}
          <button className="btn btn-ghost btn-sm" style={{flex:1,justifyContent:'center'}} onClick={onBifurcar}>Bifurcar</button>
          <button className="btn btn-ghost btn-sm" style={{justifyContent:'center',color:'#b91c1c'}} onClick={onEncerrar}>Encerrar</button>
        </div>
      )}

      <div style={{display:'flex',gap:6}}>
        <button
          className="btn btn-ghost btn-sm"
          style={{flex:1,justifyContent:'center',color:'#b91c1c',borderColor:'#ffcdd2'}}
          onClick={() => {
            if (window.confirm(`Excluir permanentemente "${lote.nome_lote}"?\n\nTodos os dados relacionados (pesagens, saídas, custos) serão removidos. Esta ação não pode ser desfeita.`))
              onExcluir()
          }}>
          Excluir lote
        </button>
      </div>
    </div>
  )
}
