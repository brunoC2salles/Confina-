import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Parceiro } from '@/types'

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
