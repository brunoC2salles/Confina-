import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import type { Parceiro } from '@/types'
import * as core from '@/core/cadastros'

// Operações em src/core/cadastros.ts (compartilhado com o servidor MCP).
export function useParceiros() {
  const { user } = useAuth()
  const [parceiros, setParceiros] = useState<Parceiro[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setParceiros(await core.listarParceiros(user.id))
    setLoading(false)
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  const criarParceiro = async (input: Omit<Parceiro, 'id'|'user_id'|'created_at'|'updated_at'>) => {
    if (!user) return { error: 'Não autenticado' }
    const res = await core.criarParceiro(user.id, input)
    if (!res.error) await fetch()
    return res
  }

  const editarParceiro = async (id: string, input: Partial<Omit<Parceiro, 'id'|'user_id'|'created_at'|'updated_at'>>) => {
    const res = await core.editarParceiro(id, input)
    if (!res.error) await fetch()
    return res
  }

  const excluirParceiro = async (id: string) => {
    const res = await core.excluirParceiro(id)
    if (!res.error) await fetch()
    return res
  }

  return { parceiros, loading, fetch, criarParceiro, editarParceiro, excluirParceiro, porTipo: (t: Parceiro['tipo']) => parceiros.filter(p => p.tipo === t) }
}
