import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { usePortal } from '@/portal/PortalContext'
import type {
  ClienteFornecedor, EstoqueCliente, MembroFornecedor, PedidoFornecedor, ProdutoFornecedor, RotaEntrega,
} from '@/core/parceiros'

// Dados do fornecedor escolhido, já filtrados pelo RLS: o gestor vê toda a
// carteira; o vendedor, só os clientes dele (e os pedidos e estoques deles).
export function useDadosFornecedor() {
  const { fornecedor } = usePortal()
  const [clientes, setClientes] = useState<ClienteFornecedor[]>([])
  const [produtos, setProdutos] = useState<ProdutoFornecedor[]>([])
  const [membros, setMembros] = useState<MembroFornecedor[]>([])
  const [pedidos, setPedidos] = useState<PedidoFornecedor[]>([])
  const [estoque, setEstoque] = useState<EstoqueCliente[]>([])
  const [rotas, setRotas] = useState<RotaEntrega[]>([])
  const [capacidadeKg, setCapacidadeKg] = useState(15000)
  const [loading, setLoading] = useState(true)

  const carregar = useCallback(async () => {
    if (!fornecedor) { setLoading(false); return }
    setLoading(true)
    const fid = fornecedor.id
    const [c, p, m, pe, ro, cfg] = await Promise.all([
      supabase.from('fornecedor_clientes').select('*').eq('fornecedor_id', fid).order('nome_fazenda'),
      supabase.from('fornecedor_produtos').select('*').eq('fornecedor_id', fid).order('nome'),
      supabase.from('fornecedor_membros').select('*').eq('fornecedor_id', fid).order('nome'),
      supabase.from('fornecedor_pedidos').select('*').eq('fornecedor_id', fid).order('created_at', { ascending: false }).limit(1000),
      supabase.from('fornecedor_rotas').select('*').eq('fornecedor_id', fid).order('nome'),
      supabase.from('fornecedor_config').select('capacidade_carga_kg').eq('fornecedor_id', fid).maybeSingle(),
    ])
    const listaClientes = (c.data ?? []) as ClienteFornecedor[]
    let est: EstoqueCliente[] = []
    const ids = listaClientes.map(x => x.id)
    for (let i = 0; i < ids.length; i += 200) {
      const { data } = await supabase.from('fornecedor_estoque').select('*').in('cliente_id', ids.slice(i, i + 200))
      est = est.concat((data ?? []) as EstoqueCliente[])
    }
    setClientes(listaClientes)
    setProdutos((p.data ?? []) as ProdutoFornecedor[])
    setMembros((m.data ?? []) as MembroFornecedor[])
    setPedidos((pe.data ?? []) as PedidoFornecedor[])
    setEstoque(est)
    setRotas((ro.data ?? []) as RotaEntrega[])
    setCapacidadeKg(cfg.data?.capacidade_carga_kg != null ? Number(cfg.data.capacidade_carga_kg) : 15000)
    setLoading(false)
  }, [fornecedor])

  useEffect(() => { carregar() }, [carregar])

  return { fornecedor, clientes, produtos, membros, pedidos, estoque, rotas, capacidadeKg, loading, recarregar: carregar }
}

export const nomeCliente = (c: ClienteFornecedor | undefined) => c ? (c.nome_fazenda || c.responsavel || c.email || 'Cliente') : 'Cliente'
