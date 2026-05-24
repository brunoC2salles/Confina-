import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Lote } from '@/types'

export function useLotes() {
  const { user } = useAuth()
  const [lotes, setLotes] = useState<Lote[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase.from('lotes').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    setLotes(data ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  const criarLote = async (input: { nome_lote: string; codigo_lote: string; ciclo_inicial: number }) => {
    if (!user) return { error: 'Não autenticado' }
    const { error } = await supabase.from('lotes').insert({ ...input, ciclo_atual: input.ciclo_inicial, user_id: user.id })
    if (!error) await fetch()
    return { error: error?.message ?? null }
  }

  const atualizarLote = async (id: string, updates: Partial<Lote>) => {
    const { error } = await supabase.from('lotes').update(updates).eq('id', id)
    if (!error) await fetch()
    return { error: error?.message ?? null }
  }

  const encerrarLote = async (id: string) => atualizarLote(id, { status: 'encerrado' })
  const avancarCiclo = async (id: string, ciclo: number) => atualizarLote(id, { ciclo_atual: ciclo })

  const bifurcarLote = async (input: {
    lote_origem_id: string; nome_lote: string; codigo_lote: string
    ciclo_inicial: number; animal_ids: string[]
  }) => {
    if (!user) return { error: 'Não autenticado' }
    const { data: novoLote, error: e1 } = await supabase.from('lotes').insert({
      nome_lote: input.nome_lote, codigo_lote: input.codigo_lote,
      ciclo_inicial: input.ciclo_inicial, ciclo_atual: input.ciclo_inicial,
      lote_origem_id: input.lote_origem_id, user_id: user.id,
    }).select().single()
    if (e1) return { error: e1.message }
    await supabase.from('animais').update({ lote_atual_id: novoLote.id }).in('id', input.animal_ids)
    await supabase.from('movimentacoes_animais').insert(input.animal_ids.map(aid => ({
      animal_id: aid, tipo: 'bifurcacao', lote_origem_id: input.lote_origem_id,
      lote_destino_id: novoLote.id, data: new Date().toISOString().split('T')[0], user_id: user.id,
    })))
    await fetch()
    return { error: null, lote: novoLote }
  }

  return {
    lotes, loading, fetch,
    lotesAtivos: lotes.filter(l => l.status === 'ativo'),
    lotesEncerrados: lotes.filter(l => l.status === 'encerrado'),
    criarLote, atualizarLote, encerrarLote, avancarCiclo, bifurcarLote,
  }
}
