import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Dieta, ComponenteAlimentar, Parceiro, CustoFixoLote } from '@/types'

export function useDietas() {
  const { user } = useAuth()
  const [dietas, setDietas] = useState<Dieta[]>([])
  const [componentes, setComponentes] = useState<ComponenteAlimentar[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const [d, c] = await Promise.all([
      supabase.from('dietas').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('componentes_alimentares').select('*').eq('user_id', user.id).order('nome'),
    ])
    setDietas(d.data ?? [])
    setComponentes(c.data ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  const criarDieta = async (input: Omit<Dieta, 'id'|'user_id'|'created_at'|'updated_at'>) => {
    if (!user) return { error: 'Não autenticado' }
    const { error } = await supabase.from('dietas').insert({ ...input, user_id: user.id })
    if (!error) await fetch()
    return { error: error?.message ?? null }
  }

  const excluirDieta = async (id: string) => {
    const { error } = await supabase.from('dietas').delete().eq('id', id)
    if (!error) await fetch()
    return { error: error?.message ?? null }
  }

  const criarComponente = async (input: { nome: string; preco_atual: number; unidade?: string }) => {
    if (!user) return { error: 'Não autenticado' }
    const { error } = await supabase.from('componentes_alimentares').insert({ ...input, unidade: input.unidade ?? 'kg', user_id: user.id })
    if (!error) await fetch()
    return { error: error?.message ?? null }
  }

  const atualizarComponente = async (id: string, preco_atual: number) => {
    const { error } = await supabase.from('componentes_alimentares').update({ preco_atual }).eq('id', id)
    if (!error) await fetch()
    return { error: error?.message ?? null }
  }

  const aplicarDietaLote = async (input: { lote_id: string; dieta_id: string; ciclo: number; data_inicio: string }) => {
    if (!user) return { error: 'Não autenticado' }
    await supabase.from('dietas_lote').update({ ativa: false, data_fim: input.data_inicio }).eq('lote_id', input.lote_id).eq('ciclo', input.ciclo).eq('ativa', true)
    const { error } = await supabase.from('dietas_lote').insert({ ...input, user_id: user.id })
    return { error: error?.message ?? null }
  }

  const buscarDietaAtiva = async (loteId: string, ciclo: number): Promise<Dieta | null> => {
    const { data } = await supabase.from('dietas_lote').select('dieta_id').eq('lote_id', loteId).eq('ciclo', ciclo).eq('ativa', true).single()
    if (!data) return null
    const { data: dieta } = await supabase.from('dietas').select('*').eq('id', data.dieta_id).single()
    return dieta
  }

  return { dietas, componentes, loading, fetch, criarDieta, excluirDieta, criarComponente, atualizarComponente, aplicarDietaLote, buscarDietaAtiva, templates: dietas.filter(d => d.is_template) }
}

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

  const excluirParceiro = async (id: string) => {
    const { error } = await supabase.from('parceiros').delete().eq('id', id)
    if (!error) await fetch()
    return { error: error?.message ?? null }
  }

  return { parceiros, loading, fetch, criarParceiro, excluirParceiro, porTipo: (t: Parceiro['tipo']) => parceiros.filter(p => p.tipo === t) }
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
