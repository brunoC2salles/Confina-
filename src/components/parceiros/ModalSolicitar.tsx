import { useState, useMemo } from 'react'
import { Modal } from '@/components/common/UI'
import {
  criarPedido, quantidadeSugerida, dataEntregaSugerida, fmtKg, fmtDataBr, hojeISO,
  type ProdutoFornecedor, type EstoqueCliente, type ClienteFornecedor, type PedidoFornecedor,
} from '@/core/parceiros'
import { chamarApiParceiros } from '@/lib/parceirosApi'

// Pedido de cotação em 1 clique: dados da fazenda vêm do vínculo, quantidade
// sugerida pelos dias de consumo a cobrir e data sugerida antes do fim do
// estoque. A solicitação chega ao vendedor pelo portal e por e-mail.
export function ModalSolicitar({ produto, estoque, cliente, fornecedorNome, onClose, onCriado }: {
  produto: ProdutoFornecedor
  estoque: EstoqueCliente | undefined
  cliente: ClienteFornecedor
  fornecedorNome: string
  onClose: () => void
  onCriado: (p: PedidoFornecedor, aviso: string | null) => void
}) {
  const consumo = estoque?.consumo_dia_kg ?? null
  const [dias, setDias] = useState('30')
  const sugerida = useMemo(() => quantidadeSugerida(produto, consumo, Number(dias) || 0), [produto, consumo, dias])
  const [quantidade, setQuantidade] = useState(sugerida > 0 ? String(sugerida) : '')
  const [editouQtd, setEditouQtd] = useState(false)
  const [data, setData] = useState(dataEntregaSugerida(produto, estoque?.data_fim ?? null))
  const [obs, setObs] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const alterarDias = (v: string) => {
    setDias(v)
    if (!editouQtd) {
      const q = quantidadeSugerida(produto, consumo, Number(v) || 0)
      setQuantidade(q > 0 ? String(q) : '')
    }
  }

  const enviar = async () => {
    setErro(null)
    const q = Number(quantidade.replace(',', '.'))
    if (!(q > 0)) { setErro('Informe a quantidade'); return }
    if (produto.pedido_minimo_kg && q < produto.pedido_minimo_kg) { setErro(`Pedido mínimo: ${fmtKg(produto.pedido_minimo_kg)}`); return }
    if (!data || data < hojeISO()) { setErro('Escolha uma data de entrega a partir de hoje'); return }
    setSalvando(true)
    const r = await criarPedido({
      cliente_id: cliente.id, produto_id: produto.id, quantidade_kg: q, data_entrega: data, observacoes: obs.trim(),
      estoque_info: estoque ? { saldo_kg: estoque.saldo_kg, consumo_dia_kg: estoque.consumo_dia_kg, data_fim: estoque.data_fim, dias_cobertura: estoque.dias_cobertura } : null,
    })
    if (r.error || !r.pedido) { setSalvando(false); setErro(r.error ?? 'Não foi possível enviar'); return }
    const n = await chamarApiParceiros('notificar_pedido', { pedido_id: r.pedido.id })
    setSalvando(false)
    onCriado(r.pedido, n.error ? `Pedido registrado, mas o e-mail ao vendedor não foi enviado (${n.error}). Ele aparece no portal.` : null)
  }

  return (
    <Modal open onClose={onClose} title={`Solicitar cotação à ${fornecedorNome}`} subtitle={produto.nome} size="md"
      footer={<>
        <button className="btn btn-ghost" onClick={onClose} disabled={salvando}>Cancelar</button>
        <button className="btn btn-primary" onClick={enviar} disabled={salvando}>{salvando ? 'Enviando...' : 'Enviar solicitação'}</button>
      </>}>
      <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: 12, fontSize: 13, marginBottom: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <div><span style={{ color: 'var(--text-2)' }}>Fazenda: </span>{cliente.nome_fazenda || '—'}</div>
        <div><span style={{ color: 'var(--text-2)' }}>Responsável: </span>{cliente.responsavel || '—'}</div>
        <div><span style={{ color: 'var(--text-2)' }}>Contato: </span>{cliente.telefone || cliente.email || '—'}</div>
        <div><span style={{ color: 'var(--text-2)' }}>Estoque: </span>{fmtKg(estoque?.saldo_kg)}</div>
        <div><span style={{ color: 'var(--text-2)' }}>Consumo médio: </span>{consumo != null ? `${fmtKg(consumo)}/dia` : '—'}</div>
        <div><span style={{ color: 'var(--text-2)' }}>Fim previsto: </span>{fmtDataBr(estoque?.data_fim)}</div>
      </div>
      <div className="form-row-2">
        <div className="field">
          <label>Dias de consumo a cobrir</label>
          <input type="number" min={1} value={dias} onChange={e => alterarDias(e.target.value)} disabled={consumo == null || consumo <= 0} />
        </div>
        <div className="field">
          <label>Quantidade (kg)</label>
          <input type="number" min={0} value={quantidade} onChange={e => { setEditouQtd(true); setQuantidade(e.target.value) }} />
        </div>
      </div>
      {(consumo == null || consumo <= 0) && (
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: -8, marginBottom: 12 }}>Sem consumo registrado: informe a quantidade.</div>
      )}
      {(produto.embalagem || produto.pedido_minimo_kg || produto.prazo_entrega_dias != null) && (
        <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: -8, marginBottom: 12 }}>
          {[produto.embalagem && `Embalagem: ${produto.embalagem}`, produto.pedido_minimo_kg && `Pedido mínimo: ${fmtKg(produto.pedido_minimo_kg)}`,
            produto.prazo_entrega_dias != null && `Prazo de entrega: ${produto.prazo_entrega_dias} dias`].filter(Boolean).join(' · ')}
        </div>
      )}
      <div className="field">
        <label>Entrega em</label>
        <input type="date" value={data} min={hojeISO()} onChange={e => setData(e.target.value)} />
      </div>
      <div className="field">
        <label>Observações</label>
        <textarea value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex.: entregar na sede, período da manhã" />
      </div>
      {erro && <div className="field-error">{erro}</div>}
    </Modal>
  )
}
