import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export interface Insumo {
  id: string; nome: string; categoria: string
  unidade_padrao: string; preco_referencia: number
  observacao?: string; ativo: boolean
}

export interface ComponenteDieta {
  id?: string; dieta_id?: string; insumo_id?: string
  nome_ingrediente?: string; quantidade: number
  unidade: 'kg_animal_dia' | 'pct_pc'; preco_kg: number
  insumo?: Insumo
}

export interface Dieta {
  id: string; nome: string; gmd_esperado: number
  ciclo_recomendado?: number; descricao?: string
  baseada_em?: string; custo_dia_atual?: number
  custo_dia_por_animal?: number; user_id?: string
  componentes?: ComponenteDieta[]
}

export interface DietaBase {
  id: string; nome: string; ciclo_recomendado?: number
  descricao?: string; gmd_esperado?: number; ativo: boolean
  ingredientes?: Array<{
    id: string; insumo_id: string; quantidade: number
    unidade: string; observacao?: string; insumo?: Insumo
  }>
}

export function useDietas() {
  const { user } = useAuth()
  const [dietas, setDietas] = useState<Dieta[]>([])
  const [dietasBase, setDietasBase] = useState<DietaBase[]>([])
  const [insumos, setInsumos] = useState<Insumo[]>([])
  const [loading, setLoading] = useState(true)

  const fetchInsumos = useCallback(async () => {
    const { data } = await supabase
      .from('insumos_padrao').select('*')
      .eq('ativo', true).order('categoria').order('nome')
    setInsumos(data ?? [])
  }, [])

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
      .select('*, componentes:componentes_dieta(*, insumo:insumos_padrao(*))')
      .eq('user_id', user.id).order('nome')
    setDietas(data ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => {
    fetchInsumos()
    fetchDietasBase()
    fetchDietas()
  }, [fetchInsumos, fetchDietasBase, fetchDietas])

  const criarDieta = async (input: {
    nome: string; gmd_esperado: number; ciclo_recomendado?: number
    descricao?: string; baseada_em?: string
    componentes: Array<{ insumo_id?: string; nome_ingrediente?: string; quantidade: number; unidade: string; preco_kg: number }>
  }) => {
    if (!user) return { error: 'Não autenticado' }

    const { data: dieta, error: e1 } = await supabase.from('dietas').insert({
      nome: input.nome, gmd_esperado: input.gmd_esperado,
      ciclo_recomendado: input.ciclo_recomendado ?? null,
      descricao: input.descricao ?? null,
      baseada_em: input.baseada_em ?? null,
      user_id: user.id,
    }).select().single()
    if (e1) return { error: e1.message }

    if (input.componentes.length > 0) {
      const { error: e2 } = await supabase.from('componentes_dieta').insert(
        input.componentes.map(c => ({
          dieta_id: dieta.id,
          insumo_id: c.insumo_id ?? null,
          nome_ingrediente: c.nome_ingrediente ?? null,
          quantidade: c.quantidade, unidade: c.unidade,
          preco_kg: c.preco_kg, user_id: user.id,
        }))
      )
      if (e2) return { error: e2.message }
    }

    await fetchDietas()
    return { error: null, dieta }
  }

  const atualizarDieta = async (id: string, input: {
    nome?: string; gmd_esperado?: number; ciclo_recomendado?: number; descricao?: string
    componentes?: Array<{ insumo_id?: string; nome_ingrediente?: string; quantidade: number; unidade: string; preco_kg: number }>
  }) => {
    if (!user) return { error: 'Não autenticado' }

    const { error: e1 } = await supabase.from('dietas').update({
      nome: input.nome, gmd_esperado: input.gmd_esperado,
      ciclo_recomendado: input.ciclo_recomendado ?? null,
      descricao: input.descricao ?? null,
    }).eq('id', id)
    if (e1) return { error: e1.message }

    if (input.componentes !== undefined) {
      await supabase.from('componentes_dieta').delete().eq('dieta_id', id)
      if (input.componentes.length > 0) {
        await supabase.from('componentes_dieta').insert(
          input.componentes.map(c => ({
            dieta_id: id, insumo_id: c.insumo_id ?? null,
            nome_ingrediente: c.nome_ingrediente ?? null,
            quantidade: c.quantidade, unidade: c.unidade,
            preco_kg: c.preco_kg, user_id: user.id,
          }))
        )
      }
    }

    await fetchDietas()
    return { error: null }
  }

  const excluirDieta = async (id: string) => {
    const { error } = await supabase.from('dietas').delete().eq('id', id)
    if (!error) await fetchDietas()
    return { error: error?.message ?? null }
  }

  const calcularCustoDia = (componentes: ComponenteDieta[], pesoMedio: number, qtdAnimais: number) => {
    return componentes.reduce((total, c) => {
      let custo = 0
      if (c.unidade === 'kg_animal_dia') {
        custo = c.quantidade * c.preco_kg * qtdAnimais
      } else if (c.unidade === 'pct_pc') {
        custo = (c.quantidade / 100) * pesoMedio * qtdAnimais * c.preco_kg
      }
      return total + custo
    }, 0)
  }

  const templates = dietas.map(d => ({ id: d.id, nome: d.nome, gmd_esperado: d.gmd_esperado }))

  return {
    dietas, dietasBase, insumos, loading, templates,
    fetchDietas, fetchDietasBase, fetchInsumos,
    criarDieta, atualizarDieta, excluirDieta, calcularCustoDia,
  }
}

export function useAdmin() {
  const { user } = useAuth()
  const [insumos, setInsumos] = useState<Insumo[]>([])
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

  const criarInsumo = async (input: Omit<Insumo, 'id' | 'ativo'>) => {
    const { error } = await supabase.from('insumos_padrao').insert({ ...input, ativo: true, created_by: user?.id })
    if (!error) await fetchAll()
    return { error: error?.message ?? null }
  }

  const atualizarInsumo = async (id: string, input: Partial<Insumo>) => {
    const { error } = await supabase.from('insumos_padrao').update(input).eq('id', id)
    if (!error) await fetchAll()
    return { error: error?.message ?? null }
  }

  const criarDietaBase = async (input: {
    nome: string; ciclo_recomendado?: number; descricao?: string; gmd_esperado?: number
    ingredientes: Array<{ insumo_id: string; quantidade: number; unidade: string; observacao?: string }>
  }) => {
    const { data: db, error: e1 } = await supabase.from('dietas_base').insert({
      nome: input.nome, ciclo_recomendado: input.ciclo_recomendado ?? null,
      descricao: input.descricao ?? null, gmd_esperado: input.gmd_esperado ?? null,
      ativo: true, created_by: user?.id,
    }).select().single()
    if (e1) return { error: e1.message }

    if (input.ingredientes.length > 0) {
      const { error: e2 } = await supabase.from('dietas_base_ingredientes').insert(
        input.ingredientes.map(i => ({ dieta_base_id: db.id, ...i }))
      )
      if (e2) return { error: e2.message }
    }

    await fetchAll()
    return { error: null }
  }

  const atualizarDietaBase = async (id: string, input: {
    nome?: string; ciclo_recomendado?: number; descricao?: string
    gmd_esperado?: number; ativo?: boolean
    ingredientes?: Array<{ insumo_id: string; quantidade: number; unidade: string; observacao?: string }>
  }) => {
    const { error: e1 } = await supabase.from('dietas_base').update({
      nome: input.nome, ciclo_recomendado: input.ciclo_recomendado,
      descricao: input.descricao, gmd_esperado: input.gmd_esperado, ativo: input.ativo,
    }).eq('id', id)
    if (e1) return { error: e1.message }

    if (input.ingredientes !== undefined) {
      await supabase.from('dietas_base_ingredientes').delete().eq('dieta_base_id', id)
      if (input.ingredientes.length > 0) {
        await supabase.from('dietas_base_ingredientes').insert(
          input.ingredientes.map(i => ({ dieta_base_id: id, ...i }))
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
