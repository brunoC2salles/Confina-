import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { buscarPorIds } from '@/hooks/useLotes'
import { recomputarGrupoCompleto } from '@/hooks/useGruposConsumoRacao'
import { recalcularTodosPeriodosIngrediente } from '@/hooks/useComprasIngrediente'
import {
  toDay, construirPeriodosDeMovimentacoes,
  type CicloInfo, type PesagemPonto, type CicloAnimalEvento, type TrocaDietaCiclo, type HistoricoCustoPonto,
} from '@/lib/custoAnimal'
import { sintetizarHistoricoDieta, type DietaComposicaoInfo } from '@/lib/custoIngrediente'
import { carregarComposicaoDietasDoUsuario, carregarPeriodosIngrediente } from '@/lib/componentesDieta'
import {
  calcularPrevistoPorLotePorDia, dividirEntreLotes, coberturasPorLote, inicioCoberturaPorLote,
  totaisFornecimento, valorFornecimento, distribuirRealizadoNosDias,
  type AnimalLoteInput, type ModoFornecimento, type TotaisFornecimento,
} from '@/lib/fornecimentoRacao'
import { carregarFornecimentosDoUsuario, type FornecimentoCompleto } from '@/lib/fornecimentosDb'

// ─── Fornecimento de ração ─────────────────────────────────────────────────
// Registro da ração efetivamente dada aos lotes (ver fornecimentoRacao.ts),
// divisão automática entre lotes, e o planejado x realizado por lote.

export interface IngredienteFornecimentoOpcao {
  chave: string
  nome: string
  pct_ms: number | null
  tipoPadrao: 'concentrado' | 'volumoso'
  preco_kg: number
  ativo: boolean
}

export interface IndicadoresLote {
  lote_id: string
  desde: string
  dias: number
  planejado: IndicadoresValores
  realizado: IndicadoresValores
}

export interface IndicadoresValores {
  consumoPctPv: number | null
  pctConcentrado: number | null
  custoCabecaDia: number | null
  custoKgGanho: number | null
  conversao: number | null
}

type Mov = { animal_id: string; tipo: string; lote_origem_id: string | null; lote_destino_id: string | null; data: string }

// Animais que passaram pelos lotes, com peso, pesagens, períodos e eventos
// de ciclo; ciclos e trocas de dieta desses lotes.
async function carregarContextoLotes(loteIds: string[]): Promise<{ animais: AnimalLoteInput[]; ciclos: CicloInfo[]; trocas: TrocaDietaCiclo[] }> {
  if (loteIds.length === 0) return { animais: [], ciclos: [], trocas: [] }
  const [ciclosData, trocasData, movsOrigem, movsDestino] = await Promise.all([
    buscarPorIds<CicloInfo>(loteIds, (idsChunk, from, to) =>
      supabase.from('ciclos_lote').select('lote_id, numero, tipo_ciclo, dieta_id, gmd_esperado, data_inicio, data_fim').in('lote_id', idsChunk).range(from, to)),
    buscarPorIds<TrocaDietaCiclo>(loteIds, (idsChunk, from, to) =>
      supabase.from('trocas_dieta_lote').select('lote_id, ciclo_numero, dieta_id, data').in('lote_id', idsChunk).range(from, to)),
    buscarPorIds<Mov>(loteIds, (idsChunk, from, to) =>
      supabase.from('movimentacoes_animais').select('animal_id, tipo, lote_origem_id, lote_destino_id, data').in('lote_origem_id', idsChunk).range(from, to)),
    buscarPorIds<Mov>(loteIds, (idsChunk, from, to) =>
      supabase.from('movimentacoes_animais').select('animal_id, tipo, lote_origem_id, lote_destino_id, data').in('lote_destino_id', idsChunk).range(from, to)),
  ])
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
  const animais: AnimalLoteInput[] = animaisData.map(a => ({
    animal: { peso_entrada: a.peso_entrada, data_entrada: a.data_entrada },
    pesagens: pesagensPorAnimal[a.id] ?? [],
    periodos: construirPeriodosDeMovimentacoes(movsPorAnimal[a.id] ?? []),
    eventosCiclo: eventosPorAnimal[a.id] ?? [],
  }))
  return { animais, ciclos: ciclosData, trocas: trocasData }
}

// Custo por kg de MS do grupo (dieta pronta) na data: confirmado
// manualmente, senão o custo médio do período vigente.
async function carregarCustoGrupos(grupoIds: string[]): Promise<(grupoId: string | null, data: string) => number | null> {
  if (grupoIds.length === 0) return () => null
  const [{ data: gruposData }, { data: periodosData }] = await Promise.all([
    supabase.from('grupos_consumo_racao').select('id, custo_confirmado_kg').in('id', grupoIds),
    supabase.from('grupos_consumo_periodos').select('grupo_id, vigente_desde, vigente_ate, custo_medio_kg').in('grupo_id', grupoIds),
  ])
  const confirmado: Record<string, number | null> = {}
  for (const g of (gruposData ?? []) as Array<{ id: string; custo_confirmado_kg: number | null }>) confirmado[g.id] = g.custo_confirmado_kg
  const periodos: Record<string, Array<{ vigente_desde: string; vigente_ate: string | null; custo_medio_kg: number }>> = {}
  for (const p of (periodosData ?? []) as Array<{ grupo_id: string; vigente_desde: string; vigente_ate: string | null; custo_medio_kg: number }>) {
    (periodos[p.grupo_id] ??= []).push(p)
  }
  return (grupoId, data) => {
    if (!grupoId) return null
    if (confirmado[grupoId] != null) return Number(confirmado[grupoId])
    const dia = toDay(data)
    const p = (periodos[grupoId] ?? []).find(x => {
      const desde = toDay(x.vigente_desde)
      const ate = x.vigente_ate ? toDay(x.vigente_ate) : null
      return dia >= desde && (ate === null || dia < ate)
    })
    return p ? Number(p.custo_medio_kg) : null
  }
}

// Recalcula os estoques afetados por um fornecimento: todos os ingredientes
// e os grupos de consumo dos lotes envolvidos (mais o grupo de origem, na
// mistura pronta).
async function recalcularEstoques(userId: string, loteIds: string[], grupoId: string | null): Promise<{ error: string | null }> {
  const { error: eIng } = await recalcularTodosPeriodosIngrediente(userId)
  if (eIng) return { error: eIng }
  const grupoIds = new Set<string>()
  if (grupoId) grupoIds.add(grupoId)
  if (loteIds.length > 0) {
    const { data } = await supabase.from('grupos_consumo_lotes').select('grupo_id').in('lote_id', loteIds)
    for (const r of (data ?? []) as Array<{ grupo_id: string }>) grupoIds.add(r.grupo_id)
  }
  for (const id of grupoIds) {
    const { error } = await recomputarGrupoCompleto(id, userId)
    if (error) return { error }
  }
  return { error: null }
}

function dividir(a: number, b: number): number | null {
  return b > 0 ? a / b : null
}

export function useFornecimentosRacao() {
  const { user } = useAuth()
  const [fornecimentos, setFornecimentos] = useState<FornecimentoCompleto[]>([])
  const [dietas, setDietas] = useState<Array<{ id: string; nome: string }>>([])
  const [composicoes, setComposicoes] = useState<Record<string, DietaComposicaoInfo>>({})
  const [lotes, setLotes] = useState<Array<{ id: string; nome_lote: string; codigo_lote: string; status: string }>>([])
  const [dietaHojePorLote, setDietaHojePorLote] = useState<Record<string, string | null>>({})
  const [grupos, setGrupos] = useState<Array<{ id: string; nome: string; dieta_id: string; status: string }>>([])
  const [ingredientes, setIngredientes] = useState<IngredienteFornecimentoOpcao[]>([])
  const [indicadores, setIndicadores] = useState<IndicadoresLote[]>([])
  const [loading, setLoading] = useState(true)
  const [calculandoIndicadores, setCalculandoIndicadores] = useState(false)

  const calcularIndicadores = useCallback(async (lista: FornecimentoCompleto[], comps: Record<string, DietaComposicaoInfo>) => {
    if (!user) return
    const hoje = new Date().toISOString().slice(0, 10)
    const hojeDia = toDay(hoje)
    const validos = lista.filter(f => f.data <= hoje)
    const inicio = inicioCoberturaPorLote(validos)
    const loteIds = Object.keys(inicio)
    if (loteIds.length === 0) { setIndicadores([]); return }
    setCalculandoIndicadores(true)

    const grupoIds = Array.from(new Set(validos.map(f => f.grupo_id).filter((x): x is string => !!x)))
    const dietaIds = Object.keys(comps)
    const [contexto, periodosIng, custoGrupo, { data: historicoData }, { data: manualData }] = await Promise.all([
      carregarContextoLotes(loteIds),
      carregarPeriodosIngrediente(user.id),
      carregarCustoGrupos(grupoIds),
      dietaIds.length > 0
        ? supabase.from('dietas_historico_custo').select('dieta_id, custo_kg_ms, vigente_desde, vigente_ate').in('dieta_id', dietaIds)
        : Promise.resolve({ data: [] }),
      dietaIds.length > 0
        ? supabase.from('dietas').select('id, custo_manual_ativo, custo_manual_valor, custo_manual_unidade').in('id', dietaIds)
        : Promise.resolve({ data: [] }),
    ])

    // Custo planejado por kg de MS da dieta no dia — mesma regra do motor de
    // custo: custo manual quando ativo; senão o histórico da dieta com o
    // preço do estoque de ingredientes.
    const historicoPorDieta: Record<string, HistoricoCustoPonto[]> = {}
    for (const h of (historicoData ?? []) as Array<{ dieta_id: string; custo_kg_ms: number | null; vigente_desde: string; vigente_ate: string | null }>) {
      (historicoPorDieta[h.dieta_id] ??= []).push({ custo_kg_ms: h.custo_kg_ms, vigente_desde: h.vigente_desde, vigente_ate: h.vigente_ate })
    }
    const manualPorDieta: Record<string, number | null> = {}
    for (const d of (manualData ?? []) as Array<{ id: string; custo_manual_ativo: boolean; custo_manual_valor: number | null; custo_manual_unidade: 'kg' | 'ton' | null }>) {
      if (d.custo_manual_ativo) manualPorDieta[d.id] = d.custo_manual_valor != null ? (d.custo_manual_unidade === 'ton' ? d.custo_manual_valor / 1000 : d.custo_manual_valor) : null
    }
    const historicoFinal: Record<string, HistoricoCustoPonto[]> = {}
    for (const id of dietaIds) {
      const base = [...(historicoPorDieta[id] ?? [])].sort((a, b) => a.vigente_desde.localeCompare(b.vigente_desde))
      historicoFinal[id] = comps[id] && !(id in manualPorDieta) ? sintetizarHistoricoDieta(base, comps[id], periodosIng) : base
    }
    const custoDietaNoDia = (dietaId: string, dia: number): number | null => {
      if (dietaId in manualPorDieta) return manualPorDieta[dietaId]
      for (const h of historicoFinal[dietaId] ?? []) {
        const desde = toDay(h.vigente_desde)
        const ate = h.vigente_ate ? toDay(h.vigente_ate) : null
        if (dia >= desde && (ate === null || dia < ate)) return h.custo_kg_ms
      }
      return null
    }

    const diaInicial = Math.min(...loteIds.map(id => inicio[id]))
    const previsto = calcularPrevistoPorLotePorDia(
      contexto.animais, new Set(loteIds), contexto.ciclos, contexto.trocas, comps, diaInicial, hojeDia + 1, custoDietaNoDia,
    )

    const totais: Record<string, TotaisFornecimento> = {}
    const valores: Record<string, number> = {}
    for (const f of validos) {
      totais[f.id] = totaisFornecimento(f, comps[f.dieta_id])
      valores[f.id] = valorFornecimento(f, comps[f.dieta_id], periodosIng, custoGrupo(f.grupo_id, f.data))
    }
    const coberturas = coberturasPorLote(validos, hojeDia)

    const resultado: IndicadoresLote[] = []
    for (const loteId of loteIds) {
      const previstoLote = previsto[loteId] ?? {}
      const realizado = distribuirRealizadoNosDias(coberturas[loteId] ?? [], previstoLote, totais, valores)
      let peso = 0, cabecasDia = 0, ganho = 0, consPrev = 0, concPrev = 0, custoPrev = 0
      let consReal = 0, concReal = 0, custoReal = 0
      for (let d = inicio[loteId]; d <= hojeDia; d++) {
        const p = previstoLote[d]
        if (p) {
          peso += p.pesoTotalKg; cabecasDia += p.qtd; ganho += p.ganhoKg
          consPrev += p.consumoMsKg; concPrev += p.concentradoMsKg; custoPrev += p.custoPrevisto
        }
        const r = realizado[d]
        if (r) { consReal += r.kgMs; concReal += r.kgMsConcentrado; custoReal += r.valor }
      }
      const pct = (a: number | null) => (a != null ? a * 100 : null)
      resultado.push({
        lote_id: loteId,
        desde: new Date(inicio[loteId] * 86400000).toISOString().slice(0, 10),
        dias: hojeDia - inicio[loteId] + 1,
        planejado: {
          consumoPctPv: pct(dividir(consPrev, peso)),
          pctConcentrado: pct(dividir(concPrev, consPrev)),
          custoCabecaDia: dividir(custoPrev, cabecasDia),
          custoKgGanho: dividir(custoPrev, ganho),
          conversao: dividir(concPrev, ganho),
        },
        realizado: {
          consumoPctPv: pct(dividir(consReal, peso)),
          pctConcentrado: pct(dividir(concReal, consReal)),
          custoCabecaDia: dividir(custoReal, cabecasDia),
          custoKgGanho: dividir(custoReal, ganho),
          conversao: dividir(concReal, ganho),
        },
      })
    }
    setIndicadores(resultado)
    setCalculandoIndicadores(false)
  }, [user])

  const fetch = useCallback(async () => {
    if (!user) { setLoading(false); return }
    setLoading(true)
    const [lista, comps, { data: dietasData }, { data: lotesData }, { data: gruposData }, { data: insumosData }, { data: produtorData }, { data: precosData }] = await Promise.all([
      carregarFornecimentosDoUsuario(user.id),
      carregarComposicaoDietasDoUsuario(user.id),
      supabase.from('dietas').select('id, nome').eq('user_id', user.id).order('nome'),
      supabase.from('lotes').select('id, nome_lote, codigo_lote, status, ciclo_atual').eq('user_id', user.id).order('nome_lote'),
      supabase.from('grupos_consumo_racao').select('id, nome, dieta_id, status').eq('user_id', user.id).order('nome'),
      supabase.from('insumos_padrao').select('id, nome, categoria, pct_ms, preco_referencia, ativo').order('nome'),
      supabase.from('ingredientes_produtor').select('id, nome, categoria, pct_ms, preco_kg, ativo').eq('user_id', user.id).order('nome'),
      supabase.from('precos_produtor').select('insumo_id, preco_kg').eq('user_id', user.id),
    ])

    const lotesLista = (lotesData ?? []) as Array<{ id: string; nome_lote: string; codigo_lote: string; status: string; ciclo_atual: number }>
    // Dieta planejada hoje em cada lote ativo (ciclo atual do lote e a troca
    // de dieta mais recente desse ciclo) — usada para já marcar os lotes ao
    // escolher a dieta no registro.
    const ativosIds = lotesLista.filter(l => l.status === 'ativo').map(l => l.id)
    const dietaHoje: Record<string, string | null> = {}
    if (ativosIds.length > 0) {
      const hoje = new Date().toISOString().slice(0, 10)
      const [{ data: ciclosData }, { data: trocasData }] = await Promise.all([
        supabase.from('ciclos_lote').select('lote_id, numero, dieta_id').in('lote_id', ativosIds),
        supabase.from('trocas_dieta_lote').select('lote_id, ciclo_numero, dieta_id, data').in('lote_id', ativosIds),
      ])
      for (const l of lotesLista.filter(x => x.status === 'ativo')) {
        const ciclo = ((ciclosData ?? []) as Array<{ lote_id: string; numero: number; dieta_id: string | null }>)
          .find(c => c.lote_id === l.id && c.numero === l.ciclo_atual)
        let dieta = ciclo?.dieta_id ?? null
        let melhor = ''
        for (const t of (trocasData ?? []) as Array<{ lote_id: string; ciclo_numero: number; dieta_id: string; data: string }>) {
          if (t.lote_id === l.id && t.ciclo_numero === l.ciclo_atual && t.data <= hoje && t.data > melhor) { melhor = t.data; dieta = t.dieta_id }
        }
        dietaHoje[l.id] = dieta
      }
    }

    const precoProdutor: Record<string, number> = {}
    for (const p of (precosData ?? []) as Array<{ insumo_id: string; preco_kg: number }>) precoProdutor[p.insumo_id] = Number(p.preco_kg)
    const tipoPorCategoria = (cat: string): 'concentrado' | 'volumoso' => (cat === 'volumoso' ? 'volumoso' : 'concentrado')
    const opcoes: IngredienteFornecimentoOpcao[] = [
      ...((produtorData ?? []) as Array<{ id: string; nome: string; categoria: string; pct_ms: number | null; preco_kg: number; ativo: boolean }>).map(i => ({
        chave: `ingrediente_produtor:${i.id}`, nome: i.nome, pct_ms: i.pct_ms, tipoPadrao: tipoPorCategoria(i.categoria), preco_kg: Number(i.preco_kg ?? 0), ativo: i.ativo,
      })),
      ...((insumosData ?? []) as Array<{ id: string; nome: string; categoria: string; pct_ms: number | null; preco_referencia: number | null; ativo: boolean }>).map(i => ({
        chave: `insumo_padrao:${i.id}`, nome: i.nome, pct_ms: i.pct_ms, tipoPadrao: tipoPorCategoria(i.categoria),
        preco_kg: precoProdutor[i.id] ?? Number(i.preco_referencia ?? 0), ativo: i.ativo,
      })),
    ]

    setFornecimentos(lista)
    setComposicoes(comps)
    setDietas(dietasData ?? [])
    setLotes(lotesLista.map(l => ({ id: l.id, nome_lote: l.nome_lote, codigo_lote: l.codigo_lote, status: l.status })))
    setDietaHojePorLote(dietaHoje)
    setGrupos((gruposData ?? []) as Array<{ id: string; nome: string; dieta_id: string; status: string }>)
    setIngredientes(opcoes)
    setLoading(false)

    await calcularIndicadores(lista, comps)
  }, [user, calcularIndicadores])

  useEffect(() => { fetch() }, [fetch])

  const registrarFornecimento = async (input: {
    data: string
    dieta_id: string
    modo: ModoFornecimento
    grupo_id: string | null
    kg_total: number
    pct_ms: number | null
    itens: Array<{ chave: string; tipo: 'concentrado' | 'volumoso'; kg: number; pct_ms: number; preco_kg_referencia: number }>
    loteIds: string[]
    observacoes?: string
  }): Promise<{ error: string | null; divisao?: Array<{ lote_id: string; fracao: number }> }> => {
    if (!user) return { error: 'Não autenticado' }
    if (!input.data || !input.dieta_id) return { error: 'Informe a data e a dieta' }
    if (input.loteIds.length === 0) return { error: 'Escolha ao menos um lote' }

    let kgTotal = input.kg_total
    if (input.modo === 'mistura_pronta') {
      if (!input.grupo_id) return { error: 'Escolha o grupo de consumo de onde sai a ração' }
      if (!(kgTotal > 0)) return { error: 'Informe a quantidade fornecida' }
      if (!(input.pct_ms != null && input.pct_ms > 0 && input.pct_ms <= 100)) return { error: 'Informe a % de matéria seca (entre 0 e 100)' }
    } else {
      const itens = input.itens.filter(i => i.kg > 0)
      if (itens.length === 0) return { error: 'Informe a quantidade de ao menos um ingrediente' }
      const semMs = itens.find(i => !(i.pct_ms > 0 && i.pct_ms <= 100))
      if (semMs) return { error: 'Informe a % de matéria seca de todos os ingredientes' }
      kgTotal = itens.reduce((s, i) => s + i.kg, 0)
      input = { ...input, itens }
    }

    // Divisão automática entre os lotes: consumo previsto de cada um na data.
    const dia = toDay(input.data)
    const contexto = await carregarContextoLotes(input.loteIds)
    const previsto = calcularPrevistoPorLotePorDia(
      contexto.animais, new Set(input.loteIds), contexto.ciclos, contexto.trocas, composicoes, dia, dia + 1,
    )
    const previstoNaData: Record<string, (typeof previsto)[string][number] | undefined> = {}
    for (const id of input.loteIds) previstoNaData[id] = previsto[id]?.[dia]
    const divisao = dividirEntreLotes(input.loteIds, previstoNaData)
    if (!divisao) return { error: 'Nenhum animal nos lotes escolhidos nessa data' }

    const { data: novo, error: e1 } = await supabase.from('fornecimentos_racao').insert({
      data: input.data,
      dieta_id: input.dieta_id,
      modo: input.modo,
      grupo_id: input.modo === 'mistura_pronta' ? input.grupo_id : null,
      kg_total: kgTotal,
      pct_ms: input.modo === 'mistura_pronta' ? input.pct_ms : null,
      observacoes: input.observacoes || null,
      user_id: user.id,
    }).select('id').single()
    if (e1 || !novo) return { error: e1?.message ?? 'Erro ao registrar fornecimento' }

    const desfazer = async (msg: string) => {
      await supabase.from('fornecimentos_racao').delete().eq('id', novo.id)
      return { error: msg }
    }

    if (input.modo === 'feita_na_fazenda') {
      const { error: e2 } = await supabase.from('fornecimentos_racao_itens').insert(input.itens.map(i => {
        const [origem, id] = i.chave.split(':')
        return {
          fornecimento_id: novo.id,
          origem_ingrediente: origem,
          insumo_id: origem === 'insumo_padrao' ? id : null,
          ingrediente_produtor_id: origem === 'ingrediente_produtor' ? id : null,
          tipo: i.tipo,
          kg: i.kg,
          pct_ms: i.pct_ms,
          preco_kg_referencia: i.preco_kg_referencia,
          user_id: user.id,
        }
      }))
      if (e2) return desfazer(e2.message)
    }

    const { error: e3 } = await supabase.from('fornecimentos_racao_lotes').insert(divisao.map(d => ({
      fornecimento_id: novo.id, lote_id: d.lote_id, fracao: d.fracao, consumo_previsto_ms_kg: d.consumo_previsto_ms_kg, user_id: user.id,
    })))
    if (e3) return desfazer(e3.message)

    const { error: eRecalc } = await recalcularEstoques(user.id, input.loteIds, input.modo === 'mistura_pronta' ? input.grupo_id : null)
    await fetch()
    if (eRecalc) return { error: `Fornecimento registrado, mas houve erro ao recalcular os estoques: ${eRecalc}` }
    return { error: null, divisao: divisao.map(d => ({ lote_id: d.lote_id, fracao: d.fracao })) }
  }

  const excluirFornecimento = async (f: FornecimentoCompleto): Promise<{ error: string | null }> => {
    if (!user) return { error: 'Não autenticado' }
    const { error } = await supabase.from('fornecimentos_racao').delete().eq('id', f.id)
    if (error) return { error: error.message }
    const { error: eRecalc } = await recalcularEstoques(user.id, f.lotes.map(l => l.lote_id), f.grupo_id)
    await fetch()
    return { error: eRecalc }
  }

  return {
    fornecimentos, dietas, composicoes, lotes, dietaHojePorLote, grupos, ingredientes, indicadores,
    loading, calculandoIndicadores, registrarFornecimento, excluirFornecimento, refetch: fetch,
  }
}
