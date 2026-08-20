import { useState, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { CompraMedicamento } from '@/types'
import { buscarTudoPaginado, chunkArray } from './useLotes'

// ─── Compras de medicamento (ou insumo similar) rateadas por cabeça ─────────
//
// Diferente das compras de ração (useGruposConsumoRacao, rateio por consumo
// teórico da dieta, dentro de um grupo de lotes escolhido), aqui o rateio é
// simples: valor_total / quantidade de animais ATIVOS que estejam no ciclo
// alvo na data de aplicação — cruzando QUALQUER lote (todo o rebanho). É
// fixo: calculado uma única vez no lançamento e gravado por animal em
// custos_variaveis_animal (mesma tabela que já alimenta o custo do animal em
// Ranking, Comparativo, Lotes e no cálculo de venda) — sem recálculo
// automático se a lista de animais do ciclo mudar depois.

const TAMANHO_CHUNK_INSERT = 500

export function useComprasMedicamento() {
  const { user } = useAuth()
  const [compras, setCompras] = useState<CompraMedicamento[]>([])
  const [fornecedores, setFornecedores] = useState<Array<{ id: string; nome: string }>>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const [{ data: comprasData }, { data: parceirosData }] = await Promise.all([
      supabase.from('compras_medicamento').select('*').eq('user_id', user.id).order('data_aplicacao', { ascending: false }),
      supabase.from('parceiros').select('id, nome').eq('user_id', user.id).eq('tipo', 'fornecedor').order('nome'),
    ])
    setCompras((comprasData ?? []) as CompraMedicamento[])
    setFornecedores(parceirosData ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  // Quantos animais ativos existem em cada número de ciclo, cruzando todos
  // os lotes — usado para o seletor de ciclo mostrar "Ciclo 2 — 663 animais"
  // antes do produtor confirmar a compra.
  const distribuicaoPorCiclo = useCallback(async (): Promise<Record<number, number>> => {
    if (!user) return {}
    const linhas = await buscarTudoPaginado<{ ciclo_atual: number }>((from, to) =>
      supabase.from('animais').select('ciclo_atual').eq('user_id', user.id).eq('status', 'ativo').range(from, to))
    const porCiclo: Record<number, number> = {}
    for (const a of linhas) porCiclo[a.ciclo_atual] = (porCiclo[a.ciclo_atual] ?? 0) + 1
    return porCiclo
  }, [user])

  const buscarElegiveis = async (ciclo: number): Promise<string[]> => {
    if (!user) return []
    const linhas = await buscarTudoPaginado<{ id: string }>((from, to) =>
      supabase.from('animais').select('id').eq('user_id', user.id).eq('status', 'ativo').eq('ciclo_atual', ciclo).range(from, to))
    return linhas.map(a => a.id)
  }

  const registrarCompra = async (input: {
    descricao: string; ciclo_alvo: number; data_compra: string; data_aplicacao: string
    valor_total: number; parceiro_id?: string; observacoes?: string
  }): Promise<{ error: string | null; quantidade?: number; valorPorAnimal?: number }> => {
    if (!user) return { error: 'Não autenticado' }
    if (!input.descricao.trim()) return { error: 'Informe a descrição' }
    if (input.valor_total <= 0) return { error: 'Informe o valor total' }

    const animalIds = await buscarElegiveis(input.ciclo_alvo)
    if (animalIds.length === 0) return { error: `Nenhum animal ativo encontrado no ciclo ${input.ciclo_alvo}` }

    const valorPorAnimal = input.valor_total / animalIds.length

    const { data: compra, error: eCompra } = await supabase.from('compras_medicamento').insert({
      descricao: input.descricao, ciclo_alvo: input.ciclo_alvo,
      data_compra: input.data_compra, data_aplicacao: input.data_aplicacao,
      valor_total: input.valor_total, quantidade_animais: animalIds.length, valor_por_animal: valorPorAnimal,
      parceiro_id: input.parceiro_id || null, observacoes: input.observacoes || null,
      user_id: user.id,
    }).select().single()
    if (eCompra) return { error: eCompra.message }

    const linhasCusto = animalIds.map(animal_id => ({
      animal_id, descricao: input.descricao, valor: valorPorAnimal,
      data_lancamento: input.data_aplicacao, compra_medicamento_id: compra.id, user_id: user.id,
    }))
    for (const chunk of chunkArray(linhasCusto, TAMANHO_CHUNK_INSERT)) {
      const { error: eInsert } = await supabase.from('custos_variaveis_animal').insert(chunk)
      if (eInsert) {
        // Falhou no meio da inserção (ex.: mais de 500 animais, 2º lote falhou) —
        // desfaz a compra inteira em vez de deixar o cabeçalho com uma
        // quantidade_animais que não bate com os lançamentos realmente
        // gravados. O CASCADE em compra_medicamento_id remove o que já tiver
        // sido inserido nos lotes anteriores.
        await supabase.from('compras_medicamento').delete().eq('id', compra.id)
        return { error: `Falha ao lançar custo nos animais: ${eInsert.message}. A compra foi desfeita, tente novamente.` }
      }
    }

    await fetch()
    return { error: null, quantidade: animalIds.length, valorPorAnimal }
  }

  const excluirCompra = async (id: string) => {
    // ON DELETE CASCADE em custos_variaveis_animal.compra_medicamento_id remove
    // junto todos os lançamentos por animal gerados por essa compra.
    const { error } = await supabase.from('compras_medicamento').delete().eq('id', id)
    if (!error) await fetch()
    return { error: error?.message ?? null }
  }

  // Quebra por lote dos animais atingidos por uma compra já registrada —
  // mesmo espírito do "ver estatística" das compras de ração.
  const buscarDistribuicaoPorLote = async (compraId: string): Promise<Array<{ lote_id: string; nome_lote: string; codigo_lote: string; quantidade: number }>> => {
    const linhas = await buscarTudoPaginado<{ animal_id: string; animais: { lote_atual_id: string | null; lotes: { nome_lote: string; codigo_lote: string } | null } | null }>((from, to) =>
      supabase.from('custos_variaveis_animal')
        .select('animal_id, animais(lote_atual_id, lotes(nome_lote, codigo_lote))')
        .eq('compra_medicamento_id', compraId).range(from, to) as any)
    const porLote: Record<string, { nome_lote: string; codigo_lote: string; quantidade: number }> = {}
    for (const l of linhas) {
      const loteId = l.animais?.lote_atual_id
      if (!loteId) continue
      if (!porLote[loteId]) {
        porLote[loteId] = { nome_lote: l.animais?.lotes?.nome_lote ?? '—', codigo_lote: l.animais?.lotes?.codigo_lote ?? '—', quantidade: 0 }
      }
      porLote[loteId].quantidade += 1
    }
    return Object.entries(porLote).map(([lote_id, v]) => ({ lote_id, ...v })).sort((a, b) => b.quantidade - a.quantidade)
  }

  return {
    compras, fornecedores, loading,
    distribuicaoPorCiclo, buscarElegiveis, registrarCompra, excluirCompra, buscarDistribuicaoPorLote,
    refetch: fetch,
  }
}
