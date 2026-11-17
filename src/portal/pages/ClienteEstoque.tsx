import { useState } from 'react'
import { PageHeader, EmptyState } from '@/components/common/UI'
import { useParceiroCliente } from '@/hooks/useParceiroCliente'
import { EstoqueGerenciado } from '@/components/parceiros/EstoqueGerenciado'
import { EnderecoEntrega } from '@/components/parceiros/EnderecoEntrega'

// Conta só de estoque: o cliente lança entradas, baixas e ajustes, informa
// o consumo e pede cotação. O vendedor e o gestor operam o mesmo estoque
// pelo portal (ver Clientes).
export default function ClienteEstoque() {
  const { vinculo, loading, alterarJanela } = useParceiroCliente({ calcularEstoque: false })
  const [janela, setJanela] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  if (loading) return <div className="page"><div className="spinner" style={{ width: 28, height: 28, margin: '48px auto' }} /></div>
  if (!vinculo) return <div className="page"><EmptyState icon="◻" title="Conta sem fornecedor" desc="Aceite o convite do fornecedor para usar o estoque." /></div>

  const salvarJanela = async () => {
    const n = Number(janela)
    if (!(n >= 1 && n <= 90)) { setErro('A janela deve ter entre 1 e 90 dias'); return }
    const r = await alterarJanela(n)
    setJanela(null)
    setErro(r.error)
  }

  return (
    <div className="page">
      <PageHeader title="Estoque" subtitle={`Produtos ${vinculo.fornecedor.nome}: saldo, consumo e previsão de fim`} />
      <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        Média das baixas calculada sobre os últimos {vinculo.cliente.janela_consumo_dias} dias.
        {janela == null
          ? <button className="btn btn-ghost btn-sm" onClick={() => setJanela(String(vinculo.cliente.janela_consumo_dias))}>Alterar</button>
          : <><input type="number" min={1} max={90} className="form-input" style={{ width: 70, height: 30 }} value={janela} onChange={e => setJanela(e.target.value)} />
              <button className="btn btn-primary btn-sm" onClick={salvarJanela}>Salvar</button></>}
      </div>
      {erro && <div className="field-error" style={{ marginBottom: 12 }}>{erro}</div>}
      <div className="card" style={{ marginBottom: 16 }}>
        <EnderecoEntrega cliente={vinculo.cliente} />
      </div>
      <EstoqueGerenciado key={`${vinculo.cliente.id}-${vinculo.cliente.janela_consumo_dias}`} cliente={vinculo.cliente}
        produtos={vinculo.produtos} fornecedorNome={vinculo.fornecedor.nome} quem="cliente" />
    </div>
  )
}
