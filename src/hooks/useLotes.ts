import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type { Lote } from '@/types'

export interface NovoLoteInput {
  nome_lote: string; codigo_lote: string; ciclo_inicial: number
  qtd_animais: number; data_entrada: string
  peso_medio_entrada: number
  valor_pago_kg?: number; valor_total_lote?: number
  origem_fazenda?: string; origem_municipio?: string
  origem_estado?: string; raca_predominante?: string
  dieta_id?: string; observacoes?: string
}

export interface PesagemLoteInput {
  lote_id: string; data: string
  peso_medio: number; qtd_animais: number; observacoes?: string
}

export interface BifurcacaoInput {
  lote_origem_id: string; nome_lote: string; codigo_lote: string
  ciclo_inicial: number; data_bifurcacao: string
  qtd_animais_transferidos: number; peso_medio_saida?: number
  motivo?: 'peso' | 'gmd' | 'sanitario' | 'outro'
  dieta_id?: string; observacoes?: string
}

export interface SaidaLoteInput {
  lote_id: string
  tipo: 'venda' | 'abate' | 'transferencia' | 'morte'
  data_saida: string; qtd_animais_saida: number
  peso_medio_saida: number; saida_total: boolean
  valor_total_venda?: number; valor_por_kg?: number
  destino_tipo?: 'frigorifico' | 'corretor' | 'produtor' | 'outro'
  destino_id?: string
  comissoes?: Array<{ tipo: string; percentual: number; valor_calculado: number }>
  encargos?: Array<{ descricao: string; percentual: number; valor_calculado: number }>
  rendimento_pct?: number; peso_carcaca_total?: number
  bonus_por_kg?: number; valor_bonus?: number
  receita_bruta?: number; total_comissoes?: number; total_encargos?: number
  receita_liquida?: number; custo_alimentacao?: number
  custo_compra_rateado?: number; custos_fixos_rateados?: number
  custos_variaveis?: number; custo_total?: number
  lucro_total?: number; lucro_por_animal?: number; margem_pct?: number
  observacoes?: string
}

export function useLotes() {
  const { user } = useAuth()
  const [lotes, setLotes] = useState<Lote[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('lotes').select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setLotes(data ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  const criarLote = async (input: NovoLoteInput) => {
    if (!user) return { error: 'Não autenticado' }
    let vkg = input.valor_pago_kg
    let vtl = input.valor_total_lote
    if (!vtl && vkg && input.peso_medio_entrada && input.qtd_animais)
      vtl = vkg * input.peso_medio_entrada * input.qtd_animais
    if (!vkg && vtl && input.peso_medio_entrada && input.qtd_animais)
      vkg = vtl / (input.peso_medio_entrada * input.qtd_animais)

    const { error } = await supabase.from('lotes').insert({
      nome_lote: input.nome_lote, codigo_lote: input.codigo_lote,
      ciclo_inicial: input.ciclo_inicial, ciclo_atual: input.ciclo_inicial,
      data_criacao: input.data_entrada, data_entrada: input.data_entrada,
      qtd_animais: input.qtd_animais, qtd_animais_atual: input.qtd_animais,
      peso_medio_entrada: input.peso_medio_entrada, peso_medio_atual: input.peso_medio_entrada,
      valor_pago_kg: vkg ?? null, valor_total_lote: vtl ?? null,
      origem_fazenda: input.origem_fazenda ?? null,
      origem_municipio: input.origem_municipio ?? null,
      origem_estado: input.origem_estado ?? null,
      raca_predominante: input.raca_predominante ?? null,
      dieta_id: input.dieta_id ?? null,
      observacoes: input.observacoes ?? null,
      dias_confinamento: 0, status: 'ativo', user_id: user.id,
    })
    if (!error) await fetch()
    return { error: error?.message ?? null }
  }

  const registrarPesagem = async (input: PesagemLoteInput) => {
    if (!user) return { error: 'Não autenticado' }
    const { error } = await supabase.from('pesagens_lote').insert({ ...input, user_id: user.id })
    if (!error) await fetch()
    return { error: error?.message ?? null }
  }

  const bifurcarLote = async (input: BifurcacaoInput) => {
    if (!user) return { error: 'Não autenticado' }
    const origem = lotes.find(l => l.id === input.lote_origem_id)
    if (!origem) return { error: 'Lote de origem não encontrado' }

    const { data: novoLote, error: e1 } = await supabase.from('lotes').insert({
      nome_lote: input.nome_lote, codigo_lote: input.codigo_lote,
      ciclo_inicial: input.ciclo_inicial, ciclo_atual: input.ciclo_inicial,
      data_criacao: input.data_bifurcacao, data_entrada: input.data_bifurcacao,
      qtd_animais: input.qtd_animais_transferidos,
      qtd_animais_atual: input.qtd_animais_transferidos,
      peso_medio_entrada: input.peso_medio_saida ?? (origem as any).peso_medio_atual,
      peso_medio_atual: input.peso_medio_saida ?? (origem as any).peso_medio_atual,
      origem_fazenda: (origem as any).origem_fazenda,
      origem_municipio: (origem as any).origem_municipio,
      origem_estado: (origem as any).origem_estado,
      raca_predominante: (origem as any).raca_predominante,
      dieta_id: input.dieta_id ?? (origem as any).dieta_id,
      lote_origem_id: input.lote_origem_id,
      status: 'ativo', user_id: user.id,
    }).select().single()
    if (e1) return { error: e1.message }

    const { error: e2 } = await supabase.from('bifurcacoes').insert({
      lote_origem_id: input.lote_origem_id, lote_destino_id: novoLote.id,
      data_bifurcacao: input.data_bifurcacao,
      qtd_animais_transferidos: input.qtd_animais_transferidos,
      peso_medio_saida: input.peso_medio_saida ?? null,
      motivo: input.motivo ?? null, observacoes: input.observacoes ?? null,
      user_id: user.id,
    })
    if (e2) return { error: e2.message }

    await fetch()
    return { error: null, lote: novoLote }
  }

  const registrarSaida = async (input: SaidaLoteInput) => {
    if (!user) return { error: 'Não autenticado' }

    const lote = lotes.find(l => l.id === input.lote_id) as any
    const qtd_saida = input.qtd_animais_saida
    const qtd_total = lote?.qtd_animais ?? qtd_saida

    // Custo de compra rateado proporcional
    const custo_compra_rateado = lote?.valor_total_lote
      ? (lote.valor_total_lote / qtd_total) * qtd_saida
      : (input.custo_compra_rateado ?? 0)

    // Custo alimentação acumulado rateado
    const custo_alimentacao = lote?.custo_alimentacao_acumulado
      ? (lote.custo_alimentacao_acumulado / qtd_total) * qtd_saida
      : (input.custo_alimentacao ?? 0)

    const receita_bruta   = input.receita_bruta ?? input.valor_total_venda ?? 0
    const valor_bonus     = input.valor_bonus ?? 0
    const total_comissoes = input.total_comissoes ?? 0
    const total_encargos  = input.total_encargos ?? 0
    const receita_liquida = input.receita_liquida ?? (receita_bruta + valor_bonus - total_comissoes - total_encargos)
    const custo_total     = custo_compra_rateado + custo_alimentacao + (input.custos_variaveis ?? 0) + (input.custos_fixos_rateados ?? 0)
    const lucro_total     = receita_liquida - custo_total
    const lucro_por_animal = qtd_saida > 0 ? lucro_total / qtd_saida : 0
    const margem_pct      = receita_liquida > 0 ? (lucro_total / receita_liquida) * 100 : 0

    const { error } = await supabase.from('saidas_lote').insert({
      ...input,
      comissoes: input.comissoes ?? [],
      encargos:  input.encargos ?? [],
      custo_compra_rateado, custo_alimentacao, custo_total,
      lucro_total, lucro_por_animal, margem_pct,
      receita_bruta, valor_bonus, total_comissoes, total_encargos, receita_liquida,
      user_id: user.id,
    })
    if (!error) await fetch()
    return { error: error?.message ?? null }
  }

  const avancarCiclo = async (id: string, ciclo: number) => {
    const { error } = await supabase.from('lotes').update({ ciclo_atual: ciclo }).eq('id', id)
    if (!error) await fetch()
    return { error: error?.message ?? null }
  }

  const encerrarLote = async (id: string) => {
    const { error } = await supabase.from('lotes').update({ status: 'encerrado' }).eq('id', id)
    if (!error) await fetch()
    return { error: error?.message ?? null }
  }

  const excluirLote = async (id: string) => {
    const { error } = await supabase.from('lotes').delete().eq('id', id)
    if (!error) await fetch()
    return { error: error?.message ?? null }
  }

  const buscarPesagens = async (loteId: string) => {
    const { data } = await supabase.from('pesagens_lote').select('*')
      .eq('lote_id', loteId).order('data', { ascending: false })
    return data ?? []
  }

  const buscarSaidas = async (loteId: string) => {
    const { data } = await supabase.from('saidas_lote').select('*')
      .eq('lote_id', loteId).order('data_saida', { ascending: false })
    return data ?? []
  }

  return {
    lotes, loading, fetch,
    lotesAtivos: lotes.filter(l => l.status === 'ativo'),
    lotesEncerrados: lotes.filter(l => l.status === 'encerrado'),
    criarLote, registrarPesagem, bifurcarLote,
    registrarSaida, avancarCiclo, encerrarLote, excluirLote,
    buscarPesagens, buscarSaidas,
  }
}
