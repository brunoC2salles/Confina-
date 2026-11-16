import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader } from '@/components/common/UI'
import { useDadosFornecedor } from '@/portal/useDadosFornecedor'
import { usePortal } from '@/portal/PortalContext'
import { chamarApiParceiros } from '@/lib/parceirosApi'
import { fmtDataBr, type ConviteFornecedor, type MembroFornecedor, type ModoCliente } from '@/core/parceiros'

const ROTULO_PAPEL: Record<ConviteFornecedor['papel'], string> = { gestor: 'Gestor', vendedor: 'Vendedor', cliente: 'Cliente' }

// Gestor: convida vendedores e clientes por e-mail, define o vendedor
// responsável do cliente e ativa ou desativa membros da equipe.
export default function Equipe() {
  const { fornecedor, admin } = usePortal()
  const { membros, loading, recarregar } = useDadosFornecedor()
  const [convites, setConvites] = useState<ConviteFornecedor[]>([])
  const modosPermitidos: ModoCliente[] = [
    ...(fornecedor?.opcao_integrada ? ['confina' as const] : []),
    ...(fornecedor?.opcao_plataforma ? ['estoque' as const] : []),
  ]
  const [form, setForm] = useState({ email: '', nome: '', papel: 'cliente' as ConviteFornecedor['papel'], modo: (modosPermitidos[0] ?? 'confina') as ModoCliente, vendedor_id: '' })
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  const carregarConvites = useCallback(async () => {
    if (!fornecedor) return
    const { data } = await supabase.from('fornecedor_convites').select('*').eq('fornecedor_id', fornecedor.id).is('aceito_em', null).order('created_at', { ascending: false })
    setConvites((data ?? []) as ConviteFornecedor[])
  }, [fornecedor])
  useEffect(() => { carregarConvites() }, [carregarConvites])

  const enviar = async (id: string) => {
    const r = await chamarApiParceiros('enviar_convite', { convite_id: id })
    setMsg(r.error ? { tipo: 'erro', texto: `Convite salvo, mas o e-mail não saiu: ${r.error}` } : { tipo: 'ok', texto: 'Convite enviado por e-mail.' })
    carregarConvites()
  }

  const convidar = async () => {
    if (!fornecedor) return
    const email = form.email.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(email)) { setMsg({ tipo: 'erro', texto: 'Informe um e-mail válido' }); return }
    if (form.papel === 'cliente' && modosPermitidos.length === 0) { setMsg({ tipo: 'erro', texto: 'O fornecedor não tem opção de parceria ativa para clientes' }); return }
    setSalvando(true); setMsg(null)
    const { data, error } = await supabase.from('fornecedor_convites').insert({
      fornecedor_id: fornecedor.id, email, nome: form.nome.trim() || null, papel: form.papel,
      modo: form.papel === 'cliente' ? form.modo : null,
      vendedor_id: form.papel === 'cliente' && form.vendedor_id ? form.vendedor_id : null,
    }).select('id').single()
    setSalvando(false)
    if (error || !data) { setMsg({ tipo: 'erro', texto: error?.message ?? 'Erro ao criar convite' }); return }
    setForm(f => ({ ...f, email: '', nome: '' }))
    await enviar(data.id as string)
  }

  const excluirConvite = async (c: ConviteFornecedor) => {
    const { error } = await supabase.from('fornecedor_convites').delete().eq('id', c.id)
    if (error) { setMsg({ tipo: 'erro', texto: error.message }); return }
    carregarConvites()
  }

  const alternarMembro = async (m: MembroFornecedor) => {
    const { error } = await supabase.from('fornecedor_membros').update({ ativo: !m.ativo }).eq('id', m.id)
    if (error) { setMsg({ tipo: 'erro', texto: error.message }); return }
    recarregar()
  }

  if (loading) return <div className="page"><div className="spinner" style={{ width: 28, height: 28, margin: '48px auto' }} /></div>
  const vendedores = membros.filter(m => m.ativo)
  const papeis: ConviteFornecedor['papel'][] = admin ? ['cliente', 'vendedor', 'gestor'] : ['cliente', 'vendedor']

  return (
    <div className="page">
      <PageHeader title="Equipe e convites" subtitle="Convide vendedores e clientes por e-mail" />

      <div className="card" style={{ marginBottom: 20 }}>
        <strong style={{ display: 'block', marginBottom: 12 }}>Novo convite</strong>
        <div className="form-row-3">
          <div className="field"><label>E-mail</label><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
          <div className="field"><label>Nome</label><input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
          <div className="field"><label>Acesso</label>
            <select value={form.papel} onChange={e => setForm({ ...form, papel: e.target.value as ConviteFornecedor['papel'] })}>
              {papeis.map(p => <option key={p} value={p}>{ROTULO_PAPEL[p]}</option>)}
            </select>
          </div>
        </div>
        {form.papel === 'cliente' && (
          <div className="form-row-2">
            <div className="field"><label>Tipo de conta</label>
              <select value={form.modo} onChange={e => setForm({ ...form, modo: e.target.value as ModoCliente })}>
                {modosPermitidos.includes('confina') && <option value="confina">Confina+ (parceria integrada, sem custo)</option>}
                {modosPermitidos.includes('estoque') && <option value="estoque">Só estoque e pedidos (plataforma de venda)</option>}
              </select>
            </div>
            <div className="field"><label>Vendedor responsável</label>
              <select value={form.vendedor_id} onChange={e => setForm({ ...form, vendedor_id: e.target.value })}>
                <option value="">Definir depois</option>
                {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome || v.email} ({v.papel === 'gestor' ? 'gestor' : 'vendedor'})</option>)}
              </select>
            </div>
          </div>
        )}
        {msg && <div style={{ fontSize: 13, marginBottom: 12, color: msg.tipo === 'erro' ? 'var(--red)' : 'var(--green-dark)' }}>{msg.texto}</div>}
        <button className="btn btn-primary" disabled={salvando} onClick={convidar}>{salvando ? 'Enviando...' : 'Enviar convite'}</button>
        {form.papel === 'cliente' && form.modo === 'confina' && (
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>O cliente aceita em confinamais.com com a conta que já usa ou cria uma conta gratuita.</div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16 }}>
        <div className="card">
          <strong style={{ display: 'block', marginBottom: 12 }}>Equipe</strong>
          {membros.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Nenhum membro ainda.</div> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Nome</th><th>Papel</th><th>Telefone</th><th></th></tr></thead>
              <tbody>{membros.map(m => (
                <tr key={m.id} style={{ opacity: m.ativo ? 1 : 0.5 }}>
                  <td><strong>{m.nome || '—'}</strong><div style={{ fontSize: 11, color: 'var(--text-3)' }}>{m.email}</div></td>
                  <td>{ROTULO_PAPEL[m.papel]}</td>
                  <td>{m.telefone || '—'}</td>
                  <td style={{ textAlign: 'right' }}><button className="btn btn-ghost btn-sm" onClick={() => alternarMembro(m)}>{m.ativo ? 'Desativar' : 'Reativar'}</button></td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
        <div className="card">
          <strong style={{ display: 'block', marginBottom: 12 }}>Convites pendentes</strong>
          {convites.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Nenhum convite pendente.</div> : (
            <div className="table-wrap"><table>
              <thead><tr><th>E-mail</th><th>Acesso</th><th>Enviado</th><th></th></tr></thead>
              <tbody>{convites.map(c => (
                <tr key={c.id}>
                  <td>{c.email}{c.nome && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{c.nome}</div>}</td>
                  <td style={{ fontSize: 12 }}>{ROTULO_PAPEL[c.papel]}{c.papel === 'cliente' && (c.modo === 'confina' ? ' · Confina+' : ' · Só estoque')}</td>
                  <td style={{ fontSize: 12 }}>{c.enviado_em ? fmtDataBr(c.enviado_em.slice(0, 10)) : 'Não enviado'}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => enviar(c.id)}>Reenviar</button>
                    <button className="btn btn-ghost btn-sm" style={{ marginLeft: 6 }} onClick={() => excluirConvite(c)}>Excluir</button>
                  </td>
                </tr>
              ))}</tbody>
            </table></div>
          )}
        </div>
      </div>
    </div>
  )
}
