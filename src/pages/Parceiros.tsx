import { useState } from 'react'
import { useParceiros } from '@/hooks/useHooks'
import { Modal, PageHeader, EmptyState } from '@/components/common/UI'
import type { Parceiro } from '@/types'

const tipoLabel: Record<Parceiro['tipo'], string> = { fornecedor: 'Fornecedor', corretor: 'Corretor', frigorifico: 'Frigorífico', produtor: 'Produtor' }
const tipoBadge: Record<Parceiro['tipo'], string> = { fornecedor: 'badge-gray', corretor: 'badge-amber', frigorifico: 'badge-blue', produtor: 'badge-green' }

export default function Parceiros() {
  const { parceiros, loading, criarParceiro, excluirParceiro } = useParceiros()
  const [showNovo, setShowNovo] = useState(false)
  const [filtro, setFiltro] = useState<Parceiro['tipo']|'todos'>('todos')
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({ nome: '', tipo: 'corretor' as Parceiro['tipo'], cpf_cnpj: '', contato: '', endereco: '', observacoes: '' })

  const handleCriar = async (e: React.FormEvent) => {
    e.preventDefault(); setSaving(true)
    await criarParceiro({ nome: form.nome, tipo: form.tipo, cpf_cnpj: form.cpf_cnpj || null, contato: form.contato || null, endereco: form.endereco || null, observacoes: form.observacoes || null })
    setSaving(false); setShowNovo(false)
    setForm({ nome: '', tipo: 'corretor', cpf_cnpj: '', contato: '', endereco: '', observacoes: '' })
  }

  const lista = filtro === 'todos' ? parceiros : parceiros.filter(p => p.tipo === filtro)

  return (
    <div className="page">
      <PageHeader title="Parceiros" subtitle="Frigoríficos, corretores e fornecedores" action={<button className="btn btn-primary" onClick={() => setShowNovo(true)}>+ Novo parceiro</button>} />

      <div className="pill-wrap">
        {(['todos','frigorifico','corretor','fornecedor','produtor'] as const).map(t => (
          <button key={t} className={`pill${filtro===t?' active':''}`} onClick={() => setFiltro(t)}>{t === 'todos' ? 'Todos' : tipoLabel[t]}</button>
        ))}
      </div>

      {loading ? <div style={{display:'flex',justifyContent:'center',padding:48}}><div className="spinner" style={{width:28,height:28}}/></div>
      : lista.length === 0 ? <div className="card"><EmptyState icon="◻" title="Nenhum parceiro" desc="Cadastre frigoríficos, corretores e outros parceiros." action={<button className="btn btn-primary" onClick={() => setShowNovo(true)}>Novo parceiro</button>}/></div>
      : (
        <div className="card" style={{padding:0}}>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Nome</th><th>Tipo</th><th>CPF/CNPJ</th><th>Contato</th><th>Ações</th></tr></thead>
              <tbody>
                {lista.map(p => (
                  <tr key={p.id}>
                    <td><strong>{p.nome}</strong></td>
                    <td><span className={`badge ${tipoBadge[p.tipo]}`}>{tipoLabel[p.tipo]}</span></td>
                    <td>{p.cpf_cnpj ?? '—'}</td>
                    <td>{p.contato ?? '—'}</td>
                    <td><button className="btn btn-ghost btn-sm" style={{color:'#b91c1c'}} onClick={() => excluirParceiro(p.id)}>Excluir</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={showNovo} onClose={() => setShowNovo(false)} title="Novo parceiro">
        <form onSubmit={handleCriar} style={{display:'flex',flexDirection:'column',gap:14}}>
          <div className="form-row-2">
            <div className="form-group"><label className="form-label">Nome</label><input className="form-input" placeholder="Nome" value={form.nome} onChange={e=>setForm(f=>({...f,nome:e.target.value}))} required/></div>
            <div className="form-group"><label className="form-label">Tipo</label><select className="form-input" value={form.tipo} onChange={e=>setForm(f=>({...f,tipo:e.target.value as Parceiro['tipo']}))}><option value="frigorifico">Frigorífico</option><option value="corretor">Corretor</option><option value="fornecedor">Fornecedor</option><option value="produtor">Produtor</option></select></div>
          </div>
          <div className="form-row-2">
            <div className="form-group"><label className="form-label">CPF / CNPJ</label><input className="form-input" placeholder="Opcional" value={form.cpf_cnpj} onChange={e=>setForm(f=>({...f,cpf_cnpj:e.target.value}))}/></div>
            <div className="form-group"><label className="form-label">Contato</label><input className="form-input" placeholder="Telefone ou e-mail" value={form.contato} onChange={e=>setForm(f=>({...f,contato:e.target.value}))}/></div>
          </div>
          <div className="form-group"><label className="form-label">Endereço</label><input className="form-input" placeholder="Opcional" value={form.endereco} onChange={e=>setForm(f=>({...f,endereco:e.target.value}))}/></div>
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setShowNovo(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving?<span className="spinner" style={{width:14,height:14}}/>:'Salvar'}</button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
