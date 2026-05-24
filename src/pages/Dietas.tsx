// ─── DIETAS ──────────────────────────────────────────────────────────────────
import { useState } from 'react'
import { useDietas } from '@/hooks/useHooks'
import { Modal, PageHeader, EmptyState } from '@/components/common/UI'
import { fmt, calcularCustoDiario, diasParaPeso } from '@/lib/calculations'
import type { ComponenteDieta } from '@/types'

export default function Dietas() {
  const { dietas, componentes, loading, criarDieta, excluirDieta, criarComponente } = useDietas()
  const [tab, setTab] = useState<'templates'|'componentes'|'calculadora'>('templates')
  const [showNovaDieta, setShowNovaDieta] = useState(false)
  const [showNovoComp, setShowNovoComp] = useState(false)
  const [saving, setSaving] = useState(false)
  const [fDieta, setFDieta] = useState({ nome: '', descricao: '', gmd_esperado: '', is_template: true, componentes: [] as ComponenteDieta[] })
  const [fComp, setFComp] = useState({ nome: '', preco_atual: '', unidade: 'kg' })
  const [calcPI, setCalcPI] = useState(320); const [calcPF, setCalcPF] = useState(540); const [calcGMD, setCalcGMD] = useState(1.2)
  const [calcComps, setCalcComps] = useState<ComponenteDieta[]>([])

  const custoDia = calcComps.length > 0 ? calcularCustoDiario(calcPI, calcComps) : 0
  const dias = diasParaPeso(calcPI, calcPF, calcGMD)
  const custoTotal = custoDia * dias

  return (
    <div className="page">
      <PageHeader title="Dietas" subtitle="Componentes, templates e simulações" action={<button className="btn btn-primary" onClick={() => setShowNovaDieta(true)}>+ Nova dieta</button>} />
      <div className="tabs">
        {([['templates','Templates'],['componentes','Componentes'],['calculadora','Calculadora']] as const).map(([t,l]) => (
          <button key={t} className={`tab-btn${tab===t?' active':''}`} onClick={() => setTab(t)}>{l}</button>
        ))}
      </div>

      {tab === 'templates' && (
        loading ? <div style={{ display:'flex',justifyContent:'center',padding:48 }}><div className="spinner" style={{width:28,height:28}}/></div>
        : dietas.length === 0 ? <div className="card"><EmptyState icon="◉" title="Nenhuma dieta" desc="Crie sua primeira dieta." action={<button className="btn btn-primary" onClick={()=>setShowNovaDieta(true)}>Nova dieta</button>}/></div>
        : <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))',gap:12}}>
            {dietas.map(d => (
              <div key={d.id} className="card">
                <div className="flex-between" style={{marginBottom:10}}>
                  <div><div style={{fontSize:15,fontWeight:600}}>{d.nome}</div>{d.descricao&&<div style={{fontSize:12,color:'#9e9e9e',marginTop:2}}>{d.descricao}</div>}</div>
                  <span className={`badge ${d.is_template?'badge-blue':'badge-gray'}`}>{d.is_template?'Template':'Custom'}</span>
                </div>
                <div style={{display:'flex',gap:8,marginBottom:10}}>
                  <div style={{background:'#fafafa',borderRadius:8,padding:'8px 12px',flex:1}}><div style={{fontSize:11,color:'#9e9e9e'}}>GMD esperado</div><div style={{fontSize:16,fontWeight:600}}>{d.gmd_esperado} kg/dia</div></div>
                  <div style={{background:'#fafafa',borderRadius:8,padding:'8px 12px',flex:1}}><div style={{fontSize:11,color:'#9e9e9e'}}>Componentes</div><div style={{fontSize:16,fontWeight:600}}>{d.componentes.length}</div></div>
                </div>
                {d.componentes.map((c,i)=><div key={i} style={{display:'flex',justifyContent:'space-between',fontSize:12,padding:'3px 0',borderBottom:'1px solid #f5f5f5'}}><span style={{color:'#555'}}>{c.nome}</span><span style={{color:'#9e9e9e'}}>{c.percentual_peso_corporal}% · R${c.preco_kg}/kg</span></div>)}
                <button className="btn btn-ghost btn-sm" style={{marginTop:12,width:'100%',justifyContent:'center',color:'#b91c1c'}} onClick={()=>excluirDieta(d.id)}>Excluir</button>
              </div>
            ))}
          </div>
      )}

      {tab === 'componentes' && (
        <div>
          <div style={{display:'flex',justifyContent:'flex-end',marginBottom:12}}><button className="btn btn-primary" onClick={()=>setShowNovoComp(true)}>+ Novo componente</button></div>
          {componentes.length === 0 ? <div className="card"><EmptyState icon="◎" title="Nenhum componente" desc="Cadastre os ingredientes da dieta." action={<button className="btn btn-primary" onClick={()=>setShowNovoComp(true)}>Novo componente</button>}/></div>
          : <div className="card" style={{padding:0}}><div className="table-wrap"><table><thead><tr><th>Nome</th><th>Preço atual</th><th>Unidade</th></tr></thead><tbody>{componentes.map(c=><tr key={c.id}><td><strong>{c.nome}</strong></td><td>{fmt(c.preco_atual)}/kg</td><td>{c.unidade}</td></tr>)}</tbody></table></div></div>}
        </div>
      )}

      {tab === 'calculadora' && (
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:16}}>
          <div className="card">
            <div style={{fontWeight:600,marginBottom:16}}>Parâmetros</div>
            <div className="form-row-2" style={{marginBottom:12}}>
              <div className="form-group"><label className="form-label">Peso inicial (kg)</label><input className="form-input" type="number" value={calcPI} onChange={e=>setCalcPI(Number(e.target.value))}/></div>
              <div className="form-group"><label className="form-label">Peso alvo (kg)</label><input className="form-input" type="number" value={calcPF} onChange={e=>setCalcPF(Number(e.target.value))}/></div>
            </div>
            <div className="form-group" style={{marginBottom:16}}><label className="form-label">GMD esperado (kg/dia)</label><input className="form-input" type="number" step="0.01" value={calcGMD} onChange={e=>setCalcGMD(Number(e.target.value))}/></div>
            <div style={{fontWeight:500,fontSize:13,marginBottom:8}}>Componentes</div>
            {calcComps.map((c,i)=>(
              <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 80px 80px 28px',gap:6,marginBottom:6,alignItems:'center'}}>
                <select className="form-input" value={c.componente_id} onChange={e=>{const comp=componentes.find(x=>x.id===e.target.value);if(comp)setCalcComps(cs=>cs.map((x,j)=>j===i?{...x,componente_id:comp.id,nome:comp.nome,preco_kg:comp.preco_atual}:x))}}>{componentes.map(x=><option key={x.id} value={x.id}>{x.nome}</option>)}</select>
                <input className="form-input" type="number" step="0.1" placeholder="% peso" value={c.percentual_peso_corporal} onChange={e=>setCalcComps(cs=>cs.map((x,j)=>j===i?{...x,percentual_peso_corporal:Number(e.target.value)}:x))}/>
                <input className="form-input" type="number" step="0.01" placeholder="R$/kg" value={c.preco_kg} onChange={e=>setCalcComps(cs=>cs.map((x,j)=>j===i?{...x,preco_kg:Number(e.target.value)}:x))}/>
                <button onClick={()=>setCalcComps(cs=>cs.filter((_,j)=>j!==i))} style={{background:'none',border:'none',cursor:'pointer',color:'#9e9e9e',fontSize:16}}>×</button>
              </div>
            ))}
            {componentes.length>0&&<button className="btn btn-ghost btn-sm" onClick={()=>{const c=componentes[0];setCalcComps(cs=>[...cs,{componente_id:c.id,nome:c.nome,percentual_peso_corporal:2,preco_kg:c.preco_atual}])}}>+ Adicionar componente</button>}
          </div>
          <div className="card">
            <div style={{fontWeight:600,marginBottom:16}}>Resultado da simulação</div>
            {[['Dias estimados',`${dias} dias`],['Custo diário (peso inicial)',fmt(custoDia)],['Custo total estimado',fmt(custoTotal)],['Custo por kg ganho',calcPF>calcPI?fmt(custoTotal/(calcPF-calcPI)):'—']].map(([l,v])=>(
              <div key={l} style={{display:'flex',justifyContent:'space-between',padding:'10px 12px',background:'#fafafa',borderRadius:8,marginBottom:8}}>
                <span style={{fontSize:13,color:'#555'}}>{l}</span><span style={{fontSize:14,fontWeight:600}}>{v}</span>
              </div>
            ))}
            {calcComps.length===0&&<div style={{marginTop:16,fontSize:13,color:'#9e9e9e',textAlign:'center'}}>Adicione componentes para ver os cálculos</div>}
          </div>
        </div>
      )}

      <Modal open={showNovaDieta} onClose={()=>setShowNovaDieta(false)} title="Nova dieta" size="lg">
        <form onSubmit={async e=>{e.preventDefault();setSaving(true);await criarDieta({nome:fDieta.nome,descricao:fDieta.descricao||null,gmd_esperado:Number(fDieta.gmd_esperado),is_template:fDieta.is_template,componentes:fDieta.componentes});setSaving(false);setShowNovaDieta(false);setFDieta({nome:'',descricao:'',gmd_esperado:'',is_template:true,componentes:[]})}} style={{display:'flex',flexDirection:'column',gap:14}}>
          <div className="form-row-2">
            <div className="form-group"><label className="form-label">Nome</label><input className="form-input" placeholder="Ex: Engorda Intensiva" value={fDieta.nome} onChange={e=>setFDieta(f=>({...f,nome:e.target.value}))} required/></div>
            <div className="form-group"><label className="form-label">GMD esperado (kg/dia)</label><input className="form-input" type="number" step="0.01" placeholder="1.2" value={fDieta.gmd_esperado} onChange={e=>setFDieta(f=>({...f,gmd_esperado:e.target.value}))} required/></div>
          </div>
          <div className="form-group"><label className="form-label">Descrição</label><input className="form-input" placeholder="Opcional" value={fDieta.descricao} onChange={e=>setFDieta(f=>({...f,descricao:e.target.value}))}/></div>
          <label style={{display:'flex',alignItems:'center',gap:8,fontSize:13,color:'#555',cursor:'pointer'}}><input type="checkbox" checked={fDieta.is_template} onChange={e=>setFDieta(f=>({...f,is_template:e.target.checked}))}/>Salvar como template reutilizável</label>
          <div style={{fontWeight:500,fontSize:13,marginBottom:4}}>Componentes</div>
          {fDieta.componentes.map((c,i)=>(
            <div key={i} style={{display:'grid',gridTemplateColumns:'1fr 100px 100px 28px',gap:6,alignItems:'center'}}>
              <select className="form-input" value={c.componente_id} onChange={e=>{const comp=componentes.find(x=>x.id===e.target.value);if(comp)setFDieta(f=>({...f,componentes:f.componentes.map((x,j)=>j===i?{...x,componente_id:comp.id,nome:comp.nome,preco_kg:comp.preco_atual}:x)}))}}>
                {componentes.map(x=><option key={x.id} value={x.id}>{x.nome}</option>)}
              </select>
              <input className="form-input" type="number" placeholder="% peso" value={c.percentual_peso_corporal} onChange={e=>setFDieta(f=>({...f,componentes:f.componentes.map((x,j)=>j===i?{...x,percentual_peso_corporal:Number(e.target.value)}:x)}))}/>
              <input className="form-input" type="number" placeholder="R$/kg" value={c.preco_kg} onChange={e=>setFDieta(f=>({...f,componentes:f.componentes.map((x,j)=>j===i?{...x,preco_kg:Number(e.target.value)}:x)}))}/>
              <button type="button" onClick={()=>setFDieta(f=>({...f,componentes:f.componentes.filter((_,j)=>j!==i)}))} style={{background:'none',border:'none',cursor:'pointer',color:'#9e9e9e',fontSize:16}}>×</button>
            </div>
          ))}
          {componentes.length>0?<button type="button" className="btn btn-ghost btn-sm" onClick={()=>{const c=componentes[0];setFDieta(f=>({...f,componentes:[...f.componentes,{componente_id:c.id,nome:c.nome,percentual_peso_corporal:2,preco_kg:c.preco_atual}]}));}}>+ Adicionar componente</button>
          :<div style={{fontSize:12,color:'#e65100',padding:'8px 12px',background:'#fff3e0',borderRadius:6}}>Cadastre componentes alimentares primeiro na aba Componentes.</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={()=>setShowNovaDieta(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving?<span className="spinner" style={{width:14,height:14}}/>:'Salvar dieta'}</button>
          </div>
        </form>
      </Modal>

      <Modal open={showNovoComp} onClose={()=>setShowNovoComp(false)} title="Novo componente alimentar" size="sm">
        <form onSubmit={async e=>{e.preventDefault();setSaving(true);await criarComponente({nome:fComp.nome,preco_atual:Number(fComp.preco_atual),unidade:fComp.unidade});setSaving(false);setShowNovoComp(false);setFComp({nome:'',preco_atual:'',unidade:'kg'})}} style={{display:'flex',flexDirection:'column',gap:14}}>
          <div className="form-group"><label className="form-label">Nome</label><input className="form-input" placeholder="Ex: Milho moído" value={fComp.nome} onChange={e=>setFComp(f=>({...f,nome:e.target.value}))} required/></div>
          <div className="form-group"><label className="form-label">Preço atual (R$/kg)</label><input className="form-input" type="number" step="0.0001" placeholder="0.85" value={fComp.preco_atual} onChange={e=>setFComp(f=>({...f,preco_atual:e.target.value}))} required min="0"/></div>
          <div className="form-group"><label className="form-label">Unidade</label><input className="form-input" value={fComp.unidade} onChange={e=>setFComp(f=>({...f,unidade:e.target.value}))}/></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={()=>setShowNovoComp(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving?<span className="spinner" style={{width:14,height:14}}/>:'Salvar'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
