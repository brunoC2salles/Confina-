import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type {
  Lote, CicloLote, Animal, Movimentacao, Pesagem, SaidaGrupo,
  CustoVariavelAnimal, AnimalStatus, SaidaTipo, SaidaModo,
  CustoOperacionalLote, CategoriaCustoOperacional, MotivoEncerramento,
  Compra, TipoCiclo, CustoRacaoRealLote,
} from '@/types'
import {
  calcularAnimalNaData, construirPeriodosDeMovimentacoes, gerarCodigoAnimal,
  encontrarLoteAtivo, toDay, projetarPesoPorDia,
  type PeriodoLote, type CicloInfo, type DietaInfo, type ResultadoAnimalNaData, type CustoOperacionalInfo,
  type CustoRacaoRealPorDia, type CustoRacaoRealDiaInfo,
} from '@/lib/custoAnimal'
import { ordenarPorBrinco } from '@/lib/calculations'
import { obterRendimento, obterBonus } from '@/lib/calculations'
import { LIMITE_LOTES_ATIVOS, type Plano } from '@/hooks/useAssinatura'

// ─── Tipos de entrada ───────────────────────────────────────────────────────────

export interface CicloInput {
  numero: number
  nome: string
  tipo_ciclo: TipoCiclo
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
  origem_municipio?: string
  origem_estado?: string
  raca_predominante?: string
  observacoes?: string
  ciclos: CicloInput[]
}

export interface LinhaAnimalInput {
  brinco: string
  peso: number
  peso2?: number | null
}

// ─── Dados da compra (fornecedor + preço) desta leva específica de entrada ────
// Substitui o antigo preco_kg_compra fixo do lote: cada leva de animais pode
// ter um fornecedor e um preço de compra diferentes, mesmo dentro do mesmo lote.
export interface CompraInput {
  parceiro_id: string | null
  origem_texto: string | null
  data: string
  preco_kg: number
  observacoes?: string
}

export interface CriarAnimaisInput {
  lote_id: string
  data_entrada: string
  data_pesagem2?: string
  origem?: string
  raca?: string
  idade_estimada?: number
  linhas: LinhaAnimalInput[]
  compra: CompraInput
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

// Gera o código de cada animal (prefixo + brinco) e resolve colisões: como o
// prefixo do lote agora pode ser vazio ou repetido entre lotes, dois animais
// podem gerar o mesmo código-base. Quando isso acontece, acrescenta um sufixo
// numérico ("-2", "-3"...) até ficar único para aquele usuário. Reserva os
// códigos já atribuídos dentro do próprio lote de chamadas para não colidir
// entre si também.
export async function gerarCodigosUnicos(userId: string, prefixo: string, brincos: string[]): Promise<string[]> {
  const { data: existentesData } = await supabase.from('animais').select('codigo').eq('user_id', userId)
  const existentes = new Set((existentesData ?? []).map((a: { codigo: string }) => a.codigo))

  return brincos.map(brinco => {
    const codigoBase = gerarCodigoAnimal(prefixo, brinco)
    let codigo = codigoBase
    let n = 2
    while (existentes.has(codigo)) {
      codigo = `${codigoBase}-${n}`
      n++
    }
    existentes.add(codigo)
    return codigo
  })
}

// ─── Hook: lotes (lista + CRUD) ────────────────────────────────────────────────

export function useLotes() {
  const { user } = useAuth()
  const [lotes, setLotes] = useState<Lote[]>([])
  const [ciclosPorLote, setCiclosPorLote] = useState<Record<string, CicloLote[]>>({})
  const [resumo, setResumo] = useState<Record<string, { qtdAtiva: number; pesoMedioEntrada: number; dataEntradaMin: string | null; dataEntradaMax: string | null }>>({})
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
        .from('animais').select('lote_atual_id, peso_entrada, status, data_entrada')
        .eq('user_id', user.id).in('lote_atual_id', ids)
      const res: Record<string, { qtdAtiva: number; pesoMedioEntrada: number; dataEntradaMin: string | null; dataEntradaMax: string | null }> = {}
      for (const id of ids) res[id] = { qtdAtiva: 0, pesoMedioEntrada: 0, dataEntradaMin: null, dataEntradaMax: null }
      const somaPeso: Record<string, number> = {}
      for (const a of (animaisData ?? []) as Array<{ lote_atual_id: string; peso_entrada: number; status: string; data_entrada: string | null }>) {
        if (a.status !== 'ativo') continue
        if (!a.lote_atual_id) continue
        res[a.lote_atual_id].qtdAtiva += 1
        somaPeso[a.lote_atual_id] = (somaPeso[a.lote_atual_id] ?? 0) + a.peso_entrada
        if (a.data_entrada) {
          const r = res[a.lote_atual_id]
          if (!r.dataEntradaMin || a.data_entrada < r.dataEntradaMin) r.dataEntradaMin = a.data_entrada
          if (!r.dataEntradaMax || a.data_entrada > r.dataEntradaMax) r.dataEntradaMax = a.data_entrada
        }
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

    // Limite de lotes ativos por plano — checado com dado fresco do banco,
    // não com o estado local, pra não deixar passar por corrida entre abas
    // ou por essa mesma função ser chamada logo após um upgrade.
    const { data: profileData } = await supabase
      .from('profiles').select('plano, plano_status').eq('id', user.id).single()
    const planoEfetivo = ((profileData?.plano_status === 'ativo' ? profileData?.plano : 'free') ?? 'free') as Plano
    const limite = LIMITE_LOTES_ATIVOS[planoEfetivo] ?? LIMITE_LOTES_ATIVOS.free
    if (Number.isFinite(limite)) {
      const { count } = await supabase
        .from('lotes').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'ativo')
      if ((count ?? 0) >= limite) {
        return { error: `Seu plano (${planoEfetivo}) permite até ${limite} lotes ativos. Encerre um lote existente ou faça upgrade em Configurações, aba Conta.` }
      }
    }

    const { data: lote, error: e1 } = await supabase.from('lotes').insert({
      nome_lote: input.nome_lote,
      codigo_lote: input.codigo_lote,
      prefixo: input.prefixo,
      data_criacao: input.data_criacao,
      ciclo_atual: 1,
      num_ciclos: input.num_ciclos,
      status: 'ativo',
      // preco_kg_compra e origem_fazenda ficam null na criação do lote — cada
      // leva de animais agora carrega seu próprio fornecedor/preço via `compras`
      // (ver criarAnimais). Colunas mantidas no schema só por compatibilidade
      // com lotes antigos.
      preco_kg_compra: null,
      origem_fazenda: null,
      origem_municipio: input.origem_municipio ?? null,
      origem_estado: input.origem_estado ?? null,
      raca_predominante: input.raca_predominante ?? null,
      observacoes: input.observacoes ?? null,
      user_id: user.id,
    }).select().single()
    if (e1) return { error: e1.message }

    const ciclosRows = input.ciclos.map(c => ({
      lote_id: lote.id,
      numero: c.numero,
      nome: c.nome,
      tipo_ciclo: c.tipo_ciclo,
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

  const editarCiclo = async (cicloId: string, patch: Partial<Pick<CicloLote, 'nome' | 'tipo_ciclo' | 'dias_planejados' | 'dieta_id' | 'gmd_esperado'>>) => {
    const { error } = await supabase.from('ciclos_lote').update(patch).eq('id', cicloId)
    if (!error) await fetchLotes()
    return { error: error?.message ?? null }
  }

  // Reescreve todos os ciclos de um lote de uma vez: permite adicionar ciclo
  // novo (linha sem id), editar os existentes, e SEMPRE recalcula data_inicio/
  // data_fim de todos em cascata a partir de data_criacao — pra não deixar
  // ciclo nenhum com data desencontrada depois de qualquer alteração. Isso é
  // o que o motor de custo usa pra saber qual ciclo (e qual dieta) vale em
  // cada dia, então precisa estar sempre consistente.
  const salvarCiclosLote = async (
    loteId: string,
    dataCriacao: string,
    ciclos: Array<{ id?: string; numero: number; nome: string; tipo_ciclo: TipoCiclo; dias_planejados: number; dieta_id: string | null; gmd_esperado: number | null }>
  ) => {
    if (!user) return { error: 'Não autenticado' }
    if (ciclos.length === 0) return { error: 'O lote precisa ter ao menos um ciclo' }
    if (ciclos.length > 8) return { error: 'Máximo de 8 ciclos por lote' }

    const { error: eLote } = await supabase.from('lotes')
      .update({ data_criacao: dataCriacao, num_ciclos: ciclos.length }).eq('id', loteId)
    if (eLote) return { error: eLote.message }

    // Apaga do banco qualquer ciclo que existia antes e não está mais na lista
    // final (ex: usuário removeu um ciclo no modal). Sem isso, a linha antiga
    // permanece com o numero antigo e pode colidir com o numero de um ciclo
    // novo inserido depois, violando a constraint única (lote_id, numero).
    const idsMantidos = ciclos.filter(c => c.id).map(c => c.id as string)
    const { data: existentes, error: eExistentes } = await supabase
      .from('ciclos_lote').select('id').eq('lote_id', loteId)
    if (eExistentes) return { error: eExistentes.message }
    const idsParaRemover = (existentes ?? [])
      .map(e => e.id as string)
      .filter(id => !idsMantidos.includes(id))
    if (idsParaRemover.length > 0) {
      const { error: eDel } = await supabase.from('ciclos_lote').delete().in('id', idsParaRemover)
      if (eDel) return { error: eDel.message }
    }

    const ordenados = [...ciclos].sort((a, b) => a.numero - b.numero)
    let cursor = new Date(dataCriacao + 'T00:00:00')
    for (let i = 0; i < ordenados.length; i++) {
      const c = ordenados[i]
      const dataInicio = cursor.toISOString().slice(0, 10)
      const proximo = new Date(cursor)
      proximo.setDate(proximo.getDate() + c.dias_planejados)
      const dataFim = i === ordenados.length - 1 ? null : proximo.toISOString().slice(0, 10)

      if (c.id) {
        const { error } = await supabase.from('ciclos_lote').update({
          numero: c.numero, nome: c.nome, tipo_ciclo: c.tipo_ciclo, dias_planejados: c.dias_planejados,
          dieta_id: c.dieta_id, gmd_esperado: c.gmd_esperado, data_inicio: dataInicio, data_fim: dataFim,
        }).eq('id', c.id)
        if (error) return { error: `Ciclo ${c.numero}: ${error.message}` }
      } else {
        const { error } = await supabase.from('ciclos_lote').insert({
          lote_id: loteId, numero: c.numero, nome: c.nome, tipo_ciclo: c.tipo_ciclo,
          dias_planejados: c.dias_planejados, dieta_id: c.dieta_id, gmd_esperado: c.gmd_esperado,
          data_inicio: dataInicio, data_fim: dataFim, user_id: user.id,
        })
        if (error) return { error: `Ciclo ${c.numero}: ${error.message}` }
      }
      cursor = proximo
    }

    await fetchLotes()
    return { error: null }
  }

  const removerCiclo = async (cicloId: string) => {
    const { error } = await supabase.from('ciclos_lote').delete().eq('id', cicloId)
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

  const encerrarLote = async (loteId: string, motivo: MotivoEncerramento, motivoObs?: string) => {
    const { error } = await supabase.from('lotes')
      .update({ status: 'encerrado', motivo_encerramento: motivo, motivo_encerramento_obs: motivoObs ?? null })
      .eq('id', loteId)
    if (!error) await fetchLotes()
    return { error: error?.message ?? null }
  }

  // ─── Animais ──────────────────────────────────────────────────────────────

  const criarAnimais = async (input: CriarAnimaisInput) => {
    if (!user) return { error: 'Não autenticado' }
    const lote = lotes.find(l => l.id === input.lote_id)
    if (!lote) return { error: 'Lote não encontrado' }
    if (input.linhas.length === 0) return { error: 'Nenhum animal para criar' }
    if (!input.compra.parceiro_id && !input.compra.origem_texto?.trim()) {
      return { error: 'Informe o fornecedor (cadastrado ou em texto livre) desta leva' }
    }
    if (!input.compra.preco_kg || input.compra.preco_kg <= 0) {
      return { error: 'Informe o preço de compra por kg desta leva' }
    }

    const brincosVistos = new Set<string>()
    for (const l of input.linhas) {
      if (brincosVistos.has(l.brinco)) return { error: `Brinco "${l.brinco}" duplicado na mesma criação` }
      brincosVistos.add(l.brinco)
    }

    const temPeso2 = input.linhas.some(l => l.peso2 != null)
    if (temPeso2 && !input.data_pesagem2) return { error: 'Informe a data da segunda pesagem' }

    const precoKg = input.compra.preco_kg
    const pesoTotal = input.linhas.reduce((s, l) => s + l.peso, 0)

    // Cada leva de "Adicionar animais" vira o registro de uma compra própria,
    // com seu fornecedor e preço — não herda mais do lote.
    const { data: compra, error: eCompra } = await supabase.from('compras').insert({
      lote_id: input.lote_id,
      parceiro_id: input.compra.parceiro_id,
      origem_texto: input.compra.origem_texto || null,
      data: input.compra.data,
      preco_kg: precoKg,
      quantidade_animais: input.linhas.length,
      peso_total: pesoTotal,
      valor_total: pesoTotal * precoKg,
      observacoes: input.compra.observacoes || null,
      user_id: user.id,
    }).select().single()
    if (eCompra) return { error: eCompra.message }

    const codigos = await gerarCodigosUnicos(user.id, lote.prefixo, input.linhas.map(l => l.brinco))
    const rows = input.linhas.map((l, i) => ({
      codigo: codigos[i],
      brinco: l.brinco,
      peso_entrada: l.peso,
      data_entrada: input.data_entrada,
      origem: input.origem ?? null,
      raca: input.raca ?? null,
      idade_estimada: input.idade_estimada ?? null,
      valor_compra: l.peso * precoKg,
      preco_kg_compra_no_lote: precoKg,
      compra_id: compra.id,
      lote_atual_id: input.lote_id,
      status: 'ativo' as const,
      user_id: user.id,
    }))

    const { data: criados, error: e1 } = await supabase.from('animais').insert(rows).select('id, brinco')
    if (e1) return { error: e1.message }

    const movRows = (criados ?? []).map((a: { id: string }) => ({
      animal_id: a.id, tipo: 'entrada',
      lote_destino_id: input.lote_id,
      data: input.data_entrada,
      user_id: user.id,
    }))
    const { error: e2 } = await supabase.from('movimentacoes_animais').insert(movRows)
    if (e2) return { error: e2.message }

    if (temPeso2) {
      const idPorBrinco: Record<string, string> = {}
      for (const a of (criados ?? []) as Array<{ id: string; brinco: string }>) idPorBrinco[a.brinco] = a.id
      const pesagemRows = input.linhas
        .filter(l => l.peso2 != null)
        .map(l => ({ animal_id: idPorBrinco[l.brinco], peso: l.peso2 as number, data: input.data_pesagem2 as string, user_id: user.id }))
        .filter(p => !!p.animal_id)
      if (pesagemRows.length > 0) {
        const { error: e3 } = await supabase.from('pesagens').insert(pesagemRows)
        if (e3) return { error: e3.message }
      }
    }

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

  // Exclusão definitiva de um animal (ex.: digitado errado no lote).
  // Remove o registro de `animais` — pesagens, movimentações e custos
  // variáveis do animal caem junto por CASCADE no banco. Se o animal
  // pertencia a uma compra (leva), a compra é recalculada com base nos
  // animais restantes; se não sobrar nenhum, a compra também é excluída.
  const excluirAnimal = async (animalId: string) => {
    if (!user) return { error: 'Não autenticado' }

    const { data: animal, error: eGet } = await supabase
      .from('animais').select('id, compra_id').eq('id', animalId).maybeSingle()
    if (eGet) return { error: eGet.message }
    if (!animal) return { error: 'Animal não encontrado' }

    const { error: eDel } = await supabase.from('animais').delete().eq('id', animalId)
    if (eDel) return { error: eDel.message }

    if (animal.compra_id) {
      const { data: restantes, error: eRest } = await supabase
        .from('animais').select('peso_entrada, valor_compra').eq('compra_id', animal.compra_id)
      if (eRest) return { error: eRest.message }

      if (!restantes || restantes.length === 0) {
        const { error: eDelCompra } = await supabase.from('compras').delete().eq('id', animal.compra_id)
        if (eDelCompra) return { error: eDelCompra.message }
      } else {
        const pesoTotal = restantes.reduce((s, r) => s + r.peso_entrada, 0)
        const valorTotal = restantes.reduce((s, r) => s + r.valor_compra, 0)
        const { error: eUpdCompra } = await supabase.from('compras').update({
          quantidade_animais: restantes.length,
          peso_total: pesoTotal,
          valor_total: valorTotal,
        }).eq('id', animal.compra_id)
        if (eUpdCompra) return { error: eUpdCompra.message }
      }
    }

    await fetchLotes()
    return { error: null }
  }

  // Memoizado: sem isso, cada chamada do hook devolvia um array NOVO (mesmo
  // com os mesmos lotes dentro), e qualquer efeito que dependesse desse valor
  // (como o do Dashboard) entrava em loop — via de referência mudando a cada
  // render, disparando o efeito de novo, gerando outro render, indefinidamente.
  const lotesAtivos = useMemo(() => lotes.filter(l => l.status === 'ativo'), [lotes])
  const lotesEncerrados = useMemo(() => lotes.filter(l => l.status === 'encerrado'), [lotes])

  return {
    lotes, ciclosPorLote, resumo, loading,
    lotesAtivos, lotesEncerrados,
    fetchLotes, proximoNumeroLote,
    criarLote, atualizarLote, editarCiclo, salvarCiclosLote, removerCiclo, avancarCiclo, encerrarLote,
    criarAnimais, bifurcar, moverAliquota, excluirAnimal,
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
    setAnimais(ordenarPorBrinco((data ?? []) as Animal[]))
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

  const editarEntrada = async (input: { animal_id: string; peso_entrada: number; data_entrada: string }) => {
    if (!user) return { error: 'Não autenticado' }
    const { data: pesagensExistentes } = await supabase
      .from('pesagens').select('data').eq('animal_id', input.animal_id)
    const temPesagemAnterior = (pesagensExistentes ?? []).some(p => (p as { data: string }).data < input.data_entrada)
    if (temPesagemAnterior) {
      return { error: 'Já existe pesagem registrada antes dessa data de entrada. Ajuste ou exclua a pesagem antes de mudar a data.' }
    }
    const { error } = await supabase
      .from('animais')
      .update({ peso_entrada: input.peso_entrada, data_entrada: input.data_entrada })
      .eq('id', input.animal_id)
    if (!error) await fetch()
    return { error: error?.message ?? null }
  }

  return {
    animais, loading, fetch,
    registrarPesagem, registrarPesagemLote, editarEntrada,
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
  custosOperacionaisPorLote: Record<string, CustoOperacionalInfo[]>
  custosRacaoRealPorLote: Record<string, CustoRacaoRealPorDia>
}

export function useCustoEngine() {
  const { user } = useAuth()

  const construirContexto = useCallback(async (animalIds: string[]): Promise<ContextoCusto> => {
    if (!user || animalIds.length === 0) {
      return { animaisPorId: {}, pesagensPorAnimal: {}, periodosPorAnimal: {}, ciclos: [], dietas: {}, custosOperacionaisPorLote: {}, custosRacaoRealPorLote: {} }
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
    const custosOperacionaisPorLote: Record<string, CustoOperacionalInfo[]> = {}
    const custosRacaoRealPorLote: Record<string, CustoRacaoRealPorDia> = {}

    if (loteIdsEnvolvidos.size > 0) {
      const loteIdsArr = Array.from(loteIdsEnvolvidos)
      const [{ data: ciclosData }, { data: custosOpData }, { data: racaoRealData }, { data: ativosData }] = await Promise.all([
        supabase.from('ciclos_lote').select('lote_id, numero, tipo_ciclo, dieta_id, gmd_esperado, data_inicio, data_fim').in('lote_id', loteIdsArr),
        supabase.from('custos_operacionais_lote').select('lote_id, valor, data_lancamento').in('lote_id', loteIdsArr),
        supabase.from('custos_racao_real_lote').select('lote_id, valor_total, data_inicio').in('lote_id', loteIdsArr),
        supabase.from('animais').select('lote_atual_id').eq('status', 'ativo').in('lote_atual_id', loteIdsArr),
      ])
      ciclos = (ciclosData ?? []) as CicloInfo[]

      // fallback: quantidade ativa HOJE, usada só quando não há ninguém registrado
      // no lote na data exata do lançamento do custo
      const qtdAtivaAtualPorLote: Record<string, number> = {}
      for (const a of (ativosData ?? []) as Array<{ lote_atual_id: string }>) {
        qtdAtivaAtualPorLote[a.lote_atual_id] = (qtdAtivaAtualPorLote[a.lote_atual_id] ?? 0) + 1
      }

      const custosOp = (custosOpData ?? []) as Array<{ lote_id: string; valor: number; data_lancamento: string }>
      const racaoReal = (racaoRealData ?? []) as Array<{ lote_id: string; valor_total: number; data_inicio: string }>

      if (custosOp.length > 0 || racaoReal.length > 0) {
        // rateio histórico: busca TODAS as movimentações desses lotes (qualquer
        // animal que já passou por eles, não só o lote em cálculo), reconstrói
        // os períodos de cada um e conta quantos estavam no lote em qualquer
        // data pedida — usado tanto pelo custo operacional (um dia) quanto
        // pelo custo real de ração (todos os dias do intervalo de vigência)
        const { data: todasMovsDosLotes } = await supabase
          .from('movimentacoes_animais')
          .select('animal_id, tipo, lote_origem_id, lote_destino_id, data')
          .or(loteIdsArr.map(id => `lote_origem_id.eq.${id}`).concat(loteIdsArr.map(id => `lote_destino_id.eq.${id}`)).join(','))

        const movsPorAnimalTodos: Record<string, Array<{ tipo: string; lote_origem_id: string | null; lote_destino_id: string | null; data: string }>> = {}
        for (const m of (todasMovsDosLotes ?? []) as Array<{ animal_id: string; tipo: string; lote_origem_id: string | null; lote_destino_id: string | null; data: string }>) {
          (movsPorAnimalTodos[m.animal_id] ??= []).push(m)
        }
        // Mantém o animal_id (não descarta em um array solto) porque o rateio
        // proporcional ao peso precisa cruzar cada animal com seu peso_entrada
        // e pesagens — não só contar cabeças.
        const periodosPorAnimalTodos: Record<string, PeriodoLote[]> = {}
        for (const [animalId, movs] of Object.entries(movsPorAnimalTodos)) {
          periodosPorAnimalTodos[animalId] = construirPeriodosDeMovimentacoes(movs)
        }

        const contarAtivosNoDia = (loteId: string, dia: number): number => {
          let count = 0
          for (const periodos of Object.values(periodosPorAnimalTodos)) {
            const periodo = encontrarLoteAtivo(dia, periodos)
            if (periodo && periodo.lote_id === loteId) count++
          }
          return count
        }

        for (const c of custosOp) {
          const qtdHistorica = contarAtivosNoDia(c.lote_id, toDay(c.data_lancamento))
          const qtdAtivaNaData = qtdHistorica > 0 ? qtdHistorica : (qtdAtivaAtualPorLote[c.lote_id] ?? 1)
          ;(custosOperacionaisPorLote[c.lote_id] ??= []).push({ valor: c.valor, data_lancamento: c.data_lancamento, qtdAtivaNaData })
        }

        // ─── Custo real de ração: cada lançamento vale desde sua data_inicio
        // até o início do próximo lançamento do mesmo lote (ou até hoje, se
        // for o mais recente) — mesma ideia de uma pesagem reiniciar a base
        // do peso, aqui reiniciando a base do custo de ração. O valor_total é
        // dividido pelos dias do intervalo e depois rateado, dia a dia,
        // PROPORCIONALMENTE AO PESO de cada animal ativo naquele lote naquele
        // dia (animal mais pesado consome mais ração) — com fallback pra
        // rateio igual por cabeça se o peso total do dia vier zerado.
        if (racaoReal.length > 0) {
          const hojeDia = toDay(new Date().toISOString().slice(0, 10))
          const porLote: Record<string, Array<{ valor_total: number; data_inicio: string }>> = {}
          for (const r of racaoReal) (porLote[r.lote_id] ??= []).push(r)

          // Peso de cada animal precisa vir de TODOS os que já passaram pelos
          // lotes com custo real lançado, não só dos animais do cálculo atual
          // — por isso busca peso_entrada/data_entrada/pesagens de novo aqui,
          // para o conjunto completo de animal_ids encontrado acima.
          const animalIdsEnvolvidos = Object.keys(periodosPorAnimalTodos)
          const animaisBasicoPorId: Record<string, { peso_entrada: number; data_entrada: string }> = {}
          const pesagensPorAnimalTodos: Record<string, Array<{ data: string; peso: number }>> = {}
          if (animalIdsEnvolvidos.length > 0) {
            const [{ data: animaisBasicoData }, { data: pesagensTodasData }] = await Promise.all([
              supabase.from('animais').select('id, peso_entrada, data_entrada').in('id', animalIdsEnvolvidos),
              supabase.from('pesagens').select('animal_id, data, peso').in('animal_id', animalIdsEnvolvidos),
            ])
            for (const a of (animaisBasicoData ?? []) as Array<{ id: string; peso_entrada: number; data_entrada: string }>) {
              animaisBasicoPorId[a.id] = { peso_entrada: a.peso_entrada, data_entrada: a.data_entrada }
            }
            for (const p of (pesagensTodasData ?? []) as Array<{ animal_id: string; data: string; peso: number }>) {
              (pesagensPorAnimalTodos[p.animal_id] ??= []).push({ data: p.data, peso: p.peso })
            }
          }

          for (const [loteId, lancamentos] of Object.entries(porLote)) {
            const ordenados = [...lancamentos].sort((a, b) => a.data_inicio.localeCompare(b.data_inicio))
            const diaInicioLote = toDay(ordenados[0].data_inicio)
            const diaFimLote = hojeDia + 1

            // Soma o peso projetado de cada animal que esteve ativo NESSE
            // LOTE em cada dia do intervalo total (do primeiro lançamento até
            // hoje) — um único passe por animal cobre todos os lançamentos
            // do lote, em vez de recalcular por lançamento.
            const pesoTotalPorDia: Record<number, number> = {}
            const qtdAtivaPorDia: Record<number, number> = {}
            for (const animalId of animalIdsEnvolvidos) {
              const periodosDoAnimal = periodosPorAnimalTodos[animalId] ?? []
              const estevAlgumDiaNesseLote = periodosDoAnimal.some(p => p.lote_id === loteId)
              if (!estevAlgumDiaNesseLote) continue
              const animalBasico = animaisBasicoPorId[animalId]
              if (!animalBasico) continue
              const pesoPorDiaDoAnimal = projetarPesoPorDia(
                animalBasico, pesagensPorAnimalTodos[animalId] ?? [], periodosDoAnimal, ciclos,
                diaInicioLote, diaFimLote,
              )
              for (const [diaStr, peso] of Object.entries(pesoPorDiaDoAnimal)) {
                const dia = Number(diaStr)
                const periodo = encontrarLoteAtivo(dia, periodosDoAnimal)
                if (!periodo || periodo.lote_id !== loteId) continue
                pesoTotalPorDia[dia] = (pesoTotalPorDia[dia] ?? 0) + peso
                qtdAtivaPorDia[dia] = (qtdAtivaPorDia[dia] ?? 0) + 1
              }
            }

            const mapaDias: CustoRacaoRealPorDia = {}
            for (let i = 0; i < ordenados.length; i++) {
              const atual = ordenados[i]
              const proximo = ordenados[i + 1]
              const diaInicio = toDay(atual.data_inicio)
              const diaFimExclusivo = proximo ? toDay(proximo.data_inicio) : diaFimLote
              const numDias = Math.max(diaFimExclusivo - diaInicio, 1)
              const valorPorDiaDoLote = atual.valor_total / numDias
              for (let dia = diaInicio; dia < diaFimExclusivo; dia++) {
                const qtdHistorica = qtdAtivaPorDia[dia] ?? 0
                const qtdAtivaDia = qtdHistorica > 0 ? qtdHistorica : (qtdAtivaAtualPorLote[loteId] ?? 1)
                const info: CustoRacaoRealDiaInfo = {
                  valorTotalDia: valorPorDiaDoLote,
                  pesoTotalDia: pesoTotalPorDia[dia] ?? 0,
                  qtdAtivaDia,
                }
                mapaDias[dia] = info
              }
            }
            custosRacaoRealPorLote[loteId] = mapaDias
          }
        }
      }

      const dietaIds = Array.from(new Set(ciclos.map(c => c.dieta_id).filter((x): x is string => !!x)))
      if (dietaIds.length > 0) {
        const [{ data: dietasData }, { data: historicoData }] = await Promise.all([
          supabase.from('dietas').select('id, pct_consumo_pv_ms, custo_manual_ativo, custo_manual_valor, custo_manual_unidade').in('id', dietaIds),
          supabase.from('dietas_historico_custo').select('dieta_id, custo_kg_ms, vigente_desde, vigente_ate').in('dieta_id', dietaIds),
        ])
        for (const d of (dietasData ?? []) as Array<{
          id: string
          pct_consumo_pv_ms: number | null
          custo_manual_ativo: boolean
          custo_manual_valor: number | null
          custo_manual_unidade: 'kg' | 'ton' | null
        }>) {
          // custo_manual_valor é cadastrado por kg ou por ton (custo_manual_unidade);
          // o motor de cálculo (custoAnimal.ts) trabalha sempre em R$/kg de MS,
          // então a conversão ton -> kg acontece aqui, na borda de leitura.
          const custoManualValorPorKg = d.custo_manual_ativo && d.custo_manual_valor != null
            ? (d.custo_manual_unidade === 'ton' ? d.custo_manual_valor / 1000 : d.custo_manual_valor)
            : null
          dietas[d.id] = {
            pct_consumo_pv_ms: d.pct_consumo_pv_ms,
            historico: [],
            custoManualAtivo: d.custo_manual_ativo,
            custoManualValorPorKg,
          }
        }
        for (const h of (historicoData ?? []) as Array<{ dieta_id: string; custo_kg_ms: number | null; vigente_desde: string; vigente_ate: string | null }>) {
          if (!dietas[h.dieta_id]) dietas[h.dieta_id] = { pct_consumo_pv_ms: null, historico: [], custoManualAtivo: false, custoManualValorPorKg: null }
          dietas[h.dieta_id].historico.push({ custo_kg_ms: h.custo_kg_ms, vigente_desde: h.vigente_desde, vigente_ate: h.vigente_ate })
        }
        for (const d of Object.values(dietas)) {
          d.historico.sort((a, b) => a.vigente_desde.localeCompare(b.vigente_desde))
        }
      }
    }

    return { animaisPorId, pesagensPorAnimal, periodosPorAnimal, ciclos, dietas, custosOperacionaisPorLote, custosRacaoRealPorLote }
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
        ctx.custosOperacionaisPorLote,
        ctx.custosRacaoRealPorLote,
      )
    }
    return resultado
  }, [construirContexto])

  return { construirContexto, calcularEmLote }
}

// ─── Hook: custos operacionais de um lote ──────────────────────────────────────

export function useCustosOperacionais(loteId: string | null) {
  const { user } = useAuth()
  const [custos, setCustos] = useState<CustoOperacionalLote[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user || !loteId) { setCustos([]); setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('custos_operacionais_lote').select('*')
      .eq('lote_id', loteId).order('data_lancamento', { ascending: false })
    setCustos((data ?? []) as CustoOperacionalLote[])
    setLoading(false)
  }, [user, loteId])

  useEffect(() => { fetch() }, [fetch])

  const adicionarCusto = async (input: { categoria: CategoriaCustoOperacional; descricao?: string; valor: number; data_lancamento: string }) => {
    if (!user || !loteId) return { error: 'Não autenticado' }
    const { error } = await supabase.from('custos_operacionais_lote').insert({
      lote_id: loteId, categoria: input.categoria, descricao: input.descricao ?? null,
      valor: input.valor, data_lancamento: input.data_lancamento, user_id: user.id,
    })
    if (!error) await fetch()
    return { error: error?.message ?? null }
  }

  const removerCusto = async (id: string) => {
    const { error } = await supabase.from('custos_operacionais_lote').delete().eq('id', id)
    if (!error) await fetch()
    return { error: error?.message ?? null }
  }

  const total = custos.reduce((s, c) => s + c.valor, 0)

  return { custos, loading, total, adicionarCusto, removerCusto }
}

// ─── Hook: custo real de ração de um lote (recalibração) ───────────────────────
// Cada lançamento vale desde data_inicio até o próximo lançamento (ou até
// hoje, se for o mais recente), substituindo o custo de alimentação estimado
// do motor nesse intervalo. Suporta editar e excluir, diferente do custo
// operacional (que só permite excluir), pois o produtor pode errar o valor
// ou a data ao lançar.

export function useCustosRacaoReal(loteId: string | null) {
  const { user } = useAuth()
  const [custos, setCustos] = useState<CustoRacaoRealLote[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user || !loteId) { setCustos([]); setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('custos_racao_real_lote').select('*')
      .eq('lote_id', loteId).order('data_inicio', { ascending: false })
    setCustos((data ?? []) as CustoRacaoRealLote[])
    setLoading(false)
  }, [user, loteId])

  useEffect(() => { fetch() }, [fetch])

  const adicionarCustoRacaoReal = async (input: { data_inicio: string; valor_total: number; observacoes?: string }) => {
    if (!user || !loteId) return { error: 'Não autenticado' }
    const { error } = await supabase.from('custos_racao_real_lote').insert({
      lote_id: loteId, data_inicio: input.data_inicio, valor_total: input.valor_total,
      observacoes: input.observacoes ?? null, user_id: user.id,
    })
    if (!error) await fetch()
    return { error: error?.message ?? null }
  }

  const editarCustoRacaoReal = async (id: string, input: { data_inicio: string; valor_total: number; observacoes?: string }) => {
    const { error } = await supabase.from('custos_racao_real_lote').update({
      data_inicio: input.data_inicio, valor_total: input.valor_total, observacoes: input.observacoes ?? null,
    }).eq('id', id)
    if (!error) await fetch()
    return { error: error?.message ?? null }
  }

  const removerCustoRacaoReal = async (id: string) => {
    const { error } = await supabase.from('custos_racao_real_lote').delete().eq('id', id)
    if (!error) await fetch()
    return { error: error?.message ?? null }
  }

  return { custos, loading, adicionarCustoRacaoReal, editarCustoRacaoReal, removerCustoRacaoReal }
}

// ─── Hook: compras (fornecedor + preço) de um lote ─────────────────────────────

export function useCompras(loteId: string | null) {
  const { user } = useAuth()
  const [compras, setCompras] = useState<Compra[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user || !loteId) { setCompras([]); setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('compras').select('*')
      .eq('lote_id', loteId).order('data', { ascending: true })
    setCompras((data ?? []) as Compra[])
    setLoading(false)
  }, [user, loteId])

  useEffect(() => { fetch() }, [fetch])

  return { compras, loading, fetch }
}

// ─── Hook: listagem de vendas (saidas_grupo) ───────────────────────────────────

export interface SaidaGrupoDetalhe extends SaidaGrupo {
  destino_nome: string | null
  animais: Array<{ animal_id: string; codigo: string; peso: number | null; valor: number | null; custo_atribuido: number | null; lucro: number | null }>
}

export function useSaidasGrupo() {
  const { user } = useAuth()
  const [saidas, setSaidas] = useState<SaidaGrupo[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTodas = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase.from('saidas_grupo').select('*').eq('user_id', user.id).order('data', { ascending: false })
    setSaidas((data ?? []) as SaidaGrupo[])
    setLoading(false)
  }, [user])

  useEffect(() => { fetchTodas() }, [fetchTodas])

  const buscarDetalhe = async (saidaGrupoId: string): Promise<SaidaGrupoDetalhe | null> => {
    const { data: saida } = await supabase.from('saidas_grupo').select('*').eq('id', saidaGrupoId).single()
    if (!saida) return null
    const [{ data: movs }, destinoNome] = await Promise.all([
      supabase.from('movimentacoes_animais').select('animal_id, peso, valor, custo_atribuido, lucro, animais(codigo)').eq('saida_grupo_id', saidaGrupoId),
      saida.destino_id
        ? supabase.from('parceiros').select('nome').eq('id', saida.destino_id).single().then(r => r.data?.nome ?? null)
        : Promise.resolve(null),
    ])
    const animais = ((movs ?? []) as any[]).map(m => ({
      animal_id: m.animal_id, codigo: m.animais?.codigo ?? '—',
      peso: m.peso, valor: m.valor, custo_atribuido: m.custo_atribuido, lucro: m.lucro,
    }))
    return { ...(saida as SaidaGrupo), destino_nome: destinoNome, animais }
  }

  const buscarPorLote = async (loteId: string): Promise<SaidaGrupo[]> => {
    const { data: movs } = await supabase
      .from('movimentacoes_animais').select('saida_grupo_id')
      .eq('lote_origem_id', loteId).not('saida_grupo_id', 'is', null)
    const ids = Array.from(new Set((movs ?? []).map((m: { saida_grupo_id: string }) => m.saida_grupo_id)))
    if (ids.length === 0) return []
    const { data } = await supabase.from('saidas_grupo').select('*').in('id', ids).order('data', { ascending: false })
    return (data ?? []) as SaidaGrupo[]
  }

  return { saidas, loading, fetchTodas, buscarDetalhe, buscarPorLote }
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
      .from('custos_variaveis_animal').select('animal_id, valor').in('animal_id', animalIds).lte('data_lancamento', input.data)
    const custosVarPorAnimal: Record<string, number> = {}
    for (const c of (custosVarData ?? []) as Array<{ animal_id: string; valor: number }>) {
      custosVarPorAnimal[c.animal_id] = (custosVarPorAnimal[c.animal_id] ?? 0) + c.valor
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
    // Quebra pastagem x confinamento — soma o que o motor de custo já calcula
    // por animal (ver custoAnimal.ts), só para persistir no momento da venda.
    let custoAlimPastagemTotal = 0, custoAlimConfinamentoTotal = 0
    let custoOpPastagemTotal = 0, custoOpConfinamentoTotal = 0
    let ganhoPastagemTotal = 0, ganhoConfinamentoTotal = 0

    const linhasPorAnimal = input.itens.map(item => {
      const receitaBruta = receitaBrutaPorAnimal[item.animal_id] ?? 0
      const shareReceita = receitaBrutaTotal > 0 ? receitaBruta / receitaBrutaTotal : 1 / input.itens.length
      const comissaoAnimal = totalComissoes * shareReceita
      const encargoAnimal = totalEncargos * shareReceita
      const receitaLiquida = receitaBruta - comissaoAnimal - encargoAnimal

      const custoCompra = animaisPorId[item.animal_id]?.valor_compra ?? 0
      const custoAlimentacao = custos[item.animal_id]?.custoAlimentacao ?? 0
      const custosVariaveis = custosVarPorAnimal[item.animal_id] ?? 0
      const custosFixos = custos[item.animal_id]?.custoOperacional ?? 0
      const custoTotal = custoCompra + custoAlimentacao + custosVariaveis + custosFixos
      const lucro = receitaLiquida - custoTotal

      custoCompraTotal += custoCompra
      custoAlimentacaoTotal += custoAlimentacao
      custosVariaveisTotal += custosVariaveis
      custosFixosTotal += custosFixos
      receitaLiquidaTotal += receitaLiquida
      lucroTotal += lucro

      const r = custos[item.animal_id]
      if (r) {
        custoAlimPastagemTotal += r.custoAlimentacaoPastagem
        custoAlimConfinamentoTotal += r.custoAlimentacaoConfinamento
        custoOpPastagemTotal += r.custoOperacionalPastagem
        custoOpConfinamentoTotal += r.custoOperacionalConfinamento
        ganhoPastagemTotal += r.ganhoPesoPastagem
        ganhoConfinamentoTotal += r.ganhoPesoConfinamento
      }

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
      custo_alimentacao_pastagem_total: custoAlimPastagemTotal,
      custo_alimentacao_confinamento_total: custoAlimConfinamentoTotal,
      custo_operacional_pastagem_total: custoOpPastagemTotal,
      custo_operacional_confinamento_total: custoOpConfinamentoTotal,
      ganho_peso_pastagem_total: ganhoPastagemTotal,
      ganho_peso_confinamento_total: ganhoConfinamentoTotal,
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
