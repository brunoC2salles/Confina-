import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { RendimentoFaixa, BonusFaixa } from '@/types'

export function useFaixas() {
  const { user } = useAuth()
  const [rendimentos, setRendimentos] = useState<RendimentoFaixa[]>([])
  const [bonus, setBonus] = useState<BonusFaixa[]>([])

  const fetch = useCallback(async () => {
    if (!user) return
    const [r, b] = await Promise.all([
      supabase.from('rendimento_faixas').select('*').eq('user_id', user.id).order('peso_min'),
      supabase.from('bonus_faixas').select('*').eq('user_id', user.id).order('peso_min'),
    ])
    setRendimentos(r.data ?? [])
    setBonus(b.data ?? [])
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  const salvarRendimentos = async (faixas: RendimentoFaixa[]) => {
    for (const f of faixas) {
      await supabase.from('rendimento_faixas').update({ peso_min: f.peso_min, peso_max: f.peso_max, rendimento_percentual: f.rendimento_percentual }).eq('id', f.id)
    }
    await fetch()
  }

  const salvarBonus = async (faixas: BonusFaixa[]) => {
    for (const f of faixas) {
      await supabase.from('bonus_faixas').update({ peso_min: f.peso_min, peso_max: f.peso_max, bonus_por_kg: f.bonus_por_kg }).eq('id', f.id)
    }
    await fetch()
  }

  return { rendimentos, bonus, fetch, salvarRendimentos, salvarBonus }
}
