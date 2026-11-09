import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import type { RendimentoFaixa, BonusFaixa } from '@/types'
import * as core from '@/core/cadastros'

// Operações em src/core/cadastros.ts (compartilhado com o servidor MCP).
export function useFaixas() {
  const { user } = useAuth()
  const [rendimentos, setRendimentos] = useState<RendimentoFaixa[]>([])
  const [bonus, setBonus] = useState<BonusFaixa[]>([])

  const fetch = useCallback(async () => {
    if (!user) return
    const r = await core.listarFaixas(user.id)
    setRendimentos(r.rendimentos)
    setBonus(r.bonus)
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  const salvarRendimentos = async (faixas: RendimentoFaixa[]) => {
    await core.salvarRendimentos(faixas)
    await fetch()
  }

  const salvarBonus = async (faixas: BonusFaixa[]) => {
    await core.salvarBonus(faixas)
    await fetch()
  }

  return { rendimentos, bonus, fetch, salvarRendimentos, salvarBonus }
}
