import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import * as core from '@/core/estoque'
import type { IngredienteOpcao, ResumoIngrediente, RegistrarEntradaIngredienteInput } from '@/core/estoque'
import type { CompraIngrediente } from '@/types'

export {
  recalcularTodosPeriodosIngrediente, kgMsDaEntrada,
  type IngredienteOpcao, type ResumoIngrediente,
} from '@/core/estoque'

// ─── Compras de ingredientes (ração feita na fazenda) ─────────────────────
// Regras completas (kardex, custo médio, % MS) em src/core/estoque.ts,
// compartilhado com o servidor MCP. Aqui fica o estado do React.

export function useComprasIngrediente() {
  const { user } = useAuth()
  const [entradas, setEntradas] = useState<CompraIngrediente[]>([])
  const [ingredientes, setIngredientes] = useState<IngredienteOpcao[]>([])
  const [fornecedores, setFornecedores] = useState<Array<{ id: string; nome: string }>>([])
  const [resumos, setResumos] = useState<Record<string, ResumoIngrediente>>({})
  const [loading, setLoading] = useState(true)
  const [calculando, setCalculando] = useState(false)

  const fetch = useCallback(async () => {
    if (!user) { setLoading(false); return }
    setLoading(true)
    const dados = await core.carregarDadosEstoque(user.id)
    setEntradas(dados.entradas)
    setIngredientes(dados.ingredientes)
    setFornecedores(dados.fornecedores)
    setLoading(false)

    setCalculando(true)
    setResumos(await core.calcularResumos(user.id, dados.entradas))
    setCalculando(false)
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  // Aplica no estado o resultado de uma operação que refez o kardex.
  const aplicar = (r: { entradas?: CompraIngrediente[]; resumos?: Record<string, ResumoIngrediente> }) => {
    if (r.entradas) setEntradas(r.entradas)
    if (r.resumos) setResumos(r.resumos)
  }

  const registrarEntrada = async (input: RegistrarEntradaIngredienteInput): Promise<{ error: string | null }> => {
    if (!user) return { error: 'Não autenticado' }
    setCalculando(true)
    const r = await core.registrarEntradaIngrediente(user.id, input)
    if (r.pctMsAtualizado && input.pct_ms != null) {
      const pctMs = input.pct_ms
      setIngredientes(prev => prev.map(i => i.chave === input.chave ? { ...i, pct_ms: pctMs } : i))
    }
    aplicar(r)
    setCalculando(false)
    return { error: r.error }
  }

  // Ajuste de inventário: grava o saldo contado fisicamente na data (kg
  // natural e % MS do material contado). A partir dela, o saldo em MS parte
  // desse valor; o custo médio não muda.
  const ajustarInventario = async (chave: string, data: string, saldoContadoKg: number, pctMs: number | null, observacoes?: string): Promise<{ error: string | null }> => {
    if (!user) return { error: 'Não autenticado' }
    setCalculando(true)
    const r = await core.ajustarInventarioIngrediente(user.id, chave, data, saldoContadoKg, pctMs, observacoes)
    aplicar(r)
    setCalculando(false)
    return { error: r.error }
  }

  const excluirEntrada = async (entrada: CompraIngrediente): Promise<{ error: string | null }> => {
    if (!user) return { error: 'Não autenticado' }
    setCalculando(true)
    const r = await core.excluirEntradaIngrediente(user.id, entrada)
    setCalculando(false)
    if (r.semChave) { await fetch(); return { error: null } }
    aplicar(r)
    return { error: r.error }
  }

  return { entradas, ingredientes, fornecedores, resumos, loading, calculando, registrarEntrada, ajustarInventario, excluirEntrada, refetch: fetch }
}

// Custo médio vigente hoje de cada ingrediente com estoque (R$/kg de MS) —
// usado na tela Dietas para mostrar o custo com o preço do estoque.
export function usePrecosEstoqueHoje() {
  const { user } = useAuth()
  const [precos, setPrecos] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!user) return
    let ativo = true
    ;(async () => {
      const p = await core.precosEstoqueHoje(user.id)
      if (ativo) setPrecos(p)
    })()
    return () => { ativo = false }
  }, [user])

  return precos
}
