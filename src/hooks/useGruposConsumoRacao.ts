import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { buscarPorIds } from '@/hooks/useLotes'
import {
  toDay, construirPeriodosDeMovimentacoes, encontrarLoteAtivo, dietaVigenteDoAnimalNoDia,
  type CicloInfo, type PesagemPonto, type CicloAnimalEvento, type TrocaDietaCiclo,
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

interface DadosConsumoGrupo {
  membrosArr: GrupoConsumoLoteRow[]
  comprasArr: CompraRacaoGrupo[]
  periodosArr: GrupoConsumoPeriodo[]
  lotesInfo: Record<string, { nome_lote: string; codigo_lote: string }>
  pct: number | null
  dietaId: string | null
  consumoTeoricoPorLote: Record<string, Record<number, { pesoTotalKg: number; qtdAtiva: number; consumoKg: number }>>
  // Se algum animal de algum lote do grupo está HOJE de fato num ciclo com a
  // mesma dieta associada à compra — usado pra tratar um saldo negativo como
  // "ok" quando o consumo já está fechado (nenhum animal mais nessa dieta),
  // situação histórica que não precisa mais de alerta pedindo pra lançar
  // outra compra.
  algumAnimalNaDietaHoje: boolean
}

// ─── Carrega tudo que é necessário pra calcular consumo teórico e saldo de
// um grupo — extraído como função pura (não mexe em estado de nenhum hook)
// porque é usada tanto no fetch() normal quanto sempre que uma compra é
// criada ou editada, pra saber o consumo teórico ATUALIZADO antes de
// recalcular a cadeia de períodos de custo médio (ver recomputarPeriodos,
// dentro de useResumoGrupo).
async function carregarDadosConsumoGrupo(grupoId: string): Promise<DadosConsumoGrupo> {
  const [{ data: grupoData }, { data: membrosData }, { data: comprasData }, { data: periodosData }] = await Promise.all([
    supabase.from('grupos_consumo_racao').select('dieta_id').eq('id', grupoId).single(),
    supabase.from('grupos_consumo_lotes').select('*').eq('grupo_id', grupoId).order('data_inicio'),
    supabase.from('compras_racao_grupo').select('*').eq('grupo_id', grupoId).order('data_inicio_uso'),
    supabase.from('grupos_consumo_periodos').select('*').eq('grupo_id', grupoId).order('vigente_desde'),
  ])

  const membrosArr = (membrosData ?? []) as GrupoConsumoLoteRow[]
  const comprasArr = (comprasData ?? []) as CompraRacaoGrupo[]
  const periodosArr = (periodosData ?? []) as GrupoConsumoPeriodo[]
  const dietaId = grupoData?.dieta_id ?? null

  const loteIds = Array.from(new Set(membrosArr.map(m => m.lote_id)))

  let pct: number | null = null
  if (dietaId) {
    const { data: dietaData } = await supabase.from('dietas').select('pct_consumo_pv_ms').eq('id', dietaId).single()
    pct = dietaData?.pct_consumo_pv_ms ?? null
  }

  if (loteIds.length === 0) {
    return { membrosArr, comprasArr, periodosArr, lotesInfo: {}, pct, dietaId, consumoTeoricoPorLote: {}, algumAnimalNaDietaHoje: false }
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

  const lotesInfo: Record<string, { nome_lote: string; codigo_lote: string }> = {}
  for (const l of lotesData ?? []) lotesInfo[l.id] = { nome_lote: l.nome_lote, codigo_lote: l.codigo_lote }

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
  for (const animalId of animalIds) {
    const animal = animaisPorId[animalId]
    if (!animal) continue
    const periodosDoAnimal = construirPeriodosDeMovimentacoes(movsPorAnimal[animalId] ?? [])
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
  // uma vez. "Desde" (data_inicio) não entra nessa conta — é só informativo,
  // porque quem define desde quando um lote conta pra esse grupo é a dieta
  // que ele de fato estava consumindo, não a data em que foi cadastrado.
  const limiteFimPorLote: Record<string, number | null> = {}
  for (const loteId of loteIds) {
    const linhasDoLote = membrosArr.filter(m => m.lote_id === loteId)
    const semCorte = linhasDoLote.some(m => !m.data_fim)
    limiteFimPorLote[loteId] = semCorte ? null : Math.max(...linhasDoLote.map(m => toDay(m.data_fim as string)))
  }

  const hojeDia = toDay(new Date().toISOString().slice(0, 10))

  let algumAnimalNaDietaHoje = false
  if (dietaId) {
    buscaAnimal:
    for (const loteId of loteIds) {
      for (const a of animaisPorLote[loteId] ?? []) {
        const periodo = encontrarLoteAtivo(hojeDia, a.periodos)
        if (!periodo || periodo.lote_id !== loteId) continue
        if (dietaVigenteDoAnimalNoDia(loteId, hojeDia, ciclos, a.eventosCiclo, trocasDieta) === dietaId) {
          algumAnimalNaDietaHoje = true
          break buscaAnimal
        }
      }
    }
  }

  let consumoTeoricoPorLote: Record<string, Record<number, { pesoTotalKg: number; qtdAtiva: number; consumoKg: number }>> = {}
  if (pct != null && dietaId) {
    // Só faz sentido contar consumo a partir da primeira compra do grupo —
    // dias com a dieta batendo mas sem nenhuma compra registrada ainda não
    // têm preço vigente pra eles, e não devem "gastar" saldo que ainda nem
    // existia (ver calcularSaldoGrupo). Sem nenhuma compra, não há o que
    // calcular.
    const diaInicial = comprasArr.length > 0 ? Math.min(...comprasArr.map(c => toDay(c.data_inicio_uso))) : null
    if (diaInicial !== null) {
      consumoTeoricoPorLote = calcularConsumoTeoricoPorLotePorDia(
        loteIds, animaisPorLote, ciclos, pct, dietaId, trocasDieta, diaInicial, hojeDia + 1, limiteFimPorLote,
      )
    }
  }

  return { membrosArr, comprasArr, periodosArr, lotesInfo, pct, dietaId, consumoTeoricoPorLote, algumAnimalNaDietaHoje }
}

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
  // Ver DadosConsumoGrupo.algumAnimalNaDietaHoje. Começa true (postura
  // conservadora): antes de carregar, prefere não sugerir "ok" indevidamente.
  const [algumAnimalNaDietaHoje, setAlgumAnimalNaDietaHoje] = useState(true)
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user || !grupoId) { setLoading(false); return }
    setLoading(true)

    const dados = await carregarDadosConsumoGrupo(grupoId)
    setMembros(dados.membrosArr)
    setCompras(dados.comprasArr)
    setPeriodos(dados.periodosArr)
    setLotesInfo(dados.lotesInfo)
    setPctConsumoPvMs(dados.pct)
    setConsumoTeoricoPorLote(dados.consumoTeoricoPorLote)
    setAlgumAnimalNaDietaHoje(dados.algumAnimalNaDietaHoje)

    if (dados.membrosArr.length === 0) {
      setSaldo({ totalCompradoKg: dados.comprasArr.reduce((s, c) => s + c.quantidade_kg, 0), totalConsumidoTeoricoKg: 0, saldoKg: 0, custoMedioKgVigente: null })
    } else if (dados.pct != null && dados.dietaId) {
      const hojeDia = toDay(new Date().toISOString().slice(0, 10))
      const comprasInfo: CompraGrupoInfo[] = dados.comprasArr.map(c => ({
        id: c.id, quantidade_kg: c.quantidade_kg, valor_total: c.valor_total,
        data_compra: c.data_compra, data_inicio_uso: c.data_inicio_uso,
      }))
      const periodosInfo: PeriodoCustoGrupo[] = dados.periodosArr.map(p => ({
        id: p.id, compra_id: p.compra_id, vigente_desde: p.vigente_desde, vigente_ate: p.vigente_ate,
        saldo_kg_inicio: p.saldo_kg_inicio, custo_medio_kg: p.custo_medio_kg,
      }))
      setSaldo(calcularSaldoGrupo(comprasInfo, dados.consumoTeoricoPorLote, periodosInfo, hojeDia))
    } else {
      setSaldo(null)
    }

    setLoading(false)
  }, [user, grupoId])

  useEffect(() => { fetch() }, [fetch])

  // ─── Recalcula toda a cadeia de períodos de custo médio do grupo ─────────
  // Cada período herda o saldo (kg e R$) do período imediatamente anterior —
  // por isso, mudar o valor de QUALQUER compra da cadeia (não só a mais
  // recente) pode alterar todos os períodos seguintes a ela. Em vez de tentar
  // atualizar só o período afetado (frágil e fácil de deixar algo desatualizado),
  // refaz a cadeia inteira do zero a partir das compras atuais (ordenadas por
  // data_inicio_uso) e do consumo teórico já calculado.
  const recomputarPeriodos = async (
    comprasParaUsar: CompraRacaoGrupo[],
    consumoParaUsar: Record<string, Record<number, { consumoKg: number }>>,
  ): Promise<{ error: string | null }> => {
    if (!user || !grupoId) return { error: 'Não autenticado' }
    const ordenadas = [...comprasParaUsar].sort((a, b) => a.data_inicio_uso.localeCompare(b.data_inicio_uso))

    let compradoAcumulado = 0
    let custoMedioAnterior = 0
    const novosPeriodos: Array<{ compra_id: string; vigente_desde: string; vigente_ate: string | null; saldo_kg_inicio: number; custo_medio_kg: number }> = []

    for (let i = 0; i < ordenadas.length; i++) {
      const c = ordenadas[i]
      const diaUso = toDay(c.data_inicio_uso)

      let consumidoAte = 0
      for (const porDia of Object.values(consumoParaUsar)) {
        for (const [diaStr, info] of Object.entries(porDia)) {
          if (Number(diaStr) < diaUso) consumidoAte += info.consumoKg
        }
      }

      const saldoKgAntes = compradoAcumulado - consumidoAte
      const saldoValorAntes = saldoKgAntes * custoMedioAnterior
      const { saldoKgInicio, custoMedioKg } = calcularNovoPeriodo(saldoKgAntes, saldoValorAntes, c.quantidade_kg, c.valor_total)

      novosPeriodos.push({
        compra_id: c.id,
        vigente_desde: c.data_inicio_uso,
        vigente_ate: i < ordenadas.length - 1 ? ordenadas[i + 1].data_inicio_uso : null,
        saldo_kg_inicio: saldoKgInicio,
        custo_medio_kg: custoMedioKg,
      })

      compradoAcumulado += c.quantidade_kg
      custoMedioAnterior = custoMedioKg
    }

    const { error: eDel } = await supabase.from('grupos_consumo_periodos').delete().eq('grupo_id', grupoId)
    if (eDel) return { error: eDel.message }

    if (novosPeriodos.length > 0) {
      const { error: eIns } = await supabase.from('grupos_consumo_periodos').insert(
        novosPeriodos.map(p => ({ grupo_id: grupoId, user_id: (user as { id: string }).id, ...p })),
      )
      if (eIns) return { error: eIns.message }
    }

    return { error: null }
  }

  // Registra uma nova compra e recalcula a cadeia inteira de períodos a
  // partir do consumo teórico atualizado — pode incluir dias anteriores à
  // primeira compra já registrada, se esta nova tiver data_inicio_uso mais
  // antiga (registro retroativo).
  const registrarCompra = async (input: {
    quantidade_kg: number; valor_total: number; data_compra: string; data_inicio_uso: string
    parceiro_id?: string | null; observacoes?: string
  }) => {
    if (!user || !grupoId) return { error: 'Não autenticado' }

    const { data: novaCompra, error: e1 } = await supabase.from('compras_racao_grupo').insert({
      grupo_id: grupoId, quantidade_kg: input.quantidade_kg, valor_total: input.valor_total,
      data_compra: input.data_compra, data_inicio_uso: input.data_inicio_uso,
      parceiro_id: input.parceiro_id ?? null, observacoes: input.observacoes ?? null, user_id: user.id,
    }).select().single()
    if (e1 || !novaCompra) return { error: e1?.message ?? 'Erro ao registrar compra' }

    const dados = await carregarDadosConsumoGrupo(grupoId)
    const { error: eRecalc } = await recomputarPeriodos(dados.comprasArr, dados.consumoTeoricoPorLote)
    if (eRecalc) return { error: eRecalc }

    await fetch()
    return { error: null }
  }

  // Edita quantidade e/ou valor de uma compra já lançada — qualquer uma da
  // lista, a qualquer momento — e recalcula a cadeia inteira de períodos
  // depois, já que um ajuste numa compra do meio da cadeia muda o saldo
  // herdado por todas as compras seguintes a ela.
  const editarCompra = async (compraId: string, input: { quantidade_kg: number; valor_total: number }) => {
    if (!user || !grupoId) return { error: 'Não autenticado' }
    if (!input.quantidade_kg || input.quantidade_kg <= 0) return { error: 'Informe uma quantidade válida' }
    if (!input.valor_total || input.valor_total <= 0) return { error: 'Informe um valor válido' }

    const { error: eUpd } = await supabase.from('compras_racao_grupo')
      .update({ quantidade_kg: input.quantidade_kg, valor_total: input.valor_total }).eq('id', compraId)
    if (eUpd) return { error: eUpd.message }

    const dados = await carregarDadosConsumoGrupo(grupoId)
    const { error: eRecalc } = await recomputarPeriodos(dados.comprasArr, dados.consumoTeoricoPorLote)
    if (eRecalc) return { error: eRecalc }

    await fetch()
    return { error: null }
  }

  // Ajusta a quantidade da última compra (por data_inicio_uso) pra que o
  // saldo do grupo feche em zero — usado quando o produtor confirma que o
  // consumo teórico atual já é o valor real/final. O valor pago (valor_total)
  // não muda — só a quantidade em kg é corrigida — então o custo médio final
  // por kg cai (mais ração "coube" no mesmo valor pago do que o esperado).
  const confirmarSaldoAtual = async () => {
    if (!saldo || compras.length === 0) return { error: 'Nenhuma compra para ajustar' }
    const ordenadas = [...compras].sort((a, b) => a.data_inicio_uso.localeCompare(b.data_inicio_uso))
    const ultimaCompra = ordenadas[ordenadas.length - 1]
    const novaQuantidade = ultimaCompra.quantidade_kg - saldo.saldoKg
    if (novaQuantidade <= 0) return { error: 'Ajuste resultaria numa quantidade inválida — verifique as compras lançadas' }
    return editarCompra(ultimaCompra.id, { quantidade_kg: novaQuantidade, valor_total: ultimaCompra.valor_total })
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

  // Só mostra o alerta de saldo negativo se ainda houver consumo em aberto
  // nessa dieta hoje — senão é uma situação histórica/fechada, não algo que
  // precise da atenção do produtor agora.
  const mostrarAlertaSaldo = !!saldo && saldo.saldoKg < 0 && algumAnimalNaDietaHoje

  return {
    membros, compras, periodos, lotesInfo, saldo, loading, pctConsumoPvMs, mostrarAlertaSaldo,
    registrarCompra, editarCompra, confirmarSaldoAtual, adicionarLote, encerrarParticipacao, rankingPorCompra, refetch: fetch,
  }
}
