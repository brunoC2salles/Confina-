import { PageHeader, EmptyState } from '@/components/common/UI'
import { useParceiroCliente } from '@/hooks/useParceiroCliente'
import { PedidosCliente } from '@/components/parceiros/PedidosCliente'

// Pedidos do cliente no portal. O cliente do Confina+ controla estoque e
// faz pedidos em confinamais.com (Compras); aqui acompanha os pedidos.
export default function ClientePedidos() {
  const { vinculo, pedidos, loading, recarregarPedidos } = useParceiroCliente({ calcularEstoque: false })
  if (loading) return <div className="page"><div className="spinner" style={{ width: 28, height: 28, margin: '48px auto' }} /></div>
  if (!vinculo) return <div className="page"><EmptyState icon="◻" title="Conta sem fornecedor" desc="Aceite o convite do fornecedor para fazer pedidos." /></div>
  return (
    <div className="page">
      <PageHeader title="Pedidos" subtitle={`Solicitações de cotação à ${vinculo.fornecedor.nome}`}
        action={vinculo.cliente.modo === 'confina'
          ? <a className="btn btn-primary" href="https://www.confinamais.com/compras">Abrir o Confina+</a>
          : undefined} />
      {vinculo.cliente.modo === 'confina' && (
        <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>
          O estoque e os pedidos em 1 clique ficam no Confina+, em Compras. As dietas {vinculo.fornecedor.nome} estão em Dietas.
        </div>
      )}
      <div className="card">
        <PedidosCliente vinculo={vinculo} pedidos={pedidos} onAlterado={() => recarregarPedidos()} />
      </div>
    </div>
  )
}
