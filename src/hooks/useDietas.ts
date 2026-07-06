import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface InsumoPadrao {
  id: string
  nome: string
  categoria: string
  pct_ms: number | null
  preco_referencia: number
  ativo: boolean
}

export interface IngredienteProdutor {
  id: string
  user_id: string
  nome: string
  categoria: string
  pct_ms: number | null
  preco_kg: number
  ativo: boolean
}

export interface IngredienteDisponivel {
  origem: 'insumo_padrao' | 'ingrediente_produtor'
  id: string
  nome: string
  categoria: string
  pct_ms: number | null
  preco_kg_padrao: number
}

export interface ComponenteDieta {
  id?: string
  dieta_id?: string
  tipo: 'concentrado' | 'volumoso'
  origem_ingrediente: 'insumo_padrao' | 'ingrediente_produtor'
  insumo_id?: string | null
  ingrediente_produtor_id?: string | null
  pct_participacao: number
  preco_kg: number
  pct_ms_manual: number | null
  insumo?: InsumoPadrao | null
  ingrediente_produtor?: IngredienteProdutor | null
}

export interface Dieta {
  id: string
  nome: string
  descricao: string | null
  gmd_esperado: number
  ciclo_recomendado: number | null
  baseada_em: string | null
  pct_consumo_pv_ms: number
  pct_concentrado: number
  pct_volumoso: number
  custo_kg_ms: number | null
  user_id: string
  componentes?: ComponenteDieta[]
}

export interface DietaBase {
  id: string
  nome: string
  descricao: string | null
  gmd_esperado: number | null
  ciclo_recomendado: number | null
  pct_consumo_pv_ms: number | null
  pct_concentrado: number | null
  pct_volumoso: number | null
  ativo: boolean
  ingredientes?: Array<{
    id: string
    insumo_id: string
    tipo: 'concentrado' | 'volumoso' | null
    pct_participacao: number | null
    insumo?: InsumoPadrao | null
  }>
}

// ─── Helpers de cálculo ───────────────────────────────────────────────────────

export function getPctMsEfetivo(c: ComponenteDieta): number | null {
  if (c.pct_ms_manual != null) return c.pct_ms_manual
  if (c.origem_ingrediente === 'insumo_padrao') return c.insumo?.pct_ms ?? null
  return c.ingrediente_produtor?.pct_ms ?? null
}

export function calcularCustoKgMsLado(componentes: ComponenteDieta[]): number | null {
  if (componentes.length === 0) return 0
  let soma = 0
  for (const c of componentes) {
    const pctMs = getPctMsEfetivo(c)
    if (pctMs == null || pctMs <= 0) return null
    if (c.preco_kg == null || c.pct_participacao == null) return null
    const custoKgMsIng = c.preco_kg / (pctMs / 100)
    soma += custoKgMsIng * (c.pct_participacao / 100)
  }
  return soma
}

export function calcularCustoKgMs(dieta: {
  pct_concentrado: number
  pct_volumoso: number
  componentes: ComponenteDieta[]
}): number | null {
  const conc = dieta.componentes.filter(c => c.tipo === 'concentrado')
  const vol = dieta.componentes.filter(c => c.tipo === 'volumoso')
  const cc = calcularCustoKgMsLado(conc)
  const cv = calcularCustoKgMsLado(vol)
  if (cc == null || cv == null) return null
  return cc * (dieta.pct_concentrado / 100) + cv * (dieta.pct_volumoso / 100)
}

export function calcularCustoDia(
  dieta: { pct_consumo_pv_ms: number; custo_kg_ms: number | null },
  pesoMedio: number,
  qtdAnimais: number
): number {
  if (!dieta.custo_kg_ms) return 0
  return pesoMedio * (dieta.pct_consumo_pv_ms / 100) * dieta.custo_kg_ms * qtdAnimais
}

// ─── Hook principal ───────────────────────────────────────────────────────────

export function useDietas() {
  const { user } = useAuth()
  const [dietas, setDietas] = useState<Dieta[]>([])
  const [dietasBase, setDietasBase] = useState<DietaBase[]>([])
  const [insumosPadrao, setInsumosPadrao] = useState<InsumoPadrao[]>([])
  const [ingredientesProdutor, setIngredientesProdutor] = useState<IngredienteProdutor[]>([])
  const [loading, setLoading] = useState(true)

  const fetchInsumosPadrao = useCallback(async () => {
    const { data } = await supabase
      .from('insumos_padrao').select('*')
      .eq('ativo', true).order('categoria').order('nome')
    setInsumosPadrao(data ?? [])
  }, [])

  const fetchIngredientesProdutor = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('ingredientes_produtor').select('*')
      .eq('user_id', user.id).eq('ativo', true).order('categoria').order('nome')
    setIngredientesProdutor(data ?? [])
  }, [user])

  const fetchDietasBase = useCallback(async () => {
    const { data } = await supabase
      .from('dietas_base')
      .select('*, ingredientes:dietas_base_ingredientes(*, insumo:insumos_padrao(*))')
      .eq('ativo', true).order('nome')
    setDietasBase(data ?? [])
  }, [])

  const fetchDietas = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('dietas')
      .select(`
        *,
        componentes:componentes_dieta(
          *,
          insumo:insumos_padrao(*),
          ingrediente_produtor:ingredientes_produtor(*)
        )
      `)
      .eq('user_id', user.id).order('nome')
    setDietas(data ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => {
    fetchInsumosPadrao()
    fetchIngredientesProdutor()
    fetchDietasBase()
    fetchDietas()
  }, [fetchInsumosPadrao, fetchIngredientesProdutor, fetchDietasBase, fetchDietas])

  const ingredientesDisponiveis: IngredienteDisponivel[] = [
    ...insumosPadrao.map(i => ({
      origem: 'insumo_padrao' as const,
      id: i.id, nome: i.nome, categoria: i.categoria,
      pct_ms: i.pct_ms, preco_kg_padrao: i.preco_referencia ?? 0,
    })),
    ...ingredientesProdutor.map(i => ({
      origem: 'ingrediente_produtor' as const,
      id: i.id, nome: i.nome, categoria: i.categoria,
      pct_ms: i.pct_ms, preco_kg_padrao: i.preco_kg,
    })),
  ]

  const criarDieta = async (input: {
    nome: string
    descricao?: string
    gmd_esperado: number
    ciclo_recomendado?: number
    baseada_em?: string
    pct_consumo_pv_ms: number
    pct_concentrado: number
    pct_volumoso: number
    componentes: Array<Omit<ComponenteDieta, 'id' | 'dieta_id' | 'insumo' | 'ingrediente_produtor'>>
  }) => {
    if (!user) return { error: 'Não autenticado' }

    const componentesComRef = input.componentes.map(c => ({
      ...c,
      insumo: c.origem_ingrediente === 'insumo_padrao'
        ? insumosPadrao.find(i => i.id === c.insumo_id) ?? null
        : null,
      ingrediente_produtor: c.origem_ingrediente === 'ingrediente_produtor'
        ? ingredientesProdutor.find(i => i.id === c.ingrediente_produtor_id) ?? null
        : null,
    })) as ComponenteDieta[]

    const custo_kg_ms = calcularCustoKgMs({
      pct_concentrado: input.pct_concentrado,
      pct_volumoso: input.pct_volumoso,
      componentes: componentesComRef,
    })

    const { data: dieta, error: e1 } = await supabase.from('dietas').insert({
      nome: input.nome,
      descricao: input.descricao ?? null,
      gmd_esperado: input.gmd_esperado,
      ciclo_recomendado: input.ciclo_recomendado ?? null,
      baseada_em: input.baseada_em ?? null,
      pct_consumo_pv_ms: input.pct_consumo_pv_ms,
      pct_concentrado: input.pct_concentrado,
      pct_volumoso: input.pct_volumoso,
      custo_kg_ms,
      user_id: user.id,
    }).select().single()
    if (e1) return { error: e1.message }

    if (input.componentes.length > 0) {
      const { error: e2 } = await supabase.from('componentes_dieta').insert(
        input.componentes.map(c => ({
          dieta_id: dieta.id,
          tipo: c.tipo,
          origem_ingrediente: c.origem_ingrediente,
          insumo_id: c.origem_ingrediente === 'insumo_padrao' ? c.insumo_id : null,
          ingrediente_produtor_id: c.origem_ingrediente === 'ingrediente_produtor' ? c.ingrediente_produtor_id : null,
          pct_participacao: c.pct_participacao,
          preco_kg: c.preco_kg,
          pct_ms_manual: c.pct_ms_manual,
          user_id: user.id,
        }))
      )
      if (e2) return { error: e2.message }
    }

    await fetchDietas()
    return { error: null, dieta }
  }

  const atualizarDieta = async (id: string, input: {
    nome?: string
    descricao?: string
    gmd_esperado?: number
    ciclo_recomendado?: number
    pct_consumo_pv_ms: number
    pct_concentrado: number
    pct_volumoso: number
    componentes: Array<Omit<ComponenteDieta, 'id' | 'dieta_id' | 'insumo' | 'ingrediente_produtor'>>
  }) => {
    if (!user) return { error: 'Não autenticado' }

    const componentesComRef = input.componentes.map(c => ({
      ...c,
      insumo: c.origem_ingrediente === 'insumo_padrao'
        ? insumosPadrao.find(i => i.id === c.insumo_id) ?? null
        : null,
      ingrediente_produtor: c.origem_ingrediente === 'ingrediente_produtor'
        ? ingredientesProdutor.find(i => i.id === c.ingrediente_produtor_id) ?? null
        : null,
    })) as ComponenteDieta[]

    const custo_kg_ms = calcularCustoKgMs({
      pct_concentrado: input.pct_concentrado,
      pct_volumoso: input.pct_volumoso,
      componentes: componentesComRef,
    })

    const { error: e1 } = await supabase.from('dietas').update({
      nome: input.nome,
      descricao: input.descricao ?? null,
      gmd_esperado: input.gmd_esperado,
      ciclo_recomendado: input.ciclo_recomendado ?? null,
      pct_consumo_pv_ms: input.pct_consumo_pv_ms,
      pct_concentrado: input.pct_concentrado,
      pct_volumoso: input.pct_volumoso,
      custo_kg_ms,
    }).eq('id', id)
    if (e1) return { error: e1.message }

    await supabase.from('componentes_dieta').delete().eq('dieta_id', id)
    if (input.componentes.length > 0) {
      const { error: e2 } = await supabase.from('componentes_dieta').insert(
        input.componentes.map(c => ({
          dieta_id: id,
          tipo: c.tipo,
          origem_ingrediente: c.origem_ingrediente,
          insumo_id: c.origem_ingrediente === 'insumo_padrao' ? c.insumo_id : null,
          ingrediente_produtor_id: c.origem_ingrediente === 'ingrediente_produtor' ? c.ingrediente_produtor_id : null,
          pct_participacao: c.pct_participacao,
          preco_kg: c.preco_kg,
          pct_ms_manual: c.pct_ms_manual,
          user_id: user.id,
        }))
      )
      if (e2) return { error: e2.message }
    }

    await fetchDietas()
    return { error: null }
  }

  const excluirDieta = async (id: string) => {
    const { error } = await supabase.from('dietas').delete().eq('id', id)
    if (!error) await fetchDietas()
    return { error: error?.message ?? null }
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
    ingredientesDisponiveis, templates,
    loading,
    fetchDietas, fetchDietasBase, fetchInsumosPadrao, fetchIngredientesProdutor,
    criarDieta, atualizarDieta, excluirDieta,
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
