import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { buscarPorIds } from '@/hooks/useLotes'
import {
  toDay, construirPeriodosDeMovimentacoes,
  type CicloInfo, type PesagemPonto, type CicloAnimalEvento, type TrocaDietaCiclo,
} from '@/lib/custoAnimal'
import {
  chaveIngrediente, calcularConsumoIngredientesPorDia, calcularKardexIngrediente, precosEstoqueNoDia,
  type AnimalConsumoIngredienteInput, type ResultadoKardex, type TipoEntradaIngrediente,
} from '@/lib/custoIngrediente'
import { carregarComposicaoDietasDoUsuario, carregarPeriodosIngrediente } from '@/lib/componentesDieta'
import { inicioCoberturaPorLote } from '@/lib/fornecimentoRacao'
import { carregarFornecimentosDoUsuario } from '@/lib/fornecimentosDb'
import type { CompraIngrediente } from '@/types'

// ─── Compras de ingredientes (ração feita na fazenda) ─────────────────────
// Entradas de estoque por ingrediente (compra, produção própria, ajuste de
// inventário), saldo teórico e custo médio ponderado. A cada entrada criada,
// excluída ou ajuste, recalcula o kardex do ingrediente e regrava os
// períodos de custo médio (compras_ingrediente_periodos), que o motor de
// custo (useLotes.ts) usa para precificar as dietas. Ver custoIngrediente.ts.

export interface IngredienteOpcao {
  chave: string
  origem: 'insumo_padrao' | 'ingrediente_produtor'
  id: string
  nome: string
  pct_ms: number | null
  ativo: boolean
}

export interface ResumoIngrediente extends ResultadoKardex {
  chave: string
  // Se o ingrediente aparece em alguma dieta cadastrada ou em algum
  // fornecimento — sem isso não há consumo, e o saldo só reflete entradas e
  // ajustes.
  usadoEmDieta: boolean
}

// Recalcula o kardex de todos os ingredientes e regrava todos os períodos de
// custo médio do usuário. Usado depois de registrar ou excluir um
// fornecimento de ração, que muda o consumo de vários ingredientes ao mesmo
// tempo (o que foi fornecido e o teórico que deixa de contar).
export async function recalcularTodosPeriodosIngrediente(userId: string): Promise<{ error: string | null }> {
  const entradas: CompraIngrediente[] = []
  const tamanho = 1000
  for (let from = 0; ; from += tamanho) {
    const { data, error } = await supabase.from('compras_ingrediente').select('*')
      .eq('user_id', userId).range(from, from + tamanho - 1)
    if (error) return { error: error.message }
    if (!data) break
    entradas.push(...(data as CompraIngrediente[]))
    if (data.length < tamanho) break
  }
  const resumos = await calcularResumos(userId, entradas)
  const { error: eDel } = await supabase.from('compras_ingrediente_periodos').delete().eq('user_id', userId)
  if (eDel) return { error: eDel.message }
  const linhas = Object.values(resumos).flatMap(r => {
    const { origem, id } = dividirChave(r.chave)
    return r.periodos.map(p => ({
      origem_ingrediente: origem,
      insumo_id: origem === 'insumo_padrao' ? id : null,
      ingrediente_produtor_id: origem === 'ingrediente_produtor' ? id : null,
      compra_id: p.compra_id,
      vigente_desde: p.vigente_desde,
      vigente_ate: p.vigente_ate,
      saldo_kg_inicio: p.saldo_kg_inicio,
      custo_medio_kg: p.custo_medio_kg,
      user_id: userId,
    }))
  })
  for (let i = 0; i < linhas.length; i += 500) {
    const { error } = await supabase.from('compras_ingrediente_periodos').insert(linhas.slice(i, i + 500))
    if (error) return { error: error.message }
  }
  return { error: null }
}

function dividirChave(chave: string): { origem: 'insumo_padrao' | 'ingrediente_produtor'; id: string } {
  const [origem, id] = chave.split(':')
  return { origem: origem as 'insumo_padrao' | 'ingrediente_produtor', id }
}

type Mov = { animal_id: string; tipo: string; lote_origem_id: string | null; lote_destino_id: string | null; data: string }

// Calcula o kardex de todos os ingredientes com entrada. Carrega os lotes
// cujas dietas (do ciclo ou de trocas de dieta) usam algum desses
// ingredientes, e o histórico dos animais que passaram por eles. Lotes com
// fornecimento de ração registrado deixam de contar pelo teórico a partir do
// primeiro fornecimento; o que foi fornecido (ração feita na fazenda) baixa
// do estoque no dia do fornecimento.
async function calcularResumos(userId: string, entradas: CompraIngrediente[]): Promise<Record<string, ResumoIngrediente>> {
  const entradasPorChave: Record<string, CompraIngrediente[]> = {}
  for (const e of entradas) {
    const chave = chaveIngrediente(e.origem_ingrediente, e.insumo_id, e.ingrediente_produtor_id)
    if (chave) (entradasPorChave[chave] ??= []).push(e)
  }
  const chaves = new Set(Object.keys(entradasPorChave))
  if (chaves.size === 0) return {}

  const hojeDia = toDay(new Date().toISOString().slice(0, 10))
  const diaInicial = Math.min(...entradas.map(e => toDay(e.data)))

  const [composicoes, fornecimentos] = await Promise.all([
    carregarComposicaoDietasDoUsuario(userId),
    carregarFornecimentosDoUsuario(userId),
  ])
  const inicioCobertura = inicioCoberturaPorLote(fornecimentos)
  const chavesEmDieta = new Set<string>()
  const dietaIdsAlvo: string[] = []
  for (const [dietaId, d] of Object.entries(composicoes)) {
    let usa = false
    for (const c of d.componentes) {
      if (c.chave && chaves.has(c.chave)) { usa = true; chavesEmDieta.add(c.chave) }
    }
    if (usa) dietaIdsAlvo.push(dietaId)
  }

  let consumo: Record<string, Record<number, number>> = {}
  if (dietaIdsAlvo.length > 0) {
    const [{ data: ciclosAlvo }, { data: trocasAlvo }] = await Promise.all([
      supabase.from('ciclos_lote').select('lote_id').eq('user_id', userId).in('dieta_id', dietaIdsAlvo),
      supabase.from('trocas_dieta_lote').select('lote_id').eq('user_id', userId).in('dieta_id', dietaIdsAlvo),
    ])
    const loteIds = Array.from(new Set([
      ...((ciclosAlvo ?? []) as Array<{ lote_id: string }>).map(c => c.lote_id),
      ...((trocasAlvo ?? []) as Array<{ lote_id: string }>).map(t => t.lote_id),
    ]))

    if (loteIds.length > 0) {
      const [ciclosData, trocasData, movsOrigem, movsDestino] = await Promise.all([
        buscarPorIds<CicloInfo & { lote_id: string }>(loteIds, (idsChunk, from, to) =>
          supabase.from('ciclos_lote').select('lote_id, numero, tipo_ciclo, dieta_id, gmd_esperado, data_inicio, data_fim').in('lote_id', idsChunk).range(from, to)),
        buscarPorIds<TrocaDietaCiclo>(loteIds, (idsChunk, from, to) =>
          supabase.from('trocas_dieta_lote').select('lote_id, ciclo_numero, dieta_id, data').in('lote_id', idsChunk).range(from, to)),
        buscarPorIds<Mov>(loteIds, (idsChunk, from, to) =>
          supabase.from('movimentacoes_animais').select('animal_id, tipo, lote_origem_id, lote_destino_id, data').in('lote_origem_id', idsChunk).range(from, to)),
        buscarPorIds<Mov>(loteIds, (idsChunk, from, to) =>
          supabase.from('movimentacoes_animais').select('animal_id, tipo, lote_origem_id, lote_destino_id, data').in('lote_destino_id', idsChunk).range(from, to)),
      ])

      // Dedupe (um movimento pode ter origem E destino dentro do conjunto).
      const movsMap = new Map<string, Mov>()
      for (const m of [...movsOrigem, ...movsDestino]) {
        movsMap.set(`${m.animal_id}|${m.tipo}|${m.data}|${m.lote_origem_id ?? ''}|${m.lote_destino_id ?? ''}`, m)
      }
      const movs = Array.from(movsMap.values())
      const animalIds = Array.from(new Set(movs.map(m => m.animal_id)))

      const [animaisData, pesagensData, eventosData] = await Promise.all([
        buscarPorIds<{ id: string; peso_entrada: number; data_entrada: string }>(animalIds, (idsChunk, from, to) =>
          supabase.from('animais').select('id, peso_entrada, data_entrada').in('id', idsChunk).range(from, to)),
        buscarPorIds<{ animal_id: string; data: string; peso: number }>(animalIds, (idsChunk, from, to) =>
          supabase.from('pesagens').select('animal_id, data, peso').in('animal_id', idsChunk).range(from, to)),
        buscarPorIds<{ animal_id: string; lote_id: string; ciclo_numero: number; ciclo_numero_anterior: number | null; data: string }>(animalIds, (idsChunk, from, to) =>
          supabase.from('animais_ciclo_eventos').select('animal_id, lote_id, ciclo_numero, ciclo_numero_anterior, data').in('animal_id', idsChunk).range(from, to)),
      ])

      const movsPorAnimal: Record<string, Mov[]> = {}
      for (const m of movs) (movsPorAnimal[m.animal_id] ??= []).push(m)
      const pesagensPorAnimal: Record<string, PesagemPonto[]> = {}
      for (const p of pesagensData) (pesagensPorAnimal[p.animal_id] ??= []).push({ data: p.data, peso: p.peso })
      const eventosPorAnimal: Record<string, CicloAnimalEvento[]> = {}
      for (const e of eventosData) {
        (eventosPorAnimal[e.animal_id] ??= []).push({ lote_id: e.lote_id, ciclo_numero: e.ciclo_numero, ciclo_numero_anterior: e.ciclo_numero_anterior, data: e.data })
      }

      const animaisInput: AnimalConsumoIngredienteInput[] = []
      for (const a of animaisData) {
        animaisInput.push({
          animal: { peso_entrada: a.peso_entrada, data_entrada: a.data_entrada },
          pesagens: pesagensPorAnimal[a.id] ?? [],
          periodos: construirPeriodosDeMovimentacoes(movsPorAnimal[a.id] ?? []),
          eventosCiclo: eventosPorAnimal[a.id] ?? [],
        })
      }

      consumo = calcularConsumoIngredientesPorDia(
        animaisInput, ciclosData as CicloInfo[], trocasData, composicoes, chaves, diaInicial, hojeDia + 1, inicioCobertura,
      )
    }
  }

  // Realizado: ingredientes fornecidos (ração feita na fazenda) baixam do
  // estoque no dia do fornecimento.
  for (const f of fornecimentos) {
    if (f.modo !== 'feita_na_fazenda') continue
    const dia = toDay(f.data)
    if (dia > hojeDia) continue
    for (const i of f.itens) {
      if (!chaves.has(i.chave)) continue
      chavesEmDieta.add(i.chave)
      const porDia = (consumo[i.chave] ??= {})
      porDia[dia] = (porDia[dia] ?? 0) + i.kg
    }
  }

  const resultado: Record<string, ResumoIngrediente> = {}
  for (const [chave, lista] of Object.entries(entradasPorChave)) {
    const kardex = calcularKardexIngrediente(
      lista.map(e => ({ id: e.id, tipo: e.tipo, data: e.data, quantidade_kg: Number(e.quantidade_kg), valor_total: Number(e.valor_total), created_at: e.created_at })),
      consumo[chave] ?? {},
      hojeDia,
    )
    resultado[chave] = { ...kardex, chave, usadoEmDieta: chavesEmDieta.has(chave) }
  }
  return resultado
}

export function useComprasIngrediente() {
  const { user } = useAuth()
  const [entradas, setEntradas] = useState<CompraIngrediente[]>([])
  const [ingredientes, setIngredientes] = useState<IngredienteOpcao[]>([])
  const [fornecedores, setFornecedores] = useState<Array<{ id: string; nome: string }>>([])
  const [resumos, setResumos] = useState<Record<string, ResumoIngrediente>>({})
  const [loading, setLoading] = useState(true)
  const [calculando, setCalculando] = useState(false)

  const carregarEntradas = useCallback(async (): Promise<CompraIngrediente[]> => {
    if (!user) return []
    const lista: CompraIngrediente[] = []
    const tamanho = 1000
    for (let from = 0; ; from += tamanho) {
      const { data, error } = await supabase.from('compras_ingrediente').select('*')
        .eq('user_id', user.id).order('data', { ascending: false }).order('created_at', { ascending: false })
        .range(from, from + tamanho - 1)
      if (error || !data) break
      lista.push(...(data as CompraIngrediente[]))
      if (data.length < tamanho) break
    }
    return lista
  }, [user])

  const fetch = useCallback(async () => {
    if (!user) { setLoading(false); return }
    setLoading(true)
    const [lista, { data: insumosData }, { data: produtorData }, { data: parceirosData }] = await Promise.all([
      carregarEntradas(),
      supabase.from('insumos_padrao').select('id, nome, pct_ms, ativo').order('nome'),
      supabase.from('ingredientes_produtor').select('id, nome, pct_ms, ativo').eq('user_id', user.id).order('nome'),
      supabase.from('parceiros').select('id, nome').eq('user_id', user.id).eq('tipo', 'fornecedor').order('nome'),
    ])
    const opcoes: IngredienteOpcao[] = [
      ...((produtorData ?? []) as Array<{ id: string; nome: string; pct_ms: number | null; ativo: boolean }>).map(i => ({
        chave: `ingrediente_produtor:${i.id}`, origem: 'ingrediente_produtor' as const, id: i.id, nome: i.nome, pct_ms: i.pct_ms, ativo: i.ativo,
      })),
      ...((insumosData ?? []) as Array<{ id: string; nome: string; pct_ms: number | null; ativo: boolean }>).map(i => ({
        chave: `insumo_padrao:${i.id}`, origem: 'insumo_padrao' as const, id: i.id, nome: i.nome, pct_ms: i.pct_ms, ativo: i.ativo,
      })),
    ]
    setEntradas(lista)
    setIngredientes(opcoes)
    setFornecedores(parceirosData ?? [])
    setLoading(false)

    setCalculando(true)
    setResumos(await calcularResumos(user.id, lista))
    setCalculando(false)
  }, [user, carregarEntradas])

  useEffect(() => { fetch() }, [fetch])

  // Recalcula o kardex com as entradas atuais e regrava os períodos de custo
  // médio do ingrediente alterado (apaga todos quando não sobra entrada).
  const recalcularIngrediente = async (chave: string): Promise<{ error: string | null }> => {
    if (!user) return { error: 'Não autenticado' }
    setCalculando(true)
    const lista = await carregarEntradas()
    const novosResumos = await calcularResumos(user.id, lista)
    const { origem, id } = dividirChave(chave)
    const colunaId = origem === 'insumo_padrao' ? 'insumo_id' : 'ingrediente_produtor_id'

    const { error: eDel } = await supabase.from('compras_ingrediente_periodos').delete()
      .eq('user_id', user.id).eq('origem_ingrediente', origem).eq(colunaId, id)
    if (eDel) { setCalculando(false); return { error: eDel.message } }

    const resumo = novosResumos[chave]
    if (resumo && resumo.periodos.length > 0) {
      const { error: eIns } = await supabase.from('compras_ingrediente_periodos').insert(resumo.periodos.map(p => ({
        origem_ingrediente: origem,
        insumo_id: origem === 'insumo_padrao' ? id : null,
        ingrediente_produtor_id: origem === 'ingrediente_produtor' ? id : null,
        compra_id: p.compra_id,
        vigente_desde: p.vigente_desde,
        vigente_ate: p.vigente_ate,
        saldo_kg_inicio: p.saldo_kg_inicio,
        custo_medio_kg: p.custo_medio_kg,
        user_id: user.id,
      })))
      if (eIns) { setCalculando(false); return { error: eIns.message } }
    }

    setEntradas(lista)
    setResumos(novosResumos)
    setCalculando(false)
    return { error: null }
  }

  const registrarEntrada = async (input: {
    chave: string
    tipo: Exclude<TipoEntradaIngrediente, 'ajuste'>
    data: string
    quantidade_kg: number
    valor_total: number
    parceiro_id?: string | null
    observacoes?: string
  }): Promise<{ error: string | null }> => {
    if (!user) return { error: 'Não autenticado' }
    if (!(input.quantidade_kg > 0)) return { error: 'Informe uma quantidade válida' }
    if (input.tipo === 'compra' && !(input.valor_total > 0)) return { error: 'Informe o valor da compra' }
    if (input.tipo === 'producao_propria' && !(input.valor_total >= 0)) return { error: 'Informe o custo de produção' }
    const { origem, id } = dividirChave(input.chave)
    const { error } = await supabase.from('compras_ingrediente').insert({
      origem_ingrediente: origem,
      insumo_id: origem === 'insumo_padrao' ? id : null,
      ingrediente_produtor_id: origem === 'ingrediente_produtor' ? id : null,
      tipo: input.tipo,
      data: input.data,
      quantidade_kg: input.quantidade_kg,
      valor_total: input.valor_total,
      parceiro_id: input.tipo === 'compra' ? (input.parceiro_id ?? null) : null,
      observacoes: input.observacoes || null,
      user_id: user.id,
    })
    if (error) return { error: error.message }
    return recalcularIngrediente(input.chave)
  }

  // Ajuste de inventário: grava o saldo contado fisicamente na data. A
  // partir dela, o saldo parte desse valor; o custo médio não muda.
  const ajustarInventario = async (chave: string, data: string, saldoContadoKg: number, observacoes?: string): Promise<{ error: string | null }> => {
    if (!user) return { error: 'Não autenticado' }
    if (!(saldoContadoKg >= 0)) return { error: 'Informe o saldo contado' }
    const { origem, id } = dividirChave(chave)
    const { error } = await supabase.from('compras_ingrediente').insert({
      origem_ingrediente: origem,
      insumo_id: origem === 'insumo_padrao' ? id : null,
      ingrediente_produtor_id: origem === 'ingrediente_produtor' ? id : null,
      tipo: 'ajuste',
      data,
      quantidade_kg: saldoContadoKg,
      valor_total: 0,
      observacoes: observacoes || null,
      user_id: user.id,
    })
    if (error) return { error: error.message }
    return recalcularIngrediente(chave)
  }

  const excluirEntrada = async (entrada: CompraIngrediente): Promise<{ error: string | null }> => {
    const chave = chaveIngrediente(entrada.origem_ingrediente, entrada.insumo_id, entrada.ingrediente_produtor_id)
    const { error } = await supabase.from('compras_ingrediente').delete().eq('id', entrada.id)
    if (error) return { error: error.message }
    if (!chave) { await fetch(); return { error: null } }
    return recalcularIngrediente(chave)
  }

  return { entradas, ingredientes, fornecedores, resumos, loading, calculando, registrarEntrada, ajustarInventario, excluirEntrada, refetch: fetch }
}

// Custo médio vigente hoje de cada ingrediente com estoque (R$/kg natural) —
// usado na tela Dietas para mostrar o custo com o preço do estoque.
export function usePrecosEstoqueHoje() {
  const { user } = useAuth()
  const [precos, setPrecos] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!user) return
    let ativo = true
    ;(async () => {
      const periodos = await carregarPeriodosIngrediente(user.id)
      if (ativo) setPrecos(precosEstoqueNoDia(toDay(new Date().toISOString().slice(0, 10)), periodos))
    })()
    return () => { ativo = false }
  }, [user])

  return precos
}
