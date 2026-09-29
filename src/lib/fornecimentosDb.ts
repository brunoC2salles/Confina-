// ─── Leitura de fornecimentos de ração (Supabase) ──────────────────────────
// Compartilhada pelo motor de custo (useLotes.ts), pelos grupos de consumo,
// pelo estoque de ingredientes e pela tela de Compras. Fica fora dos hooks
// para não criar importação circular entre eles.

import { supabase } from './supabase'
import { chaveIngrediente } from './custoIngrediente'
import type { FornecimentoInfo, ModoFornecimento } from './fornecimentoRacao'

const SELECT_FORNECIMENTO = `
  id, data, dieta_id, modo, grupo_id, kg_total, pct_ms, observacoes, created_at,
  itens:fornecimentos_racao_itens(origem_ingrediente, insumo_id, ingrediente_produtor_id, tipo, kg, pct_ms, preco_kg_referencia),
  lotes:fornecimentos_racao_lotes(lote_id, fracao, consumo_previsto_ms_kg)
`

export interface FornecimentoCompleto extends FornecimentoInfo {
  observacoes: string | null
  created_at: string
  lotesDetalhe: Array<{ lote_id: string; fracao: number; consumo_previsto_ms_kg: number }>
}

interface FornecimentoRow {
  id: string
  data: string
  dieta_id: string
  modo: ModoFornecimento
  grupo_id: string | null
  kg_total: number
  pct_ms: number | null
  observacoes: string | null
  created_at: string
  itens: Array<{
    origem_ingrediente: string; insumo_id: string | null; ingrediente_produtor_id: string | null
    tipo: string; kg: number; pct_ms: number; preco_kg_referencia: number
  }> | null
  lotes: Array<{ lote_id: string; fracao: number; consumo_previsto_ms_kg: number }> | null
}

function montar(row: FornecimentoRow): FornecimentoCompleto {
  const itens = (row.itens ?? []).flatMap(i => {
    const chave = chaveIngrediente(i.origem_ingrediente, i.insumo_id, i.ingrediente_produtor_id)
    if (!chave) return []
    return [{
      chave,
      tipo: (i.tipo === 'volumoso' ? 'volumoso' : 'concentrado') as 'concentrado' | 'volumoso',
      kg: Number(i.kg),
      pct_ms: Number(i.pct_ms),
      preco_kg_referencia: Number(i.preco_kg_referencia),
    }]
  })
  const lotes = (row.lotes ?? []).map(l => ({ lote_id: l.lote_id, fracao: Number(l.fracao), consumo_previsto_ms_kg: Number(l.consumo_previsto_ms_kg) }))
  return {
    id: row.id,
    data: row.data,
    dieta_id: row.dieta_id,
    modo: row.modo,
    grupo_id: row.grupo_id,
    kg_total: Number(row.kg_total),
    pct_ms: row.pct_ms != null ? Number(row.pct_ms) : null,
    observacoes: row.observacoes,
    created_at: row.created_at,
    itens,
    lotes: lotes.map(l => ({ lote_id: l.lote_id, fracao: l.fracao })),
    lotesDetalhe: lotes,
  }
}

async function carregarPorIds(ids: string[]): Promise<FornecimentoCompleto[]> {
  const unicos = Array.from(new Set(ids))
  const resultado: FornecimentoCompleto[] = []
  for (let i = 0; i < unicos.length; i += 150) {
    const chunk = unicos.slice(i, i + 150)
    const { data } = await supabase.from('fornecimentos_racao').select(SELECT_FORNECIMENTO).in('id', chunk)
    for (const row of (data ?? []) as unknown as FornecimentoRow[]) resultado.push(montar(row))
  }
  return resultado
}

// Todos os fornecimentos do usuário, mais recentes primeiro.
export async function carregarFornecimentosDoUsuario(userId: string): Promise<FornecimentoCompleto[]> {
  const resultado: FornecimentoCompleto[] = []
  const tamanho = 1000
  for (let from = 0; ; from += tamanho) {
    const { data, error } = await supabase.from('fornecimentos_racao').select(SELECT_FORNECIMENTO)
      .eq('user_id', userId).order('data', { ascending: false }).order('created_at', { ascending: false })
      .range(from, from + tamanho - 1)
    if (error || !data) break
    for (const row of data as unknown as FornecimentoRow[]) resultado.push(montar(row))
    if (data.length < tamanho) break
  }
  return resultado
}

// Fornecimentos que incluem algum dos lotes pedidos.
export async function carregarFornecimentosDosLotes(loteIds: string[]): Promise<FornecimentoCompleto[]> {
  const ids = Array.from(new Set(loteIds.filter(Boolean)))
  if (ids.length === 0) return []
  const fornecimentoIds: string[] = []
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150)
    const tamanho = 1000
    for (let from = 0; ; from += tamanho) {
      const { data, error } = await supabase.from('fornecimentos_racao_lotes').select('fornecimento_id')
        .in('lote_id', chunk).range(from, from + tamanho - 1)
      if (error || !data) break
      for (const r of data as Array<{ fornecimento_id: string }>) fornecimentoIds.push(r.fornecimento_id)
      if (data.length < tamanho) break
    }
  }
  return carregarPorIds(fornecimentoIds)
}

// Fornecimentos de mistura pronta que baixam do estoque dos grupos pedidos.
export async function carregarFornecimentosDosGrupos(grupoIds: string[]): Promise<FornecimentoCompleto[]> {
  const ids = Array.from(new Set(grupoIds.filter(Boolean)))
  if (ids.length === 0) return []
  const fornecimentoIds: string[] = []
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150)
    const { data } = await supabase.from('fornecimentos_racao').select('id').in('grupo_id', chunk)
    for (const r of (data ?? []) as Array<{ id: string }>) fornecimentoIds.push(r.id)
  }
  return carregarPorIds(fornecimentoIds)
}
