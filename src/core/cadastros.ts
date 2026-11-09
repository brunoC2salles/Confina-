// ─── Núcleo de cadastros ───────────────────────────────────────────────────────
// Parceiros, faixas de rendimento/bônus, simulações, ingredientes próprios e
// preços do produtor. Compartilhado entre os hooks do app e o servidor MCP.
import { supabase } from './db.js'
import type { Parceiro, RendimentoFaixa, BonusFaixa } from '../types'
import type { SimDados } from '../lib/simulador'
import type { InsumoPadrao, IngredienteProdutor } from './dietas'

// ─── Parceiros ─────────────────────────────────────────────────────────────────

export type ParceiroInput = Omit<Parceiro, 'id' | 'user_id' | 'created_at' | 'updated_at'>

export async function listarParceiros(userId: string): Promise<Parceiro[]> {
  const { data } = await supabase.from('parceiros').select('*').eq('user_id', userId).order('nome')
  return (data ?? []) as Parceiro[]
}

export async function criarParceiro(userId: string, input: ParceiroInput): Promise<{ error: string | null }> {
  const { error } = await supabase.from('parceiros').insert({ ...input, user_id: userId })
  return { error: error?.message ?? null }
}

export async function editarParceiro(id: string, input: Partial<ParceiroInput>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('parceiros').update(input).eq('id', id)
  return { error: error?.message ?? null }
}

export async function excluirParceiro(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('parceiros').delete().eq('id', id)
  return { error: error?.message ?? null }
}

// ─── Faixas de rendimento de carcaça e bônus ───────────────────────────────────

export async function listarFaixas(userId: string): Promise<{ rendimentos: RendimentoFaixa[]; bonus: BonusFaixa[] }> {
  const [r, b] = await Promise.all([
    supabase.from('rendimento_faixas').select('*').eq('user_id', userId).order('peso_min'),
    supabase.from('bonus_faixas').select('*').eq('user_id', userId).order('peso_min'),
  ])
  return { rendimentos: (r.data ?? []) as RendimentoFaixa[], bonus: (b.data ?? []) as BonusFaixa[] }
}

export async function salvarRendimentos(faixas: RendimentoFaixa[]): Promise<void> {
  for (const f of faixas) {
    await supabase.from('rendimento_faixas').update({ peso_min: f.peso_min, peso_max: f.peso_max, rendimento_percentual: f.rendimento_percentual }).eq('id', f.id)
  }
}

export async function salvarBonus(faixas: BonusFaixa[]): Promise<void> {
  for (const f of faixas) {
    await supabase.from('bonus_faixas').update({ peso_min: f.peso_min, peso_max: f.peso_max, bonus_por_kg: f.bonus_por_kg }).eq('id', f.id)
  }
}

// ─── Simulações ────────────────────────────────────────────────────────────────

export interface Simulacao {
  id: string
  nome: string
  dados: SimDados
  created_at: string
  updated_at: string
}

// Tabela ainda não criada no banco (SQL de supabase/simulacoes.sql não rodado).
export function erroTabelaAusente(e: { code?: string; message?: string } | null): boolean {
  if (!e) return false
  const msg = e.message ?? ''
  return e.code === '42P01' || e.code === 'PGRST205' || (/simulacoes/.test(msg) && /(does not exist|could not find)/i.test(msg))
}

export async function listarSimulacoes(userId: string): Promise<{ simulacoes: Simulacao[]; tabelaAusente: boolean }> {
  const { data, error } = await supabase
    .from('simulacoes').select('id, nome, dados, created_at, updated_at')
    .eq('user_id', userId).order('updated_at', { ascending: false })
  return { simulacoes: (data ?? []) as Simulacao[], tabelaAusente: erroTabelaAusente(error) }
}

export async function criarSimulacao(userId: string, nome: string, dados: SimDados): Promise<{ error: string | null; id: string | null }> {
  const { data, error } = await supabase.from('simulacoes')
    .insert({ nome, dados, user_id: userId }).select('id').single()
  if (error) return { error: error.message, id: null }
  return { error: null, id: (data as { id: string }).id }
}

export async function salvarSimulacao(id: string, nome: string, dados: SimDados): Promise<{ error: string | null }> {
  const { error } = await supabase.from('simulacoes')
    .update({ nome, dados, updated_at: new Date().toISOString() }).eq('id', id)
  if (error) return { error: error.message }
  return { error: null }
}

export async function excluirSimulacao(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('simulacoes').delete().eq('id', id)
  if (error) return { error: error.message }
  return { error: null }
}

// ─── Ingredientes próprios e preços do produtor ────────────────────────────────

export interface PrecoProdutor {
  id: string
  user_id: string
  insumo_id: string
  preco_kg: number
}

export async function listarIngredientesEPrecos(userId: string): Promise<{
  ingredientes: IngredienteProdutor[]; insumosPadrao: InsumoPadrao[]; precos: PrecoProdutor[]
}> {
  const [{ data: ing }, { data: ins }, { data: pr }] = await Promise.all([
    supabase.from('ingredientes_produtor').select('*')
      .eq('user_id', userId).order('categoria').order('nome'),
    supabase.from('insumos_padrao').select('*')
      .eq('ativo', true).order('categoria').order('nome'),
    supabase.from('precos_produtor').select('*')
      .eq('user_id', userId),
  ])
  return {
    ingredientes: (ing ?? []) as IngredienteProdutor[],
    insumosPadrao: (ins ?? []) as InsumoPadrao[],
    precos: (pr ?? []) as PrecoProdutor[],
  }
}

export async function criarIngrediente(userId: string, input: {
  nome: string
  categoria: string
  pct_ms: number | null
  preco_kg: number
}): Promise<{ error: string | null }> {
  const { error } = await supabase.from('ingredientes_produtor').insert({
    user_id: userId,
    nome: input.nome,
    categoria: input.categoria,
    pct_ms: input.pct_ms,
    preco_kg: input.preco_kg,
    ativo: true,
  })
  return { error: error?.message ?? null }
}

export async function atualizarIngrediente(id: string, input: Partial<{
  nome: string
  categoria: string
  pct_ms: number | null
  preco_kg: number
  ativo: boolean
}>): Promise<{ error: string | null }> {
  const { error } = await supabase.from('ingredientes_produtor').update(input).eq('id', id)
  return { error: error?.message ?? null }
}

export async function excluirIngrediente(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('ingredientes_produtor').delete().eq('id', id)
  return { error: error?.message ?? null }
}

// Preço do produtor para um insumo padrão ("Meus preços da base"). A lista de
// preços já carregada pode ser passada para evitar uma leitura extra.
async function precoExistente(userId: string, insumoId: string, precos?: PrecoProdutor[]): Promise<PrecoProdutor | null> {
  if (precos) return precos.find(p => p.insumo_id === insumoId) ?? null
  const { data } = await supabase.from('precos_produtor').select('*')
    .eq('user_id', userId).eq('insumo_id', insumoId).maybeSingle()
  return (data ?? null) as PrecoProdutor | null
}

export async function upsertPrecoProdutor(
  userId: string, insumoId: string, precoKg: number, precos?: PrecoProdutor[],
): Promise<{ error: string | null }> {
  const existente = await precoExistente(userId, insumoId, precos)
  if (existente) {
    const { error } = await supabase.from('precos_produtor')
      .update({ preco_kg: precoKg })
      .eq('id', existente.id)
    return { error: error?.message ?? null }
  }
  const { error } = await supabase.from('precos_produtor').insert({
    user_id: userId, insumo_id: insumoId, preco_kg: precoKg,
  })
  return { error: error?.message ?? null }
}

// semAlteracao: não havia preço para remover (a tela não recarrega nesse caso).
export async function removerPrecoProdutor(
  userId: string, insumoId: string, precos?: PrecoProdutor[],
): Promise<{ error: string | null; semAlteracao?: boolean }> {
  const existente = await precoExistente(userId, insumoId, precos)
  if (!existente) return { error: null, semAlteracao: true }
  const { error } = await supabase.from('precos_produtor').delete().eq('id', existente.id)
  return { error: error?.message ?? null }
}
