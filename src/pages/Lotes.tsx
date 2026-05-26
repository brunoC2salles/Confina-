import { useState } from 'react'
import { useLotes } from '@/hooks/useLotes'
import { useDietas } from '@/hooks/useDietas'
import { useParceiros } from '@/hooks/useHooks'
import { useFaixas } from '@/hooks/useFaixas'
import { useProjecao } from '@/hooks/useProjecao'
import { Modal, PageHeader, EmptyState } from '@/components/common/UI'
import { fmt, fmtNum } from '@/lib/calculations'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine, Legend } from 'recharts'

const cicloLabel = (n: number) =>
  ({ 1: 'Adaptação', 2: 'Crescimento', 3: 'Engorda', 4: 'Acabamento' }[n] ?? `Ciclo ${n}`)

const ESTADOS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO']

export default function Lotes() {
  const { lotesAtivos, lotesEncerrados, loading, criarLote, encerrarLote, excluirLote, avancarCiclo, bifurcarLote, registrarPesagem, registrarSaida } = useLotes()
  const { templates } = useDietas()
  const { parceiros } = useParceiros()
  const { rendimentos, bonus } = useFaixas()
  const { calcular } = useProjecao()

  const [tab, setTab] = useState<'ativos'|'encerrados'>('ativos')
  const [showNovo, setShowNovo] = useState(false)
  const [showAvancar, setShowAvancar] = useState<string|null>(null)
  const [showBifurcar, setShowBifurcar] = useState<string|null>(null)
  const [showPesagem, setShowPesagem] = useState<string|null>(null)
  const [showSaida, setShowSaida] = useState<string|null>(null)
  const [showProjecao, setShowProjecao] = useState<string|null>(null)
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

  const [fSaida, setFSaida] = useState({
    tipo: 'venda' as const,
    data_saida: new Date().toISOString().split('T')[0],
    qtd_animais_saida: '', peso_medio_saida: '',
    valor_total_venda: '', valor_por_kg: '',
    saida_total: true, destino_tipo: '' as any, destino_id: '',
    comissoes: [] as Array<{ tipo: string; percentual: number }>,
    encargos: [] as Array<{ descricao: string; percentual: number }>,
    observacoes: '',
  })

  const [fProjecao, setFProjecao] = useState({
    preco_kg_vivo: '', pct_comissao: '2', pct_encargo: '1.5',
  })

  const todosLotes = [...lotesAtivos, ...lotesEncerrados]
  const loteAvancar = lotesAtivos.find(l => l.id === showAvancar)
  const loteBifurcar = lotesAtivos.find(l => l.id === showBifurcar)
  const loteSaida = todosLotes.find(l => l.id === showSaida)
  const loteProjecao = todosLotes.find(l => l.id === showProjecao)

  const projecaoResult = showProjecao && loteProjecao && fProjecao.preco_kg_vivo
    ? calcular({
        peso_medio_atual: (loteProjecao as any).peso_medio_atual ?? (loteProjecao as any).peso_medio_entrada ?? 0,
        qtd_animais: (loteProjecao as any).qtd_animais_atual ?? (loteProjecao as any).qtd_animais ?? 0,
        gmd_real: (loteProjecao as any).gmd_atual ?? null,
        gmd_esperado: templates.find(t => t.id === (loteProjecao as any).dieta_id)?.gmd_esperado ?? null,
        data_hoje: new Date().toISOString().split('T')[0],
        custo_compra_total: (loteProjecao as any).valor_total_lote ?? 0,
        custo_alimentacao_acumulado: (loteProjecao as any).custo_alimentacao_acumulado ?? 0,
        custo_alimentacao_dia: (loteProjecao as any).custo_alimentacao_dia ?? 0,
        preco_kg_vivo: Number(fProjecao.preco_kg_vivo),
        pct_comissao: Number(fProjecao.pct_comissao),
        pct_encargo: Number(fProjecao.pct_encargo),
        faixas_rendimento: rendimentos.map(f => ({
          peso_min: f.peso_min, peso_max: f.peso_max, rendimento_pct: f.rendimento_percentual,
        })),
        faixas_bonus: bonus.map(f => ({
          peso_min: f.peso_min, peso_max: f.peso_max, bonus_kg: f.bonus_por_kg,
        })),
      })
    : null

  const resetForm = () => {
    setForm({ nome_lote: '', codigo_lote: '', ciclo_inicial: 1, qtd_animais: '', data_entrada: new Date().toISOString().split('T')[0], peso_medio_entrada: '', valor_pago_kg: '', valor_total_lote: '', origem_fazenda: '', origem_municipio: '', origem_estado: '', raca_predominante: '', dieta_id: '', observacoes: '' })
    setStep(1); setErro(null)
  }

  const resetSaida = () => setFSaida({
    tipo: 'venda', data_saida: new Date().toISOString().split('T')[0],
    qtd_animais_saida: '', peso_medio_saida: '', valor_total_venda: '', valor_por_kg: '',
    saida_total: true, destino_tipo: '', destino_id: '', comissoes: [], encargos: [], observacoes: '',
  })

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
      lote_id: showPesagem, data: fPesagem.data,
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
      ciclo_inicial: fBif.ciclo_inicial, data_bifurcacao: fBif.data_bifurcacao,
      qtd_animais_transferidos: Number(fBif.qtd_animais_transferidos),
      peso_medio_saida: fBif.peso_medio_saida ? Number(fBif.peso_medio_saida) : undefined,
      motivo: fBif.motivo, dieta_id: fBif.dieta_id || undefined,
      observacoes: fBif.observacoes || undefined,
    })
    setSaving(false)
    if (error) { setErro(error); return }
    setShowBifurcar(null)
  }

  const handleSaida = async (e: React.FormEvent) => {
    e.preventDefault(); if (!showSaida) return
    setSaving(true)
    const receita = Number(fSaida.valor_total_venda) || 0
    const totalComissoes = fSaida.comissoes.reduce((t, c) => t + receita * c.percentual / 100, 0)
    const totalEncargos = fSaida.encargos.reduce((t, c) => t + receita * c.percentual / 100, 0)
    await registrarSaida({
      lote_id: showSaida, tipo: fSaida.tipo, data_saida: fSaida.data_saida,
      qtd_animais_saida: Number(fSaida.qtd_animais_saida),
      peso_medio_saida: Number(fSaida.peso_medio_saida),
      saida_total: fSaida.saida_total,
      valor_total_venda: receita || undefined,
      valor_por_kg: fSaida.valor_por_kg ? Number(fSaida.valor_por_kg) : undefined,
      destino_tipo: fSaida.destino_tipo || undefined,
      destino_id: fSaida.destino_id || undefined,
      comissoes: fSaida.comissoes.map(c => ({ tipo: c.tipo, percentual: c.percentual, valor_calculado: receita * c.percentual / 100 })),
      encargos: fSaida.encargos.map(c => ({ descricao: c.descricao, percentual: c.percentual, valor_calculado: receita * c.percentual / 100 })),
      total_comissoes: totalComissoes, total_encargos: totalEncargos,
      receita_bruta: receita, receita_liquida: receita - totalComissoes - totalEncargos,
    })
    setSaving(false); setShowSaida(null); resetSaida()
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
              onSaida={() => { setShowSaida(lote.id); resetSaida() }}
              onProjecao={() => {
                setShowProjecao(lote.id)
                setFProjecao({
                  preco_kg_vivo: String((lote as any).preco_venda_esperado_kg ?? ''),
                  pct_comissao: '2', pct_encargo: '1.5',
                })
              }}/>
          ))}
        </div>
      )}

      {/* ── MODAL CRIAR LOTE ── */}
      <Modal open={showNovo} onClose={() => setShowNovo(false)} title="Criar novo lote"
        subtitle={`Passo ${step} de 3 — ${stepLabel[step-1]}`} size="lg">
        <form onSubmit={handleCriar} style={{display:'flex',flexDirection:'column',gap:14,maxHeight:'75vh',overflowY:'auto',paddingRight:4}}>
          <div style={{display:'flex',gap:6,marginBottom:4}}>
            {[1,2,3].map(s=>(
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
            <div style={{padding:'10px 14px',background:'var(--gray-50)',borderRadius:8,fontSize:12,color:'var(--gray-500)'}}>
              Informe o valor pago por kg vivo, o valor total do lote, ou ambos.
            </div>
            <div className="form-row-2">
              <div className="form-group"><label className="form-label">Valor pago por kg vivo (R$)</label>
                <input className="form-input" type="number" placeholder="210,00" step="0.01" value={form.valor_pago_kg} onChange={e=>{
                  const vkg=e.target.value
                  setForm(f=>({...f,valor_pago_kg:vkg,valor_total_lote:vkg&&f.peso_medio_entrada&&f.qtd_animais?String((Number(vkg)*Number(f.peso_medio_entrada)*Number(f.qtd_animais)).toFixed(2)):''}))
                }}/></div>
              <div className="form-group"><label className="form-label">Valor total do lote (R$)</label>
                <input className="form-input" type="number" placeholder="638.400,00" step="0.01" value={form.valor_total_lote} onChange={e=>{
                  const vtl=e.target.value
                  setForm(f=>({...f,valor_total_lote:vtl,valor_pago_kg:vtl&&f.peso_medio_entrada&&f.qtd_animais?String((Number(vtl)/(Number(f.peso_medio_entrada)*Number(f.qtd_animais))).toFixed(4)):''}))
                }}/></div>
            </div>
            {form.qtd_animais&&form.peso_medio_entrada&&form.valor_pago_kg&&(
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

          {erro&&<div style={{padding:10,background:'#ffebee',borderRadius:8,color:'#b91c1c',fontSize:13}}>{erro}</div>}
          <div className="modal-actions">
            {step>1&&<button type="button" className="btn btn-ghost" onClick={()=>setStep(s=>s-1)}>Voltar</button>}
            <button type="button" className="btn btn-ghost" onClick={()=>setShowNovo(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving?<span className="spinner" style={{width:14,height:14}}/>:step<3?'Próximo':'Criar lote'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL PESAGEM ── */}
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

      {/* ── MODAL AVANÇAR CICLO ── */}
      <Modal open={!!showAvancar} onClose={()=>setShowAvancar(null)} title="Avançar ciclo" size="sm"
        subtitle={loteAvancar?`${loteAvancar.nome_lote} — Ciclo ${loteAvancar.ciclo_atual} para ${loteAvancar.ciclo_atual+1}`:''}>
        <p style={{fontSize:13,color:'#555',marginBottom:20}}>Todos os animais do lote avançarão para o próximo ciclo. Esta ação não pode ser desfeita.</p>
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={()=>setShowAvancar(null)}>Cancelar</button>
          <button className="btn btn-primary" disabled={saving} onClick={async()=>{
            if(!loteAvancar)return; setSaving(true)
            await avancarCiclo(loteAvancar.id,loteAvancar.ciclo_atual+1)
            setSaving(false); setShowAvancar(null)
          }}>{saving?<span className="spinner" style={{width:14,height:14}}/>:'Confirmar'}</button>
        </div>
      </Modal>

      {/* ── MODAL BIFURCAR ── */}
      <Modal open={!!showBifurcar} onClose={()=>setShowBifurcar(null)} title="Bifurcar lote" size="lg"
        subtitle={loteBifurcar?`Dividindo ${loteBifurcar.nome_lote} — ${(loteBifurcar as any).qtd_animais_atual??(loteBifurcar as any).qtd_animais} animais disponíveis`:''}>
        <form onSubmit={handleBifurcar} style={{display:'flex',flexDirection:'column',gap:14,maxHeight:'75vh',overflowY:'auto',paddingRight:4}}>
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
          {fBif.qtd_animais_transferidos&&loteBifurcar&&(
            <div style={{padding:'10px 14px',background:'var(--green-bg)',borderRadius:8,fontSize:13,color:'var(--green-dark)'}}>
              Lote origem ficará com: <strong>{Math.max(0,((loteBifurcar as any).qtd_animais_atual||(loteBifurcar as any).qtd_animais||0)-Number(fBif.qtd_animais_transferidos))} animais</strong>
            </div>
          )}
          {erro&&<div style={{padding:10,background:'#ffebee',borderRadius:8,color:'#b91c1c',fontSize:13}}>{erro}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={()=>setShowBifurcar(null)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving?<span className="spinner" style={{width:14,height:14}}/>:'Confirmar bifurcação'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL SAÍDA ── */}
      <Modal open={!!showSaida} onClose={()=>setShowSaida(null)} title="Registrar saída do lote" size="lg"
        subtitle={loteSaida?`${loteSaida.nome_lote} — ${(loteSaida as any).qtd_animais_atual??0} animais`:''}>
        <form onSubmit={handleSaida} style={{display:'flex',flexDirection:'column',gap:14,maxHeight:'75vh',overflowY:'auto',paddingRight:4}}>
          <div className="form-row-2">
            <div className="form-group"><label className="form-label">Tipo de saída</label>
              <select className="form-input" value={fSaida.tipo} onChange={e=>setFSaida(f=>({...f,tipo:e.target.value as any}))}>
                <option value="venda">Venda</option>
                <option value="abate">Abate</option>
                <option value="transferencia">Transferência</option>
                <option value="morte">Morte</option>
              </select></div>
            <div className="form-group"><label className="form-label">Data</label>
              <input className="form-input" type="date" value={fSaida.data_saida} onChange={e=>setFSaida(f=>({...f,data_saida:e.target.value}))} required/></div>
          </div>
          <div className="form-row-2">
            <div className="form-group"><label className="form-label">Qtd de animais</label>
              <input className="form-input" type="number" placeholder="80" min="1" value={fSaida.qtd_animais_saida} onChange={e=>setFSaida(f=>({...f,qtd_animais_saida:e.target.value}))} required/></div>
            <div className="form-group"><label className="form-label">Peso médio final (kg)</label>
              <input className="form-input" type="number" placeholder="520" step="0.1" value={fSaida.peso_medio_saida} onChange={e=>setFSaida(f=>({...f,peso_medio_saida:e.target.value}))} required/></div>
          </div>
          <div className="form-row-2">
            <div className="form-group"><label className="form-label">Valor total recebido (R$)</label>
              <input className="form-input" type="number" placeholder="0" step="0.01" value={fSaida.valor_total_venda} onChange={e=>{
                const vtl=e.target.value
                setFSaida(f=>({...f,valor_total_venda:vtl,valor_por_kg:vtl&&f.qtd_animais_saida&&f.peso_medio_saida?String((Number(vtl)/(Number(f.qtd_animais_saida)*Number(f.peso_medio_saida))).toFixed(4)):''}))
              }}/></div>
            <div className="form-group"><label className="form-label">Valor por kg vivo (R$)</label>
              <input className="form-input" type="number" placeholder="0" step="0.01" value={fSaida.valor_por_kg} onChange={e=>{
                const vkg=e.target.value
                setFSaida(f=>({...f,valor_por_kg:vkg,valor_total_venda:vkg&&f.qtd_animais_saida&&f.peso_medio_saida?String((Number(vkg)*Number(f.qtd_animais_saida)*Number(f.peso_medio_saida)).toFixed(2)):''}))
              }}/></div>
          </div>
          <div className="form-row-2">
            <div className="form-group"><label className="form-label">Destino</label>
              <select className="form-input" value={fSaida.destino_tipo} onChange={e=>setFSaida(f=>({...f,destino_tipo:e.target.value,destino_id:''}))}>
                <option value="">— Selecionar —</option>
                <option value="frigorifico">Frigorífico</option>
                <option value="corretor">Corretor</option>
                <option value="produtor">Produtor</option>
                <option value="outro">Outro</option>
              </select></div>
            {fSaida.destino_tipo&&(
              <div className="form-group"><label className="form-label">Parceiro</label>
                <select className="form-input" value={fSaida.destino_id} onChange={e=>setFSaida(f=>({...f,destino_id:e.target.value}))}>
                  <option value="">— Selecionar —</option>
                  {parceiros.filter(p=>p.tipo===fSaida.destino_tipo).map(p=><option key={p.id} value={p.id}>{p.nome}</option>)}
                </select></div>
            )}
          </div>
          <label style={{display:'flex',alignItems:'center',gap:8,fontSize:13,cursor:'pointer'}}>
            <input type="checkbox" checked={fSaida.saida_total} onChange={e=>setFSaida(f=>({...f,saida_total:e.target.checked}))}/>
            Saída total do lote (encerrar lote após registrar)
          </label>
          <div style={{fontWeight:500,fontSize:12,color:'#555',textTransform:'uppercase',letterSpacing:'0.4px',marginTop:4}}>Comissionamentos</div>
          {fSaida.comissoes.map((c,i)=>(
            <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 100px 28px',gap:6,alignItems:'center'}}>
              <select className="form-input" value={c.tipo} onChange={e=>setFSaida(f=>({...f,comissoes:f.comissoes.map((x,j)=>j===i?{...x,tipo:e.target.value}:x)}))}>
                <option value="corretor">Corretor</option>
                <option value="operador">Operador</option>
                <option value="outro">Outro</option>
              </select>
              <div style={{position:'relative'}}>
                <input className="form-input" type="number" step="0.1" placeholder="%" value={c.percentual} onChange={e=>setFSaida(f=>({...f,comissoes:f.comissoes.map((x,j)=>j===i?{...x,percentual:Number(e.target.value)}:x)}))} style={{paddingRight:24}}/>
                <span style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',fontSize:11,color:'#9e9e9e'}}>%</span>
              </div>
              <button type="button" onClick={()=>setFSaida(f=>({...f,comissoes:f.comissoes.filter((_,j)=>j!==i)}))} style={{background:'none',border:'none',cursor:'pointer',color:'#9e9e9e',fontSize:18}}>×</button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={()=>setFSaida(f=>({...f,comissoes:[...f.comissoes,{tipo:'corretor',percentual:2}]}))}>+ Adicionar comissão</button>
          <div style={{fontWeight:500,fontSize:12,color:'#555',textTransform:'uppercase',letterSpacing:'0.4px'}}>Encargos / Impostos</div>
          {fSaida.encargos.map((c,i)=>(
            <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 100px 28px',gap:6,alignItems:'center'}}>
              <input className="form-input" placeholder="Ex: FUNRURAL" value={c.descricao} onChange={e=>setFSaida(f=>({...f,encargos:f.encargos.map((x,j)=>j===i?{...x,descricao:e.target.value}:x)}))}/>
              <div style={{position:'relative'}}>
                <input className="form-input" type="number" step="0.1" placeholder="%" value={c.percentual} onChange={e=>setFSaida(f=>({...f,encargos:f.encargos.map((x,j)=>j===i?{...x,percentual:Number(e.target.value)}:x)}))} style={{paddingRight:24}}/>
                <span style={{position:'absolute',right:8,top:'50%',transform:'translateY(-50%)',fontSize:11,color:'#9e9e9e'}}>%</span>
              </div>
              <button type="button" onClick={()=>setFSaida(f=>({...f,encargos:f.encargos.filter((_,j)=>j!==i)}))} style={{background:'none',border:'none',cursor:'pointer',color:'#9e9e9e',fontSize:18}}>×</button>
            </div>
          ))}
          <button type="button" className="btn btn-ghost btn-sm" onClick={()=>setFSaida(f=>({...f,encargos:[...f.encargos,{descricao:'',percentual:0}]}))}>+ Adicionar encargo</button>
          {fSaida.valor_total_venda&&Number(fSaida.valor_total_venda)>0&&(()=>{
            const receita=Number(fSaida.valor_total_venda)
            const comissoes=fSaida.comissoes.reduce((t,c)=>t+receita*c.percentual/100,0)
            const encargos=fSaida.encargos.reduce((t,c)=>t+receita*c.percentual/100,0)
            const liquida=receita-comissoes-encargos
            return(
              <div style={{background:'var(--green-bg)',borderRadius:8,padding:'12px 14px'}}>
                <div style={{display:'flex',justifyContent:'space-between',fontSize:13,padding:'3px 0'}}><span style={{color:'#2e7d32'}}>Receita bruta</span><span style={{fontWeight:500,color:'#1b5e20'}}>{fmt(receita)}</span></div>
                {comissoes>0&&<div style={{display:'flex',justifyContent:'space-between',fontSize:13,padding:'3px 0'}}><span style={{color:'#2e7d32'}}>Comissões</span><span style={{fontWeight:500,color:'#b91c1c'}}>- {fmt(comissoes)}</span></div>}
                {encargos>0&&<div style={{display:'flex',justifyContent:'space-between',fontSize:13,padding:'3px 0'}}><span style={{color:'#2e7d32'}}>Encargos</span><span style={{fontWeight:500,color:'#b91c1c'}}>- {fmt(encargos)}</span></div>}
                <div style={{display:'flex',justifyContent:'space-between',fontSize:14,padding:'6px 0 0',borderTop:'1px solid #a5d6a7',marginTop:4}}><span style={{fontWeight:600,color:'#1b5e20'}}>Receita líquida</span><span style={{fontWeight:700,color:'#1b5e20'}}>{fmt(liquida)}</span></div>
              </div>
            )
          })()}
          <div className="form-group"><label className="form-label">Observações</label>
            <input className="form-input" placeholder="Opcional" value={fSaida.observacoes} onChange={e=>setFSaida(f=>({...f,observacoes:e.target.value}))}/></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={()=>setShowSaida(null)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving?<span className="spinner" style={{width:14,height:14}}/>:'Confirmar saída'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL PROJEÇÃO ── */}
      <Modal open={!!showProjecao} onClose={()=>setShowProjecao(null)} title="Projeção de venda" size="lg"
        subtitle={loteProjecao?`${loteProjecao.nome_lote} · ${(loteProjecao as any).qtd_animais_atual??0} animais · Peso médio: ${fmtNum((loteProjecao as any).peso_medio_atual??0,0)} kg`:''}>
        <div style={{display:'flex',flexDirection:'column',gap:16,maxHeight:'80vh',overflowY:'auto',paddingRight:4}}>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:10}}>
            <div className="form-group"><label className="form-label">Preço esperado por kg vivo (R$)</label>
              <input className="form-input" type="number" step="0.01" placeholder="210,00"
                value={fProjecao.preco_kg_vivo} onChange={e=>setFProjecao(f=>({...f,preco_kg_vivo:e.target.value}))}/></div>
            <div className="form-group"><label className="form-label">Comissão esperada (%)</label>
              <input className="form-input" type="number" step="0.1" placeholder="2"
                value={fProjecao.pct_comissao} onChange={e=>setFProjecao(f=>({...f,pct_comissao:e.target.value}))}/></div>
            <div className="form-group"><label className="form-label">Encargos esperados (%)</label>
              <input className="form-input" type="number" step="0.1" placeholder="1.5"
                value={fProjecao.pct_encargo} onChange={e=>setFProjecao(f=>({...f,pct_encargo:e.target.value}))}/></div>
          </div>

          {!fProjecao.preco_kg_vivo&&(
            <div style={{padding:'12px 14px',background:'var(--gray-50)',borderRadius:8,fontSize:13,color:'var(--gray-500)',textAlign:'center'}}>
              Informe o preço esperado por kg vivo para ver a projeção.
            </div>
          )}

          {projecaoResult&&(()=>{
            const {curva_real,curva_esperada,dia_ideal_real,dia_ideal_esperado}=projecaoResult
            const diaIdeal=dia_ideal_real??dia_ideal_esperado
            const dadosGrafico=Array.from({length:31},(_,i)=>{
              const dia=i*3
              const real=curva_real.find(p=>p.dia===dia)
              const esp=curva_esperada.find(p=>p.dia===dia)
              return{ dia:`Dia ${dia}`, lucro_real:real?Math.round(real.lucro_por_animal):undefined, lucro_esperado:esp?Math.round(esp.lucro_por_animal):undefined }
            })
            return(<>
              {diaIdeal&&(
                <div style={{background:'var(--green-bg)',border:'1px solid var(--green-border)',borderRadius:12,padding:'16px 20px'}}>
                  <div style={{fontSize:11,color:'var(--green)',textTransform:'uppercase',letterSpacing:'1px',marginBottom:8}}>Dia ideal de venda estimado</div>
                  <div style={{display:'flex',gap:32,flexWrap:'wrap'}}>
                    <div>
                      <div style={{fontSize:28,fontWeight:700,color:'var(--green-dark)'}}>{diaIdeal.dia===0?'Hoje':`Em ${diaIdeal.dia} dias`}</div>
                      <div style={{fontSize:12,color:'var(--green)'}}>{new Date(diaIdeal.data+'T12:00:00').toLocaleDateString('pt-BR')}</div>
                    </div>
                    <div><div style={{fontSize:11,color:'var(--gray-500)'}}>Lucro total estimado</div><div style={{fontSize:22,fontWeight:600,color:'var(--green-dark)'}}>{fmt(diaIdeal.lucro)}</div></div>
                    <div><div style={{fontSize:11,color:'var(--gray-500)'}}>Por animal</div><div style={{fontSize:22,fontWeight:600,color:'var(--green-dark)'}}>{fmt(diaIdeal.lucro_por_animal)}</div></div>
                    <div><div style={{fontSize:11,color:'var(--gray-500)'}}>Peso médio estimado</div><div style={{fontSize:22,fontWeight:600,color:'var(--black)'}}>{fmtNum(diaIdeal.peso,0)} kg</div></div>
                  </div>
                </div>
              )}
              <div>
                <div style={{fontSize:12,color:'var(--gray-500)',marginBottom:8}}>Lucro por animal (R$) — próximos 90 dias</div>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={dadosGrafico} margin={{top:4,right:8,left:0,bottom:0}}>
                    <XAxis dataKey="dia" tick={{fontSize:10}} interval={4}/>
                    <YAxis tick={{fontSize:10}} tickFormatter={(v: number)=>`R$${v}`} width={72}/>
                    <Tooltip formatter={(v:any)=>fmt(v)} labelStyle={{fontSize:12}}/>
                    <Legend wrapperStyle={{fontSize:12}}/>
                    {curva_real.length>0&&<Line type="monotone" dataKey="lucro_real" name="GMD real" stroke="#2e7d32" strokeWidth={2} dot={false}/>}
                    {curva_esperada.length>0&&<Line type="monotone" dataKey="lucro_esperado" name="GMD esperado" stroke="#9e9e9e" strokeWidth={1.5} strokeDasharray="5 5" dot={false}/>}
                    {dia_ideal_real&&<ReferenceLine x={`Dia ${Math.round(dia_ideal_real.dia/3)*3}`} stroke="#2e7d32" strokeDasharray="3 3" label={{value:'Ideal',fontSize:10,fill:'#2e7d32'}}/>}
                  </LineChart>
                </ResponsiveContainer>
              </div>
              <div>
                <div style={{fontSize:12,color:'var(--gray-500)',marginBottom:8}}>Detalhamento semanal</div>
                <div className="card" style={{padding:0}}>
                  <div className="table-wrap" style={{border:'none',borderRadius:0}}>
                    <table>
                      <thead><tr><th>Dia</th><th>Data</th><th>Peso médio</th><th>Receita bruta</th><th>Custo total</th><th>Lucro total</th><th>Lucro/animal</th></tr></thead>
                      <tbody>
                        {[0,7,14,21,28,35,42,49,56,63,70,77,84,90].map(dia=>{
                          const real=curva_real.find(p=>p.dia===dia)
                          const esp=curva_esperada.find(p=>p.dia===dia)
                          const ponto=real??esp
                          if(!ponto)return null
                          const isIdeal=diaIdeal?.dia===dia
                          return(
                            <tr key={dia} style={{background:isIdeal?'#e8f5e9':undefined}}>
                              <td>
                                <strong style={{color:isIdeal?'var(--green-dark)':undefined}}>{dia===0?'Hoje':`+${dia}d`}</strong>
                                {isIdeal&&<span style={{fontSize:10,marginLeft:6,color:'var(--green)',background:'var(--green-bg)',padding:'1px 6px',borderRadius:20,border:'1px solid var(--green-border)'}}>Ideal</span>}
                              </td>
                              <td>{new Date(ponto.data+'T12:00:00').toLocaleDateString('pt-BR')}</td>
                              <td>{fmtNum(ponto.peso,0)} kg</td>
                              <td>{fmt(ponto.receita_bruta)}</td>
                              <td style={{color:'#b91c1c'}}>{fmt(ponto.custo_total)}</td>
                              <td style={{fontWeight:500,color:ponto.lucro>=0?'var(--green-dark)':'#b91c1c'}}>{fmt(ponto.lucro)}</td>
                              <td style={{fontWeight:500,color:ponto.lucro_por_animal>=0?'var(--green-dark)':'#b91c1c'}}>{fmt(ponto.lucro_por_animal)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              <div style={{padding:'10px 14px',background:'var(--gray-50)',borderRadius:8,fontSize:11,color:'var(--gray-400)',lineHeight:1.6}}>
                Projeção baseada no GMD atual do lote e preço informado. Variações de mercado, saúde do rebanho e custos futuros podem alterar o resultado real. Use como referência, não como garantia.
              </div>
            </>)
          })()}
        </div>
      </Modal>
    </div>
  )
}

function LoteCard({ lote, onAvancar, onEncerrar, onExcluir, onBifurcar, onPesagem, onSaida, onProjecao }: {
  lote: any; onAvancar:()=>void; onEncerrar:()=>void; onExcluir:()=>void
  onBifurcar:()=>void; onPesagem:()=>void; onSaida:()=>void; onProjecao:()=>void
}) {
  const qtd=lote.qtd_animais_atual??lote.qtd_animais??'—'
  const pesoAtual=lote.peso_medio_atual??lote.peso_medio_entrada
  const gmd=lote.gmd_atual
  const dias=lote.dias_confinamento??0
  const custoAcum=lote.custo_alimentacao_acumulado
  const custoDia=lote.custo_alimentacao_dia

  return(
    <div className="card" style={{display:'flex',flexDirection:'column',gap:12}}>
      <div className="flex-between">
        <div>
          <div style={{fontSize:15,fontWeight:600}}>{lote.nome_lote}</div>
          <div style={{fontSize:11,color:'#9e9e9e',marginTop:2}}>{lote.codigo_lote} · {lote.raca_predominante||'Raça não informada'}</div>
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

      {(custoAcum>0||custoDia>0)&&(
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <div style={{background:'#fff8e1',borderRadius:8,padding:'8px 10px'}}>
            <div style={{fontSize:11,color:'#9e9e9e'}}>Custo alim./dia</div>
            <div style={{fontSize:15,fontWeight:600,color:'#b45309'}}>{custoDia>0?fmt(custoDia):'—'}</div>
          </div>
          <div style={{background:'#fff8e1',borderRadius:8,padding:'8px 10px'}}>
            <div style={{fontSize:11,color:'#9e9e9e'}}>Custo alim. acumulado</div>
            <div style={{fontSize:15,fontWeight:600,color:'#b45309'}}>{custoAcum>0?fmt(custoAcum):'—'}</div>
          </div>
        </div>
      )}

      {lote.origem_fazenda&&(
        <div style={{fontSize:12,color:'#9e9e9e'}}>
          Origem: {lote.origem_fazenda}{lote.origem_municipio?` · ${lote.origem_municipio}`:''}{lote.origem_estado?`/${lote.origem_estado}`:''}
        </div>
      )}

      {lote.status==='ativo'&&(
        <>
          <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
            <button className="btn btn-primary btn-sm" style={{flex:1,justifyContent:'center'}} onClick={onPesagem}>Pesagem</button>
            <button className="btn btn-secondary btn-sm" style={{flex:1,justifyContent:'center'}} onClick={onSaida}>Registrar saída</button>
            <button className="btn btn-ghost btn-sm" style={{flex:1,justifyContent:'center'}} onClick={onProjecao}>Projetar venda</button>
          </div>
          <div style={{display:'flex',gap:6}}>
            {lote.ciclo_atual<4&&<button className="btn btn-ghost btn-sm" style={{flex:1,justifyContent:'center'}} onClick={onAvancar}>Avançar ciclo</button>}
            <button className="btn btn-ghost btn-sm" style={{flex:1,justifyContent:'center'}} onClick={onBifurcar}>Bifurcar</button>
          </div>
        </>
      )}

      <div style={{display:'flex',gap:6}}>
        {lote.status==='ativo'&&(
          <button className="btn btn-ghost btn-sm" style={{flex:1,justifyContent:'center',color:'#b91c1c'}} onClick={onEncerrar}>Encerrar</button>
        )}
        <button className="btn btn-ghost btn-sm" style={{flex:1,justifyContent:'center',color:'#b91c1c',borderColor:'#ffcdd2'}}
          onClick={()=>{
            if(window.confirm(`Excluir permanentemente "${lote.nome_lote}"?\n\nTodos os dados relacionados serão removidos. Esta ação não pode ser desfeita.`))
              onExcluir()
          }}>
          Excluir lote
        </button>
      </div>
    </div>
  )
}
