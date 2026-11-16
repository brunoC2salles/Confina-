import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import {
  carregarVinculoCliente, carregarPedidosCliente, atualizarResumoCliente,
  type VinculoCliente, type PedidoFornecedor, type EstoqueCliente,
} from '@/core/parceiros'

// Vínculo do produtor com um fornecedor (cooperativa), estoque dos produtos
// do fornecedor e pedidos. O estoque é recalculado ao abrir e o resumo é
// gravado para o vendedor ver no portal.
export function useParceiroCliente(opcoes?: { calcularEstoque?: boolean }) {
  const { user } = useAuth()
  const calcular = opcoes?.calcularEstoque ?? true
  const [vinculo, setVinculo] = useState<VinculoCliente | null>(null)
  const [pedidos, setPedidos] = useState<PedidoFornecedor[]>([])
  const [estoque, setEstoque] = useState<Record<string, EstoqueCliente>>({})
  const [loading, setLoading] = useState(true)
  const [calculando, setCalculando] = useState(false)

  const recarregarPedidos = useCallback(async (v?: VinculoCliente | null) => {
    const alvo = v ?? vinculo
    if (!alvo) return
    setPedidos(await carregarPedidosCliente(alvo.cliente.id))
  }, [vinculo])

  const recalcular = useCallback(async (v?: VinculoCliente | null) => {
    const alvo = v ?? vinculo
    if (!user || !alvo) return
    setCalculando(true)
    const r = await atualizarResumoCliente(user.id, alvo.cliente, alvo.produtos)
    setEstoque(Object.fromEntries(r.linhas.map(l => [l.produto_id, l])))
    setCalculando(false)
  }, [user, vinculo])

  const carregar = useCallback(async () => {
    if (!user) { setLoading(false); return }
    setLoading(true)
    const v = await carregarVinculoCliente(user.id)
    setVinculo(v)
    setLoading(false)
    if (!v) return
    await recarregarPedidos(v)
    if (calcular) await recalcular(v)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, calcular])

  useEffect(() => { carregar() }, [carregar])

  const alterarJanela = async (dias: number): Promise<{ error: string | null }> => {
    if (!vinculo) return { error: 'Sem vínculo' }
    const { error } = await supabase.from('fornecedor_clientes').update({ janela_consumo_dias: dias }).eq('id', vinculo.cliente.id)
    if (error) return { error: error.message }
    const novo = { ...vinculo, cliente: { ...vinculo.cliente, janela_consumo_dias: dias } }
    setVinculo(novo)
    await recalcular(novo)
    return { error: null }
  }

  return { vinculo, pedidos, estoque, loading, calculando, recarregar: carregar, recarregarPedidos, recalcular, alterarJanela }
}
