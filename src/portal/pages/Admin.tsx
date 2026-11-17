import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { PageHeader, Modal, EmptyState } from '@/components/common/UI'
import { usePortal } from '@/portal/PortalContext'
import { chamarApiParceiros } from '@/lib/parceirosApi'
import { fmtDataBr, type Fornecedor } from '@/core/parceiros'

// Valor mensal da plataforma de venda de ração: R$ 2.000 fixos + pacote de
// clientes (múltiplos de 50). O preço por cliente da faixa do pacote vale para
// o pacote todo: 1-100 R$ 35, 101-200 R$ 32, 201-300 R$ 29, 301-400 R$ 26,
// acima de 400 R$ 24. Igual ao preço de pacotes na Stripe.
export function pacoteClientes(clientes: number): number {
  return clientes > 0 ? Math.ceil(clientes / 50) * 50 : 0
}
function precoPorCliente(pacote: number): number {
  return pacote <= 100 ? 35 : pacote <= 200 ? 32 : pacote <= 300 ? 29 : pacote <= 400 ? 26 : 24
}
export function valorMensal(clientes: number): number {
  const pacote = pacoteClientes(clientes)
  return 2000 + pacote * precoPorCliente(pacote)
}

const vazio = { nome: '', email_contato: '', opcao_integrada: true, opcao_plataforma: false, ativo: true, gestor_email: '', gestor_nome: '' }

export default function Admin() {
  const { admin, fornecedores, recarregar, escolherFornecedor } = usePortal()
  const navigate = useNavigate()
  const [editando, setEditando] = useState<Fornecedor | 'novo' | null>(null)
  const [form, setForm] = useState(vazio)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const [cobrando, setCobrando] = useState<string | null>(null)

  if (!admin) return <div className="page"><EmptyState icon="◻" title="Acesso restrito" desc="Somente o administrador do Confina+." /></div>

  const abrir = (f: Fornecedor | 'novo') => {
    setMsg(null); setEditando(f)
    setForm(f === 'novo' ? vazio : { ...vazio, nome: f.nome, email_contato: f.email_contato ?? '', opcao_integrada: f.opcao_integrada, opcao_plataforma: f.opcao_plataforma, ativo: f.ativo })
  }

  const salvar = async () => {
    if (!form.nome.trim()) { setMsg({ tipo: 'erro', texto: 'Informe o nome' }); return }
    setSalvando(true); setMsg(null)
    const linha = { nome: form.nome.trim(), email_contato: form.email_contato.trim() || null, opcao_integrada: form.opcao_integrada, opcao_plataforma: form.opcao_plataforma, ativo: form.ativo }
    let id = editando !== 'novo' && editando ? editando.id : null
    if (id) {
      const { error } = await supabase.from('fornecedores').update(linha).eq('id', id)
      if (error) { setSalvando(false); setMsg({ tipo: 'erro', texto: error.message }); return }
    } else {
      const { data, error } = await supabase.from('fornecedores').insert(linha).select('id').single()
      if (error || !data) { setSalvando(false); setMsg({ tipo: 'erro', texto: error?.message ?? 'Erro' }); return }
      id = data.id as string
    }
    if (form.gestor_email.trim()) {
      const { data: c, error } = await supabase.from('fornecedor_convites').insert({
        fornecedor_id: id, email: form.gestor_email.trim().toLowerCase(), nome: form.gestor_nome.trim() || null, papel: 'gestor',
      }).select('id').single()
      if (error || !c) { setSalvando(false); setMsg({ tipo: 'erro', texto: error?.message ?? 'Erro no convite' }); return }
      const r = await chamarApiParceiros('enviar_convite', { convite_id: c.id as string })
      if (r.error) { setSalvando(false); setMsg({ tipo: 'erro', texto: `Fornecedor salvo; o e-mail do convite não saiu: ${r.error}` }); await recarregar(); return }
    }
    setSalvando(false)
    setEditando(null)
    await recarregar()
  }

  const cobranca = async (f: Fornecedor, acao: 'cobranca_ativar' | 'cobranca_sincronizar') => {
    if (acao === 'cobranca_ativar' && !window.confirm(`Ativar a cobrança mensal da ${f.nome} na Stripe? A fatura é enviada por e-mail ao contato do fornecedor.`)) return
    setCobrando(f.id); setMsg(null)
    const r = await chamarApiParceiros(acao, { fornecedor_id: f.id })
    setCobrando(null)
    setMsg(r.error ? { tipo: 'erro', texto: r.error } : { tipo: 'ok', texto: `Cobrança da ${f.nome} atualizada.` })
    await recarregar()
  }

  return (
    <div className="page">
      <PageHeader title="Fornecedores" subtitle="Cooperativas e revendas com portal de parceiros"
        action={<button className="btn btn-primary" onClick={() => abrir('novo')}>+ Novo fornecedor</button>} />
      {msg && !editando && <div style={{ fontSize: 13, marginBottom: 12, color: msg.tipo === 'erro' ? 'var(--red)' : 'var(--green-dark)' }}>{msg.texto}</div>}
      {fornecedores.length === 0 ? <div className="card"><EmptyState icon="◻" title="Nenhum fornecedor" desc="Cadastre a primeira cooperativa e convide o gestor." /></div> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Fornecedor</th><th>Parceria</th><th>Cobrança</th><th></th></tr></thead>
          <tbody>{fornecedores.map(f => (
            <tr key={f.id} style={{ opacity: f.ativo ? 1 : 0.5 }}>
              <td><strong>{f.nome}</strong><div style={{ fontSize: 11, color: 'var(--text-3)' }}>{f.email_contato ?? 'Sem e-mail de contato'}</div></td>
              <td style={{ fontSize: 12 }}>{[f.opcao_integrada && 'Integrada', f.opcao_plataforma && 'Plataforma de venda'].filter(Boolean).join(' + ') || '—'}</td>
              <td style={{ fontSize: 12 }}>
                {f.stripe_subscription_id
                  ? <>
                      <span className={`badge ${f.cobranca_status === 'active' ? 'badge-green' : 'badge-amber'}`}>{f.cobranca_status ?? 'criada'}</span>
                      <div style={{ marginTop: 4 }}>{f.clientes_cobrados ?? 0} clientes · pacote de {pacoteClientes(f.clientes_cobrados ?? 0)} · {valorMensal(f.clientes_cobrados ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}/mês</div>
                      {f.cobranca_sincronizada_em && <div style={{ color: 'var(--text-3)' }}>Ajustada em {fmtDataBr(f.cobranca_sincronizada_em.slice(0, 10))}</div>}
                    </>
                  : f.opcao_plataforma ? 'Não ativada' : 'Sem custo'}
              </td>
              <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => { escolherFornecedor(f.id); navigate('/') }}>Abrir portal</button>
                <button className="btn btn-ghost btn-sm" style={{ marginLeft: 6 }} onClick={() => abrir(f)}>Editar</button>
                {f.opcao_plataforma && !f.stripe_subscription_id && (
                  <button className="btn btn-primary btn-sm" style={{ marginLeft: 6 }} disabled={cobrando === f.id} onClick={() => cobranca(f, 'cobranca_ativar')}>Ativar cobrança</button>
                )}
                {f.stripe_subscription_id && (
                  <button className="btn btn-ghost btn-sm" style={{ marginLeft: 6 }} disabled={cobrando === f.id} onClick={() => cobranca(f, 'cobranca_sincronizar')}>Ajustar clientes</button>
                )}
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 12 }}>
        Plataforma de venda: R$ 2.000/mês + por cliente só de estoque ativo (R$ 35 até 50, R$ 33 de 51 a 100, R$ 30 de 101 a 300, R$ 28 de 301 a 500, R$ 25 de 501 a 1.000). Clientes do Confina+ da parceria integrada não entram na conta. A quantidade é ajustada todo dia e vale a partir da próxima fatura.
      </div>

      {editando && (
        <Modal open onClose={() => setEditando(null)} title={editando === 'novo' ? 'Novo fornecedor' : `Editar ${editando.nome}`}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setEditando(null)}>Cancelar</button>
            <button className="btn btn-primary" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando...' : 'Salvar'}</button>
          </>}>
          <div className="field"><label>Nome</label><input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
          <div className="field"><label>E-mail de contato (recebe as faturas)</label><input type="email" value={form.email_contato} onChange={e => setForm({ ...form, email_contato: e.target.value })} /></div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 8 }}>
            <input type="checkbox" checked={form.opcao_integrada} onChange={e => setForm({ ...form, opcao_integrada: e.target.checked })} /> Parceria integrada (clientes do Confina+, sem custo)
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 8 }}>
            <input type="checkbox" checked={form.opcao_plataforma} onChange={e => setForm({ ...form, opcao_plataforma: e.target.checked })} /> Plataforma de venda de ração (contas só de estoque, cobrada)
          </label>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 16 }}>
            <input type="checkbox" checked={form.ativo} onChange={e => setForm({ ...form, ativo: e.target.checked })} /> Ativo
          </label>
          <strong style={{ fontSize: 13 }}>Convidar gestor (opcional)</strong>
          <div className="form-row-2" style={{ marginTop: 8 }}>
            <div className="field"><label>E-mail do gestor</label><input type="email" value={form.gestor_email} onChange={e => setForm({ ...form, gestor_email: e.target.value })} /></div>
            <div className="field"><label>Nome</label><input value={form.gestor_nome} onChange={e => setForm({ ...form, gestor_nome: e.target.value })} /></div>
          </div>
          {msg && <div style={{ fontSize: 13, color: msg.tipo === 'erro' ? 'var(--red)' : 'var(--green-dark)' }}>{msg.texto}</div>}
        </Modal>
      )}
    </div>
  )
}
