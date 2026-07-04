import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { InsumoPadrao, IngredienteProdutor } from '@/hooks/useDietas'

export interface PrecoProdutor {
  id: string
  user_id: string
  insumo_id: string
  preco_kg: number
}

export function useIngredientesProdutor() {
  const { user } = useAuth()
  const [ingredientes, setIngredientes] = useState<IngredienteProdutor[]>([])
  const [insumosPadrao, setInsumosPadrao] = useState<InsumoPadrao[]>([])
  const [precos, setPrecos] = useState<PrecoProdutor[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const [{ data: ing }, { data: ins }, { data: pr }] = await Promise.all([
      supabase.from('ingredientes_produtor').select('*')
        .eq('user_id', user.id).order('categoria').order('nome'),
      supabase.from('insumos_padrao').select('*')
        .eq('ativo', true).order('categoria').order('nome'),
      supabase.from('precos_produtor').select('*')
        .eq('user_id', user.id),
    ])
    setIngredientes(ing ?? [])
    setInsumosPadrao(ins ?? [])
    setPrecos(pr ?? [])
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
    const { error } = await supabase.from('ingredientes_produtor').insert({
      user_id: user.id,
      nome: input.nome,
      categoria: input.categoria,
      pct_ms: input.pct_ms,
      preco_kg: input.preco_kg,
      ativo: true,
    })
    if (!error) await fetchAll()
    return { error: error?.message ?? null }
  }

  const atualizarIngrediente = async (id: string, input: Partial<{
    nome: string
    categoria: string
    pct_ms: number | null
    preco_kg: number
    ativo: boolean
  }>) => {
    const { error } = await supabase.from('ingredientes_produtor').update(input).eq('id', id)
    if (!error) await fetchAll()
    return { error: error?.message ?? null }
  }

  const excluirIngrediente = async (id: string) => {
    const { error } = await supabase.from('ingredientes_produtor').delete().eq('id', id)
    if (!error) await fetchAll()
    return { error: error?.message ?? null }
  }

  const upsertPrecoProdutor = async (insumo_id: string, preco_kg: number) => {
    if (!user) return { error: 'Não autenticado' }
    const existente = precos.find(p => p.insumo_id === insumo_id)
    if (existente) {
      const { error } = await supabase.from('precos_produtor')
        .update({ preco_kg })
        .eq('id', existente.id)
      if (!error) await fetchAll()
      return { error: error?.message ?? null }
    }
    const { error } = await supabase.from('precos_produtor').insert({
      user_id: user.id, insumo_id, preco_kg,
    })
    if (!error) await fetchAll()
    return { error: error?.message ?? null }
  }

  const removerPrecoProdutor = async (insumo_id: string) => {
    const existente = precos.find(p => p.insumo_id === insumo_id)
    if (!existente) return { error: null }
    const { error } = await supabase.from('precos_produtor').delete().eq('id', existente.id)
    if (!error) await fetchAll()
    return { error: error?.message ?? null }
  }

  return {
    ingredientes, insumosPadrao, precos, loading,
    fetchAll, precoDoInsumo,
    criarIngrediente, atualizarIngrediente, excluirIngrediente,
    upsertPrecoProdutor, removerPrecoProdutor,
  }
}
