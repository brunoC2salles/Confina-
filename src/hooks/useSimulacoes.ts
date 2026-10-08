import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { SimDados } from '@/lib/simulador'

export interface Simulacao {
  id: string
  nome: string
  dados: SimDados
  created_at: string
  updated_at: string
}

// Tabela ainda não criada no banco (SQL de supabase/simulacoes.sql não rodado).
function erroTabelaAusente(e: { code?: string; message?: string } | null): boolean {
  if (!e) return false
  const msg = e.message ?? ''
  return e.code === '42P01' || e.code === 'PGRST205' || (/simulacoes/.test(msg) && /(does not exist|could not find)/i.test(msg))
}

export function useSimulacoes() {
  const { user } = useAuth()
  const [simulacoes, setSimulacoes] = useState<Simulacao[]>([])
  const [loading, setLoading] = useState(true)
  const [tabelaAusente, setTabelaAusente] = useState(false)

  const fetchSimulacoes = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data, error } = await supabase
      .from('simulacoes').select('id, nome, dados, created_at, updated_at')
      .eq('user_id', user.id).order('updated_at', { ascending: false })
    setTabelaAusente(erroTabelaAusente(error))
    setSimulacoes((data ?? []) as Simulacao[])
    setLoading(false)
  }, [user])

  useEffect(() => { fetchSimulacoes() }, [fetchSimulacoes])

  const criarSimulacao = async (nome: string, dados: SimDados) => {
    if (!user) return { error: 'Não autenticado', id: null as string | null }
    const { data, error } = await supabase.from('simulacoes')
      .insert({ nome, dados, user_id: user.id }).select('id').single()
    if (error) return { error: error.message, id: null }
    await fetchSimulacoes()
    return { error: null, id: (data as { id: string }).id }
  }

  const salvarSimulacao = async (id: string, nome: string, dados: SimDados) => {
    const { error } = await supabase.from('simulacoes')
      .update({ nome, dados, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) return { error: error.message }
    await fetchSimulacoes()
    return { error: null }
  }

  const excluirSimulacao = async (id: string) => {
    const { error } = await supabase.from('simulacoes').delete().eq('id', id)
    if (error) return { error: error.message }
    await fetchSimulacoes()
    return { error: null }
  }

  return { simulacoes, loading, tabelaAusente, criarSimulacao, salvarSimulacao, excluirSimulacao }
}
