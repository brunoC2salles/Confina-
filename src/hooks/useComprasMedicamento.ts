import { useState, useCallback, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import type { CompraMedicamento } from '@/types'
import * as core from '@/core/comprasRateio'
import type { RegistrarCompraRateioInput } from '@/core/comprasRateio'

// ─── Compras de medicamento (ou insumo similar) rateadas por cabeça ─────────
//
// Diferente das compras de ração (useGruposConsumoRacao, rateio por consumo
// teórico da dieta, dentro de um grupo de lotes escolhido), aqui o rateio é
// simples: valor_total / quantidade de animais ATIVOS que estejam no ciclo
// alvo na data de aplicação — cruzando QUALQUER lote (todo o rebanho). É
// fixo: calculado uma única vez no lançamento e gravado por animal em
// custos_variaveis_animal (mesma tabela que já alimenta o custo do animal em
// Ranking, Comparativo, Lotes e no cálculo de venda) — sem recálculo
// automático se a lista de animais do ciclo mudar depois.
// Regras completas em src/core/comprasRateio.ts (compartilhado com o MCP).

export function useComprasMedicamento() {
  const { user } = useAuth()
  const [compras, setCompras] = useState<CompraMedicamento[]>([])
  const [fornecedores, setFornecedores] = useState<Array<{ id: string; nome: string }>>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const r = await core.listarComprasRateio<CompraMedicamento>('medicamento', user.id)
    setCompras(r.compras)
    setFornecedores(r.fornecedores)
    setLoading(false)
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  // Quantos animais ativos existem em cada número de ciclo, cruzando todos
  // os lotes — usado para o seletor de ciclo mostrar "Ciclo 2 — 663 animais"
  // antes do produtor confirmar a compra.
  const distribuicaoPorCiclo = useCallback(async (): Promise<Record<number, number>> => {
    if (!user) return {}
    return core.distribuicaoAtivosPorCiclo(user.id)
  }, [user])

  const buscarElegiveis = async (ciclo: number): Promise<string[]> => {
    if (!user) return []
    return core.buscarAnimaisElegiveisCiclo(user.id, ciclo)
  }

  const registrarCompra = async (input: RegistrarCompraRateioInput): Promise<{ error: string | null; quantidade?: number; valorPorAnimal?: number }> => {
    if (!user) return { error: 'Não autenticado' }
    const res = await core.registrarCompraRateio('medicamento', user.id, input)
    if (!res.error) await fetch()
    return res
  }

  const excluirCompra = async (id: string) => {
    const res = await core.excluirCompraRateio('medicamento', id)
    if (!res.error) await fetch()
    return res
  }

  // Quebra por lote dos animais atingidos por uma compra já registrada —
  // mesmo espírito do "ver estatística" das compras de ração.
  const buscarDistribuicaoPorLote = (compraId: string) => core.distribuicaoCompraRateioPorLote('medicamento', compraId)

  return {
    compras, fornecedores, loading,
    distribuicaoPorCiclo, buscarElegiveis, registrarCompra, excluirCompra, buscarDistribuicaoPorLote,
    refetch: fetch,
  }
}
