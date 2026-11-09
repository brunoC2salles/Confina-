// Hook de dietas. Tipos, cálculo de custo e operações estão em src/core/dietas.ts
// (compartilhado com o servidor MCP); aqui fica o estado do React.
import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import * as core from '@/core/dietas'
import {
  calcularCustoDia,
  type InsumoPadrao, type IngredienteProdutor, type Dieta, type DietaBase,
  type IngredienteDisponivel, type IngredienteBusca, type CriarDietaInput, type AtualizarDietaInput,
} from '@/core/dietas'

export {
  getPctMsEfetivo, calcularCustoKgMsLado, calcularCustoKgMs, calcularCustoDia,
  type InsumoPadrao, type IngredienteProdutor, type IngredienteDisponivel, type IngredienteBusca,
  type ComponenteDieta, type Dieta, type DietaBase,
} from '@/core/dietas'

// ─── Hook principal ───────────────────────────────────────────────────────────

export function useDietas() {
  const { user } = useAuth()
  const [dietas, setDietas] = useState<Dieta[]>([])
  const [dietasBase, setDietasBase] = useState<DietaBase[]>([])
  const [insumosPadrao, setInsumosPadrao] = useState<InsumoPadrao[]>([])
  const [ingredientesProdutorTodos, setIngredientesProdutorTodos] = useState<IngredienteProdutor[]>([])
  const [precosProdutor, setPrecosProdutor] = useState<Array<{ insumo_id: string; preco_kg: number }>>([])
  const [loading, setLoading] = useState(true)

  const fetchInsumosPadrao = useCallback(async () => {
    setInsumosPadrao(await core.carregarInsumosPadrao())
  }, [])

  const fetchIngredientesProdutor = useCallback(async () => {
    if (!user) return
    const r = await core.carregarIngredientesProdutor(user.id)
    setIngredientesProdutorTodos(r.ingredientesProdutorTodos)
    setPrecosProdutor(r.precosProdutor)
  }, [user])

  const fetchDietasBase = useCallback(async () => {
    setDietasBase(await core.carregarDietasBase())
  }, [])

  const fetchDietas = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setDietas(await core.carregarDietas(user.id))
    setLoading(false)
  }, [user])

  useEffect(() => {
    fetchInsumosPadrao()
    fetchIngredientesProdutor()
    fetchDietasBase()
    fetchDietas()
  }, [fetchInsumosPadrao, fetchIngredientesProdutor, fetchDietasBase, fetchDietas])

  const ingredientesProdutor = ingredientesProdutorTodos.filter(i => i.ativo)

  const ingredientesDisponiveis: IngredienteDisponivel[] = core.montarIngredientesDisponiveis(insumosPadrao, ingredientesProdutorTodos)

  const ingredientesBusca: IngredienteBusca[] = core.montarIngredientesBusca(insumosPadrao, ingredientesProdutorTodos, precosProdutor)

  // Cria os ingredientes novos digitados na dieta (no cadastro do produtor)
  // e devolve as linhas criadas, na mesma ordem.
  const criarIngredientesDieta = async (novos: Array<{
    nome: string; categoria: string; pct_ms: number | null; preco_kg: number
  }>): Promise<{ error: string | null; criados: IngredienteProdutor[] }> => {
    if (!user) return { error: 'Não autenticado', criados: [] }
    const res = await core.criarIngredientesDieta(user.id, novos)
    if (!res.error && novos.length > 0) await fetchIngredientesProdutor()
    return res
  }

  // Reativa ingredientes próprios inativos escolhidos na dieta.
  const reativarIngredientes = async (ids: string[]) => {
    const res = await core.reativarIngredientes(ids)
    if (!res.error && ids.length > 0) await fetchIngredientesProdutor()
    return res
  }

  const criarDieta = async (input: CriarDietaInput, extras?: IngredienteProdutor[]): Promise<Awaited<ReturnType<typeof core.criarDieta>>> => {
    if (!user) return { error: 'Não autenticado' }
    const res = await core.criarDieta(user.id, input, extras, { insumosPadrao, ingredientesProdutorTodos })
    if (!res.error) await fetchDietas()
    return res
  }

  const atualizarDieta = async (id: string, input: AtualizarDietaInput, extras?: IngredienteProdutor[]) => {
    if (!user) return { error: 'Não autenticado' }
    const res = await core.atualizarDieta(user.id, id, input, extras, { insumosPadrao, ingredientesProdutorTodos })
    if (!res.error) await fetchDietas()
    return res
  }

  const excluirDieta = async (id: string) => {
    const res = await core.excluirDieta(id)
    if (!res.error) await fetchDietas()
    return res
  }

  const templates = dietas.map(d => ({
    id: d.id,
    nome: d.nome,
    gmd_esperado: d.gmd_esperado,
    pct_consumo_pv_ms: d.pct_consumo_pv_ms,
    custo_kg_ms: d.custo_kg_ms,
  }))

  return {
    dietas, dietasBase, insumosPadrao, ingredientesProdutor,
    ingredientesDisponiveis, ingredientesBusca, templates,
    loading,
    fetchDietas, fetchDietasBase, fetchInsumosPadrao, fetchIngredientesProdutor,
    criarDieta, atualizarDieta, excluirDieta,
    criarIngredientesDieta, reativarIngredientes,
    calcularCustoDia,
  }
}

// ─── Hook admin ───────────────────────────────────────────────────────────────

export function useAdmin() {
  const { user } = useAuth()
  const [insumos, setInsumos] = useState<InsumoPadrao[]>([])
  const [dietasBase, setDietasBase] = useState<DietaBase[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    setLoading(true)
    const [{ data: ins }, { data: db }] = await Promise.all([
      supabase.from('insumos_padrao').select('*').order('categoria').order('nome'),
      supabase.from('dietas_base')
        .select('*, ingredientes:dietas_base_ingredientes(*, insumo:insumos_padrao(*))')
        .order('nome'),
    ])
    setInsumos(ins ?? [])
    setDietasBase(db ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const criarInsumo = async (input: Omit<InsumoPadrao, 'id' | 'ativo'>) => {
    const { error } = await supabase.from('insumos_padrao').insert({ ...input, ativo: true, created_by: user?.id })
    if (!error) await fetchAll()
    return { error: error?.message ?? null }
  }

  const atualizarInsumo = async (id: string, input: Partial<InsumoPadrao>) => {
    const { error } = await supabase.from('insumos_padrao').update(input).eq('id', id)
    if (!error) await fetchAll()
    return { error: error?.message ?? null }
  }

  const criarDietaBase = async (input: {
    nome: string
    descricao?: string
    gmd_esperado?: number
    gmd_esperado_concentrado?: number | null
    ciclo_recomendado?: number
    pct_consumo_pv_ms?: number
    pct_concentrado?: number
    pct_volumoso?: number
    ingredientes: Array<{ insumo_id: string; tipo: 'concentrado' | 'volumoso'; pct_participacao: number }>
  }) => {
    const { data: db, error: e1 } = await supabase.from('dietas_base').insert({
      nome: input.nome,
      descricao: input.descricao ?? null,
      gmd_esperado: input.gmd_esperado ?? null,
      gmd_esperado_concentrado: input.gmd_esperado_concentrado ?? null,
      ciclo_recomendado: input.ciclo_recomendado ?? null,
      pct_consumo_pv_ms: input.pct_consumo_pv_ms ?? null,
      pct_concentrado: input.pct_concentrado ?? null,
      pct_volumoso: input.pct_volumoso ?? null,
      ativo: true,
      created_by: user?.id,
    }).select().single()
    if (e1) return { error: e1.message }

    if (input.ingredientes.length > 0) {
      const { error: e2 } = await supabase.from('dietas_base_ingredientes').insert(
        input.ingredientes.map(i => ({
          dieta_base_id: db.id,
          insumo_id: i.insumo_id,
          tipo: i.tipo,
          pct_participacao: i.pct_participacao,
        }))
      )
      if (e2) return { error: e2.message }
    }

    await fetchAll()
    return { error: null }
  }

  const atualizarDietaBase = async (id: string, input: {
    nome?: string
    descricao?: string
    gmd_esperado?: number
    gmd_esperado_concentrado?: number | null
    ciclo_recomendado?: number
    pct_consumo_pv_ms?: number
    pct_concentrado?: number
    pct_volumoso?: number
    ativo?: boolean
    ingredientes?: Array<{ insumo_id: string; tipo: 'concentrado' | 'volumoso'; pct_participacao: number }>
  }) => {
    const { error: e1 } = await supabase.from('dietas_base').update({
      nome: input.nome,
      descricao: input.descricao,
      gmd_esperado: input.gmd_esperado,
      gmd_esperado_concentrado: input.gmd_esperado_concentrado,
      ciclo_recomendado: input.ciclo_recomendado,
      pct_consumo_pv_ms: input.pct_consumo_pv_ms,
      pct_concentrado: input.pct_concentrado,
      pct_volumoso: input.pct_volumoso,
      ativo: input.ativo,
    }).eq('id', id)
    if (e1) return { error: e1.message }

    if (input.ingredientes !== undefined) {
      await supabase.from('dietas_base_ingredientes').delete().eq('dieta_base_id', id)
      if (input.ingredientes.length > 0) {
        await supabase.from('dietas_base_ingredientes').insert(
          input.ingredientes.map(i => ({
            dieta_base_id: id,
            insumo_id: i.insumo_id,
            tipo: i.tipo,
            pct_participacao: i.pct_participacao,
          }))
        )
      }
    }

    await fetchAll()
    return { error: null }
  }

  return {
    insumos, dietasBase, loading, fetchAll,
    criarInsumo, atualizarInsumo,
    criarDietaBase, atualizarDietaBase,
  }
}
