import { useState, useEffect, useCallback } from 'react'
import { useEstadoCache, useCarregando } from '@/lib/cacheTela'
import { useAuth } from '@/contexts/AuthContext'
import type { InsumoPadrao, IngredienteProdutor } from '@/hooks/useDietas'
import * as core from '@/core/cadastros'
import type { PrecoProdutor } from '@/core/cadastros'

export type { PrecoProdutor } from '@/core/cadastros'

// Operações em src/core/cadastros.ts (compartilhado com o servidor MCP).
export function useIngredientesProdutor() {
  const { user } = useAuth()
  const _k = user ? `useIngredientesProdutor:${user.id}` : null
  const [ingredientes, setIngredientes] = useEstadoCache<IngredienteProdutor[]>(_k && `${_k}:ingredientes`, [])
  const [insumosPadrao, setInsumosPadrao] = useEstadoCache<InsumoPadrao[]>(_k && `${_k}:insumosPadrao`, [])
  const [precos, setPrecos] = useEstadoCache<PrecoProdutor[]>(_k && `${_k}:precos`, [])
  const [loading, setLoading] = useCarregando(_k && `${_k}:ingredientes`)

  const fetchAll = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const r = await core.listarIngredientesEPrecos(user.id)
    setIngredientes(r.ingredientes)
    setInsumosPadrao(r.insumosPadrao)
    setPrecos(r.precos)
    setLoading(false)
  }, [user])

  useEffect(() => { fetchAll() }, [fetchAll])

  const precoDoInsumo = (insumo_id: string): number | null => {
    const p = precos.find(x => x.insumo_id === insumo_id)
    return p ? p.preco_kg : null
  }

  const criarIngrediente = async (input: {
    nome: string
    categoria: string
    pct_ms: number | null
    preco_kg: number
  }) => {
    if (!user) return { error: 'Não autenticado' }
    const res = await core.criarIngrediente(user.id, input)
    if (!res.error) await fetchAll()
    return res
  }

  const atualizarIngrediente = async (id: string, input: Partial<{
    nome: string
    categoria: string
    pct_ms: number | null
    preco_kg: number
    ativo: boolean
  }>) => {
    const res = await core.atualizarIngrediente(id, input)
    if (!res.error) await fetchAll()
    return res
  }

  const excluirIngrediente = async (id: string) => {
    const res = await core.excluirIngrediente(id)
    if (!res.error) await fetchAll()
    return res
  }

  const upsertPrecoProdutor = async (insumo_id: string, preco_kg: number) => {
    if (!user) return { error: 'Não autenticado' }
    const res = await core.upsertPrecoProdutor(user.id, insumo_id, preco_kg, precos)
    if (!res.error) await fetchAll()
    return res
  }

  const removerPrecoProdutor = async (insumo_id: string) => {
    if (!user) return { error: 'Não autenticado' }
    const res = await core.removerPrecoProdutor(user.id, insumo_id, precos)
    if (res.semAlteracao) return { error: null }
    if (!res.error) await fetchAll()
    return { error: res.error }
  }

  return {
    ingredientes, insumosPadrao, precos, loading,
    fetchAll, precoDoInsumo,
    criarIngrediente, atualizarIngrediente, excluirIngrediente,
    upsertPrecoProdutor, removerPrecoProdutor,
  }
}
