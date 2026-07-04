import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Parceiro, CustoFixoLote } from '@/types'

export function useParceiros() {
  const { user } = useAuth()
  const [parceiros, setParceiros] = useState<Parceiro[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase.from('parceiros').select('*').eq('user_id', user.id).order('nome')
    setParceiros(data ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  const criarParceiro = async (input: Omit<Parceiro, 'id'|'user_id'|'created_at'|'updated_at'>) => {
    if (!user) return { error: 'Não autenticado' }
    const { error } = await supabase.from('parceiros').insert({ ...input, user_id: user.id })
    if (!error) await fetch()
    return { error: error?.message ?? null }
  }

  const editarParceiro = async (id: string, input: Partial<Omit<Parceiro, 'id'|'user_id'|'created_at'|'updated_at'>>) => {
    const { error } = await supabase.from('parceiros').update(input).eq('id', id)
    if (!error) await fetch()
    return { error: error?.message ?? null }
  }

  const excluirParceiro = async (id: string) => {
    const { error } = await supabase.from('parceiros').delete().eq('id', id)
    if (!error) await fetch()
    return { error: error?.message ?? null }
  }

  return { parceiros, loading, fetch, criarParceiro, editarParceiro, excluirParceiro, porTipo: (t: Parceiro['tipo']) => parceiros.filter(p => p.tipo === t) }
}

export function useCustosLote(loteId: string) {
  const { user } = useAuth()
  const [custos, setCustos] = useState<CustoFixoLote[]>([])

  const fetch = useCallback(async () => {
    if (!user || !loteId) return
    const { data } = await supabase.from('custos_fixos_lote').select('*').eq('lote_id', loteId).eq('user_id', user.id)
    setCustos(data ?? [])
  }, [user, loteId])

  useEffect(() => { fetch() }, [fetch])

  const adicionar = async (input: { descricao: string; recorrencia: string; valor: number; data_lancamento: string }) => {
    if (!user) return { error: 'Não autenticado' }
    const { error } = await supabase.from('custos_fixos_lote').insert({ ...input, lote_id: loteId, user_id: user.id })
    if (!error) await fetch()
    return { error: error?.message ?? null }
  }

  const remover = async (id: string) => {
    await supabase.from('custos_fixos_lote').delete().eq('id', id)
    await fetch()
  }

  const totalMensal = custos.reduce((t, c) => {
    const mult: Record<string, number> = { unico: 0, semanal: 4, quinzenal: 2, mensal: 1 }
    return t + c.valor * (mult[c.recorrencia] ?? 1)
  }, 0)

  return { custos, totalMensal, adicionar, remover }
}
