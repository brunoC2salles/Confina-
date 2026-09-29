// ─── Carregamento de composição de dietas e períodos de custo de ingrediente ─
// Funções de leitura compartilhadas pelo motor de custo (useLotes.ts), pelos
// Grupos de Consumo (conversão da compra para kg de MS) e pela tela de
// Compras (estoque de ingredientes). Ficam fora dos hooks para não criar
// importação circular entre eles.

import { supabase } from './supabase'
import {
  chaveIngrediente,
  type DietaComposicaoInfo, type ComponenteCustoInfo, type PeriodoCustoIngredienteInfo,
} from './custoIngrediente'

const SELECT_DIETA_COMPOSICAO = `
  id, pct_consumo_pv_ms, pct_concentrado, pct_volumoso, custo_manual_ativo,
  componentes:componentes_dieta(
    tipo, origem_ingrediente, insumo_id, ingrediente_produtor_id, pct_participacao, preco_kg, pct_ms_manual,
    insumo:insumos_padrao(pct_ms),
    ingrediente_produtor:ingredientes_produtor(pct_ms)
  )
`

interface DietaComposicaoRow {
  id: string
  pct_consumo_pv_ms: number | null
  pct_concentrado: number | null
  pct_volumoso: number | null
  custo_manual_ativo: boolean | null
  componentes: Array<{
    tipo: string | null
    origem_ingrediente: string | null
    insumo_id: string | null
    ingrediente_produtor_id: string | null
    pct_participacao: number | null
    preco_kg: number | null
    pct_ms_manual: number | null
    insumo: { pct_ms: number | null } | null
    ingrediente_produtor: { pct_ms: number | null } | null
  }> | null
}

function montarComposicao(row: DietaComposicaoRow): DietaComposicaoInfo {
  const componentes: ComponenteCustoInfo[] = (row.componentes ?? []).map(c => {
    const pctMsIngrediente = c.origem_ingrediente === 'insumo_padrao' ? (c.insumo?.pct_ms ?? null) : (c.ingrediente_produtor?.pct_ms ?? null)
    return {
      tipo: c.tipo === 'volumoso' ? 'volumoso' : 'concentrado',
      chave: chaveIngrediente(c.origem_ingrediente, c.insumo_id, c.ingrediente_produtor_id),
      pct_participacao: c.pct_participacao,
      pct_ms: c.pct_ms_manual != null ? c.pct_ms_manual : pctMsIngrediente,
      preco_kg: c.preco_kg,
    }
  })
  return {
    pct_consumo_pv_ms: row.pct_consumo_pv_ms,
    pct_concentrado: row.pct_concentrado,
    pct_volumoso: row.pct_volumoso,
    custo_manual_ativo: !!row.custo_manual_ativo,
    componentes,
  }
}

// Composição das dietas pedidas (dieta_id -> composição).
export async function carregarComposicaoDietas(dietaIds: string[]): Promise<Record<string, DietaComposicaoInfo>> {
  const resultado: Record<string, DietaComposicaoInfo> = {}
  const ids = Array.from(new Set(dietaIds.filter(Boolean)))
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150)
    const { data } = await supabase.from('dietas').select(SELECT_DIETA_COMPOSICAO).in('id', chunk)
    for (const row of (data ?? []) as unknown as DietaComposicaoRow[]) resultado[row.id] = montarComposicao(row)
  }
  return resultado
}

// Composição de todas as dietas do usuário.
export async function carregarComposicaoDietasDoUsuario(userId: string): Promise<Record<string, DietaComposicaoInfo>> {
  const resultado: Record<string, DietaComposicaoInfo> = {}
  const { data } = await supabase.from('dietas').select(SELECT_DIETA_COMPOSICAO).eq('user_id', userId)
  for (const row of (data ?? []) as unknown as DietaComposicaoRow[]) resultado[row.id] = montarComposicao(row)
  return resultado
}

// Períodos de custo médio de todos os ingredientes do usuário, por chave.
export async function carregarPeriodosIngrediente(userId: string): Promise<Record<string, PeriodoCustoIngredienteInfo[]>> {
  const resultado: Record<string, PeriodoCustoIngredienteInfo[]> = {}
  const tamanho = 1000
  for (let from = 0; ; from += tamanho) {
    const { data, error } = await supabase.from('compras_ingrediente_periodos')
      .select('origem_ingrediente, insumo_id, ingrediente_produtor_id, vigente_desde, vigente_ate, custo_medio_kg')
      .eq('user_id', userId).order('vigente_desde').range(from, from + tamanho - 1)
    if (error || !data) break
    for (const p of data as Array<{ origem_ingrediente: string; insumo_id: string | null; ingrediente_produtor_id: string | null; vigente_desde: string; vigente_ate: string | null; custo_medio_kg: number }>) {
      const chave = chaveIngrediente(p.origem_ingrediente, p.insumo_id, p.ingrediente_produtor_id)
      if (!chave) continue
      ;(resultado[chave] ??= []).push({ vigente_desde: p.vigente_desde, vigente_ate: p.vigente_ate, custo_medio_kg: Number(p.custo_medio_kg) })
    }
    if (data.length < tamanho) break
  }
  return resultado
}

// kg de MS de uma compra de dieta pronta: usa a % MS informada na compra;
// sem ela (compras antigas), a % MS calculada pela dieta; sem as duas, 100%.
export function kgMsDaCompraGrupo(quantidadeKg: number, pctMsCompra: number | null | undefined, pctMsDieta: number | null): number {
  const pct = pctMsCompra != null ? pctMsCompra : (pctMsDieta != null ? pctMsDieta : 100)
  return quantidadeKg * (pct / 100)
}
