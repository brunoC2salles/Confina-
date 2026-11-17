import { useState, useEffect, useCallback } from 'react'
import { useEstadoCache, useCarregando } from '@/lib/cacheTela'
import { useAuth } from '@/contexts/AuthContext'
import type { DietaComposicaoInfo } from '@/lib/custoIngrediente'
import type { FornecimentoCompleto } from '@/lib/fornecimentosDb'
import * as core from '@/core/fornecimentos'
import type { IngredienteFornecimentoOpcao, IndicadoresLote, RegistrarFornecimentoInput } from '@/core/fornecimentos'

export type { IngredienteFornecimentoOpcao, IndicadoresLote, IndicadoresValores } from '@/core/fornecimentos'

// ─── Fornecimento de ração ─────────────────────────────────────────────────
// Registro da ração efetivamente dada aos lotes (ver fornecimentoRacao.ts),
// divisão automática entre lotes, e o planejado x realizado por lote.
// Regras completas em src/core/fornecimentos.ts (compartilhado com o MCP).

export function useFornecimentosRacao() {
  const { user } = useAuth()
  const _k = user ? `useFornecimentosRacao:${user.id}` : null
  const [fornecimentos, setFornecimentos] = useEstadoCache<FornecimentoCompleto[]>(_k && `${_k}:fornecimentos`, [])
  const [dietas, setDietas] = useEstadoCache<Array<{ id: string; nome: string }>>(_k && `${_k}:dietas`, [])
  const [composicoes, setComposicoes] = useEstadoCache<Record<string, DietaComposicaoInfo>>(_k && `${_k}:composicoes`, {})
  const [lotes, setLotes] = useEstadoCache<Array<{ id: string; nome_lote: string; codigo_lote: string; status: string }>>(_k && `${_k}:lotes`, [])
  const [dietaHojePorLote, setDietaHojePorLote] = useEstadoCache<Record<string, string | null>>(_k && `${_k}:dietaHojePorLote`, {})
  const [grupos, setGrupos] = useEstadoCache<Array<{ id: string; nome: string; dieta_id: string; status: string }>>(_k && `${_k}:grupos`, [])
  const [ingredientes, setIngredientes] = useEstadoCache<IngredienteFornecimentoOpcao[]>(_k && `${_k}:ingredientes`, [])
  const [indicadores, setIndicadores] = useEstadoCache<IndicadoresLote[]>(_k && `${_k}:indicadores`, [])
  const [loading, setLoading] = useCarregando(_k && `${_k}:fornecimentos`)
  const [calculandoIndicadores, setCalculandoIndicadores] = useState(false)

  const fetch = useCallback(async () => {
    if (!user) { setLoading(false); return }
    setLoading(true)
    const dados = await core.carregarDadosFornecimento(user.id)
    setFornecimentos(dados.fornecimentos)
    setComposicoes(dados.composicoes)
    setDietas(dados.dietas)
    setLotes(dados.lotes)
    setDietaHojePorLote(dados.dietaHojePorLote)
    setGrupos(dados.grupos)
    setIngredientes(dados.ingredientes)
    setLoading(false)

    setCalculandoIndicadores(true)
    setIndicadores(await core.calcularIndicadoresFornecimento(user.id, dados.fornecimentos, dados.composicoes))
    setCalculandoIndicadores(false)
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  const registrarFornecimento = async (input: RegistrarFornecimentoInput): Promise<{ error: string | null; divisao?: Array<{ lote_id: string; fracao: number }> }> => {
    if (!user) return { error: 'Não autenticado' }
    const res = await core.registrarFornecimento(user.id, input, composicoes)
    if (res.gravado) await fetch()
    return { error: res.error, divisao: res.divisao }
  }

  const excluirFornecimento = async (f: FornecimentoCompleto): Promise<{ error: string | null }> => {
    if (!user) return { error: 'Não autenticado' }
    const res = await core.excluirFornecimento(user.id, f)
    if (res.gravado) await fetch()
    return { error: res.error }
  }

  return {
    fornecimentos, dietas, composicoes, lotes, dietaHojePorLote, grupos, ingredientes, indicadores,
    loading, calculandoIndicadores, registrarFornecimento, excluirFornecimento, refetch: fetch,
  }
}
