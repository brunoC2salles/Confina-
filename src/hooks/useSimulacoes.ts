import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import type { SimDados } from '@/lib/simulador'
import * as core from '@/core/cadastros'
import type { Simulacao } from '@/core/cadastros'

export type { Simulacao } from '@/core/cadastros'

// Operações em src/core/cadastros.ts (compartilhado com o servidor MCP).
export function useSimulacoes() {
  const { user } = useAuth()
  const [simulacoes, setSimulacoes] = useState<Simulacao[]>([])
  const [loading, setLoading] = useState(true)
  const [tabelaAusente, setTabelaAusente] = useState(false)

  const fetchSimulacoes = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const r = await core.listarSimulacoes(user.id)
    setTabelaAusente(r.tabelaAusente)
    setSimulacoes(r.simulacoes)
    setLoading(false)
  }, [user])

  useEffect(() => { fetchSimulacoes() }, [fetchSimulacoes])

  const criarSimulacao = async (nome: string, dados: SimDados) => {
    if (!user) return { error: 'Não autenticado', id: null as string | null }
    const res = await core.criarSimulacao(user.id, nome, dados)
    if (!res.error) await fetchSimulacoes()
    return res
  }

  const salvarSimulacao = async (id: string, nome: string, dados: SimDados) => {
    const res = await core.salvarSimulacao(id, nome, dados)
    if (!res.error) await fetchSimulacoes()
    return res
  }

  const excluirSimulacao = async (id: string) => {
    const res = await core.excluirSimulacao(id)
    if (!res.error) await fetchSimulacoes()
    return res
  }

  return { simulacoes, loading, tabelaAusente, criarSimulacao, salvarSimulacao, excluirSimulacao }
}
