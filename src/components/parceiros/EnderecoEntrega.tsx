import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { linkMapsCliente, type ClienteFornecedor } from '@/core/parceiros'

// Endereço de entrega do produtor, usado no romaneio. Editado pela equipe
// (gestor ou vendedor responsável) e pelo próprio produtor. O link do Google
// Maps colado vale como localização exata; sem ele, o link sai do endereço.
export function EnderecoEntrega({ cliente, onSalvo, compacto }: {
  cliente: Pick<ClienteFornecedor, 'id' | 'endereco_entrega' | 'link_maps' | 'municipio' | 'uf'>
  onSalvo?: (endereco: string | null, link: string | null) => void
  compacto?: boolean
}) {
  const [editando, setEditando] = useState(false)
  const [endereco, setEndereco] = useState(cliente.endereco_entrega ?? '')
  const [link, setLink] = useState(cliente.link_maps ?? '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  // Valores salvos nesta tela valem até a próxima carga do cliente.
  const [salvo, setSalvo] = useState<{ endereco_entrega: string | null; link_maps: string | null } | null>(null)
  const atual = { ...cliente, ...(salvo ?? {}) }
  const maps = linkMapsCliente(atual)

  const salvar = async () => {
    setErro(null)
    const l = link.trim()
    if (l && !/^https:\/\//i.test(l)) { setErro('O link do Google Maps deve começar com https://'); return }
    setSalvando(true)
    const { error } = await supabase.rpc('definir_endereco_cliente', { cid: cliente.id, endereco: endereco.trim(), link: l })
    setSalvando(false)
    if (error) { setErro(error.message); return }
    setEditando(false)
    setSalvo({ endereco_entrega: endereco.trim() || null, link_maps: l || null })
    onSalvo?.(endereco.trim() || null, l || null)
  }

  if (editando) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Endereço de entrega</label>
          <textarea rows={2} value={endereco} onChange={e => setEndereco(e.target.value)} placeholder="Estrada, km, localidade e referências para o motorista" />
        </div>
        <div className="field" style={{ marginBottom: 0 }}>
          <label>Link do Google Maps (opcional)</label>
          <input value={link} onChange={e => setLink(e.target.value)} placeholder="https://maps.app.goo.gl/..." />
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-3)' }}>Sem link, o romaneio abre o Maps pela busca do endereço, município e UF.</div>
        {erro && <div className="field-error">{erro}</div>}
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-primary btn-sm" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando...' : 'Salvar endereço'}</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setEditando(false); setEndereco(atual.endereco_entrega ?? ''); setLink(atual.link_maps ?? ''); setErro(null) }}>Cancelar</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ fontSize: 13 }}>
      {!compacto && <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 2 }}>Endereço de entrega</div>}
      {atual.endereco_entrega
        ? <div>{atual.endereco_entrega}{(atual.municipio || atual.uf) && <span style={{ color: 'var(--text-3)' }}> · {[atual.municipio, atual.uf].filter(Boolean).join('/')}</span>}</div>
        : <div style={{ color: 'var(--text-3)' }}>Não informado</div>}
      <div style={{ display: 'flex', gap: 12, marginTop: 4, flexWrap: 'wrap' }}>
        {maps && <a href={maps} target="_blank" rel="noreferrer" style={{ color: 'var(--green-dark)', fontWeight: 600 }}>Abrir no Google Maps</a>}
        <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '0 4px', height: 'auto' }} onClick={() => setEditando(true)}>
          {atual.endereco_entrega || atual.link_maps ? 'Editar endereço' : 'Informar endereço'}
        </button>
      </div>
    </div>
  )
}
