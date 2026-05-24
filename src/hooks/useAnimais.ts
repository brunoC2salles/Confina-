import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Animal, Movimentacao, Pesagem } from '@/types'

export function useAnimais(loteId?: string) {
  const { user } = useAuth()
  const [animais, setAnimais] = useState<Animal[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user) return
    setLoading(true)
    let q = supabase.from('animais').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    if (loteId) q = q.eq('lote_atual_id', loteId)
    const { data } = await q
    setAnimais(data ?? [])
    setLoading(false)
  }, [user, loteId])

  useEffect(() => { fetch() }, [fetch])

  const adicionarAnimal = async (input: {
    identificacao: string; peso_entrada: number; data_entrada: string
    origem?: string; raca?: string; idade_estimada?: number
    valor_compra: number; lote_atual_id: string; observacoes?: string
  }) => {
    if (!user) return { error: 'Não autenticado' }
    const { data, error } = await supabase.from('animais').insert({ ...input, user_id: user.id }).select().single()
    if (error) return { error: error.message }
    await supabase.from('movimentacoes_animais').insert({
      animal_id: data.id, tipo: 'entrada', lote_destino_id: input.lote_atual_id,
      data: input.data_entrada, peso: input.peso_entrada,
      observacoes: input.observacoes ?? null, user_id: user.id,
    })
    await fetch()
    return { error: null }
  }

  const registrarPesagem = async (input: { animal_id: string; peso: number; data: string; observacoes?: string }) => {
    if (!user) return { error: 'Não autenticado' }
    const { error } = await supabase.from('pesagens').insert({ ...input, user_id: user.id })
    return { error: error?.message ?? null }
  }

  const buscarPesagens = async (animalId: string): Promise<Pesagem[]> => {
    const { data } = await supabase.from('pesagens').select('*').eq('animal_id', animalId).order('data', { ascending: false })
    return data ?? []
  }

  const buscarMovimentacoes = async (animalId: string): Promise<Movimentacao[]> => {
    const { data } = await supabase.from('movimentacoes_animais').select('*').eq('animal_id', animalId).order('data', { ascending: true })
    return data ?? []
  }

  const buscarCustosVariaveis = async (animalId: string) => {
    const { data } = await supabase.from('custos_variaveis_animal').select('*').eq('animal_id', animalId)
    return data ?? []
  }

  const adicionarCustoVariavel = async (input: { animal_id: string; descricao: string; valor: number; data_lancamento: string }) => {
    if (!user) return { error: 'Não autenticado' }
    const { error } = await supabase.from('custos_variaveis_animal').insert({ ...input, user_id: user.id })
    return { error: error?.message ?? null }
  }

  const registrarSaida = async (input: {
    animal_id: string
    tipo: 'saida_venda' | 'saida_abate' | 'saida_transferencia' | 'saida_morte'
    data: string; peso_final: number; valor?: number
    destino_tipo?: string; destino_id?: string; observacoes?: string
    comissoes?: Array<{ tipo: string; parceiro_id?: string; descricao?: string; percentual: number; valor_calculado: number }>
    encargos?: Array<{ descricao: string; base_calculo: string; percentual?: number; valor_fixo?: number; valor_calculado: number }>
  }) => {
    if (!user) return { error: 'Não autenticado' }
    const statusMap = { saida_venda: 'vendido', saida_abate: 'abatido', saida_transferencia: 'transferido', saida_morte: 'morto' } as const
    await supabase.from('animais').update({ status: statusMap[input.tipo], lote_atual_id: null }).eq('id', input.animal_id)
    const { data: mov, error } = await supabase.from('movimentacoes_animais').insert({
      animal_id: input.animal_id, tipo: input.tipo, data: input.data, peso: input.peso_final,
      valor: input.valor ?? null, destino_tipo: input.destino_tipo ?? null,
      destino_id: input.destino_id ?? null, observacoes: input.observacoes ?? null, user_id: user.id,
    }).select().single()
    if (error) return { error: error.message }
    if (input.comissoes?.length) {
      await supabase.from('comissoes_venda').insert(input.comissoes.map(c => ({ ...c, movimentacao_id: mov.id, user_id: user.id })))
    }
    if (input.encargos?.length) {
      await supabase.from('encargos_venda').insert(input.encargos.map(e => ({ ...e, movimentacao_id: mov.id, user_id: user.id })))
    }
    await fetch()
    return { error: null }
  }

  return {
    animais, loading, fetch,
    animaisAtivos: animais.filter(a => a.status === 'ativo'),
    adicionarAnimal, registrarPesagem, buscarPesagens,
    buscarMovimentacoes, buscarCustosVariaveis,
    adicionarCustoVariavel, registrarSaida,
  }
}
