import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type {
  Lote, CicloLote, Animal, Movimentacao, Pesagem, SaidaGrupo,
  CustoVariavelAnimal, AnimalStatus, SaidaTipo, SaidaModo,
} from '@/types'
import {
  calcularAnimalNaData, construirPeriodosDeMovimentacoes, gerarCodigoAnimal,
  type PeriodoLote, type CicloInfo, type DietaInfo, type ResultadoAnimalNaData,
} from '@/lib/custoAnimal'
import { obterRendimento, obterBonus } from '@/lib/calculations'

// ─── Tipos de entrada ───────────────────────────────────────────────────────────

export interface CicloInput {
  numero: number
  nome: string
  dias_planejados: number
  dieta_id: string | null
  gmd_esperado: number | null
}

export interface CriarLoteInput {
  nome_lote: string
  codigo_lote: string
  prefixo: string
  data_criacao: string
  num_ciclos: number
  preco_kg_compra: number | null
  origem_fazenda?: string
  origem_municipio?: string
  origem_estado?: string
  raca_predominante?: string
  observacoes?: string
  preco_venda_esperado_kg?: number
  peso_maximo_acabamento?: number
  pct_comissao_esperada?: number
  pct_encargo_esperado?: number
  ciclos: CicloInput[]
}

export interface LinhaAnimalInput {
  brinco: string
  peso: number
}

export interface CriarAnimaisInput {
  lote_id: string
  data_entrada: string
  origem?: string
  raca?: string
  idade_estimada?: number
  linhas: LinhaAnimalInput[]
}

export interface BifurcarInput {
  lote_origem_id: string
  animal_ids: string[]
  data_bifurcacao: string
  motivo?: 'peso' | 'gmd' | 'sanitario' | 'outro'
  observacoes?: string
  novo_lote: CriarLoteInput
}

export interface MoverAliquotaInput {
  animal_ids: string[]
  lote_destino_id: string
  data: string
  observacoes?: string
}

export interface ItemVendaInput {
  animal_id: string
  peso: number
  valor?: number // usado só no modo peso_proprio
}

export interface RegistrarVendaInput {
  tipo: SaidaTipo
  modo: SaidaModo
  data: string
  itens: ItemVendaInput[]
  valor_total?: number // obrigatório no modo peso_carga
  destino_tipo?: 'corretor' | 'frigorifico' | 'produtor'
  destino_id?: string
  observacoes?: string
  comissoes: Array<{ tipo: 'corretor' | 'operador' | 'outro'; parceiro_id?: string; descricao?: string; percentual: number }>
  encargos: Array<{ descricao: string; base_calculo: 'receita_bruta' | 'valor_fixo'; percentual?: number; valor_fixo?: number }>
}

const TIPO_SAIDA_MOV: Record<SaidaTipo, string> = {
  venda: 'saida_venda', abate: 'saida_abate',
  transferencia: 'saida_transferencia', morte: 'saida_morte',
}
const TIPO_SAIDA_STATUS: Record<SaidaTipo, AnimalStatus> = {
  venda: 'vendido', abate: 'abatido',
  transferencia: 'transferido', morte: 'morto',
}

const MULT_RECORRENCIA: Record<string, number> = { unico: 1, semanal: 4, quinzenal: 2, mensal: 1 }

// ─── Hook: lotes (lista + CRUD) ────────────────────────────────────────────────

export function useLotes() {
  const { user } = useAuth()
  const [lotes, setLotes] = useState<Lote[]>([])
  const [ciclosPorLote, setCiclosPorLote] = useState<Record<string, CicloLote[]>>({})
  const [resumo, setResumo] = useState<Record<string, { qtdAtiva: number; pesoMedioEntrada: number }>>({})
  const [loading, setLoading] = useState(true)

  const fetchLotes = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data: lotesData } = await supabase
      .from('lotes').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    const listaLotes = (lotesData ?? []) as Lote[]
    setLotes(listaLotes)

    if (listaLotes.length > 0) {
      const ids = listaLotes.map(l => l.id)
      const { data: ciclosData } = await supabase
        .from('ciclos_lote').select('*').in('lote_id', ids).order('numero')
      const grupos: Record<string, CicloLote[]> = {}
      for (const c of (ciclosData ?? []) as CicloLote[]) {
        (grupos[c.lote_id] ??= []).push(c)
      }
      setCiclosPorLote(grupos)

      const { data: animaisData } = await supabase
        .from('animais').select('lote_atual_id, peso_entrada, status')
        .eq('user_id', user.id).in('lote_atual_id', ids)
      const res: Record<string, { qtdAtiva: number; pesoMedioEntrada: number }> = {}
      for (const id of ids) res[id] = { qtdAtiva: 0, pesoMedioEntrada: 0 }
      const somaPeso: Record<string, number> = {}
      for (const a of (animaisData ?? []) as Array<{ lote_atual_id: string; peso_entrada: number; status: string }>) {
        if (a.status !== 'ativo') continue
        if (!a.lote_atual_id) continue
        res[a.lote_atual_id].qtdAtiva += 1
        somaPeso[a.lote_atual_id] = (somaPeso[a.lote_atual_id] ?? 0) + a.peso_entrada
      }
      for (const id of ids) {
        if (res[id].qtdAtiva > 0) res[id].pesoMedioEntrada = somaPeso[id] / res[id].qtdAtiva
      }
      setResumo(res)
    } else {
      setCiclosPorLote({})
      setResumo({})
    }
    setLoading(false)
  }, [user])

  useEffect(() => { fetchLotes() }, [fetchLotes])

  const proximoNumeroLote = () => {
    const ano = new Date().getFullYear()
    const doAno = lotes.filter(l => l.codigo_lote.includes(String(ano)))
    return `LOTE-${ano}-${String(doAno.length + 1).padStart(2, '0')}`
  }

  const criarLoteInterno = async (input: CriarLoteInput): Promise<{ error: string | null; lote?: Lote }> => {
    if (!user) return { error: 'Não autenticado' }
    if (input.ciclos.length !== input.num_ciclos) {
      return { error: 'Número de ciclos configurados não bate com num_ciclos' }
    }

    const { data: loteExistente } = await supabase
      .from('lotes').select('id').eq('user_id', user.id).eq('prefixo', input.prefixo).eq('status', 'ativo').maybeSingle()
    if (loteExistente) return { error: `Já existe um lote ativo usando o prefixo "${input.prefixo}"` }

    const { data: lote, error: e1 } = await supabase.from('lotes').insert({
      nome_lote: input.nome_lote,
      codigo_lote: input.codigo_lote,
      prefixo: input.prefixo,
      data_criacao: input.data_criacao,
      ciclo_atual: 1,
      num_ciclos: input.num_ciclos,
      status: 'ativo',
      preco_kg_compra: input.preco_kg_compra,
      origem_fazenda: input.origem_fazenda ?? null,
      origem_municipio: input.origem_municipio ?? null,
      origem_estado: input.origem_estado ?? null,
      raca_predominante: input.raca_predominante ?? null,
      observacoes: input.observacoes ?? null,
      preco_venda_esperado_kg: input.preco_venda_esperado_kg ?? null,
      peso_maximo_acabamento: input.peso_maximo_acabamento ?? null,
      pct_comissao_esperada: input.pct_comissao_esperada ?? null,
      pct_encargo_esperado: input.pct_encargo_esperado ?? null,
      user_id: user.id,
    }).select().single()
    if (e1) return { error: e1.message }

    const ciclosRows = input.ciclos.map(c => ({
      lote_id: lote.id,
      numero: c.numero,
      nome: c.nome,
      dias_planejados: c.dias_planejados,
      dieta_id: c.dieta_id,
      gmd_esperado: c.gmd_esperado,
      data_inicio: c.numero === 1 ? input.data_criacao : null,
      data_fim: null,
      user_id: user.id,
    }))
    const { error: e2 } = await supabase.from('ciclos_lote').insert(ciclosRows)
    if (e2) return { error: e2.message }

    return { error: null, lote: lote as Lote }
  }

  const criarLote = async (input: CriarLoteInput) => {
    const res = await criarLoteInterno(input)
    if (!res.error) await fetchLotes()
    return res
  }

  const atualizarLote = async (id: string, patch: Partial<Lote>) => {
    const { error } = await supabase.from('lotes').update(patch).eq('id', id)
    if (!error) await fetchLotes()
    return { error: error?.message ?? null }
  }

  const editarCiclo = async (cicloId: string, patch: Partial<Pick<CicloLote, 'nome' | 'dias_planejados' | 'dieta_id' | 'gmd_esperado'>>) => {
    const { error } = await supabase.from('ciclos_lote').update(patch).eq('id', cicloId)
    if (!error) await fetchLotes()
    return { error: error?.message ?? null }
  }

  const avancarCiclo = async (loteId: string) => {
    const lote = lotes.find(l => l.id === loteId)
    if (!lote) return { error: 'Lote não encontrado' }
    if (lote.ciclo_atual >= lote.num_ciclos) return { error: 'Lote já está no último ciclo configurado' }

    const hoje = new Date().toISOString().split('T')[0]
    const ciclos = ciclosPorLote[loteId] ?? []
    const atual = ciclos.find(c => c.numero === lote.ciclo_atual)
    const proximo = ciclos.find(c => c.numero === lote.ciclo_atual + 1)
    if (!proximo) return { error: 'Próximo ciclo não está configurado' }

    if (atual) await supabase.from('ciclos_lote').update({ data_fim: hoje }).eq('id', atual.id)
    await supabase.from('ciclos_lote').update({ data_inicio: hoje }).eq('id', proximo.id)
    const { error } = await supabase.from('lotes').update({ ciclo_atual: lote.ciclo_atual + 1 }).eq('id', loteId)
    if (!error) await fetchLotes()
    return { error: error?.message ?? null }
  }

  const encerrarLote = async (loteId: string) => {
    const { error } = await supabase.from('lotes').update({ status: 'encerrado' }).eq('id', loteId)
    if (!error) await fetchLotes()
    return { error: error?.message ?? null }
  }

  // ─── Animais ──────────────────────────────────────────────────────────────

  const criarAnimais = async (input: CriarAnimaisInput) => {
    if (!user) return { error: 'Não autenticado' }
    const lote = lotes.find(l => l.id === input.lote_id)
    if (!lote) return { error: 'Lote não encontrado' }
    if (input.linhas.length === 0) return { error: 'Nenhum animal para criar' }

    const brincosVistos = new Set<string>()
    for (const l of input.linhas) {
      if (brincosVistos.has(l.brinco)) return { error: `Brinco "${l.brinco}" duplicado na mesma criação` }
      brincosVistos.add(l.brinco)
    }

    const precoKg = lote.preco_kg_compra ?? 0
    const rows = input.linhas.map(l => ({
      codigo: gerarCodigoAnimal(lote.prefixo, l.brinco),
      brinco: l.brinco,
      peso_entrada: l.peso,
      data_entrada: input.data_entrada,
      origem: input.origem ?? null,
      raca: input.raca ?? null,
      idade_estimada: input.idade_estimada ?? null,
      valor_compra: l.peso * precoKg,
      preco_kg_compra_no_lote: precoKg,
      lote_atual_id: input.lote_id,
      status: 'ativo' as const,
      user_id: user.id,
    }))

    const { data: criados, error: e1 } = await supabase.from('animais').insert(rows).select('id')
    if (e1) return { error: e1.message }

    const movRows = (criados ?? []).map((a: { id: string }) => ({
      animal_id: a.id, tipo: 'entrada',
      lote_destino_id: input.lote_id,
      data: input.data_entrada,
      user_id: user.id,
    }))
    const { error: e2 } = await supabase.from('movimentacoes_animais').insert(movRows)
    if (e2) return { error: e2.message }

    await fetchLotes()
    return { error: null, quantidade: rows.length }
  }

  // ─── Bifurcação e movimentação ─────────────────────────────────────────────

  const bifurcar = async (input: BifurcarInput) => {
    if (!user) return { error: 'Não autenticado' }
    if (input.animal_ids.length === 0) return { error: 'Selecione ao menos um animal' }

    const { error: eNovo, lote: novoLote } = await criarLoteInterno(input.novo_lote)
    if (eNovo || !novoLote) return { error: eNovo ?? 'Erro ao criar novo lote' }

    const grupoEventoId = crypto.randomUUID()
    const movRows = input.animal_ids.map(animalId => ({
      animal_id: animalId, tipo: 'bifurcacao',
      lote_origem_id: input.lote_origem_id, lote_destino_id: novoLote.id,
      data: input.data_bifurcacao, motivo: input.motivo ?? null,
      observacoes: input.observacoes ?? null, grupo_evento_id: grupoEventoId,
      user_id: user.id,
    }))
    const { error: e1 } = await supabase.from('movimentacoes_animais').insert(movRows)
    if (e1) return { error: e1.message }

    const { error: e2 } = await supabase.from('animais')
      .update({ lote_atual_id: novoLote.id }).in('id', input.animal_ids)
    if (e2) return { error: e2.message }

    await fetchLotes()
    return { error: null, lote: novoLote }
  }

  const moverAliquota = async (input: MoverAliquotaInput) => {
    if (!user) return { error: 'Não autenticado' }
    if (input.animal_ids.length === 0) return { error: 'Selecione ao menos um animal' }

    const { data: animaisAtuais, error: e0 } = await supabase
      .from('animais').select('id, lote_atual_id').in('id', input.animal_ids)
    if (e0) return { error: e0.message }

    const grupoEventoId = crypto.randomUUID()
    const movRows = (animaisAtuais ?? []).map((a: { id: string; lote_atual_id: string | null }) => ({
      animal_id: a.id, tipo: 'transferencia_lote',
      lote_origem_id: a.lote_atual_id, lote_destino_id: input.lote_destino_id,
      data: input.data, observacoes: input.observacoes ?? null,
      grupo_evento_id: grupoEventoId, user_id: user.id,
    }))
    const { error: e1 } = await supabase.from('movimentacoes_animais').insert(movRows)
    if (e1) return { error: e1.message }

    const { error: e2 } = await supabase.from('animais')
      .update({ lote_atual_id: input.lote_destino_id }).in('id', input.animal_ids)
    if (e2) return { error: e2.message }

    await fetchLotes()
    return { error: null }
  }

  return {
    lotes, ciclosPorLote, resumo, loading,
    lotesAtivos: lotes.filter(l => l.status === 'ativo'),
    lotesEncerrados: lotes.filter(l => l.status === 'encerrado'),
    fetchLotes, proximoNumeroLote,
    criarLote, atualizarLote, editarCiclo, avancarCiclo, encerrarLote,
    criarAnimais, bifurcar, moverAliquota,
  }
}

// ─── Hook: animais de um lote específico ───────────────────────────────────────

export function useAnimaisDoLote(loteId: string | null) {
  const { user } = useAuth()
  const [animais, setAnimais] = useState<Animal[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user || !loteId) { setAnimais([]); setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('animais').select('*')
      .eq('user_id', user.id).eq('lote_atual_id', loteId).eq('status', 'ativo')
      .order('brinco')
    setAnimais((data ?? []) as Animal[])
    setLoading(false)
  }, [user, loteId])

  useEffect(() => { fetch() }, [fetch])

  const registrarPesagem = async (input: { animal_id: string; peso: number; data: string; observacoes?: string }) => {
    if (!user) return { error: 'Não autenticado' }
    const { error } = await supabase.from('pesagens').insert({ ...input, user_id: user.id })
    return { error: error?.message ?? null }
  }

  const registrarPesagemLote = async (pesagens: Array<{ animal_id: string; peso: number; data: string }>) => {
    if (!user) return { error: 'Não autenticado' }
    const rows = pesagens.map(p => ({ ...p, user_id: user.id }))
    const { error } = await supabase.from('pesagens').insert(rows)
    return { error: error?.message ?? null }
  }

  const buscarPesagens = async (animalId: string): Promise<Pesagem[]> => {
    const { data } = await supabase.from('pesagens').select('*').eq('animal_id', animalId).order('data', { ascending: false })
    return (data ?? []) as Pesagem[]
  }

  const buscarMovimentacoes = async (animalId: string): Promise<Movimentacao[]> => {
    const { data } = await supabase.from('movimentacoes_animais').select('*').eq('animal_id', animalId).order('data', { ascending: true })
    return (data ?? []) as Movimentacao[]
  }

  const buscarCustosVariaveis = async (animalId: string): Promise<CustoVariavelAnimal[]> => {
    const { data } = await supabase.from('custos_variaveis_animal').select('*').eq('animal_id', animalId)
    return (data ?? []) as CustoVariavelAnimal[]
  }

  const adicionarCustoVariavel = async (input: { animal_id: string; descricao: string; valor: number; data_lancamento: string }) => {
    if (!user) return { error: 'Não autenticado' }
    const { error } = await supabase.from('custos_variaveis_animal').insert({ ...input, user_id: user.id })
    if (!error) await fetch()
    return { error: error?.message ?? null }
  }

  return {
    animais, loading, fetch,
    registrarPesagem, registrarPesagemLote,
    buscarPesagens, buscarMovimentacoes, buscarCustosVariaveis, adicionarCustoVariavel,
  }
}

// ─── Motor de custo: monta contexto e calcula por animal ──────────────────────

interface ContextoCusto {
  animaisPorId: Record<string, { peso_entrada: number; data_entrada: string }>
  pesagensPorAnimal: Record<string, Array<{ data: string; peso: number }>>
  periodosPorAnimal: Record<string, PeriodoLote[]>
  ciclos: CicloInfo[]
  dietas: Record<string, DietaInfo>
}

export function useCustoEngine() {
  const { user } = useAuth()

  const construirContexto = useCallback(async (animalIds: string[]): Promise<ContextoCusto> => {
    if (!user || animalIds.length === 0) {
      return { animaisPorId: {}, pesagensPorAnimal: {}, periodosPorAnimal: {}, ciclos: [], dietas: {} }
    }

    const [{ data: animaisData }, { data: pesagensData }, { data: movsData }] = await Promise.all([
      supabase.from('animais').select('id, peso_entrada, data_entrada, lote_atual_id').in('id', animalIds),
      supabase.from('pesagens').select('animal_id, data, peso').in('animal_id', animalIds),
      supabase.from('movimentacoes_animais').select('animal_id, tipo, lote_origem_id, lote_destino_id, data').in('animal_id', animalIds),
    ])

    const animaisPorId: ContextoCusto['animaisPorId'] = {}
    for (const a of (animaisData ?? []) as Array<{ id: string; peso_entrada: number; data_entrada: string }>) {
      animaisPorId[a.id] = { peso_entrada: a.peso_entrada, data_entrada: a.data_entrada }
    }

    const pesagensPorAnimal: ContextoCusto['pesagensPorAnimal'] = {}
    for (const p of (pesagensData ?? []) as Array<{ animal_id: string; data: string; peso: number }>) {
      (pesagensPorAnimal[p.animal_id] ??= []).push({ data: p.data, peso: p.peso })
    }

    const movsPorAnimal: Record<string, Array<{ tipo: string; lote_origem_id: string | null; lote_destino_id: string | null; data: string }>> = {}
    const loteIdsEnvolvidos = new Set<string>()
    for (const m of (movsData ?? []) as Array<{ animal_id: string; tipo: string; lote_origem_id: string | null; lote_destino_id: string | null; data: string }>) {
      (movsPorAnimal[m.animal_id] ??= []).push(m)
      if (m.lote_origem_id) loteIdsEnvolvidos.add(m.lote_origem_id)
      if (m.lote_destino_id) loteIdsEnvolvidos.add(m.lote_destino_id)
    }

    const periodosPorAnimal: ContextoCusto['periodosPorAnimal'] = {}
    for (const animalId of animalIds) {
      periodosPorAnimal[animalId] = construirPeriodosDeMovimentacoes(movsPorAnimal[animalId] ?? [])
    }

    let ciclos: CicloInfo[] = []
    const dietas: Record<string, DietaInfo> = {}

    if (loteIdsEnvolvidos.size > 0) {
      const { data: ciclosData } = await supabase
        .from('ciclos_lote').select('lote_id, numero, dieta_id, gmd_esperado, data_inicio, data_fim')
        .in('lote_id', Array.from(loteIdsEnvolvidos))
      ciclos = (ciclosData ?? []) as CicloInfo[]

      const dietaIds = Array.from(new Set(ciclos.map(c => c.dieta_id).filter((x): x is string => !!x)))
      if (dietaIds.length > 0) {
        const [{ data: dietasData }, { data: historicoData }] = await Promise.all([
          supabase.from('dietas').select('id, pct_consumo_pv_ms').in('id', dietaIds),
          supabase.from('dietas_historico_custo').select('dieta_id, custo_kg_ms, vigente_desde, vigente_ate').in('dieta_id', dietaIds),
        ])
        for (const d of (dietasData ?? []) as Array<{ id: string; pct_consumo_pv_ms: number | null }>) {
          dietas[d.id] = { pct_consumo_pv_ms: d.pct_consumo_pv_ms, historico: [] }
        }
        for (const h of (historicoData ?? []) as Array<{ dieta_id: string; custo_kg_ms: number | null; vigente_desde: string; vigente_ate: string | null }>) {
          if (!dietas[h.dieta_id]) dietas[h.dieta_id] = { pct_consumo_pv_ms: null, historico: [] }
          dietas[h.dieta_id].historico.push({ custo_kg_ms: h.custo_kg_ms, vigente_desde: h.vigente_desde, vigente_ate: h.vigente_ate })
        }
        for (const d of Object.values(dietas)) {
          d.historico.sort((a, b) => a.vigente_desde.localeCompare(b.vigente_desde))
        }
      }
    }

    return { animaisPorId, pesagensPorAnimal, periodosPorAnimal, ciclos, dietas }
  }, [user])

  const calcularEmLote = useCallback(async (
    animalIds: string[], dataAlvo: string
  ): Promise<Record<string, ResultadoAnimalNaData>> => {
    const ctx = await construirContexto(animalIds)
    const resultado: Record<string, ResultadoAnimalNaData> = {}
    for (const animalId of animalIds) {
      const animal = ctx.animaisPorId[animalId]
      if (!animal) continue
      resultado[animalId] = calcularAnimalNaData(
        dataAlvo, animal,
        ctx.pesagensPorAnimal[animalId] ?? [],
        ctx.periodosPorAnimal[animalId] ?? [],
        ctx.ciclos, ctx.dietas,
      )
    }
    return resultado
  }, [construirContexto])

  return { construirContexto, calcularEmLote }
}

// ─── Hook: vendas ───────────────────────────────────────────────────────────────

export function useVendas() {
  const { user } = useAuth()
  const { calcularEmLote } = useCustoEngine()

  const registrarVenda = async (input: RegistrarVendaInput) => {
    if (!user) return { error: 'Não autenticado' }
    if (input.itens.length === 0) return { error: 'Selecione ao menos um animal' }
    if (input.modo === 'peso_carga' && !input.valor_total) return { error: 'Informe o valor total da carga' }
    if (input.modo === 'peso_proprio' && input.itens.some(i => i.valor == null)) {
      return { error: 'Informe o valor de venda de cada animal' }
    }

    const animalIds = input.itens.map(i => i.animal_id)

    const [{ data: animaisData }, { data: rendData }, { data: bonusData }, custos] = await Promise.all([
      supabase.from('animais').select('id, valor_compra, lote_atual_id').in('id', animalIds),
      supabase.from('rendimento_faixas').select('*').eq('user_id', user.id),
      supabase.from('bonus_faixas').select('*').eq('user_id', user.id),
      calcularEmLote(animalIds, input.data),
    ])

    const animaisPorId: Record<string, { valor_compra: number; lote_atual_id: string | null }> = {}
    for (const a of (animaisData ?? []) as Array<{ id: string; valor_compra: number; lote_atual_id: string | null }>) {
      animaisPorId[a.id] = { valor_compra: a.valor_compra, lote_atual_id: a.lote_atual_id }
    }

    const { data: custosVarData } = await supabase
      .from('custos_variaveis_animal').select('animal_id, valor').in('animal_id', animalIds)
    const custosVarPorAnimal: Record<string, number> = {}
    for (const c of (custosVarData ?? []) as Array<{ animal_id: string; valor: number }>) {
      custosVarPorAnimal[c.animal_id] = (custosVarPorAnimal[c.animal_id] ?? 0) + c.valor
    }

    // custos fixos: rateio simples por lote de origem (mesmo padrão do modelo anterior)
    const loteIds = Array.from(new Set(Object.values(animaisPorId).map(a => a.lote_atual_id).filter((x): x is string => !!x)))
    const custosFixosRateadosPorAnimal: Record<string, number> = {}
    if (loteIds.length > 0) {
      const [{ data: fixosData }, { data: qtdAtivaData }] = await Promise.all([
        supabase.from('custos_fixos_lote').select('lote_id, valor, recorrencia').in('lote_id', loteIds),
        supabase.from('animais').select('lote_atual_id').eq('status', 'ativo').in('lote_atual_id', loteIds),
      ])
      const totalFixoPorLote: Record<string, number> = {}
      for (const f of (fixosData ?? []) as Array<{ lote_id: string; valor: number; recorrencia: string }>) {
        totalFixoPorLote[f.lote_id] = (totalFixoPorLote[f.lote_id] ?? 0) + f.valor * (MULT_RECORRENCIA[f.recorrencia] ?? 1)
      }
      const qtdAtivaPorLote: Record<string, number> = {}
      for (const a of (qtdAtivaData ?? []) as Array<{ lote_atual_id: string }>) {
        qtdAtivaPorLote[a.lote_atual_id] = (qtdAtivaPorLote[a.lote_atual_id] ?? 0) + 1
      }
      for (const item of input.itens) {
        const loteId = animaisPorId[item.animal_id]?.lote_atual_id
        if (!loteId) continue
        const totalFixo = totalFixoPorLote[loteId] ?? 0
        const qtdAtiva = qtdAtivaPorLote[loteId] ?? 1
        custosFixosRateadosPorAnimal[item.animal_id] = qtdAtiva > 0 ? totalFixo / qtdAtiva : 0
      }
    }

    const rendimentos = (rendData ?? []) as Array<{ peso_min: number; peso_max: number; rendimento_percentual: number }>
    const bonus = (bonusData ?? []) as Array<{ peso_min: number; peso_max: number; bonus_por_kg: number }>

    const porAnimal = input.itens.map(item => {
      const rendPct = obterRendimento(item.peso, rendimentos as any)
      const pesoCarcaca = item.peso * (rendPct / 100)
      const bonusPorKg = obterBonus(item.peso, bonus as any)
      const valorBonus = pesoCarcaca * bonusPorKg
      return { ...item, rendPct, pesoCarcaca, valorBonus }
    })

    const pesoTotalVivo = porAnimal.reduce((s, a) => s + a.peso, 0)
    const pesoTotalCarcaca = porAnimal.reduce((s, a) => s + a.pesoCarcaca, 0)

    const receitaPrincipalPorAnimal: Record<string, number> = {}
    if (input.modo === 'peso_proprio') {
      for (const a of porAnimal) receitaPrincipalPorAnimal[a.animal_id] = a.valor ?? 0
    } else {
      const total = input.valor_total ?? 0
      for (const a of porAnimal) {
        const share = pesoTotalCarcaca > 0 ? a.pesoCarcaca / pesoTotalCarcaca : 1 / porAnimal.length
        receitaPrincipalPorAnimal[a.animal_id] = total * share
      }
    }

    const receitaBrutaPorAnimal: Record<string, number> = {}
    for (const a of porAnimal) {
      receitaBrutaPorAnimal[a.animal_id] = (receitaPrincipalPorAnimal[a.animal_id] ?? 0) + a.valorBonus
    }
    const receitaBrutaTotal = Object.values(receitaBrutaPorAnimal).reduce((s, v) => s + v, 0)

    const totalComissoes = input.comissoes.reduce((s, c) => s + (c.percentual / 100) * receitaBrutaTotal, 0)
    const totalEncargos = input.encargos.reduce((s, e) => {
      if (e.base_calculo === 'valor_fixo') return s + (e.valor_fixo ?? 0)
      return s + ((e.percentual ?? 0) / 100) * receitaBrutaTotal
    }, 0)

    let custoCompraTotal = 0, custoAlimentacaoTotal = 0, custosVariaveisTotal = 0, custosFixosTotal = 0
    let receitaLiquidaTotal = 0, lucroTotal = 0

    const linhasPorAnimal = input.itens.map(item => {
      const receitaBruta = receitaBrutaPorAnimal[item.animal_id] ?? 0
      const shareReceita = receitaBrutaTotal > 0 ? receitaBruta / receitaBrutaTotal : 1 / input.itens.length
      const comissaoAnimal = totalComissoes * shareReceita
      const encargoAnimal = totalEncargos * shareReceita
      const receitaLiquida = receitaBruta - comissaoAnimal - encargoAnimal

      const custoCompra = animaisPorId[item.animal_id]?.valor_compra ?? 0
      const custoAlimentacao = custos[item.animal_id]?.custoAcumulado ?? 0
      const custosVariaveis = custosVarPorAnimal[item.animal_id] ?? 0
      const custosFixos = custosFixosRateadosPorAnimal[item.animal_id] ?? 0
      const custoTotal = custoCompra + custoAlimentacao + custosVariaveis + custosFixos
      const lucro = receitaLiquida - custoTotal

      custoCompraTotal += custoCompra
      custoAlimentacaoTotal += custoAlimentacao
      custosVariaveisTotal += custosVariaveis
      custosFixosTotal += custosFixos
      receitaLiquidaTotal += receitaLiquida
      lucroTotal += lucro

      return { animal_id: item.animal_id, peso: item.peso, receitaBruta, custoTotal, lucro }
    })

    const margemPct = receitaLiquidaTotal > 0 ? (lucroTotal / receitaLiquidaTotal) * 100 : 0

    const { data: saidaGrupo, error: eSaida } = await supabase.from('saidas_grupo').insert({
      data: input.data, tipo: input.tipo, modo: input.modo,
      valor_total: input.modo === 'peso_carga' ? input.valor_total : receitaBrutaTotal,
      peso_total_vivo: pesoTotalVivo, peso_total_carcaca: pesoTotalCarcaca,
      destino_tipo: input.destino_tipo ?? null, destino_id: input.destino_id ?? null,
      observacoes: input.observacoes ?? null,
      custo_compra_total: custoCompraTotal, custo_alimentacao_total: custoAlimentacaoTotal,
      custos_variaveis_total: custosVariaveisTotal, custos_fixos_rateados: custosFixosTotal,
      total_comissoes: totalComissoes, total_encargos: totalEncargos,
      receita_bruta: receitaBrutaTotal, receita_liquida: receitaLiquidaTotal,
      lucro_total: lucroTotal, margem_pct: margemPct,
      user_id: user.id,
    }).select().single()
    if (eSaida) return { error: eSaida.message }

    if (input.comissoes.length > 0) {
      await supabase.from('comissoes_venda').insert(input.comissoes.map(c => ({
        saida_grupo_id: saidaGrupo.id, tipo: c.tipo, parceiro_id: c.parceiro_id ?? null,
        descricao: c.descricao ?? null, percentual: c.percentual,
        valor_calculado: (c.percentual / 100) * receitaBrutaTotal, user_id: user.id,
      })))
    }
    if (input.encargos.length > 0) {
      await supabase.from('encargos_venda').insert(input.encargos.map(e => ({
        saida_grupo_id: saidaGrupo.id, descricao: e.descricao, base_calculo: e.base_calculo,
        percentual: e.percentual ?? null, valor_fixo: e.valor_fixo ?? null,
        valor_calculado: e.base_calculo === 'valor_fixo' ? (e.valor_fixo ?? 0) : ((e.percentual ?? 0) / 100) * receitaBrutaTotal,
        user_id: user.id,
      })))
    }

    const tipoMov = TIPO_SAIDA_MOV[input.tipo]
    const movRows = linhasPorAnimal.map(l => ({
      animal_id: l.animal_id, tipo: tipoMov,
      lote_origem_id: animaisPorId[l.animal_id]?.lote_atual_id ?? null,
      data: input.data, peso: l.peso, valor: l.receitaBruta,
      destino_tipo: input.destino_tipo ?? null, destino_id: input.destino_id ?? null,
      observacoes: input.observacoes ?? null, saida_grupo_id: saidaGrupo.id,
      custo_atribuido: l.custoTotal, lucro: l.lucro,
      user_id: user.id,
    }))
    const { error: eMov } = await supabase.from('movimentacoes_animais').insert(movRows)
    if (eMov) return { error: eMov.message }

    const statusNovo = TIPO_SAIDA_STATUS[input.tipo]
    const { error: eUpd } = await supabase.from('animais')
      .update({ status: statusNovo, lote_atual_id: null }).in('id', animalIds)
    if (eUpd) return { error: eUpd.message }

    return { error: null, saidaGrupo: saidaGrupo as SaidaGrupo, resultadoPorAnimal: linhasPorAnimal }
  }

  return { registrarVenda }
}
