import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { buscarPorIds } from '@/hooks/useLotes'
import {
  toDay, construirPeriodosDeMovimentacoes,
  type PeriodoLote, type CicloInfo, type PesagemPonto, type CicloAnimalEvento, type TrocaDietaCiclo,
} from '@/lib/custoAnimal'
import {
  calcularConsumoTeoricoPorLotePorDia, calcularSaldoGrupo, calcularNovoPeriodo,
  calcularRankingConsumoPorCompra,
  type PeriodoCustoGrupo, type CompraGrupoInfo, type SaldoGrupo, type RankingLoteCompra,
  type AnimalConsumoInput,
} from '@/lib/custoRacaoGrupo'
import type {
  GrupoConsumoRacao, GrupoConsumoLoteRow, CompraRacaoGrupo, GrupoConsumoPeriodo,
} from '@/types'

// ─── Lista de grupos + dados auxiliares para os formulários ───────────────
// Fetch leve (sem cálculo de consumo/saldo) — usado na tela de listagem.
// O cálculo pesado (saldo, custo médio, ranking) só roda no detalhe de um
// grupo específico, em useResumoGrupo, abaixo.

export interface GrupoConsumoComDieta extends GrupoConsumoRacao {
  dieta_nome: string | null
}

export function useGruposConsumoRacao() {
  const { user } = useAuth()
  const [grupos, setGrupos] = useState<GrupoConsumoComDieta[]>([])
  const [lotesAtivos, setLotesAtivos] = useState<Array<{ id: string; nome_lote: string; codigo_lote: string }>>([])
  const [dietas, setDietas] = useState<Array<{ id: string; nome: string; pct_consumo_pv_ms: number | null }>>([])
  const [fornecedores, setFornecedores] = useState<Array<{ id: string; nome: string }>>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user) { setGrupos([]); setLoading(false); return }
    setLoading(true)
    const [{ data: gruposData }, { data: lotesData }, { data: dietasData }, { data: parceirosData }] = await Promise.all([
      supabase.from('grupos_consumo_racao').select('*, dieta:dietas(nome)').eq('user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('lotes').select('id, nome_lote, codigo_lote').eq('user_id', user.id).eq('status', 'ativo').order('nome_lote'),
      supabase.from('dietas').select('id, nome, pct_consumo_pv_ms').eq('user_id', user.id).order('nome'),
      supabase.from('parceiros').select('id, nome').eq('user_id', user.id).eq('tipo', 'fornecedor').order('nome'),
    ])
    setGrupos(((gruposData ?? []) as Array<GrupoConsumoRacao & { dieta: { nome: string } | null }>)
      .map(g => { const { dieta, ...resto } = g; return { ...resto, dieta_nome: dieta?.nome ?? null } }))
    setLotesAtivos(lotesData ?? [])
    setDietas(dietasData ?? [])
    setFornecedores(parceirosData ?? [])
    setLoading(false)
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  const criarGrupo = async (input: { nome: string; dieta_id: string; observacoes?: string; loteIds: string[] }) => {
    if (!user) return { error: 'Não autenticado', grupoId: null }
    const hoje = new Date().toISOString().slice(0, 10)
    const { data: grupo, error } = await supabase.from('grupos_consumo_racao').insert({
      nome: input.nome, dieta_id: input.dieta_id, observacoes: input.observacoes || null,
      status: 'ativo', user_id: user.id,
    }).select().single()
    if (error || !grupo) return { error: error?.message ?? 'Erro ao criar grupo', grupoId: null }

    if (input.loteIds.length > 0) {
      const membros = input.loteIds.map(loteId => ({
        grupo_id: grupo.id, lote_id: loteId, data_inicio: hoje, user_id: user.id,
      }))
      const { error: e2 } = await supabase.from('grupos_consumo_lotes').insert(membros)
      if (e2) return { error: e2.message, grupoId: null }
    }
    await fetch()
    return { error: null, grupoId: grupo.id as string }
  }

  const editarGrupo = async (id: string, input: { nome?: string; observacoes?: string | null; status?: 'ativo' | 'encerrado' }) => {
    const { error } = await supabase.from('grupos_consumo_racao').update(input).eq('id', id)
    if (!error) await fetch()
    return { error: error?.message ?? null }
  }

  const excluirGrupo = async (id: string) => {
    const { error } = await supabase.from('grupos_consumo_racao').delete().eq('id', id)
    if (!error) await fetch()
    return { error: error?.message ?? null }
  }

  return { grupos, lotesAtivos, dietas, fornecedores, loading, criarGrupo, editarGrupo, excluirGrupo, refetch: fetch }
}

// ─── Detalhe de um grupo: membros, compras, períodos, saldo, ranking ──────
// Busca dados de peso/pesagens/movimentações dos lotes membros (mesmo
// princípio de useCustoEngine em useLotes.ts) pra calcular consumo teórico,
// saldo e custo médio vigente sob demanda.

export function useResumoGrupo(grupoId: string | null) {
  const { user } = useAuth()
  const [membros, setMembros] = useState<GrupoConsumoLoteRow[]>([])
  const [compras, setCompras] = useState<CompraRacaoGrupo[]>([])
  const [periodos, setPeriodos] = useState<GrupoConsumoPeriodo[]>([])
  const [lotesInfo, setLotesInfo] = useState<Record<string, { nome_lote: string; codigo_lote: string }>>({})
  const [saldo, setSaldo] = useState<SaldoGrupo | null>(null)
  const [consumoTeoricoPorLote, setConsumoTeoricoPorLote] =
    useState<Record<string, Record<number, { pesoTotalKg: number; qtdAtiva: number; consumoKg: number }>>>({})
  const [pctConsumoPvMs, setPctConsumoPvMs] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user || !grupoId) { setLoading(false); return }
    setLoading(true)

    const [{ data: grupoData }, { data: membrosData }, { data: comprasData }, { data: periodosData }] = await Promise.all([
      supabase.from('grupos_consumo_racao').select('dieta_id').eq('id', grupoId).single(),
      supabase.from('grupos_consumo_lotes').select('*').eq('grupo_id', grupoId).order('data_inicio'),
      supabase.from('compras_racao_grupo').select('*').eq('grupo_id', grupoId).order('data_inicio_uso'),
      supabase.from('grupos_consumo_periodos').select('*').eq('grupo_id', grupoId).order('vigente_desde'),
    ])

    const membrosArr = (membrosData ?? []) as GrupoConsumoLoteRow[]
    const comprasArr = (comprasData ?? []) as CompraRacaoGrupo[]
    const periodosArr = (periodosData ?? []) as GrupoConsumoPeriodo[]
    setMembros(membrosArr)
    setCompras(comprasArr)
    setPeriodos(periodosArr)

    const loteIds = Array.from(new Set(membrosArr.map(m => m.lote_id)))

    let pct: number | null = null
    if (grupoData?.dieta_id) {
      const { data: dietaData } = await supabase.from('dietas').select('pct_consumo_pv_ms').eq('id', grupoData.dieta_id).single()
      pct = dietaData?.pct_consumo_pv_ms ?? null
    }
    setPctConsumoPvMs(pct)

    if (loteIds.length === 0) {
      setLotesInfo({})
      setConsumoTeoricoPorLote({})
      setSaldo({ totalCompradoKg: comprasArr.reduce((s, c) => s + c.quantidade_kg, 0), totalConsumidoTeoricoKg: 0, saldoKg: 0, custoMedioKgVigente: null })
      setLoading(false)
      return
    }

    const [{ data: lotesData }, { data: ciclosData }, { data: trocasDietaData }, movsOrigem, movsDestino] = await Promise.all([
      supabase.from('lotes').select('id, nome_lote, codigo_lote').in('id', loteIds),
      supabase.from('ciclos_lote').select('lote_id, numero, tipo_ciclo, dieta_id, gmd_esperado, data_inicio, data_fim').in('lote_id', loteIds),
      supabase.from('trocas_dieta_lote').select('lote_id, ciclo_numero, dieta_id, data').in('lote_id', loteIds),
      buscarPorIds<{ animal_id: string; tipo: string; lote_origem_id: string | null; lote_destino_id: string | null; data: string }>(loteIds, (idsChunk, from, to) =>
        supabase.from('movimentacoes_animais').select('animal_id, tipo, lote_origem_id, lote_destino_id, data').in('lote_origem_id', idsChunk).range(from, to)),
      buscarPorIds<{ animal_id: string; tipo: string; lote_origem_id: string | null; lote_destino_id: string | null; data: string }>(loteIds, (idsChunk, from, to) =>
        supabase.from('movimentacoes_animais').select('animal_id, tipo, lote_origem_id, lote_destino_id, data').in('lote_destino_id', idsChunk).range(from, to)),
    ])

    const info: Record<string, { nome_lote: string; codigo_lote: string }> = {}
    for (const l of lotesData ?? []) info[l.id] = { nome_lote: l.nome_lote, codigo_lote: l.codigo_lote }
    setLotesInfo(info)

    const ciclos = (ciclosData ?? []) as CicloInfo[]
    const trocasDieta = (trocasDietaData ?? []) as TrocaDietaCiclo[]

    // Dedupe entre as duas buscas (um movimento pode ter lote_origem_id E
    // lote_destino_id dentro do mesmo conjunto de loteIds, ex.: transferência
    // entre dois lotes que estão os dois no grupo).
    const movsMap = new Map<string, { animal_id: string; tipo: string; lote_origem_id: string | null; lote_destino_id: string | null; data: string }>()
    for (const m of [...movsOrigem, ...movsDestino]) {
      movsMap.set(`${m.animal_id}|${m.tipo}|${m.data}|${m.lote_origem_id ?? ''}|${m.lote_destino_id ?? ''}`, m)
    }
    const movs = Array.from(movsMap.values())
    const animalIds = Array.from(new Set(movs.map(m => m.animal_id)))

    const [animaisData, pesagensData, eventosCicloData] = await Promise.all([
      buscarPorIds<{ id: string; peso_entrada: number; data_entrada: string }>(animalIds, (idsChunk, from, to) =>
        supabase.from('animais').select('id, peso_entrada, data_entrada').in('id', idsChunk).range(from, to)),
      buscarPorIds<{ animal_id: string; data: string; peso: number }>(animalIds, (idsChunk, from, to) =>
        supabase.from('pesagens').select('animal_id, data, peso').in('animal_id', idsChunk).range(from, to)),
      buscarPorIds<{ animal_id: string; lote_id: string; ciclo_numero: number; ciclo_numero_anterior: number | null; data: string }>(animalIds, (idsChunk, from, to) =>
        supabase.from('animais_ciclo_eventos').select('animal_id, lote_id, ciclo_numero, ciclo_numero_anterior, data').in('animal_id', idsChunk).range(from, to)),
    ])

    const animaisPorId: Record<string, { peso_entrada: number; data_entrada: string }> = {}
    for (const a of animaisData) animaisPorId[a.id] = { peso_entrada: a.peso_entrada, data_entrada: a.data_entrada }
    const pesagensPorAnimal: Record<string, PesagemPonto[]> = {}
    for (const p of pesagensData) (pesagensPorAnimal[p.animal_id] ??= []).push({ data: p.data, peso: p.peso })
    const movsPorAnimal: Record<string, typeof movs> = {}
    for (const m of movs) (movsPorAnimal[m.animal_id] ??= []).push(m)
    const eventosCicloPorAnimal: Record<string, CicloAnimalEvento[]> = {}
    for (const e of eventosCicloData) {
      (eventosCicloPorAnimal[e.animal_id] ??= []).push({
        lote_id: e.lote_id, ciclo_numero: e.ciclo_numero, ciclo_numero_anterior: e.ciclo_numero_anterior, data: e.data,
      })
    }

    const animaisPorLote: Record<string, AnimalConsumoInput[]> = {}
    for (const loteId of loteIds) animaisPorLote[loteId] = []
    const periodosPorAnimal: Record<string, PeriodoLote[]> = {}
    for (const animalId of animalIds) {
      const animal = animaisPorId[animalId]
      if (!animal) continue
      const periodosDoAnimal = construirPeriodosDeMovimentacoes(movsPorAnimal[animalId] ?? [])
      periodosPorAnimal[animalId] = periodosDoAnimal
      for (const loteId of loteIds) {
        if (periodosDoAnimal.some(p => p.lote_id === loteId)) {
          animaisPorLote[loteId].push({
            animal, pesagens: pesagensPorAnimal[animalId] ?? [], periodos: periodosDoAnimal,
            eventosCiclo: eventosCicloPorAnimal[animalId] ?? [],
          })
        }
      }
    }

    // Limite de fim de participação por lote (equivalente a "Encerrar
    // participação" na UI): se alguma linha de participação desse lote nesse
    // grupo está em aberto (sem data_fim), não há corte. Senão, usa a
    // data_fim mais recente entre as participações já encerradas — cobre o
    // caso raro de um lote ter sido removido e readicionado ao grupo mais de
    // uma vez. "Desde" (data_inicio) não entra mais nessa conta — é só
    // informativo agora, porque quem define desde quando um lote conta pra
    // esse grupo é a dieta que ele de fato estava consumindo, não a data em
    // que foi cadastrado na tela.
    const limiteFimPorLote: Record<string, number | null> = {}
    for (const loteId of loteIds) {
      const linhasDoLote = membrosArr.filter(m => m.lote_id === loteId)
      const semCorte = linhasDoLote.some(m => !m.data_fim)
      limiteFimPorLote[loteId] = semCorte ? null : Math.max(...linhasDoLote.map(m => toDay(m.data_fim as string)))
    }

    if (pct != null && grupoData?.dieta_id) {
      const hojeDia = toDay(new Date().toISOString().slice(0, 10))
      // Só faz sentido contar consumo a partir da primeira compra do grupo —
      // dias com a dieta batendo mas sem nenhuma compra registrada ainda não
      // têm preço vigente pra eles, e não devem "gastar" saldo que ainda nem
      // existia (ver calcularSaldoGrupo). Sem nenhuma compra, não há o que
      // calcular.
      const diaInicial = comprasArr.length > 0 ? Math.min(...comprasArr.map(c => toDay(c.data_inicio_uso))) : null
      const consumo = diaInicial !== null
        ? calcularConsumoTeoricoPorLotePorDia(
            loteIds, animaisPorLote, ciclos, pct, grupoData.dieta_id, trocasDieta, diaInicial, hojeDia + 1, limiteFimPorLote,
          )
        : {}
      setConsumoTeoricoPorLote(consumo)

      const comprasInfo: CompraGrupoInfo[] = comprasArr.map(c => ({
        id: c.id, quantidade_kg: c.quantidade_kg, valor_total: c.valor_total,
        data_compra: c.data_compra, data_inicio_uso: c.data_inicio_uso,
      }))
      const periodosInfo: PeriodoCustoGrupo[] = periodosArr.map(p => ({
        id: p.id, compra_id: p.compra_id, vigente_desde: p.vigente_desde, vigente_ate: p.vigente_ate,
        saldo_kg_inicio: p.saldo_kg_inicio, custo_medio_kg: p.custo_medio_kg,
      }))
      setSaldo(calcularSaldoGrupo(comprasInfo, consumo, periodosInfo, hojeDia))
    } else {
      setConsumoTeoricoPorLote({})
      setSaldo(null)
    }

    setLoading(false)
  }, [user, grupoId])

  useEffect(() => { fetch() }, [fetch])

  // Registra uma nova compra: calcula o saldo (kg e R$) imediatamente antes
  // da data_inicio_uso informada, deriva o novo custo médio ponderado,
  // fecha o período aberto anterior (se houver) e abre um novo.
  const registrarCompra = async (input: {
    quantidade_kg: number; valor_total: number; data_compra: string; data_inicio_uso: string
    parceiro_id?: string | null; observacoes?: string
  }) => {
    if (!user || !grupoId) return { error: 'Não autenticado' }

    const diaUso = toDay(input.data_inicio_uso)
    const periodoAberto = periodos.find(p => p.vigente_ate === null)
    if (periodoAberto && diaUso < toDay(periodoAberto.vigente_desde)) {
      return { error: 'A data de início de uso precisa ser igual ou posterior à última compra registrada para este grupo.' }
    }

    let consumidoAntes = 0
    for (const porDia of Object.values(consumoTeoricoPorLote)) {
      for (const [diaStr, infoDia] of Object.entries(porDia)) {
        if (Number(diaStr) < diaUso) consumidoAntes += infoDia.consumoKg
      }
    }
    const compradoAntes = compras.reduce((s, c) => s + c.quantidade_kg, 0)
    const saldoKgAntes = compradoAntes - consumidoAntes
    const custoMedioAntes = periodoAberto?.custo_medio_kg ?? 0
    const saldoValorAntes = saldoKgAntes * custoMedioAntes

    const { saldoKgInicio, custoMedioKg } = calcularNovoPeriodo(saldoKgAntes, saldoValorAntes, input.quantidade_kg, input.valor_total)

    const { data: novaCompra, error: e1 } = await supabase.from('compras_racao_grupo').insert({
      grupo_id: grupoId, quantidade_kg: input.quantidade_kg, valor_total: input.valor_total,
      data_compra: input.data_compra, data_inicio_uso: input.data_inicio_uso,
      parceiro_id: input.parceiro_id ?? null, observacoes: input.observacoes ?? null, user_id: user.id,
    }).select().single()
    if (e1 || !novaCompra) return { error: e1?.message ?? 'Erro ao registrar compra' }

    if (periodoAberto) {
      const { error: e2 } = await supabase.from('grupos_consumo_periodos')
        .update({ vigente_ate: input.data_inicio_uso }).eq('id', periodoAberto.id)
      if (e2) return { error: e2.message }
    }

    const { error: e3 } = await supabase.from('grupos_consumo_periodos').insert({
      grupo_id: grupoId, compra_id: novaCompra.id, vigente_desde: input.data_inicio_uso, vigente_ate: null,
      saldo_kg_inicio: saldoKgInicio, custo_medio_kg: custoMedioKg, user_id: user.id,
    })
    if (e3) return { error: e3.message }

    await fetch()
    return { error: null }
  }

  const adicionarLote = async (loteId: string, dataInicio: string) => {
    if (!user || !grupoId) return { error: 'Não autenticado' }
    const { error } = await supabase.from('grupos_consumo_lotes').insert({
      grupo_id: grupoId, lote_id: loteId, data_inicio: dataInicio, user_id: user.id,
    })
    if (!error) await fetch()
    return { error: error?.message ?? null }
  }

  const encerrarParticipacao = async (membershipId: string, dataFim: string) => {
    const { error } = await supabase.from('grupos_consumo_lotes').update({ data_fim: dataFim }).eq('id', membershipId)
    if (!error) await fetch()
    return { error: error?.message ?? null }
  }

  const rankingPorCompra = useCallback((compraId: string): RankingLoteCompra[] => {
    const periodo = periodos.find(p => p.compra_id === compraId)
    if (!periodo) return []
    const hojeDia = toDay(new Date().toISOString().slice(0, 10))
    const periodoInfo: PeriodoCustoGrupo = {
      id: periodo.id, compra_id: periodo.compra_id, vigente_desde: periodo.vigente_desde,
      vigente_ate: periodo.vigente_ate, saldo_kg_inicio: periodo.saldo_kg_inicio, custo_medio_kg: periodo.custo_medio_kg,
    }
    return calcularRankingConsumoPorCompra(periodoInfo, consumoTeoricoPorLote, hojeDia)
  }, [periodos, consumoTeoricoPorLote])

  return {
    membros, compras, periodos, lotesInfo, saldo, loading, pctConsumoPvMs,
    registrarCompra, adicionarLote, encerrarParticipacao, rankingPorCompra, refetch: fetch,
  }
}
