import { useState, useEffect, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import type {
  Lote, CicloLote, Animal, Movimentacao, Pesagem, SaidaGrupo,
  CustoVariavelAnimal, AnimalStatus, SaidaTipo, SaidaModo,
  CustoOperacionalLote, CategoriaCustoOperacional, MotivoEncerramento,
  Compra, TipoCiclo, CustoRacaoRealLote, TrocaDietaLoteRow,
} from '@/types'
import {
  calcularAnimalNaData, construirPeriodosDeMovimentacoes, gerarCodigoAnimal,
  encontrarLoteAtivo, toDay, projetarPesoPorDia, cicloNumeroDoAnimalNoDia, dietaVigenteDoAnimalNoDia,
  type PeriodoLote, type CicloInfo, type DietaInfo, type ResultadoAnimalNaData, type CustoOperacionalInfo,
  type CustoRacaoRealPorDia, type CustoRacaoRealDiaInfo, type CicloAnimalEvento, type TrocaDietaCiclo,
} from '@/lib/custoAnimal'
import { ordenarPorBrinco } from '@/lib/calculations'
import { obterRendimento, obterBonus } from '@/lib/calculations'
import { LIMITE_LOTES_ATIVOS, LIMITE_ANIMAIS_TOTAL, type Plano } from '@/hooks/useAssinatura'

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
  precoKgCarcaca?: number // usado só no modo rendimento_carcaca
  rendimentoAbatePct?: number // usado só no modo rendimento_carcaca
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

// Limite de animais por plano — conta o total histórico já cadastrado pelo
// usuário (inclui vendidos/abatidos/etc, não só os ativos). Checado com dado
// fresco do banco (plano + contagem), igual ao limite de lotes ativos, pra
// não deixar passar por corrida entre abas ou logo após um upgrade.
export async function verificarLimiteAnimais(userId: string, quantidadeNova: number): Promise<{ error: string | null }> {
  const { data: profileData } = await supabase
    .from('profiles').select('plano, plano_status').eq('id', userId).single()
  const planoEfetivo = ((profileData?.plano_status === 'ativo' ? profileData?.plano : 'free') ?? 'free') as Plano
  const limite = LIMITE_ANIMAIS_TOTAL[planoEfetivo] ?? LIMITE_ANIMAIS_TOTAL.free
  if (!Number.isFinite(limite)) return { error: null }

  const { count } = await supabase
    .from('animais').select('id', { count: 'exact', head: true }).eq('user_id', userId)
  if ((count ?? 0) + quantidadeNova > limite) {
    return { error: `Seu plano (${planoEfetivo}) permite até ${limite} animais cadastrados no total. Faça upgrade em Configurações, aba Conta, para cadastrar mais.` }
  }
  return { error: null }
}

// ─── Pesagem opcional lançada no momento da troca de ciclo ─────────────────────
// modo 'massa': um único peso aplicado a todos os animais da troca.
// modo 'individual': um peso por animal — animais sem peso informado no mapa
// simplesmente não recebem pesagem (a troca de ciclo em si não é bloqueada).
export interface PesagemNaTroca {
  modo: 'individual' | 'massa'
  pesoUnico?: number
  porAnimal?: Record<string, number>
}

async function inserirPesagensNaTroca(
  userId: string, animalIds: string[], data: string, pesagem?: PesagemNaTroca,
): Promise<{ error: string | null }> {
  if (!pesagem) return { error: null }
  let rows: Array<{ animal_id: string; peso: number; data: string; user_id: string }> = []
  if (pesagem.modo === 'massa') {
    if (pesagem.pesoUnico == null || pesagem.pesoUnico <= 0) {
      return { error: 'Informe o peso a aplicar a todos os animais selecionados' }
    }
    rows = animalIds.map(id => ({ animal_id: id, peso: pesagem.pesoUnico as number, data, user_id: userId }))
  } else {
    const porAnimal = pesagem.porAnimal ?? {}
    rows = animalIds
      .filter(id => porAnimal[id] != null && porAnimal[id] > 0)
      .map(id => ({ animal_id: id, peso: porAnimal[id], data, user_id: userId }))
  }
  if (rows.length === 0) return { error: null }
  const { error } = await supabase.from('pesagens').insert(rows)
  return { error: error?.message ?? null }
}

// ─── Hook: lotes (lista + CRUD) ────────────────────────────────────────────────

export function useLotes() {
  const { user } = useAuth()
  const [lotes, setLotes] = useState<Lote[]>([])
  const [ciclosPorLote, setCiclosPorLote] = useState<Record<string, CicloLote[]>>({})
  const [resumo, setResumo] = useState<Record<string, { qtdAtiva: number; pesoMedioEntrada: number; dataEntradaMin: string | null; dataEntradaMax: string | null }>>({})
  // Quantos animais ativos de cada lote estão em cada número de ciclo — igual
  // a { [numero]: qtd }. Num lote sem avanço parcial, tem uma única chave
  // (o ciclo_atual do lote); com avanço parcial, pode ter mais de uma —
  // é o que alimenta o badge de distribuição na UI.
  const [distribuicaoCiclos, setDistribuicaoCiclos] = useState<Record<string, Record<number, number>>>({})
  // Trocas de dieta dentro do mesmo ciclo (lote inteiro), por lote — ver
  // TrocaDietaLoteRow em types/index.ts e resolverDietaIdNoDia em custoAnimal.ts.
  const [trocasDietaPorLote, setTrocasDietaPorLote] = useState<Record<string, TrocaDietaLoteRow[]>>({})
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

      const { data: trocasDietaData } = await supabase
        .from('trocas_dieta_lote').select('*').in('lote_id', ids).order('data')
      const gruposTrocas: Record<string, TrocaDietaLoteRow[]> = {}
      for (const t of (trocasDietaData ?? []) as TrocaDietaLoteRow[]) {
        (gruposTrocas[t.lote_id] ??= []).push(t)
      }
      setTrocasDietaPorLote(gruposTrocas)

      const { data: animaisData } = await supabase
        .from('animais').select('lote_atual_id, peso_entrada, status, data_entrada, ciclo_atual')
        .eq('user_id', user.id).in('lote_atual_id', ids)
      const res: Record<string, { qtdAtiva: number; pesoMedioEntrada: number; dataEntradaMin: string | null; dataEntradaMax: string | null }> = {}
      for (const id of ids) res[id] = { qtdAtiva: 0, pesoMedioEntrada: 0, dataEntradaMin: null, dataEntradaMax: null }
      const somaPeso: Record<string, number> = {}
      const distribuicao: Record<string, Record<number, number>> = {}
      for (const a of (animaisData ?? []) as Array<{ lote_atual_id: string; peso_entrada: number; status: string; data_entrada: string | null; ciclo_atual: number }>) {
        if (a.status !== 'ativo') continue
        if (!a.lote_atual_id) continue
        res[a.lote_atual_id].qtdAtiva += 1
        somaPeso[a.lote_atual_id] = (somaPeso[a.lote_atual_id] ?? 0) + a.peso_entrada
        if (a.data_entrada) {
          const r = res[a.lote_atual_id]
          if (!r.dataEntradaMin || a.data_entrada < r.dataEntradaMin) r.dataEntradaMin = a.data_entrada
          if (!r.dataEntradaMax || a.data_entrada > r.dataEntradaMax) r.dataEntradaMax = a.data_entrada
        }
        const porCiclo = (distribuicao[a.lote_atual_id] ??= {})
        porCiclo[a.ciclo_atual] = (porCiclo[a.ciclo_atual] ?? 0) + 1
      }
      for (const id of ids) {
        if (res[id].qtdAtiva > 0) res[id].pesoMedioEntrada = somaPeso[id] / res[id].qtdAtiva
      }
      setResumo(res)
      setDistribuicaoCiclos(distribuicao)
    } else {
      setCiclosPorLote({})
      setResumo({})
      setDistribuicaoCiclos({})
      setTrocasDietaPorLote({})
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

    // Número do primeiro ciclo configurado — normalmente 1, mas o produtor
    // pode escolher começar em outro número (ver FormLoteBase/cicloInicial em
    // Lotes.tsx), quando o lote pula direto para uma etapa que ele numera de
    // forma fixa entre lotes (ex: sempre chamar a etapa principal de "ciclo 2").
    const numeroInicial = Math.min(...input.ciclos.map(c => c.numero))

    const { data: lote, error: e1 } = await supabase.from('lotes').insert({
      nome_lote: input.nome_lote,
      codigo_lote: input.codigo_lote,
      prefixo: input.prefixo,
      data_criacao: input.data_criacao,
      ciclo_atual: numeroInicial,
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
    if (e1) {
      if (e1.message.includes('idx_lotes_prefixo_ativo')) {
        return { error: `Já existe um lote ativo usando o prefixo "${input.prefixo || '(vazio)'}". Escolha outro prefixo.` }
      }
      return { error: e1.message }
    }

    const ciclosRows = input.ciclos.map(c => ({
      lote_id: lote.id,
      numero: c.numero,
      nome: c.nome,
      tipo_ciclo: c.tipo_ciclo,
      dias_planejados: c.dias_planejados,
      dieta_id: c.dieta_id,
      gmd_esperado: c.gmd_esperado,
      data_inicio: c.numero === numeroInicial ? input.data_criacao : null,
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
  // novo (linha sem id), editar os existentes, e agora recebe a data_inicio
  // de cada ciclo (numero >= 2) diretamente do usuário — não é mais derivada
  // por cascata de dias_planejados (esse campo virou só uma estimativa de
  // planejamento, sem efeito no cálculo). O ciclo 1 continua amarrado à data
  // de entrada do lote (dataCriacao). data_fim de cada ciclo é sempre
  // recalculado = data_inicio do próximo (ou null no último), pra nunca
  // deixar gap nem sobreposição — é o que o motor de custo usa pra saber
  // qual ciclo (e qual dieta) vale em cada dia.
  //
  // As datas dos ciclos precisam ser preenchidas em prefixo contíguo a partir
  // do 1 (não pode ter ciclo 3 com data e ciclo 2 sem) e estritamente
  // crescentes entre si.
  //
  // Quando a data_inicio de um ciclo já existente muda, os eventos
  // individuais em animais_ciclo_eventos que apontavam pra data antiga desse
  // mesmo lote/ciclo são atualizados junto — sem isso, animais que passaram
  // por avancarCiclo (evento próprio) ignorariam a nova data do lote, porque
  // o motor de custo prioriza o evento do animal sobre a data do ciclo do
  // lote (ver encontrarCicloAtivoParaAnimal em custoAnimal.ts). Avanços
  // parciais com data própria e diferente da data do lote não são tocados —
  // só os eventos cuja data batia exatamente com a data antiga do ciclo.
  const salvarCiclosLote = async (
    loteId: string,
    dataCriacao: string,
    ciclos: Array<{ id?: string; numero: number; nome: string; tipo_ciclo: TipoCiclo; dias_planejados: number; dieta_id: string | null; gmd_esperado: number | null; data_inicio: string | null }>
  ) => {
    if (!user) return { error: 'Não autenticado' }
    if (ciclos.length === 0) return { error: 'O lote precisa ter ao menos um ciclo' }
    if (ciclos.length > 8) return { error: 'Máximo de 8 ciclos por lote' }

    const ordenados = [...ciclos].sort((a, b) => a.numero - b.numero)

    // Ciclo 1 sempre começa na data de entrada do lote.
    const datasFinais = ordenados.map((c, i) => i === 0 ? dataCriacao : c.data_inicio)

    // Prefixo contíguo: se um ciclo não tem data, nenhum dos seguintes pode ter.
    const primeiroSemData = datasFinais.findIndex(d => !d)
    if (primeiroSemData !== -1) {
      const sobrouComData = datasFinais.slice(primeiroSemData + 1).some(d => !!d)
      if (sobrouComData) {
        return { error: `Ciclo ${ordenados[primeiroSemData].numero}: informe a data de início antes de datar os ciclos seguintes` }
      }
    }

    // Datas não podem voltar no tempo — mas podem EMPATAR entre ciclos
    // consecutivos: isso representa um ciclo de duração zero (o lote "pulou"
    // direto pro próximo, ex.: entrou já em pastagem/misto, sem passar pelo
    // ciclo 1). O motor de custo já trata isso corretamente (intervalo
    // meio-aberto: data_inicio == data_fim = zero dias nesse ciclo).
    for (let i = 1; i < datasFinais.length; i++) {
      if (datasFinais[i] && datasFinais[i - 1] && datasFinais[i]! < datasFinais[i - 1]!) {
        return { error: `Ciclo ${ordenados[i].numero}: a data de início não pode ser anterior à do ciclo ${ordenados[i - 1].numero}` }
      }
    }

    const { error: eLote } = await supabase.from('lotes')
      .update({ data_criacao: dataCriacao, num_ciclos: ciclos.length }).eq('id', loteId)
    if (eLote) return { error: eLote.message }

    // Apaga do banco qualquer ciclo que existia antes e não está mais na lista
    // final (ex: usuário removeu um ciclo no modal). Sem isso, a linha antiga
    // permanece com o numero antigo e pode colidir com o numero de um ciclo
    // novo inserido depois, violando a constraint única (lote_id, numero).
    const idsMantidos = ciclos.filter(c => c.id).map(c => c.id as string)
    const { data: existentes, error: eExistentes } = await supabase
      .from('ciclos_lote').select('id, numero, data_inicio').eq('lote_id', loteId)
    if (eExistentes) return { error: eExistentes.message }
    const idsParaRemover = (existentes ?? [])
      .map(e => e.id as string)
      .filter(id => !idsMantidos.includes(id))
    if (idsParaRemover.length > 0) {
      const { error: eDel } = await supabase.from('ciclos_lote').delete().in('id', idsParaRemover)
      if (eDel) return { error: eDel.message }
    }

    // Data antiga por número de ciclo, pra saber depois quais eventos por
    // animal precisam ser sincronizados com a data nova.
    const dataAntigaPorNumero = new Map<number, string | null>()
    for (const e of existentes ?? []) dataAntigaPorNumero.set(e.numero as number, e.data_inicio as string | null)

    for (let i = 0; i < ordenados.length; i++) {
      const c = ordenados[i]
      const dataInicio = datasFinais[i]
      const dataFim = i === ordenados.length - 1 ? null : datasFinais[i + 1]

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

      // Sincroniza animais_ciclo_eventos quando a data desse ciclo mudou.
      const dataAntiga = dataAntigaPorNumero.get(c.numero) ?? null
      if (dataAntiga && dataInicio && dataAntiga !== dataInicio) {
        const { error: eEv } = await supabase.from('animais_ciclo_eventos')
          .update({ data: dataInicio })
          .eq('lote_id', loteId).eq('ciclo_numero', c.numero).eq('data', dataAntiga)
        if (eEv) return { error: `Ciclo ${c.numero}: eventos de animais não puderam ser sincronizados (${eEv.message})` }
      }
    }

    await fetchLotes()
    return { error: null }
  }

  const removerCiclo = async (cicloId: string) => {
    const { error } = await supabase.from('ciclos_lote').delete().eq('id', cicloId)
    if (!error) await fetchLotes()
    return { error: error?.message ?? null }
  }

  // Avanço "total": move todos os animais ativos que ainda estão no ciclo-base
  // do lote (lote.ciclo_atual) para o próximo ciclo. Animais que já foram
  // adiantados por um avanço parcial anterior (ciclo_atual já maior) não são
  // tocados aqui — evita pular um ciclo neles. A data agora é escolhida pelo
  // produtor (pode ser retroativa, já que às vezes só lança dias depois) em
  // vez de travada em "hoje".
  const avancarCiclo = async (loteId: string, data?: string, pesagem?: PesagemNaTroca) => {
    if (!user) return { error: 'Não autenticado' }
    const lote = lotes.find(l => l.id === loteId)
    if (!lote) return { error: 'Lote não encontrado' }

    const dataEfetiva = data || new Date().toISOString().split('T')[0]
    const ciclos = ciclosPorLote[loteId] ?? []
    const atual = ciclos.find(c => c.numero === lote.ciclo_atual)
    const proximo = ciclos.find(c => c.numero === lote.ciclo_atual + 1)
    if (!proximo) return { error: 'Próximo ciclo não está configurado' }

    const { data: animaisData, error: eBusca } = await supabase
      .from('animais').select('id')
      .eq('lote_atual_id', loteId).eq('status', 'ativo').eq('ciclo_atual', lote.ciclo_atual)
    if (eBusca) return { error: eBusca.message }
    const animalIds = (animaisData ?? []).map((a: { id: string }) => a.id)

    if (atual) await supabase.from('ciclos_lote').update({ data_fim: dataEfetiva }).eq('id', atual.id)
    await supabase.from('ciclos_lote').update({ data_inicio: dataEfetiva }).eq('id', proximo.id)

    if (animalIds.length > 0) {
      for (const idsChunk of chunkArray(animalIds, TAMANHO_CHUNK_IDS)) {
        const { error: eUpd } = await supabase.from('animais').update({ ciclo_atual: lote.ciclo_atual + 1 }).in('id', idsChunk)
        if (eUpd) return { error: eUpd.message }
      }
      const eventosRows = animalIds.map(id => ({
        animal_id: id, lote_id: loteId,
        ciclo_numero_anterior: lote.ciclo_atual, ciclo_numero: lote.ciclo_atual + 1,
        data: dataEfetiva, user_id: user.id,
      }))
      for (const chunk of chunkArray(eventosRows, TAMANHO_CHUNK_IDS)) {
        const { error: eEv } = await supabase.from('animais_ciclo_eventos').insert(chunk)
        if (eEv) return { error: eEv.message }
      }
      const { error: ePeso } = await inserirPesagensNaTroca(user.id, animalIds, dataEfetiva, pesagem)
      if (ePeso) return { error: ePeso }
    }

    const { error } = await supabase.from('lotes').update({ ciclo_atual: lote.ciclo_atual + 1 }).eq('id', loteId)
    if (!error) await fetchLotes()
    return { error: error?.message ?? null }
  }

  // Avanço "parcial": adianta só os animais selecionados para o próximo
  // ciclo, sem mexer no ciclo_atual do lote nem nas datas de ciclos_lote —
  // o lote passa a ter animais em ciclos diferentes ao mesmo tempo (badge de
  // distribuição na UI). Exige que todos os selecionados estejam hoje no
  // mesmo ciclo entre si (senão não dá pra definir um único "próximo ciclo"
  // pra eles de uma vez).
  const avancarCicloParcial = async (loteId: string, animalIds: string[], data: string, pesagem?: PesagemNaTroca) => {
    if (!user) return { error: 'Não autenticado' }
    if (animalIds.length === 0) return { error: 'Selecione ao menos um animal' }
    const lote = lotes.find(l => l.id === loteId)
    if (!lote) return { error: 'Lote não encontrado' }

    const linhas = await buscarPorIds<{ id: string; ciclo_atual: number }>(animalIds, (idsChunk, from, to) =>
      supabase.from('animais').select('id, ciclo_atual').in('id', idsChunk).range(from, to))
    if (linhas.length !== animalIds.length) return { error: 'Algum animal selecionado não foi encontrado' }

    const ciclosDistintos = new Set(linhas.map(a => a.ciclo_atual))
    if (ciclosDistintos.size > 1) {
      return { error: 'Os animais selecionados estão em ciclos diferentes entre si — selecione animais que estejam todos no mesmo ciclo' }
    }
    const cicloOrigem = linhas[0].ciclo_atual
    const ciclos = ciclosPorLote[loteId] ?? []
    if (!ciclos.some(c => c.numero === cicloOrigem + 1)) {
      return { error: 'Próximo ciclo não está configurado para este lote' }
    }

    for (const idsChunk of chunkArray(animalIds, TAMANHO_CHUNK_IDS)) {
      const { error: eUpd } = await supabase.from('animais').update({ ciclo_atual: cicloOrigem + 1 }).in('id', idsChunk)
      if (eUpd) return { error: eUpd.message }
    }
    const eventosRows = animalIds.map(id => ({
      animal_id: id, lote_id: loteId,
      ciclo_numero_anterior: cicloOrigem, ciclo_numero: cicloOrigem + 1,
      data, user_id: user.id,
    }))
    for (const chunk of chunkArray(eventosRows, TAMANHO_CHUNK_IDS)) {
      const { error: eEv } = await supabase.from('animais_ciclo_eventos').insert(chunk)
      if (eEv) return { error: eEv.message }
    }
    const { error: ePeso } = await inserirPesagensNaTroca(user.id, animalIds, data, pesagem)
    if (ePeso) return { error: ePeso }

    await fetchLotes()
    return { error: null }
  }

  // Troca a dieta vigente de um ciclo já em andamento, sem mexer no ciclo em
  // si (mesmo numero, mesmo gmd_esperado) — vale para o lote inteiro, a
  // partir da data escolhida, até a próxima troca (se houver) ou até o fim
  // do ciclo. O motor de custo (resolverDietaIdNoDia) recalcula a
  // alimentação a partir dessa data pra frente, sem tocar no histórico
  // anterior. Pode ser chamada quantas vezes forem necessárias no mesmo ciclo.
  const trocarDietaCiclo = async (loteId: string, cicloNumero: number, dietaId: string, data: string) => {
    if (!user) return { error: 'Não autenticado' }
    const ciclo = (ciclosPorLote[loteId] ?? []).find(c => c.numero === cicloNumero)
    if (!ciclo) return { error: 'Ciclo não encontrado neste lote' }
    if (ciclo.data_inicio && data < ciclo.data_inicio) {
      return { error: `A data não pode ser anterior ao início do ciclo (${ciclo.data_inicio.split('-').reverse().join('/')})` }
    }
    if (ciclo.data_fim && data > ciclo.data_fim) {
      return { error: `A data não pode ser posterior ao fim do ciclo (${ciclo.data_fim.split('-').reverse().join('/')})` }
    }
    const jaExiste = (trocasDietaPorLote[loteId] ?? []).some(t => t.ciclo_numero === cicloNumero && t.data === data)
    if (jaExiste) return { error: 'Já existe uma troca de dieta registrada nesta data para este ciclo' }

    const { error } = await supabase.from('trocas_dieta_lote').insert({
      lote_id: loteId, ciclo_numero: cicloNumero, dieta_id: dietaId, data, user_id: user.id,
    })
    if (!error) await fetchLotes()
    return { error: error?.message ?? null }
  }

  const removerTrocaDieta = async (trocaId: string) => {
    const { error } = await supabase.from('trocas_dieta_lote').delete().eq('id', trocaId)
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

    const erroLimite = await verificarLimiteAnimais(user.id, input.linhas.length)
    if (erroLimite.error) return { error: erroLimite.error }

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

    for (const idsChunk of chunkArray(input.animal_ids, TAMANHO_CHUNK_IDS)) {
      const { error: e2 } = await supabase.from('animais')
        .update({ lote_atual_id: novoLote.id }).in('id', idsChunk)
      if (e2) return { error: e2.message }
    }

    await fetchLotes()
    return { error: null, lote: novoLote }
  }

  const moverAliquota = async (input: MoverAliquotaInput) => {
    if (!user) return { error: 'Não autenticado' }
    if (input.animal_ids.length === 0) return { error: 'Selecione ao menos um animal' }

    const animaisAtuais = await buscarPorIds<{ id: string; lote_atual_id: string | null }>(input.animal_ids, (idsChunk, from, to) =>
      supabase.from('animais').select('id, lote_atual_id').in('id', idsChunk).range(from, to))

    const grupoEventoId = crypto.randomUUID()
    const movRows = animaisAtuais.map(a => ({
      animal_id: a.id, tipo: 'transferencia_lote',
      lote_origem_id: a.lote_atual_id, lote_destino_id: input.lote_destino_id,
      data: input.data, observacoes: input.observacoes ?? null,
      grupo_evento_id: grupoEventoId, user_id: user.id,
    }))
    const { error: e1 } = await supabase.from('movimentacoes_animais').insert(movRows)
    if (e1) return { error: e1.message }

    for (const idsChunk of chunkArray(input.animal_ids, TAMANHO_CHUNK_IDS)) {
      const { error: e2 } = await supabase.from('animais')
        .update({ lote_atual_id: input.lote_destino_id }).in('id', idsChunk)
      if (e2) return { error: e2.message }
    }

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
    lotes, ciclosPorLote, resumo, distribuicaoCiclos, trocasDietaPorLote, loading,
    lotesAtivos, lotesEncerrados,
    fetchLotes, proximoNumeroLote,
    criarLote, atualizarLote, editarCiclo, salvarCiclosLote, removerCiclo, avancarCiclo, avancarCicloParcial, encerrarLote,
    trocarDietaCiclo, removerTrocaDieta,
    criarAnimais, bifurcar, moverAliquota, excluirAnimal,
  }
}

// ─── Hook: animais de um lote específico ───────────────────────────────────────

// ─── CRUD de pesagem/histórico de um animal (fonte única) ──────────────────────
// Extraído como funções de módulo (não presas a nenhum hook específico) para
// que tanto useAnimaisDoLote (usado em Lotes.tsx) quanto a página Pesagens
// (busca por brinco, sem passar pelo lote) usem exatamente a mesma lógica —
// nunca duas implementações divergentes do mesmo CRUD.

export async function registrarPesagemAnimal(
  userId: string, input: { animal_id: string; peso: number; data: string; observacoes?: string },
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('pesagens').insert({ ...input, user_id: userId })
  return { error: error?.message ?? null }
}

export async function registrarPesagemLoteAnimais(
  userId: string, pesagens: Array<{ animal_id: string; peso: number; data: string }>,
): Promise<{ error: string | null }> {
  const rows = pesagens.map(p => ({ ...p, user_id: userId }))
  const { error } = await supabase.from('pesagens').insert(rows)
  return { error: error?.message ?? null }
}

// Corrige uma pesagem já lançada (peso e/ou data digitados errado). Não
// permite jogar a data pra antes da entrada do animal — mesma regra do
// registro inicial — mas não impede reordenar em relação a outras pesagens,
// já que o motor de custo ordena tudo por data de qualquer forma.
export async function editarPesagemAnimal(
  input: { id: string; animal_id: string; peso: number; data: string },
): Promise<{ error: string | null }> {
  const { data: animalData } = await supabase.from('animais').select('data_entrada').eq('id', input.animal_id).maybeSingle()
  if (animalData && input.data < animalData.data_entrada) {
    return { error: 'A data da pesagem não pode ser anterior à entrada do animal' }
  }
  const { error } = await supabase.from('pesagens').update({ peso: input.peso, data: input.data }).eq('id', input.id)
  return { error: error?.message ?? null }
}

export async function excluirPesagemAnimal(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('pesagens').delete().eq('id', id)
  return { error: error?.message ?? null }
}

export async function buscarPesagensAnimal(animalId: string): Promise<Pesagem[]> {
  const { data } = await supabase.from('pesagens').select('*').eq('animal_id', animalId).order('data', { ascending: false })
  return (data ?? []) as Pesagem[]
}

export async function buscarMovimentacoesAnimal(animalId: string): Promise<Movimentacao[]> {
  const { data } = await supabase.from('movimentacoes_animais').select('*').eq('animal_id', animalId).order('data', { ascending: true })
  return (data ?? []) as Movimentacao[]
}

// Busca animais do usuário por brinco (contém, case-insensitive) — usada pela
// página Pesagens pra achar o animal sem precisar navegar até o lote. Só
// animais ativos por padrão (evita listar vendidos/mortos misturados na busca
// do dia a dia; a tela decide se quer incluir inativos).
export async function buscarAnimaisPorBrinco(
  userId: string, termo: string, incluirInativos = false,
): Promise<Array<Animal & { lote_nome: string | null; lote_codigo: string | null }>> {
  let query = supabase
    .from('animais')
    .select('*, lotes:lote_atual_id(nome_lote, codigo_lote)')
    .eq('user_id', userId)
    .ilike('brinco', `%${termo}%`)
    .order('brinco')
    .limit(50)
  if (!incluirInativos) query = query.eq('status', 'ativo')
  const { data } = await query
  return ((data ?? []) as Array<Animal & { lotes: { nome_lote: string; codigo_lote: string } | null }>).map(a => {
    const { lotes, ...resto } = a
    return { ...resto, lote_nome: lotes?.nome_lote ?? null, lote_codigo: lotes?.codigo_lote ?? null }
  })
}

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
    return registrarPesagemAnimal(user.id, input)
  }

  const registrarPesagemLote = async (pesagens: Array<{ animal_id: string; peso: number; data: string }>) => {
    if (!user) return { error: 'Não autenticado' }
    return registrarPesagemLoteAnimais(user.id, pesagens)
  }

  const editarPesagem = editarPesagemAnimal
  const excluirPesagem = excluirPesagemAnimal
  const buscarPesagens = buscarPesagensAnimal
  const buscarMovimentacoes = buscarMovimentacoesAnimal

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
    if (error) return { error: error.message }
    // Mantém a movimentação de entrada (usada na reconstrução dos períodos do
    // motor de custo) sincronizada com a data_entrada — sem isso, o motor de
    // custo não encontra lote/ciclo ativo nos dias entre a nova data_entrada
    // e a data antiga da movimentação, e o GMD/custo daquele intervalo fica
    // incorretamente zerado mesmo com data_entrada corrigida.
    await supabase
      .from('movimentacoes_animais')
      .update({ data: input.data_entrada })
      .eq('animal_id', input.animal_id).eq('tipo', 'entrada')
    await fetch()
    return { error: null }
  }

  return {
    animais, loading, fetch,
    registrarPesagem, registrarPesagemLote, editarEntrada,
    buscarPesagens, buscarMovimentacoes, buscarCustosVariaveis, adicionarCustoVariavel,
    editarPesagem, excluirPesagem,
  }
}

// ─── Hook: busca de animal por brinco (página Pesagens) ────────────────────────
// Permite achar um animal pelo brinco sem passar pelo lote. Todo o CRUD de
// pesagem usado aqui é o mesmo das funções de módulo acima (registrarPesagemAnimal
// etc.) — mesma fonte usada em Lotes.tsx, sem lógica duplicada.
export function useBuscaAnimalPorBrinco() {
  const { user } = useAuth()
  const [resultados, setResultados] = useState<Array<Animal & { lote_nome: string | null; lote_codigo: string | null }>>([])
  const [buscando, setBuscando] = useState(false)

  const buscar = useCallback(async (termo: string, incluirInativos = false) => {
    if (!user || !termo.trim()) { setResultados([]); return }
    setBuscando(true)
    const lista = await buscarAnimaisPorBrinco(user.id, termo.trim(), incluirInativos)
    setResultados(ordenarPorBrinco(lista))
    setBuscando(false)
  }, [user])

  return {
    resultados, buscando, buscar,
    registrarPesagem: (input: { animal_id: string; peso: number; data: string; observacoes?: string }) =>
      user ? registrarPesagemAnimal(user.id, input) : Promise.resolve({ error: 'Não autenticado' }),
    editarPesagem: editarPesagemAnimal,
    excluirPesagem: excluirPesagemAnimal,
    buscarPesagens: buscarPesagensAnimal,
    buscarMovimentacoes: buscarMovimentacoesAnimal,
  }
}

// ─── Hook: histórico de movimentações entre lotes (bifurcação / transferência) ─
// Ricardo (agronomista/colaborador) reportou que o produtor costuma registrar
// a movimentação de um lote pra outro em dia diferente do dia real em que o
// animal foi fisicamente movido — e como o motor de custo usa exatamente essa
// data pra decidir qual dieta/ciclo vale em cada dia, isso distorce o custo
// acumulado. Este hook lista os eventos de troca de lote (agrupados por
// grupo_evento_id, já que bifurcação/movimentação em lote afetam vários
// animais de uma vez) e permite corrigir a data de TODO o grupo junto — mais
// fiel à realidade, já que os animais daquele evento foram movidos no mesmo
// dia. Não cobre o evento de "entrada" (esse já tem correção própria em
// editarEntrada, atrelada ao peso de entrada) nem saídas/vendas (fora do
// escopo pedido).
export interface MovimentacaoGrupoLote {
  grupo_evento_id: string
  tipo: string // 'bifurcacao' | 'transferencia_lote'
  data: string
  lote_origem_id: string | null
  lote_destino_id: string | null
  animais: Array<{ animal_id: string; codigo: string }>
}

export function useMovimentacoesLote(loteId: string | null) {
  const { user } = useAuth()
  const [eventos, setEventos] = useState<MovimentacaoGrupoLote[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user || !loteId) { setEventos([]); setLoading(false); return }
    setLoading(true)

    const { data: movs } = await supabase
      .from('movimentacoes_animais')
      .select('animal_id, tipo, data, lote_origem_id, lote_destino_id, grupo_evento_id')
      .eq('user_id', user.id)
      .in('tipo', ['bifurcacao', 'transferencia_lote'])
      .not('grupo_evento_id', 'is', null)
      .or(`lote_origem_id.eq.${loteId},lote_destino_id.eq.${loteId}`)
      .order('data', { ascending: false })

    const linhas = (movs ?? []) as Array<{ animal_id: string; tipo: string; data: string; lote_origem_id: string | null; lote_destino_id: string | null; grupo_evento_id: string }>
    const animalIds = Array.from(new Set(linhas.map(l => l.animal_id)))
    const codigoPorAnimal: Record<string, string> = {}
    if (animalIds.length > 0) {
      const animaisData = await buscarPorIds<{ id: string; codigo: string }>(animalIds, (idsChunk, from, to) =>
        supabase.from('animais').select('id, codigo').in('id', idsChunk).range(from, to))
      for (const a of animaisData) codigoPorAnimal[a.id] = a.codigo
    }

    const porGrupo: Record<string, MovimentacaoGrupoLote> = {}
    for (const l of linhas) {
      if (!porGrupo[l.grupo_evento_id]) {
        porGrupo[l.grupo_evento_id] = {
          grupo_evento_id: l.grupo_evento_id, tipo: l.tipo, data: l.data,
          lote_origem_id: l.lote_origem_id, lote_destino_id: l.lote_destino_id, animais: [],
        }
      }
      porGrupo[l.grupo_evento_id].animais.push({ animal_id: l.animal_id, codigo: codigoPorAnimal[l.animal_id] ?? '—' })
    }

    setEventos(Object.values(porGrupo).sort((a, b) => b.data.localeCompare(a.data)))
    setLoading(false)
  }, [user, loteId])

  useEffect(() => { fetch() }, [fetch])

  // Corrige a data de todo o grupo junto. Valida, PRA CADA animal do grupo,
  // que a nova data não fica antes do evento anterior dele (entrada ou outra
  // troca de lote) nem depois do próximo evento (se existir) — senão os
  // períodos que o motor de custo reconstrói se sobrepõem ou invertem.
  const editarDataEvento = async (grupoEventoId: string, novaData: string) => {
    if (!user) return { error: 'Não autenticado' }

    const evento = eventos.find(e => e.grupo_evento_id === grupoEventoId)
    if (!evento) return { error: 'Evento não encontrado' }

    for (const { animal_id, codigo } of evento.animais) {
      const { data: historico } = await supabase
        .from('movimentacoes_animais')
        .select('id, tipo, data, grupo_evento_id')
        .eq('animal_id', animal_id)
        .order('data', { ascending: true })

      const lista = (historico ?? []) as Array<{ id: string; tipo: string; data: string; grupo_evento_id: string | null }>
      const idx = lista.findIndex(m => m.grupo_evento_id === grupoEventoId)
      if (idx === -1) continue

      const anterior = lista[idx - 1]
      const proximo = lista[idx + 1]
      if (anterior && novaData < anterior.data) {
        return { error: `${codigo}: a nova data não pode ser anterior a ${fmtDataSimples(anterior.data)} (evento anterior desse animal)` }
      }
      if (proximo && novaData >= proximo.data) {
        return { error: `${codigo}: a nova data precisa ser anterior a ${fmtDataSimples(proximo.data)} (próximo evento desse animal)` }
      }
    }

    const { error } = await supabase
      .from('movimentacoes_animais')
      .update({ data: novaData })
      .eq('grupo_evento_id', grupoEventoId)
    if (error) return { error: error.message }

    await fetch()
    return { error: null }
  }

  return { eventos, loading, fetch, editarDataEvento }
}

function fmtDataSimples(d: string): string {
  const [ano, mes, dia] = d.split('-')
  return `${dia}/${mes}/${ano}`
}



interface ContextoCusto {
  animaisPorId: Record<string, { peso_entrada: number; data_entrada: string }>
  pesagensPorAnimal: Record<string, Array<{ data: string; peso: number }>>
  periodosPorAnimal: Record<string, PeriodoLote[]>
  ciclos: CicloInfo[]
  dietas: Record<string, DietaInfo>
  custosOperacionaisPorLote: Record<string, CustoOperacionalInfo[]>
  custosRacaoRealPorLote: Record<string, CustoRacaoRealPorDia>
  // Histórico de troca de ciclo por animal (avanço individual/parcial dentro
  // do mesmo lote) — permite que animais do mesmo lote estejam em ciclos
  // diferentes ao mesmo tempo. Ver encontrarCicloAtivoParaAnimal.
  eventosPorAnimal: Record<string, CicloAnimalEvento[]>
  // Trocas de dieta dentro do mesmo ciclo (lote inteiro) — resolvidas por
  // lote_id + ciclo_numero + data dentro de calcularAnimalNaData, não por
  // animal (ver TrocaDietaCiclo em custoAnimal.ts).
  trocasDieta: TrocaDietaCiclo[]
}

// ─── Paginação para consultas que podem passar de 1000 linhas ─────────────────
// A API REST do Supabase retorna no máximo 1000 linhas por chamada quando não
// há .range() explícito — acima disso o resultado é truncado silenciosamente
// (sem erro). Lotes grandes (ex.: 500+ animais, 2 movimentações cada) passam
// facilmente desse limite em movimentacoes_animais, pesagens, etc. Este
// helper busca uma consulta em páginas de 1000 e concatena tudo.
export async function buscarTudoPaginado<T>(
  montarConsulta: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  const TAMANHO_PAGINA = 1000
  let resultado: T[] = []
  let from = 0
  while (true) {
    const { data, error } = await montarConsulta(from, from + TAMANHO_PAGINA - 1)
    if (error) { console.error('Erro ao paginar consulta:', error); break }
    const linhas = data ?? []
    resultado = resultado.concat(linhas)
    if (linhas.length < TAMANHO_PAGINA) break
    from += TAMANHO_PAGINA
  }
  return resultado
}

// ─── Chunking de listas grandes de IDs no filtro .in() ─────────────────────
// Bug real encontrado em produção (05/08): uma URL com centenas de UUIDs no
// filtro .in() (ex.: id=in.(uuid1,uuid2,...,uuid665)) é rejeitada pela API
// REST do Supabase com 400 Bad Request — não é truncamento silencioso, é erro
// franco, e não depende de .range() estar presente ou não (confirmado no log
// da API: a mesma query sem .range() também falha com lista grande). Lotes
// com centenas de animais (este caso: 665) batem nesse limite direto. Este
// helper divide a lista de IDs em pedaços menores antes de montar o filtro
// .in(), roda uma consulta por pedaço (cada uma já paginada via
// buscarTudoPaginado, para o caso raro de um único pedaço passar de 1000
// linhas) e concatena tudo. Exportado para reuso em qualquer tela que filtre
// por uma lista de IDs de animais (Ranking, Comparativo, etc.).
const TAMANHO_CHUNK_IDS = 150

export function chunkArray<T>(arr: T[], tamanho: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += tamanho) chunks.push(arr.slice(i, i + tamanho))
  return chunks
}

export async function buscarPorIds<T>(
  ids: string[],
  montarConsulta: (idsChunk: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  if (ids.length === 0) return []
  const chunks = chunkArray(ids, TAMANHO_CHUNK_IDS)
  const resultadosPorChunk = await Promise.all(
    chunks.map(chunk => buscarTudoPaginado<T>((from, to) => montarConsulta(chunk, from, to)))
  )
  return resultadosPorChunk.flat()
}

// ─── Contagem histórica de animais ativos num lote, numa data qualquer ────────
// Reconstrói os períodos de TODOS os animais que já passaram pelo lote (não só
// os ativos hoje) a partir de movimentacoes_animais, e conta quantos estavam
// ativos nele na data pedida. Usado para exibir o TOTAL de um lançamento de
// custo operacional (valor por animal x quantidade de animais ativos na data
// do lançamento — ver custoAnimal.ts, onde o valor por animal já é aplicado
// sem essa multiplicação, cabeça por cabeça). Fallback: se não há ninguém
// registrado exatamente naquela data (situação anômala), usa a quantidade
// ativa atual do lote.
export async function contarAtivosNoDiaDoLote(loteId: string, dataAlvo: string): Promise<number> {
  const movs = await buscarTudoPaginado<{ animal_id: string; tipo: string; lote_origem_id: string | null; lote_destino_id: string | null; data: string }>((from, to) =>
    supabase
      .from('movimentacoes_animais')
      .select('animal_id, tipo, lote_origem_id, lote_destino_id, data')
      .or(`lote_origem_id.eq.${loteId},lote_destino_id.eq.${loteId}`)
      .range(from, to))

  const movsPorAnimal: Record<string, Array<{ tipo: string; lote_origem_id: string | null; lote_destino_id: string | null; data: string }>> = {}
  for (const m of movs) (movsPorAnimal[m.animal_id] ??= []).push(m)

  const dia = toDay(dataAlvo)
  let count = 0
  for (const animalMovs of Object.values(movsPorAnimal)) {
    const periodos = construirPeriodosDeMovimentacoes(animalMovs)
    const periodo = encontrarLoteAtivo(dia, periodos)
    if (periodo && periodo.lote_id === loteId) count++
  }

  if (count > 0) return count

  const { count: countAtual } = await supabase
    .from('animais').select('id', { count: 'exact', head: true })
    .eq('lote_atual_id', loteId).eq('status', 'ativo')
  return countAtual ?? 1
}

export function useCustoEngine() {
  const { user } = useAuth()

  const construirContexto = useCallback(async (animalIds: string[]): Promise<ContextoCusto> => {
    if (!user || animalIds.length === 0) {
      return { animaisPorId: {}, pesagensPorAnimal: {}, periodosPorAnimal: {}, ciclos: [], dietas: {}, custosOperacionaisPorLote: {}, custosRacaoRealPorLote: {}, eventosPorAnimal: {}, trocasDieta: [] }
    }

    const [animaisData, pesagensData, movsData] = await Promise.all([
      buscarPorIds<{ id: string; peso_entrada: number; data_entrada: string }>(animalIds, (idsChunk, from, to) =>
        supabase.from('animais').select('id, peso_entrada, data_entrada, lote_atual_id').in('id', idsChunk).range(from, to)),
      buscarPorIds<{ animal_id: string; data: string; peso: number }>(animalIds, (idsChunk, from, to) =>
        supabase.from('pesagens').select('animal_id, data, peso').in('animal_id', idsChunk).range(from, to)),
      buscarPorIds<{ animal_id: string; tipo: string; lote_origem_id: string | null; lote_destino_id: string | null; data: string }>(animalIds, (idsChunk, from, to) =>
        supabase.from('movimentacoes_animais').select('animal_id, tipo, lote_origem_id, lote_destino_id, data').in('animal_id', idsChunk).range(from, to)),
    ])

    const animaisPorId: ContextoCusto['animaisPorId'] = {}
    for (const a of animaisData) {
      animaisPorId[a.id] = { peso_entrada: a.peso_entrada, data_entrada: a.data_entrada }
    }

    const pesagensPorAnimal: ContextoCusto['pesagensPorAnimal'] = {}
    for (const p of pesagensData) {
      (pesagensPorAnimal[p.animal_id] ??= []).push({ data: p.data, peso: p.peso })
    }

    const movsPorAnimal: Record<string, Array<{ tipo: string; lote_origem_id: string | null; lote_destino_id: string | null; data: string }>> = {}
    const loteIdsEnvolvidos = new Set<string>()
    for (const m of movsData) {
      (movsPorAnimal[m.animal_id] ??= []).push(m)
      if (m.lote_origem_id) loteIdsEnvolvidos.add(m.lote_origem_id)
      if (m.lote_destino_id) loteIdsEnvolvidos.add(m.lote_destino_id)
    }

    const periodosPorAnimal: ContextoCusto['periodosPorAnimal'] = {}
    for (const animalId of animalIds) {
      periodosPorAnimal[animalId] = construirPeriodosDeMovimentacoes(movsPorAnimal[animalId] ?? [])
    }

    let ciclos: CicloInfo[] = []
    let trocasDieta: TrocaDietaCiclo[] = []
    const dietas: Record<string, DietaInfo> = {}
    const custosOperacionaisPorLote: Record<string, CustoOperacionalInfo[]> = {}
    const custosRacaoRealPorLote: Record<string, CustoRacaoRealPorDia> = {}
    const eventosPorAnimal: Record<string, CicloAnimalEvento[]> = {}

    if (loteIdsEnvolvidos.size > 0) {
      const loteIdsArr = Array.from(loteIdsEnvolvidos)
      const [{ data: ciclosData }, { data: custosOpData }, { data: racaoRealData }, ativosData, { data: eventosCicloData }, { data: trocasDietaData }, { data: membrosGrupoData }] = await Promise.all([
        supabase.from('ciclos_lote').select('lote_id, numero, tipo_ciclo, dieta_id, gmd_esperado, data_inicio, data_fim').in('lote_id', loteIdsArr),
        supabase.from('custos_operacionais_lote').select('lote_id, valor, data_lancamento').in('lote_id', loteIdsArr),
        supabase.from('custos_racao_real_lote').select('lote_id, valor_total, data_inicio, ciclo_numero').in('lote_id', loteIdsArr),
        buscarTudoPaginado<{ lote_atual_id: string }>((from, to) =>
          supabase.from('animais').select('lote_atual_id').eq('status', 'ativo').in('lote_atual_id', loteIdsArr).range(from, to)),
        supabase.from('animais_ciclo_eventos').select('animal_id, lote_id, ciclo_numero, ciclo_numero_anterior, data').in('lote_id', loteIdsArr),
        supabase.from('trocas_dieta_lote').select('lote_id, ciclo_numero, dieta_id, data').in('lote_id', loteIdsArr),
        // Grupos de Consumo de Ração (compra rateada) em que algum desses lotes
        // participa — usado abaixo pra gerar custo real "sintético" por dia, no
        // mesmo formato do custo real manual (custosRacaoRealPorLote), a partir
        // do custo médio ponderado das compras do grupo (ver custoRacaoGrupo.ts).
        supabase.from('grupos_consumo_lotes').select('lote_id, grupo_id, data_inicio, data_fim').in('lote_id', loteIdsArr),
      ])
      ciclos = (ciclosData ?? []) as CicloInfo[]
      trocasDieta = (trocasDietaData ?? []) as TrocaDietaCiclo[]

      for (const e of (eventosCicloData ?? []) as Array<{ animal_id: string; lote_id: string; ciclo_numero: number; ciclo_numero_anterior: number | null; data: string }>) {
        (eventosPorAnimal[e.animal_id] ??= []).push({ lote_id: e.lote_id, ciclo_numero: e.ciclo_numero, ciclo_numero_anterior: e.ciclo_numero_anterior, data: e.data })
      }

      // fallback: quantidade ativa HOJE, usada só quando não há ninguém registrado
      // no lote na data exata do lançamento do custo
      const qtdAtivaAtualPorLote: Record<string, number> = {}
      for (const a of ativosData) {
        qtdAtivaAtualPorLote[a.lote_atual_id] = (qtdAtivaAtualPorLote[a.lote_atual_id] ?? 0) + 1
      }

      const custosOp = (custosOpData ?? []) as Array<{ lote_id: string; valor: number; data_lancamento: string }>
      const racaoReal = (racaoRealData ?? []) as Array<{ lote_id: string; valor_total: number; data_inicio: string; ciclo_numero: number | null }>
      const membrosGrupo = (membrosGrupoData ?? []) as Array<{ lote_id: string; grupo_id: string; data_inicio: string; data_fim: string | null }>

      if (custosOp.length > 0 || racaoReal.length > 0 || membrosGrupo.length > 0) {
        // rateio histórico: busca TODAS as movimentações desses lotes (qualquer
        // animal que já passou por eles, não só o lote em cálculo), reconstrói
        // os períodos de cada um e conta quantos estavam no lote em qualquer
        // data pedida — usado tanto pelo custo operacional (um dia) quanto
        // pelo custo real de ração (todos os dias do intervalo de vigência)
        const todasMovsDosLotes = await buscarTudoPaginado<{ animal_id: string; tipo: string; lote_origem_id: string | null; lote_destino_id: string | null; data: string }>((from, to) =>
          supabase
            .from('movimentacoes_animais')
            .select('animal_id, tipo, lote_origem_id, lote_destino_id, data')
            .or(loteIdsArr.map(id => `lote_origem_id.eq.${id}`).concat(loteIdsArr.map(id => `lote_destino_id.eq.${id}`)).join(','))
            .range(from, to))

        const movsPorAnimalTodos: Record<string, Array<{ tipo: string; lote_origem_id: string | null; lote_destino_id: string | null; data: string }>> = {}
        for (const m of todasMovsDosLotes) {
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
          // Agrupa por (lote, ciclo) — ciclo null é o lançamento "lote inteiro"
          // (comportamento original). Cada grupo cascade só contra lançamentos
          // do MESMO escopo (um lançamento do ciclo 2 não interrompe nem é
          // interrompido por um lançamento do lote inteiro ou do ciclo 3).
          const porLoteCiclo: Record<string, Array<{ valor_total: number; data_inicio: string; ciclo_numero: number | null }>> = {}
          for (const r of racaoReal) {
            const chave = `${r.lote_id}\u0000${r.ciclo_numero ?? ''}`
            ;(porLoteCiclo[chave] ??= []).push(r)
          }

          // Peso de cada animal precisa vir de TODOS os que já passaram pelos
          // lotes com custo real lançado, não só dos animais do cálculo atual
          // — por isso busca peso_entrada/data_entrada/pesagens de novo aqui,
          // para o conjunto completo de animal_ids encontrado acima.
          const animalIdsEnvolvidos = Object.keys(periodosPorAnimalTodos)
          const animaisBasicoPorId: Record<string, { peso_entrada: number; data_entrada: string }> = {}
          const pesagensPorAnimalTodos: Record<string, Array<{ data: string; peso: number }>> = {}
          if (animalIdsEnvolvidos.length > 0) {
            const [animaisBasicoData, pesagensTodasData] = await Promise.all([
              buscarPorIds<{ id: string; peso_entrada: number; data_entrada: string }>(animalIdsEnvolvidos, (idsChunk, from, to) =>
                supabase.from('animais').select('id, peso_entrada, data_entrada').in('id', idsChunk).range(from, to)),
              buscarPorIds<{ animal_id: string; data: string; peso: number }>(animalIdsEnvolvidos, (idsChunk, from, to) =>
                supabase.from('pesagens').select('animal_id, data, peso').in('animal_id', idsChunk).range(from, to)),
            ])
            for (const a of animaisBasicoData) {
              animaisBasicoPorId[a.id] = { peso_entrada: a.peso_entrada, data_entrada: a.data_entrada }
            }
            for (const p of pesagensTodasData) {
              (pesagensPorAnimalTodos[p.animal_id] ??= []).push({ data: p.data, peso: p.peso })
            }
          }

          for (const [chave, lancamentos] of Object.entries(porLoteCiclo)) {
            const [loteId, cicloStr] = chave.split('\u0000')
            const cicloNumero = cicloStr === '' ? null : Number(cicloStr)
            const ordenados = [...lancamentos].sort((a, b) => a.data_inicio.localeCompare(b.data_inicio))
            const diaInicioLote = toDay(ordenados[0].data_inicio)
            const diaFimLote = hojeDia + 1

            // Soma o peso projetado de cada animal que esteve ativo NESSE
            // LOTE (e, se o lançamento é escopado a um ciclo, também NAQUELE
            // CICLO especificamente) em cada dia do intervalo total — um
            // único passe por animal cobre todos os lançamentos do grupo.
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
                diaInicioLote, diaFimLote, eventosPorAnimal[animalId] ?? [],
              )
              for (const [diaStr, peso] of Object.entries(pesoPorDiaDoAnimal)) {
                const dia = Number(diaStr)
                const periodo = encontrarLoteAtivo(dia, periodosDoAnimal)
                if (!periodo || periodo.lote_id !== loteId) continue
                if (cicloNumero !== null) {
                  const cicloDoAnimalNoDia = cicloNumeroDoAnimalNoDia(loteId, dia, ciclos, eventosPorAnimal[animalId] ?? [])
                  if (cicloDoAnimalNoDia !== cicloNumero) continue
                }
                pesoTotalPorDia[dia] = (pesoTotalPorDia[dia] ?? 0) + peso
                qtdAtivaPorDia[dia] = (qtdAtivaPorDia[dia] ?? 0) + 1
              }
            }

            for (let i = 0; i < ordenados.length; i++) {
              const atual = ordenados[i]
              const proximo = ordenados[i + 1]
              const diaInicio = toDay(atual.data_inicio)
              const diaFimExclusivo = proximo ? toDay(proximo.data_inicio) : diaFimLote
              const numDias = Math.max(diaFimExclusivo - diaInicio, 1)
              const valorPorDia = atual.valor_total / numDias
              for (let dia = diaInicio; dia < diaFimExclusivo; dia++) {
                const qtdHistorica = qtdAtivaPorDia[dia] ?? 0
                // fallback pra quando não há histórico de peso pro dia exato:
                // lançamento do lote inteiro cai na contagem geral de ativos
                // hoje; lançamento de ciclo específico não tem esse número
                // pronto, então cai em 1 (evita dividir por zero sem inflar
                // artificialmente a contagem de um ciclo que não é o do lote).
                const qtdAtivaDia = qtdHistorica > 0
                  ? qtdHistorica
                  : (cicloNumero === null ? (qtdAtivaAtualPorLote[loteId] ?? 1) : 1)
                const info: CustoRacaoRealDiaInfo = {
                  valorTotalDia: valorPorDia,
                  pesoTotalDia: pesoTotalPorDia[dia] ?? 0,
                  qtdAtivaDia,
                  cicloNumero,
                }
                ;((custosRacaoRealPorLote[loteId] ??= {} as CustoRacaoRealPorDia)[dia] ??= []).push(info)
              }
            }
          }
        }

        // ─── Custo real de ração via Grupo de Consumo (compra rateada) ─────
        // Mesmo destino (custosRacaoRealPorLote), mas a fonte do valor não é
        // um lançamento manual: é o consumo teórico do lote (peso x %MS da
        // dieta DO GRUPO — pode ser diferente da dieta do ciclo, já que quem
        // decide quais lotes compartilham a leva física é a composição do
        // grupo, não o ciclo) multiplicado pelo custo médio ponderado vigente
        // no período que cobre aquele dia (ver grupos_consumo_periodos /
        // custoRacaoGrupo.ts). Sempre cicloNumero null — rateio de grupo vale
        // pro lote inteiro; a exclusão de quem não compartilha a compra já
        // acontece na composição do grupo (produtor escolhe os membros).
        if (membrosGrupo.length > 0) {
          const grupoIds = Array.from(new Set(membrosGrupo.map(m => m.grupo_id)))
          const [{ data: gruposData }, { data: periodosGrupoData }, { data: comprasGrupoData }] = await Promise.all([
            supabase.from('grupos_consumo_racao').select('id, dieta_id, custo_confirmado_kg').in('id', grupoIds),
            supabase.from('grupos_consumo_periodos').select('grupo_id, vigente_desde, vigente_ate, custo_medio_kg').in('grupo_id', grupoIds),
            supabase.from('compras_racao_grupo').select('grupo_id, quantidade_kg').in('grupo_id', grupoIds),
          ])
          const dietaIdPorGrupo: Record<string, string> = {}
          const custoConfirmadoPorGrupo: Record<string, number | null> = {}
          for (const g of (gruposData ?? []) as Array<{ id: string; dieta_id: string; custo_confirmado_kg: number | null }>) {
            dietaIdPorGrupo[g.id] = g.dieta_id
            custoConfirmadoPorGrupo[g.id] = g.custo_confirmado_kg
          }
          // Total realmente comprado por grupo (soma de todas as compras) —
          // usado só quando há confirmação manual, pra calcular o fator de
          // escala que mantém o total debitado dos animais igual ao total
          // pago, mesmo exibindo/aplicando o preço REAL por kg (ver abaixo).
          const totalCompradoPorGrupo: Record<string, number> = {}
          for (const c of (comprasGrupoData ?? []) as Array<{ grupo_id: string; quantidade_kg: number }>) {
            totalCompradoPorGrupo[c.grupo_id] = (totalCompradoPorGrupo[c.grupo_id] ?? 0) + c.quantidade_kg
          }

          const dietaIdsGrupo = Array.from(new Set(Object.values(dietaIdPorGrupo)))
          const pctPorDietaGrupo: Record<string, number | null> = {}
          if (dietaIdsGrupo.length > 0) {
            const { data: dietasPctData } = await supabase.from('dietas').select('id, pct_consumo_pv_ms').in('id', dietaIdsGrupo)
            for (const d of (dietasPctData ?? []) as Array<{ id: string; pct_consumo_pv_ms: number | null }>) pctPorDietaGrupo[d.id] = d.pct_consumo_pv_ms
          }

          const periodosPorGrupo: Record<string, Array<{ vigente_desde: string; vigente_ate: string | null; custo_medio_kg: number }>> = {}
          for (const p of (periodosGrupoData ?? []) as Array<{ grupo_id: string; vigente_desde: string; vigente_ate: string | null; custo_medio_kg: number }>) {
            (periodosPorGrupo[p.grupo_id] ??= []).push(p)
          }

          // Peso de cada animal, de novo a partir de todo mundo que já passou
          // pelos lotes envolvidos (mesmo animalIdsEnvolvidos usado acima pro
          // racaoReal manual) — busca independente pra não acoplar este bloco
          // ao `if (racaoReal.length > 0)` acima (grupo pode existir mesmo sem
          // nenhum lançamento manual).
          const animalIdsGrupo = Object.keys(periodosPorAnimalTodos)
          const animaisGrupoBasicoPorId: Record<string, { peso_entrada: number; data_entrada: string }> = {}
          const pesagensGrupoPorAnimal: Record<string, Array<{ data: string; peso: number }>> = {}
          if (animalIdsGrupo.length > 0) {
            const [animaisBasicoData, pesagensTodasData] = await Promise.all([
              buscarPorIds<{ id: string; peso_entrada: number; data_entrada: string }>(animalIdsGrupo, (idsChunk, from, to) =>
                supabase.from('animais').select('id, peso_entrada, data_entrada').in('id', idsChunk).range(from, to)),
              buscarPorIds<{ animal_id: string; data: string; peso: number }>(animalIdsGrupo, (idsChunk, from, to) =>
                supabase.from('pesagens').select('animal_id, data, peso').in('animal_id', idsChunk).range(from, to)),
            ])
            for (const a of animaisBasicoData) animaisGrupoBasicoPorId[a.id] = { peso_entrada: a.peso_entrada, data_entrada: a.data_entrada }
            for (const p of pesagensTodasData) (pesagensGrupoPorAnimal[p.animal_id] ??= []).push({ data: p.data, peso: p.peso })
          }

          const hojeDiaGrupo = toDay(new Date().toISOString().slice(0, 10))

          // Agrupa as linhas de participação por (grupo, lote) — um lote pode
          // ter mais de uma linha em grupos_consumo_lotes se foi removido e
          // readicionado ao grupo mais de uma vez. "Desde" (data_inicio) de
          // cada linha é só informativo agora (não limita mais o cálculo):
          // quem decide a partir de quando um dia conta pro rateio é a dieta
          // que o animal de fato consumia naquele dia (ver dietaVigenteDoAnimalNoDia
          // abaixo), a partir da primeira compra do grupo. "Até" (data_fim),
          // quando preenchido via "Encerrar participação", continua valendo
          // como corte — dias depois dele não contam mais pra esse lote nesse
          // grupo, mesmo que a dieta ainda bata.
          const membrosPorLoteGrupo: Record<string, { grupo_id: string; lote_id: string; linhas: Array<{ data_fim: string | null }> }> = {}
          for (const m of membrosGrupo) {
            const chave = `${m.grupo_id}\u0000${m.lote_id}`
            ;(membrosPorLoteGrupo[chave] ??= { grupo_id: m.grupo_id, lote_id: m.lote_id, linhas: [] }).linhas.push({ data_fim: m.data_fim })
          }

          // ─── 1ª passada: peso/consumo teórico por dia de cada (grupo,lote),
          // e o total teórico acumulado do GRUPO INTEIRO (soma de todos os
          // lotes que dividem essa compra) — precisa disso ANTES de aplicar
          // qualquer preço, porque o fator de escala da confirmação manual
          // (ver 2ª passada) depende do total teórico do grupo todo, não só
          // de um lote por vez.
          const dadosPorLoteGrupo: Record<string, {
            grupo_id: string; lote_id: string; pct: number; limiteFim: number | null
            diaInicioGrupo: number; diaFimGrupo: number
            pesoTotalPorDiaGrupo: Record<number, number>; qtdAtivaPorDiaGrupo: Record<number, number>
          }> = {}
          const totalTeoricoPorGrupo: Record<string, number> = {}

          for (const [chave, { grupo_id, lote_id, linhas }] of Object.entries(membrosPorLoteGrupo)) {
            const dietaId = dietaIdPorGrupo[grupo_id]
            const pct = dietaId ? pctPorDietaGrupo[dietaId] : null
            if (pct == null || !dietaId) continue
            const periodosDoGrupo = periodosPorGrupo[grupo_id] ?? []
            if (periodosDoGrupo.length === 0) continue

            // Só conta a partir da primeira compra do grupo — dias com a
            // dieta batendo mas sem nenhum preço vigente ainda não entram.
            const diaInicioGrupo = Math.min(...periodosDoGrupo.map(p => toDay(p.vigente_desde)))
            const diaFimGrupo = hojeDiaGrupo + 1

            const semCorte = linhas.some(l => !l.data_fim)
            const limiteFim = semCorte ? null : Math.max(...linhas.map(l => toDay(l.data_fim as string)))

            const pesoTotalPorDiaGrupo: Record<number, number> = {}
            const qtdAtivaPorDiaGrupo: Record<number, number> = {}
            for (const animalId of animalIdsGrupo) {
              const periodosDoAnimal = periodosPorAnimalTodos[animalId] ?? []
              const estevoNesseLote = periodosDoAnimal.some(p => p.lote_id === lote_id)
              if (!estevoNesseLote) continue
              const animalBasico = animaisGrupoBasicoPorId[animalId]
              if (!animalBasico) continue
              const pesoPorDiaDoAnimal = projetarPesoPorDia(
                animalBasico, pesagensGrupoPorAnimal[animalId] ?? [], periodosDoAnimal, ciclos,
                diaInicioGrupo, diaFimGrupo, eventosPorAnimal[animalId] ?? [],
              )
              for (const [diaStr, peso] of Object.entries(pesoPorDiaDoAnimal)) {
                const dia = Number(diaStr)
                if (limiteFim !== null && dia > limiteFim) continue
                const periodo = encontrarLoteAtivo(dia, periodosDoAnimal)
                if (!periodo || periodo.lote_id !== lote_id) continue
                // Só conta o dia se o animal de fato estava, naquele dia,
                // num ciclo com a mesma dieta associada à compra — é isso
                // que dá acurácia ao rateio (mesmo espírito de uma pesagem
                // real recalibrar o peso: aqui a compra recalibra o custo,
                // mas só nos dias em que a dieta realmente bate).
                const dietaDoAnimalNoDia = dietaVigenteDoAnimalNoDia(lote_id, dia, ciclos, eventosPorAnimal[animalId] ?? [], trocasDieta)
                if (dietaDoAnimalNoDia !== dietaId) continue
                pesoTotalPorDiaGrupo[dia] = (pesoTotalPorDiaGrupo[dia] ?? 0) + peso
                qtdAtivaPorDiaGrupo[dia] = (qtdAtivaPorDiaGrupo[dia] ?? 0) + 1
              }
            }

            dadosPorLoteGrupo[chave] = { grupo_id, lote_id, pct, limiteFim, diaInicioGrupo, diaFimGrupo, pesoTotalPorDiaGrupo, qtdAtivaPorDiaGrupo }
            let teoricoLote = 0
            for (const peso of Object.values(pesoTotalPorDiaGrupo)) teoricoLote += peso * (pct / 100)
            totalTeoricoPorGrupo[grupo_id] = (totalTeoricoPorGrupo[grupo_id] ?? 0) + teoricoLote
          }

          // ─── 2ª passada: gera o custo real por dia, aplicando o preço
          // vigente (histórico, baseado em kg real comprado) OU, quando há
          // confirmação manual, o preço REAL pago escalado por
          // (total comprado do grupo / total teórico do grupo) — assim o
          // preço exibido/usado é o real, e o total somado entre todos os
          // animais do grupo nunca ultrapassa o que foi de fato pago.
          for (const { grupo_id, lote_id, pct, limiteFim, diaInicioGrupo, diaFimGrupo, pesoTotalPorDiaGrupo, qtdAtivaPorDiaGrupo } of Object.values(dadosPorLoteGrupo)) {
            const periodosDoGrupo = periodosPorGrupo[grupo_id] ?? []
            const custoConfirmado = custoConfirmadoPorGrupo[grupo_id]
            const teoricoGrupo = totalTeoricoPorGrupo[grupo_id] ?? 0
            const fatorEscala = custoConfirmado != null && teoricoGrupo > 0
              ? (totalCompradoPorGrupo[grupo_id] ?? 0) / teoricoGrupo
              : 1

            for (let dia = diaInicioGrupo; dia < diaFimGrupo; dia++) {
              if (limiteFim !== null && dia > limiteFim) continue
              const pesoTotalDia = pesoTotalPorDiaGrupo[dia] ?? 0
              if (pesoTotalDia <= 0) continue
              const consumoKgDia = pesoTotalDia * (pct / 100)

              let valorTotalDia: number
              if (custoConfirmado != null) {
                valorTotalDia = consumoKgDia * fatorEscala * custoConfirmado
              } else {
                const periodoVigente = periodosDoGrupo.find(p => {
                  const desde = toDay(p.vigente_desde)
                  const ate = p.vigente_ate ? toDay(p.vigente_ate) : null
                  return dia >= desde && (ate === null || dia < ate)
                })
                if (!periodoVigente) continue
                valorTotalDia = consumoKgDia * periodoVigente.custo_medio_kg
              }

              const info: CustoRacaoRealDiaInfo = {
                valorTotalDia,
                pesoTotalDia,
                qtdAtivaDia: qtdAtivaPorDiaGrupo[dia] ?? 1,
                cicloNumero: null,
              }
              ;((custosRacaoRealPorLote[lote_id] ??= {} as CustoRacaoRealPorDia)[dia] ??= []).push(info)
            }
          }
        }
      }

      const dietaIds = Array.from(new Set(ciclos.map(c => c.dieta_id).filter((x): x is string => !!x)))
      if (dietaIds.length > 0) {
        const [{ data: dietasData }, { data: historicoData }] = await Promise.all([
          supabase.from('dietas').select('id, pct_consumo_pv_ms, pct_concentrado, gmd_esperado_concentrado, custo_manual_ativo, custo_manual_valor, custo_manual_unidade').in('id', dietaIds),
          supabase.from('dietas_historico_custo').select('dieta_id, custo_kg_ms, vigente_desde, vigente_ate').in('dieta_id', dietaIds),
        ])
        for (const d of (dietasData ?? []) as Array<{
          id: string
          pct_consumo_pv_ms: number | null
          pct_concentrado: number | null
          gmd_esperado_concentrado: number | null
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
            pct_concentrado: d.pct_concentrado,
            gmd_esperado_concentrado: d.gmd_esperado_concentrado,
            historico: [],
            custoManualAtivo: d.custo_manual_ativo,
            custoManualValorPorKg,
          }
        }
        for (const h of (historicoData ?? []) as Array<{ dieta_id: string; custo_kg_ms: number | null; vigente_desde: string; vigente_ate: string | null }>) {
          if (!dietas[h.dieta_id]) dietas[h.dieta_id] = { pct_consumo_pv_ms: null, pct_concentrado: null, gmd_esperado_concentrado: null, historico: [], custoManualAtivo: false, custoManualValorPorKg: null }
          dietas[h.dieta_id].historico.push({ custo_kg_ms: h.custo_kg_ms, vigente_desde: h.vigente_desde, vigente_ate: h.vigente_ate })
        }
        for (const d of Object.values(dietas)) {
          d.historico.sort((a, b) => a.vigente_desde.localeCompare(b.vigente_desde))
        }
      }
    }

    return { animaisPorId, pesagensPorAnimal, periodosPorAnimal, ciclos, dietas, custosOperacionaisPorLote, custosRacaoRealPorLote, eventosPorAnimal, trocasDieta }
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
        ctx.eventosPorAnimal[animalId] ?? [],
        ctx.trocasDieta,
      )
    }
    return resultado
  }, [construirContexto])

  return { construirContexto, calcularEmLote }
}

// ─── Hook: custos operacionais de um lote ──────────────────────────────────────

// Custo operacional lançado + a quantidade de animais ativos na data desse
// lançamento (para exibir o total real: valor por animal x quantidade).
export interface CustoOperacionalComQtd extends CustoOperacionalLote {
  qtdAtivaNaData: number
}

export function useCustosOperacionais(loteId: string | null) {
  const { user } = useAuth()
  const [custos, setCustos] = useState<CustoOperacionalComQtd[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user || !loteId) { setCustos([]); setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('custos_operacionais_lote').select('*')
      .eq('lote_id', loteId).order('data_lancamento', { ascending: false })
    const linhas = (data ?? []) as CustoOperacionalLote[]
    // Quantidade ativa na data de cada lançamento — cada linha resolvida em
    // paralelo (reconstrução de períodos é feita uma vez por chamada, mas o
    // volume de lançamentos operacionais por lote é tipicamente pequeno).
    const comQtd = await Promise.all(linhas.map(async c => ({
      ...c, qtdAtivaNaData: await contarAtivosNoDiaDoLote(loteId, c.data_lancamento),
    })))
    setCustos(comQtd)
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

  // valor é por animal — o total exibido é valor x quantidade de animais
  // ativos na data de cada lançamento (ver custoAnimal.ts)
  const total = custos.reduce((s, c) => s + c.valor * c.qtdAtivaNaData, 0)

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

  const adicionarCustoRacaoReal = async (input: { data_inicio: string; valor_total: number; ciclo_numero?: number | null; observacoes?: string }) => {
    if (!user || !loteId) return { error: 'Não autenticado' }
    const { error } = await supabase.from('custos_racao_real_lote').insert({
      lote_id: loteId, data_inicio: input.data_inicio, valor_total: input.valor_total,
      ciclo_numero: input.ciclo_numero ?? null,
      observacoes: input.observacoes ?? null, user_id: user.id,
    })
    if (!error) await fetch()
    return { error: error?.message ?? null }
  }

  const editarCustoRacaoReal = async (id: string, input: { data_inicio: string; valor_total: number; ciclo_numero?: number | null; observacoes?: string }) => {
    const { error } = await supabase.from('custos_racao_real_lote').update({
      data_inicio: input.data_inicio, valor_total: input.valor_total,
      ciclo_numero: input.ciclo_numero ?? null,
      observacoes: input.observacoes ?? null,
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
  animais: Array<{
    animal_id: string; codigo: string; peso: number | null; valor: number | null
    custo_atribuido: number | null; lucro: number | null
    preco_kg_carcaca: number | null; rendimento_abate_pct: number | null
  }>
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
      supabase.from('movimentacoes_animais')
        .select('animal_id, peso, valor, custo_atribuido, lucro, preco_kg_carcaca, rendimento_abate_pct, animais(codigo)')
        .eq('saida_grupo_id', saidaGrupoId),
      saida.destino_id
        ? supabase.from('parceiros').select('nome').eq('id', saida.destino_id).single().then(r => r.data?.nome ?? null)
        : Promise.resolve(null),
    ])
    const animais = ((movs ?? []) as any[]).map(m => ({
      animal_id: m.animal_id, codigo: m.animais?.codigo ?? '—',
      peso: m.peso, valor: m.valor, custo_atribuido: m.custo_atribuido, lucro: m.lucro,
      preco_kg_carcaca: m.preco_kg_carcaca, rendimento_abate_pct: m.rendimento_abate_pct,
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
    if (input.modo === 'rendimento_carcaca' && input.itens.some(i => !i.precoKgCarcaca || i.precoKgCarcaca <= 0)) {
      return { error: 'Informe o preço por kg de carcaça de cada animal' }
    }
    if (input.modo === 'rendimento_carcaca' && input.itens.some(i => !i.rendimentoAbatePct || i.rendimentoAbatePct <= 0 || i.rendimentoAbatePct > 100)) {
      return { error: 'Informe o rendimento de abate (%) de cada animal' }
    }

    const animalIds = input.itens.map(i => i.animal_id)

    const [animaisData, { data: rendData }, { data: bonusData }, custos, custosVarData] = await Promise.all([
      buscarPorIds<{ id: string; valor_compra: number; lote_atual_id: string | null }>(animalIds, (idsChunk, from, to) =>
        supabase.from('animais').select('id, valor_compra, lote_atual_id').in('id', idsChunk).range(from, to)),
      supabase.from('rendimento_faixas').select('*').eq('user_id', user.id),
      supabase.from('bonus_faixas').select('*').eq('user_id', user.id),
      calcularEmLote(animalIds, input.data),
      buscarPorIds<{ animal_id: string; valor: number }>(animalIds, (idsChunk, from, to) =>
        supabase.from('custos_variaveis_animal').select('animal_id, valor').in('animal_id', idsChunk).lte('data_lancamento', input.data).range(from, to)),
    ])

    const animaisPorId: Record<string, { valor_compra: number; lote_atual_id: string | null }> = {}
    for (const a of animaisData) {
      animaisPorId[a.id] = { valor_compra: a.valor_compra, lote_atual_id: a.lote_atual_id }
    }

    const custosVarPorAnimal: Record<string, number> = {}
    for (const c of custosVarData) {
      custosVarPorAnimal[c.animal_id] = (custosVarPorAnimal[c.animal_id] ?? 0) + c.valor
    }

    const rendimentos = (rendData ?? []) as Array<{ peso_min: number; peso_max: number; rendimento_percentual: number }>
    const bonus = (bonusData ?? []) as Array<{ peso_min: number; peso_max: number; bonus_por_kg: number }>

    const porAnimal = input.itens.map(item => {
      // No modo rendimento_carcaca o rendimento é o real, informado pelo produtor
      // no ato da venda (não a estimativa por faixa de peso) — e não há bônus,
      // já que o preço já reflete o rendimento efetivo do animal.
      if (input.modo === 'rendimento_carcaca') {
        const rendPct = item.rendimentoAbatePct ?? 0
        const pesoCarcaca = item.peso * (rendPct / 100)
        return { ...item, rendPct, pesoCarcaca, valorBonus: 0 }
      }
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
    } else if (input.modo === 'rendimento_carcaca') {
      for (const a of porAnimal) receitaPrincipalPorAnimal[a.animal_id] = a.pesoCarcaca * (a.precoKgCarcaca ?? 0)
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
    let custoAlimPastagemTotal = 0, custoAlimConfinamentoTotal = 0, custoAlimMistoTotal = 0
    let custoOpPastagemTotal = 0, custoOpConfinamentoTotal = 0, custoOpMistoTotal = 0
    let ganhoPastagemTotal = 0, ganhoConfinamentoTotal = 0, ganhoMistoTotal = 0

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
        custoAlimMistoTotal += r.custoAlimentacaoMisto
        custoOpPastagemTotal += r.custoOperacionalPastagem
        custoOpConfinamentoTotal += r.custoOperacionalConfinamento
        custoOpMistoTotal += r.custoOperacionalMisto
        ganhoPastagemTotal += r.ganhoPesoPastagem
        ganhoConfinamentoTotal += r.ganhoPesoConfinamento
        ganhoMistoTotal += r.ganhoPesoMisto
      }

      return {
        animal_id: item.animal_id, peso: item.peso, receitaBruta, custoTotal, lucro,
        precoKgCarcaca: input.modo === 'rendimento_carcaca' ? (item.precoKgCarcaca ?? null) : null,
        rendimentoAbatePct: input.modo === 'rendimento_carcaca' ? (item.rendimentoAbatePct ?? null) : null,
      }
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
      custo_alimentacao_misto_total: custoAlimMistoTotal,
      custo_operacional_pastagem_total: custoOpPastagemTotal,
      custo_operacional_confinamento_total: custoOpConfinamentoTotal,
      custo_operacional_misto_total: custoOpMistoTotal,
      ganho_peso_pastagem_total: ganhoPastagemTotal,
      ganho_peso_confinamento_total: ganhoConfinamentoTotal,
      ganho_peso_misto_total: ganhoMistoTotal,
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
      preco_kg_carcaca: l.precoKgCarcaca, rendimento_abate_pct: l.rendimentoAbatePct,
      user_id: user.id,
    }))
    const { error: eMov } = await supabase.from('movimentacoes_animais').insert(movRows)
    if (eMov) return { error: eMov.message }

    const statusNovo = TIPO_SAIDA_STATUS[input.tipo]
    for (const idsChunk of chunkArray(animalIds, TAMANHO_CHUNK_IDS)) {
      const { error: eUpd } = await supabase.from('animais')
        .update({ status: statusNovo, lote_atual_id: null }).in('id', idsChunk)
      if (eUpd) return { error: eUpd.message }
    }

    return { error: null, saidaGrupo: saidaGrupo as SaidaGrupo, resultadoPorAnimal: linhasPorAnimal }
  }

  return { registrarVenda }
}
