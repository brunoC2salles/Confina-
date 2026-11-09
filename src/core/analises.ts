// ─── Núcleo de análises (painel, ranking, comparativo, relatórios) ────────────
// Cálculos que antes ficavam dentro das páginas, compartilhados com o MCP.
import { supabase } from './db.js'
import { calcularCustosEmLote, buscarPorIds, buscarTudoPaginado, buscarFornecedorPorAnimal } from './lotes.js'
import { obterRendimento, obterBonus } from '../lib/calculations.js'
import type { RendimentoFaixa, BonusFaixa } from '../types'
import type { ResultadoAnimalNaData } from '../lib/custoAnimal'
import type { Lote, CicloLote } from '../types'

// ─── Painel (Dashboard) ────────────────────────────────────────────────────────
export interface MetricasPainel {
  totalAnimais: number; pesoMedioGeral: number
  receitaTotal: number; custoTotal: number; lucroTotal: number; qtdVendidos: number
  valorCompraTotal: number
  custoPastagemTotal: number; custoConfinamentoTotal: number; custoMistoTotal: number
  ganhoPastagemTotal: number; ganhoConfinamentoTotal: number; ganhoMistoTotal: number
}

// Lança erro quando alguma leitura falha (a tela mostra a mensagem de erro).
export async function carregarMetricasPainel(userId: string): Promise<MetricasPainel> {
  const [{ data: animais, error: e1 }, { data: saidas, error: e2 }, { count: qtdVendidos, error: e3 }] = await Promise.all([
    supabase.from('animais').select('peso_entrada, valor_compra').eq('user_id', userId).eq('status', 'ativo'),
    supabase.from('saidas_grupo').select('receita_liquida, custo_compra_total, custo_alimentacao_total, custos_variaveis_total, custos_fixos_rateados, lucro_total, custo_alimentacao_pastagem_total, custo_alimentacao_confinamento_total, custo_alimentacao_misto_total, custo_operacional_pastagem_total, custo_operacional_confinamento_total, custo_operacional_misto_total, ganho_peso_pastagem_total, ganho_peso_confinamento_total, ganho_peso_misto_total').eq('user_id', userId),
    supabase.from('movimentacoes_animais').select('id', { count: 'exact', head: true }).eq('user_id', userId).not('saida_grupo_id', 'is', null),
  ])
  if (e1) throw e1
  if (e2) throw e2
  if (e3) throw e3

  const as_ = animais ?? []
  const ss = saidas ?? []
  const totalAnimais = as_.length
  const pesoMedioGeral = totalAnimais > 0 ? as_.reduce((t, a) => t + a.peso_entrada, 0) / totalAnimais : 0
  const valorCompraTotal = as_.reduce((t, a) => t + a.valor_compra, 0)

  const receitaTotal = ss.reduce((t, s) => t + (s.receita_liquida ?? 0), 0)
  const custoTotal = ss.reduce((t, s) => t +
    (s.custo_compra_total ?? 0) + (s.custo_alimentacao_total ?? 0) +
    (s.custos_variaveis_total ?? 0) + (s.custos_fixos_rateados ?? 0), 0)
  const lucroTotal = ss.reduce((t, s) => t + (s.lucro_total ?? 0), 0)

  const custoPastagemTotal = ss.reduce((t, s) => t + (s.custo_alimentacao_pastagem_total ?? 0) + (s.custo_operacional_pastagem_total ?? 0), 0)
  const custoConfinamentoTotal = ss.reduce((t, s) => t + (s.custo_alimentacao_confinamento_total ?? 0) + (s.custo_operacional_confinamento_total ?? 0), 0)
  const custoMistoTotal = ss.reduce((t, s) => t + (s.custo_alimentacao_misto_total ?? 0) + (s.custo_operacional_misto_total ?? 0), 0)
  const ganhoPastagemTotal = ss.reduce((t, s) => t + (s.ganho_peso_pastagem_total ?? 0), 0)
  const ganhoConfinamentoTotal = ss.reduce((t, s) => t + (s.ganho_peso_confinamento_total ?? 0), 0)
  const ganhoMistoTotal = ss.reduce((t, s) => t + (s.ganho_peso_misto_total ?? 0), 0)

  return {
    totalAnimais, pesoMedioGeral, receitaTotal, custoTotal, lucroTotal, qtdVendidos: qtdVendidos ?? 0, valorCompraTotal,
    custoPastagemTotal, custoConfinamentoTotal, custoMistoTotal, ganhoPastagemTotal, ganhoConfinamentoTotal, ganhoMistoTotal,
  }
}

// ─── Ranking ───────────────────────────────────────────────────────────────────
// Linhas do ranking de animais ativos (custo e peso projetados hoje) e de
// animais que já saíram (valores gravados na venda). Usado pela página
// Ranking e pelo servidor MCP.
export type CriterioRanking = 'rendimento' | 'ganho' | 'custo_kg' | 'lucro' | 'peso'
const hojeStrRanking = () => new Date().toISOString().split('T')[0]

export type Sexo = 'M' | 'F' | null
export const rotuloSexo = (s: Sexo) => s === 'M' ? 'Macho' : s === 'F' ? 'Fêmea' : '—'

export interface LinhaAtivo {
  animal_id: string
  codigo: string
  brinco: string
  loteId: string
  loteNome: string
  cicloAtual: number
  sexo: Sexo
  fornecedorId: string | null
  fornecedorNome: string
  pesoEntrada: number
  pesoAtual: number
  ganho: number
  diasConfinamento: number
  rendPct: number
  custoAcumulado: number
  custoPorKg: number | null
  valorCompra: number
  lucroProjetado: number | null
}

export interface LinhaVendido {
  animal_id: string
  codigo: string
  brinco: string
  loteId: string | null
  loteNome: string
  sexo: Sexo
  fornecedorId: string | null
  fornecedorNome: string
  data: string
  pesoEntrada: number
  pesoVenda: number
  ganho: number
  rendPct: number
  custoAtribuido: number
  custoPorKg: number | null
  lucro: number
}

export interface ContextoRanking {
  rendimentos: RendimentoFaixa[]
  nomeFornecedor: (id: string | null) => string
  nomeLote: (id: string | null) => string
}

export async function carregarLinhasRankingAtivos(userId: string, ctx: ContextoRanking): Promise<LinhaAtivo[]> {
  const { rendimentos, nomeFornecedor } = ctx
  const { data: animaisData } = await supabase
    .from('animais').select('id, codigo, brinco, peso_entrada, valor_compra, lote_atual_id, data_entrada, ciclo_atual, sexo')
    .eq('user_id', userId).eq('status', 'ativo')

  const lista = (animaisData ?? []) as Array<{ id: string; codigo: string; brinco: string; peso_entrada: number; valor_compra: number; lote_atual_id: string; data_entrada: string; ciclo_atual: number; sexo: Sexo }>
  if (lista.length === 0) return []

  const [custos, custosVarData, fornecedorPorAnimal] = await Promise.all([
    calcularCustosEmLote(userId, lista.map(a => a.id), hojeStrRanking()),
    buscarPorIds<{ animal_id: string; valor: number }>(lista.map(a => a.id), (idsChunk, from, to) =>
      supabase.from('custos_variaveis_animal').select('animal_id, valor').in('animal_id', idsChunk).range(from, to)),
    buscarFornecedorPorAnimal(lista.map(a => a.id)),
  ])
  const custosVarPorAnimal: Record<string, number> = {}
  for (const c of custosVarData) {
    custosVarPorAnimal[c.animal_id] = (custosVarPorAnimal[c.animal_id] ?? 0) + c.valor
  }

  const linhas: LinhaAtivo[] = lista.map(a => {
    const r = custos[a.id]
    const pesoAtual = r?.peso ?? a.peso_entrada
    const ganho = pesoAtual - a.peso_entrada
    const custoAcumulado = (r?.custoAcumulado ?? 0) + (custosVarPorAnimal[a.id] ?? 0)
    const rendPct = obterRendimento(pesoAtual, rendimentos)
    const custoPorKg = ganho > 0 ? custoAcumulado / ganho : null
    const fornecedorId = fornecedorPorAnimal[a.id] ?? null
    return {
      animal_id: a.id, codigo: a.codigo, brinco: a.brinco,
      loteId: a.lote_atual_id, loteNome: ctx.nomeLote(a.lote_atual_id),
      cicloAtual: a.ciclo_atual,
      sexo: a.sexo ?? null,
      fornecedorId, fornecedorNome: nomeFornecedor(fornecedorId),
      pesoEntrada: a.peso_entrada, pesoAtual, ganho,
      diasConfinamento: r?.diasConfinamento ?? 0,
      rendPct, custoAcumulado, custoPorKg,
      valorCompra: a.valor_compra, lucroProjetado: null,
    }
  })
  return linhas
}

export async function carregarLinhasRankingVendidos(userId: string, ctx: Omit<ContextoRanking, 'nomeLote'>): Promise<LinhaVendido[]> {
  const { rendimentos, nomeFornecedor } = ctx
  const { data: movsData } = await supabase
    .from('movimentacoes_animais')
    .select('animal_id, data, peso, custo_atribuido, lucro, lote_origem_id, animais(codigo, brinco, peso_entrada, sexo)')
    .eq('user_id', userId).not('lucro', 'is', null)
    .in('tipo', ['saida_venda', 'saida_abate', 'saida_transferencia', 'saida_morte'])

  const movs = (movsData ?? []) as any[]
  const loteIds = Array.from(new Set(movs.map(m => m.lote_origem_id).filter(Boolean)))
  const [{ data: lotesData }, fornecedorPorAnimal] = await Promise.all([
    loteIds.length > 0
      ? supabase.from('lotes').select('id, nome_lote').in('id', loteIds)
      : Promise.resolve({ data: [] }),
    buscarFornecedorPorAnimal(movs.map(m => m.animal_id)),
  ])
  const nomePorLote: Record<string, string> = {}
  for (const l of (lotesData ?? []) as Array<{ id: string; nome_lote: string }>) nomePorLote[l.id] = l.nome_lote

  const linhas: LinhaVendido[] = movs
    .filter(m => m.animais && m.peso != null)
    .map(m => {
      const pesoEntrada = m.animais.peso_entrada as number
      const ganho = m.peso - pesoEntrada
      const rendPct = obterRendimento(m.peso, rendimentos)
      const custoPorKg = ganho > 0 && m.custo_atribuido != null ? m.custo_atribuido / ganho : null
      const fornecedorId = fornecedorPorAnimal[m.animal_id] ?? null
      return {
        animal_id: m.animal_id, codigo: m.animais.codigo, brinco: m.animais.brinco,
        loteId: m.lote_origem_id ?? null,
        loteNome: m.lote_origem_id ? (nomePorLote[m.lote_origem_id] ?? '—') : '—',
        sexo: (m.animais.sexo ?? null) as Sexo,
        fornecedorId, fornecedorNome: nomeFornecedor(fornecedorId),
        data: m.data, pesoEntrada, pesoVenda: m.peso, ganho, rendPct,
        custoAtribuido: m.custo_atribuido ?? 0, custoPorKg, lucro: m.lucro ?? 0,
      }
    })
  return linhas
}

// Lucro projetado dos ativos a partir do preço de venda informado (R$/kg vivo),
// com bônus por faixa e comissão/encargos em % da receita bruta.
export function aplicarLucroProjetado(
  ativos: LinhaAtivo[], preco: number, pctComissao: number, pctEncargo: number, bonus: BonusFaixa[],
): LinhaAtivo[] {
  if (!preco || preco <= 0) return ativos
  const p = preco
  const pc = pctComissao || 0
  const pe = pctEncargo || 0
  return ativos.map(a => {
    const pesoCarcaca = a.pesoAtual * (a.rendPct / 100)
    const valorBonus = pesoCarcaca * obterBonus(a.pesoAtual, bonus)
    const receitaBruta = a.pesoAtual * p + valorBonus
    const receitaLiquida = receitaBruta * (1 - pc / 100 - pe / 100)
    const custoTotal = a.valorCompra + a.custoAcumulado
    return { ...a, lucroProjetado: receitaLiquida - custoTotal }
  })
}

export function ordenarRankingAtivos(lista: LinhaAtivo[], criterio: CriterioRanking, ordemDesc: boolean): LinhaAtivo[] {
  const arr = [...lista]
  const key = (a: LinhaAtivo) => criterio === 'rendimento' ? a.rendPct : criterio === 'peso' ? a.pesoAtual : criterio === 'ganho' ? a.ganho : criterio === 'custo_kg' ? (a.custoPorKg ?? -Infinity) : (a.lucroProjetado ?? -Infinity)
  arr.sort((a, b) => (key(b) - key(a)) * (ordemDesc ? 1 : -1))
  return arr
}

export function ordenarRankingVendidos(lista: LinhaVendido[], criterio: CriterioRanking, ordemDesc: boolean): LinhaVendido[] {
  const arr = [...lista]
  const key = (v: LinhaVendido) => criterio === 'rendimento' ? v.rendPct : criterio === 'peso' ? v.pesoVenda : criterio === 'ganho' ? v.ganho : criterio === 'custo_kg' ? (v.custoPorKg ?? -Infinity) : v.lucro
  arr.sort((a, b) => (key(b) - key(a)) * (ordemDesc ? 1 : -1))
  return arr
}

// ─── Comparativo ───────────────────────────────────────────────────────────────
// Agregação por lote ou fornecedor (ativos com projeção, vendidos realizados e
// recorte por ciclo). Usado pela página Comparativo e pelo servidor MCP.
const hojeStrComparativo = () => new Date().toISOString().split('T')[0]
// Chave de agrupamento sentinela para animais sem fornecedor (parceiro_id)
// vinculado à compra — nunca colide com um UUID real de parceiro.
export const SEM_FORNECEDOR = '__sem_fornecedor__'

// ─── Linha: lotes (ou fornecedores, conforme agrupamento) com animais ainda
// ativos (peso/GMD/custo atuais, lucro é projeção) ───────────────────────
export interface LinhaComparativoAtivo {
  grupoId: string
  grupoNome: string
  status: string
  qtd: number
  pesoMedio: number
  gmdMedio: number
  conversao: number | null
  custoPorKg: number | null
  valorCompraTotal: number
  custoAcumuladoTotal: number
  lucroProjetado: number | null
  margemProjetada: number | null
}

// ─── Linha: lotes ou fornecedores com vendas já registradas (dados realizados,
// não projetados) ─────────────────────────────────────────────────────────
export interface LinhaComparativoVendido {
  grupoId: string
  grupoNome: string
  qtd: number
  pesoMedioVenda: number
  gmdMedio: number
  conversao: number | null
  custoPorKg: number | null
  lucroTotal: number
  margemPct: number | null
  lucroPorAnimal: number
}

// ─── Linha: custo médio por ciclo, agregando os ciclos selecionados pelo
// produtor (ex: só o ciclo 2, ou ciclo 1+2 juntos) — só para lotes com
// animais ativos, já que a quebra por etapa (porEtapa) só existe no
// cálculo em tempo real do motor, não em vendas já liquidadas. ───
export interface LinhaComparativoCiclo {
  loteId: string
  loteNome: string
  qtd: number
  diasMedio: number
  ganhoMedio: number
  gmdMedio: number
  conversao: number | null
  custoAlimMedio: number
  custoOpMedio: number
  custoPorKg: number | null
  // Somas brutas de concentrado — só pra linha de média ponderada (conversão
  // geral precisa das somas, não da média das conversões de cada lote).
  consumoConcSoma: number
  ganhoConcentradoSoma: number
  // Soma do ganho usado no GMD (esperado na etapa vigente sem GMD real
  // válido — ver EtapaResultado.gmdUsaEsperado) — só pra linha de média.
  ganhoGmdSoma: number
}

// ─── Dados brutos de cada venda já registrada (uma linha por animal vendido,
// sem agregar) — a agregação por lote ou por fornecedor acontece no useMemo
// agregarComparativoVendidos, mesma lógica usada para os ativos. ───────────
export interface VendidoComparativoRaw {
  animal_id: string
  loteOrigemId: string
  fornecedorId: string | null
  data: string
  pesoEntrada: number
  dataEntrada: string
  peso: number
  consumoConcKg: number
  ganhoConcentradoKg: number
  custoAtribuido: number
  lucro: number
  valor: number
}

export interface DadosAtivosComparativo {
  animais: Array<{ id: string; peso_entrada: number; valor_compra: number; lote_atual_id: string }>
  resultados: Record<string, ResultadoAnimalNaData>
  custosVar: Record<string, number>
  fornecedorPorAnimal: Record<string, string | null>
}

export interface OpcoesComparativo {
  agruparPor: 'lote' | 'fornecedor'
  passaFiltroFornecedor: (fornecedorId: string | null) => boolean
  nomePorLote: Record<string, { nome: string; status: string }>
  nomeFornecedor: (id: string | null) => string
}

export async function carregarDadosAtivosComparativo(userId: string): Promise<DadosAtivosComparativo> {
  const { data: animaisData } = await supabase
    .from('animais').select('id, peso_entrada, valor_compra, lote_atual_id')
    .eq('user_id', userId).eq('status', 'ativo')

  const lista = (animaisData ?? []) as Array<{ id: string; peso_entrada: number; valor_compra: number; lote_atual_id: string }>
  if (lista.length === 0) return { animais: [], resultados: {}, custosVar: {}, fornecedorPorAnimal: {} }

  const [resultados, custosVarData, fornecedorPorAnimal] = await Promise.all([
    calcularCustosEmLote(userId, lista.map(a => a.id), hojeStrComparativo()),
    buscarPorIds<{ animal_id: string; valor: number }>(lista.map(a => a.id), (idsChunk, from, to) =>
      supabase.from('custos_variaveis_animal').select('animal_id, valor').in('animal_id', idsChunk).range(from, to)),
    buscarFornecedorPorAnimal(lista.map(a => a.id)),
  ])
  const custosVarPorAnimal: Record<string, number> = {}
  for (const c of custosVarData) {
    custosVarPorAnimal[c.animal_id] = (custosVarPorAnimal[c.animal_id] ?? 0) + c.valor
  }
  return { animais: lista, resultados, custosVar: custosVarPorAnimal, fornecedorPorAnimal }
}

// Tabela de sempre: todo o processo. Lucro e margem só com preço esperado.
export function agregarComparativoAtivos(
  dados: DadosAtivosComparativo,
  opcoes: OpcoesComparativo & { preco: number; pctComissao: number; pctEncargo: number; rendimentos: RendimentoFaixa[]; bonus: BonusFaixa[] },
): LinhaComparativoAtivo[] {
  const { agruparPor, passaFiltroFornecedor, nomePorLote, nomeFornecedor, rendimentos, bonus } = opcoes
  const animaisAtivosRaw = dados.animais
  const resultadosAtivos = dados.resultados
  const custosVarAtivos = dados.custosVar
  const fornecedorPorAnimalAtivos = dados.fornecedorPorAnimal
  const p = opcoes.preco || 0
  const pc = opcoes.pctComissao || 0
  const pe = opcoes.pctEncargo || 0

  const grupos: Record<string, {
    qtd: number; pesoSoma: number; gmdSoma: number; ganhoSoma: number
    consumoConcSoma: number; ganhoConcentradoSoma: number
    custoAlimSoma: number; custoOpSoma: number; custoVarSoma: number
    valorCompraSoma: number; receitaLiquidaSoma: number; custoTotalSoma: number
  }> = {}

  for (const a of animaisAtivosRaw) {
    const r = resultadosAtivos[a.id]
    if (!r) continue
    const fornecedorId = fornecedorPorAnimalAtivos[a.id] ?? null
    if (!passaFiltroFornecedor(fornecedorId)) continue
    const chave = agruparPor === 'lote' ? a.lote_atual_id : (fornecedorId ?? SEM_FORNECEDOR)
    const g = grupos[chave] ??= {
      qtd: 0, pesoSoma: 0, gmdSoma: 0, ganhoSoma: 0,
      consumoConcSoma: 0, ganhoConcentradoSoma: 0,
      custoAlimSoma: 0, custoOpSoma: 0, custoVarSoma: 0,
      valorCompraSoma: 0, receitaLiquidaSoma: 0, custoTotalSoma: 0,
    }
    const custoVar = custosVarAtivos[a.id] ?? 0
    const custoTotalAnimal = r.custoAcumulado + custoVar + a.valor_compra
    const ganho = r.peso - a.peso_entrada

    g.qtd += 1
    g.pesoSoma += r.peso
    g.gmdSoma += r.gmdMedio
    g.ganhoSoma += ganho
    g.consumoConcSoma += r.consumoConcentradoKg
    g.ganhoConcentradoSoma += r.ganhoPesoConcentrado
    g.custoAlimSoma += r.custoAlimentacao
    g.custoOpSoma += r.custoOperacional
    g.custoVarSoma += custoVar
    g.valorCompraSoma += a.valor_compra
    g.custoTotalSoma += custoTotalAnimal

    if (p > 0) {
      const rendPct = obterRendimento(r.peso, rendimentos)
      const pesoCarcaca = r.peso * (rendPct / 100)
      const valorBonus = pesoCarcaca * obterBonus(r.peso, bonus)
      const receitaBruta = r.peso * p + valorBonus
      g.receitaLiquidaSoma += receitaBruta * (1 - pc / 100 - pe / 100)
    }
  }

  return Object.entries(grupos).map(([grupoId, g]) => {
    const lucroProjetado = p > 0 ? g.receitaLiquidaSoma - g.custoTotalSoma : null
    const grupoNome = agruparPor === 'lote'
      ? (nomePorLote[grupoId]?.nome ?? '—')
      : (grupoId === SEM_FORNECEDOR ? 'Não informado' : nomeFornecedor(grupoId))
    const status = agruparPor === 'lote' ? (nomePorLote[grupoId]?.status ?? '—') : '—'
    return {
      grupoId, grupoNome, status,
      qtd: g.qtd,
      pesoMedio: g.qtd > 0 ? g.pesoSoma / g.qtd : 0,
      gmdMedio: g.qtd > 0 ? g.gmdSoma / g.qtd : 0,
      // Conversão = kg concentrado consumido / kg ganho ATRIBUÍDO ao
      // concentrado (não o ganho total do ciclo) — decisão tomada com o
      // produtor. consumoConcSoma > 0 exige que o lote de fato consuma
      // concentrado (senão "—", nunca 0,00, para pastagem pura).
      conversao: (g.consumoConcSoma > 0 && g.ganhoConcentradoSoma > 0) ? g.consumoConcSoma / g.ganhoConcentradoSoma : null,
      custoPorKg: g.ganhoSoma > 0 ? (g.custoAlimSoma + g.custoOpSoma) / g.ganhoSoma : null,
      valorCompraTotal: g.valorCompraSoma,
      custoAcumuladoTotal: g.custoAlimSoma + g.custoOpSoma + g.custoVarSoma,
      lucroProjetado,
      margemProjetada: p > 0 && g.receitaLiquidaSoma > 0 ? (lucroProjetado! / g.receitaLiquidaSoma) * 100 : null,
    }
  })
}

// ─── Tabela por ciclo: só aparece quando o produtor marca ao menos um
// número de ciclo. Agrega, por lote, apenas os dias/ganho/custo que
// aconteceram DENTRO dos ciclos marcados (via porEtapa, já calculado pelo
// motor) — não é projeção nem venda, é o que já foi vivido naquele(s)
// ciclo(s) até hoje. Custos variáveis e valor de compra ficam de fora
// (não são amarrados a um ciclo específico). ───
export function agregarComparativoPorCiclo(
  dados: DadosAtivosComparativo, ciclosSelecionados: Set<number>,
  opcoes: Pick<OpcoesComparativo, 'passaFiltroFornecedor' | 'nomePorLote'>,
): LinhaComparativoCiclo[] {
  const { passaFiltroFornecedor, nomePorLote } = opcoes
  const animaisAtivosRaw = dados.animais
  const resultadosAtivos = dados.resultados
  const fornecedorPorAnimalAtivos = dados.fornecedorPorAnimal
  if (ciclosSelecionados.size === 0) return []

  const grupos: Record<string, {
    qtd: number; diasSoma: number; ganhoSoma: number; ganhoGmdSoma: number
    consumoConcSoma: number; ganhoConcentradoSoma: number
    custoAlimSoma: number; custoOpSoma: number
  }> = {}

  for (const a of animaisAtivosRaw) {
    if (!passaFiltroFornecedor(fornecedorPorAnimalAtivos[a.id] ?? null)) continue
    const r = resultadosAtivos[a.id]
    if (!r) continue
    const etapas = Object.values(r.porEtapa).filter(e => ciclosSelecionados.has(e.numero))
    if (etapas.length === 0) continue

    const g = grupos[a.lote_atual_id] ??= { qtd: 0, diasSoma: 0, ganhoSoma: 0, ganhoGmdSoma: 0, consumoConcSoma: 0, ganhoConcentradoSoma: 0, custoAlimSoma: 0, custoOpSoma: 0 }
    g.qtd += 1
    for (const e of etapas) {
      g.diasSoma += e.dias
      g.ganhoSoma += e.ganhoPeso
      g.ganhoGmdSoma += e.gmdUsaEsperado ? e.ganhoEsperado : e.ganhoPeso
      g.consumoConcSoma += e.consumoConcentradoKg
      g.ganhoConcentradoSoma += e.ganhoPesoConcentrado
      g.custoAlimSoma += e.custoAlimentacao
      g.custoOpSoma += e.custoOperacional
    }
  }

  return Object.entries(grupos).map(([loteId, g]) => ({
    loteId, loteNome: nomePorLote[loteId]?.nome ?? '—',
    qtd: g.qtd,
    diasMedio: g.qtd > 0 ? g.diasSoma / g.qtd : 0,
    ganhoMedio: g.qtd > 0 ? g.ganhoSoma / g.qtd : 0,
    gmdMedio: g.diasSoma > 0 ? g.ganhoGmdSoma / g.diasSoma : 0,
    // Conversão = kg concentrado / kg ganho ATRIBUÍDO ao concentrado (ver
    // mesma decisão na tabela de lotes ativos, acima).
    conversao: (g.consumoConcSoma > 0 && g.ganhoConcentradoSoma > 0) ? g.consumoConcSoma / g.ganhoConcentradoSoma : null,
    custoAlimMedio: g.qtd > 0 ? g.custoAlimSoma / g.qtd : 0,
    custoOpMedio: g.qtd > 0 ? g.custoOpSoma / g.qtd : 0,
    custoPorKg: g.ganhoSoma > 0 ? (g.custoAlimSoma + g.custoOpSoma) / g.ganhoSoma : null,
    consumoConcSoma: g.consumoConcSoma,
    ganhoConcentradoSoma: g.ganhoConcentradoSoma,
    ganhoGmdSoma: g.ganhoGmdSoma,
  }))
}

// Linha de média da tabela por ciclo — ponderada por animal: reconstrói as
// somas de cada lote (média x qtd) e aplica as mesmas fórmulas das linhas,
// como se todos os animais fossem um grupo só. Útil quando o mesmo grupo de
// animais foi bifurcado em vários lotes ao longo do caminho.
export function totalComparativoPorCiclo(linhasPorCiclo: LinhaComparativoCiclo[]) {
  if (linhasPorCiclo.length < 2) return null
  let qtd = 0, diasSoma = 0, ganhoSoma = 0, ganhoGmdSoma = 0, custoAlimSoma = 0, custoOpSoma = 0, consumoConcSoma = 0, ganhoConcentradoSoma = 0
  for (const l of linhasPorCiclo) {
    ganhoGmdSoma += l.ganhoGmdSoma
    qtd += l.qtd
    diasSoma += l.diasMedio * l.qtd
    ganhoSoma += l.ganhoMedio * l.qtd
    custoAlimSoma += l.custoAlimMedio * l.qtd
    custoOpSoma += l.custoOpMedio * l.qtd
    consumoConcSoma += l.consumoConcSoma
    ganhoConcentradoSoma += l.ganhoConcentradoSoma
  }
  return {
    qtd,
    diasMedio: qtd > 0 ? diasSoma / qtd : 0,
    ganhoMedio: qtd > 0 ? ganhoSoma / qtd : 0,
    gmdMedio: diasSoma > 0 ? ganhoGmdSoma / diasSoma : 0,
    conversao: (consumoConcSoma > 0 && ganhoConcentradoSoma > 0) ? consumoConcSoma / ganhoConcentradoSoma : null,
    custoAlimMedio: qtd > 0 ? custoAlimSoma / qtd : 0,
    custoOpMedio: qtd > 0 ? custoOpSoma / qtd : 0,
    custoPorKg: ganhoSoma > 0 ? (custoAlimSoma + custoOpSoma) / ganhoSoma : null,
  }
}

// ─── Lotes com vendas registradas: dados realizados (peso na venda, custo e
// lucro já liquidados na hora da venda), não é projeção. Um lote pode
// aparecer aqui mesmo ainda ativo, se já teve alguma venda parcial. ───
export async function carregarVendidosComparativo(userId: string): Promise<VendidoComparativoRaw[]> {
  const { data: movsData } = await supabase
    .from('movimentacoes_animais')
    .select('animal_id, data, peso, valor, custo_atribuido, lucro, lote_origem_id, animais(peso_entrada, data_entrada)')
    .eq('user_id', userId).not('lucro', 'is', null)
    .in('tipo', ['saida_venda', 'saida_abate', 'saida_transferencia', 'saida_morte'])

  const movs = (movsData ?? []) as any[]

  // ─── Consumo de concentrado até a data de cada venda ───────────────────
  // Esta tabela não usa o motor de custo (só dados já liquidados salvos no
  // banco), mas a Conversão precisa do consumo de concentrado, que só o
  // motor calcula. Roda o motor uma vez por data de venda distinta
  // (agrupando os animais vendidos naquela data), reconstruindo o consumo
  // de cada animal até o dia da própria venda dele.
  const datasUnicas = Array.from(new Set(movs.map(m => m.data).filter(Boolean)))
  const consumoConcPorAnimalData: Record<string, number> = {}
  const ganhoConcentradoPorAnimalData: Record<string, number> = {}
  const consumoPromise = datasUnicas.length > 0 ? Promise.all(datasUnicas.map(async (data) => {
    const idsNaData = Array.from(new Set(
      movs.filter(m => m.data === data && m.animal_id).map(m => m.animal_id as string)
    ))
    if (idsNaData.length === 0) return
    const resultados = await calcularCustosEmLote(userId, idsNaData, data)
    for (const id of idsNaData) {
      const r = resultados[id]
      if (r) {
        consumoConcPorAnimalData[`${id}|${data}`] = r.consumoConcentradoKg
        ganhoConcentradoPorAnimalData[`${id}|${data}`] = r.ganhoPesoConcentrado
      }
    }
  })) : Promise.resolve([])

  const [, fornecedorPorAnimal] = await Promise.all([
    consumoPromise,
    buscarFornecedorPorAnimal(Array.from(new Set(movs.map(m => m.animal_id).filter(Boolean)))),
  ])

  const raw: VendidoComparativoRaw[] = movs
    .filter(m => m.lote_origem_id && m.animais && m.peso != null)
    .map(m => ({
      animal_id: m.animal_id,
      loteOrigemId: m.lote_origem_id as string,
      fornecedorId: fornecedorPorAnimal[m.animal_id] ?? null,
      data: m.data, pesoEntrada: m.animais.peso_entrada as number, dataEntrada: m.animais.data_entrada as string,
      peso: m.peso,
      consumoConcKg: consumoConcPorAnimalData[`${m.animal_id}|${m.data}`] ?? 0,
      ganhoConcentradoKg: ganhoConcentradoPorAnimalData[`${m.animal_id}|${m.data}`] ?? 0,
      custoAtribuido: m.custo_atribuido ?? 0, lucro: m.lucro ?? 0, valor: m.valor ?? 0,
    }))
  return raw
}

export function agregarComparativoVendidos(vendidosRaw: VendidoComparativoRaw[], opcoes: OpcoesComparativo): LinhaComparativoVendido[] {
  const { agruparPor, passaFiltroFornecedor, nomePorLote, nomeFornecedor } = opcoes
  const grupos: Record<string, {
    qtd: number; pesoSoma: number; ganhoSoma: number; diasSoma: number
    consumoConcSoma: number; ganhoConcentradoSoma: number
    custoSoma: number; lucroSoma: number; receitaSoma: number
  }> = {}

  for (const v of vendidosRaw) {
    if (!passaFiltroFornecedor(v.fornecedorId)) continue
    const chave = agruparPor === 'lote' ? v.loteOrigemId : (v.fornecedorId ?? SEM_FORNECEDOR)
    const g = grupos[chave] ??= { qtd: 0, pesoSoma: 0, ganhoSoma: 0, diasSoma: 0, consumoConcSoma: 0, ganhoConcentradoSoma: 0, custoSoma: 0, lucroSoma: 0, receitaSoma: 0 }
    const ganho = v.peso - v.pesoEntrada
    const dias = Math.max(0, Math.floor((new Date(v.data).getTime() - new Date(v.dataEntrada).getTime()) / 86400000))

    g.qtd += 1
    g.pesoSoma += v.peso
    g.ganhoSoma += ganho
    g.diasSoma += dias
    g.consumoConcSoma += v.consumoConcKg
    g.ganhoConcentradoSoma += v.ganhoConcentradoKg
    g.custoSoma += v.custoAtribuido
    g.lucroSoma += v.lucro
    g.receitaSoma += v.valor
  }

  return Object.entries(grupos).map(([grupoId, g]) => ({
    grupoId,
    grupoNome: agruparPor === 'lote'
      ? (nomePorLote[grupoId]?.nome ?? '—')
      : (grupoId === SEM_FORNECEDOR ? 'Não informado' : nomeFornecedor(grupoId)),
    qtd: g.qtd,
    pesoMedioVenda: g.qtd > 0 ? g.pesoSoma / g.qtd : 0,
    gmdMedio: g.diasSoma > 0 ? g.ganhoSoma / g.diasSoma : 0,
    // Conversão = kg concentrado / kg ganho ATRIBUÍDO ao concentrado (ver
    // mesma decisão nas outras tabelas deste arquivo).
    conversao: (g.consumoConcSoma > 0 && g.ganhoConcentradoSoma > 0) ? g.consumoConcSoma / g.ganhoConcentradoSoma : null,
    custoPorKg: g.ganhoSoma > 0 ? g.custoSoma / g.ganhoSoma : null,
    lucroTotal: g.lucroSoma,
    margemPct: g.receitaSoma > 0 ? (g.lucroSoma / g.receitaSoma) * 100 : null,
    lucroPorAnimal: g.qtd > 0 ? g.lucroSoma / g.qtd : 0,
  }))
}

// ─── Linha de totais: soma para contagens e valores em R$ (animais, valor
// investido, lucro); média simples entre os lotes exibidos para taxas
// (peso médio, GMD, custo/kg, margem). Colunas sem dado em nenhum lote
// ficam em branco. ───
export function totalComparativoAtivos(ativos: LinhaComparativoAtivo[]) {
  if (ativos.length === 0) return null
  const n = ativos.length
  const custos = ativos.map(l => l.custoPorKg).filter((v): v is number => v != null)
  const conversoes = ativos.map(l => l.conversao).filter((v): v is number => v != null)
  const lucros = ativos.map(l => l.lucroProjetado).filter((v): v is number => v != null)
  const margens = ativos.map(l => l.margemProjetada).filter((v): v is number => v != null)
  return {
    qtd: ativos.reduce((s, l) => s + l.qtd, 0),
    pesoMedio: ativos.reduce((s, l) => s + l.pesoMedio, 0) / n,
    gmdMedio: ativos.reduce((s, l) => s + l.gmdMedio, 0) / n,
    conversao: conversoes.length > 0 ? conversoes.reduce((s, v) => s + v, 0) / conversoes.length : null,
    custoPorKg: custos.length > 0 ? custos.reduce((s, v) => s + v, 0) / custos.length : null,
    valorCompraTotal: ativos.reduce((s, l) => s + l.valorCompraTotal, 0),
    lucroProjetado: lucros.length > 0 ? lucros.reduce((s, v) => s + v, 0) : null,
    margemProjetada: margens.length > 0 ? margens.reduce((s, v) => s + v, 0) / margens.length : null,
  }
}

export function totalComparativoVendidos(vendidos: LinhaComparativoVendido[]) {
  if (vendidos.length === 0) return null
  const n = vendidos.length
  const custos = vendidos.map(l => l.custoPorKg).filter((v): v is number => v != null)
  const conversoes = vendidos.map(l => l.conversao).filter((v): v is number => v != null)
  const margens = vendidos.map(l => l.margemPct).filter((v): v is number => v != null)
  return {
    qtd: vendidos.reduce((s, l) => s + l.qtd, 0),
    pesoMedioVenda: vendidos.reduce((s, l) => s + l.pesoMedioVenda, 0) / n,
    gmdMedio: vendidos.reduce((s, l) => s + l.gmdMedio, 0) / n,
    conversao: conversoes.length > 0 ? conversoes.reduce((s, v) => s + v, 0) / conversoes.length : null,
    custoPorKg: custos.length > 0 ? custos.reduce((s, v) => s + v, 0) / custos.length : null,
    lucroTotal: vendidos.reduce((s, l) => s + l.lucroTotal, 0),
    margemPct: margens.length > 0 ? margens.reduce((s, v) => s + v, 0) / margens.length : null,
    lucroPorAnimal: vendidos.reduce((s, l) => s + l.lucroPorAnimal, 0) / n,
  }
}

// ─── Relatórios (resumo financeiro das saídas num período) ─────────────────────
export type PeriodoRelatorio = 'semanal'|'quinzenal'|'mensal'|'trimestral'|'semestral'|'anual'
export const diasPeriodoRelatorio: Record<PeriodoRelatorio, number> = {
  semanal: 7, quinzenal: 15, mensal: 30, trimestral: 90, semestral: 180, anual: 365
}

export interface ResumoRelatorio {
  receita_bruta: number
  total_comissoes: number; total_encargos: number; receita_liquida: number
  custo_compra: number; custo_alimentacao: number
  custos_variaveis: number; custos_fixos: number; custo_total: number
  lucro_total: number; qtd_saidas: number; qtd_animais: number
  lucro_por_animal: number; margem_pct: number
  custo_pastagem: number; custo_confinamento: number; custo_misto: number
  ganho_pastagem: number; ganho_confinamento: number; ganho_misto: number
}

// inicio e fim no formato aaaa-mm-dd. Lança erro quando alguma leitura falha.
export async function carregarResumoRelatorio(userId: string, inicio: string, fim: string): Promise<ResumoRelatorio> {
  const [{ data: saidas, error: e1 }, { count: qtdAnimaisCount, error: e2 }] = await Promise.all([
    supabase.from('saidas_grupo').select('*')
      .eq('user_id', userId).gte('data', inicio).lte('data', fim),
    supabase.from('movimentacoes_animais').select('id', { count: 'exact', head: true })
      .eq('user_id', userId).not('saida_grupo_id', 'is', null)
      .gte('data', inicio).lte('data', fim),
  ])
  if (e1) throw e1
  if (e2) throw e2

  const ss = saidas ?? []
  const receita_bruta     = ss.reduce((t, s) => t + (s.receita_bruta ?? 0), 0)
  const total_comissoes   = ss.reduce((t, s) => t + (s.total_comissoes ?? 0), 0)
  const total_encargos    = ss.reduce((t, s) => t + (s.total_encargos ?? 0), 0)
  const receita_liquida   = ss.reduce((t, s) => t + (s.receita_liquida ?? 0), 0)
  const custo_compra      = ss.reduce((t, s) => t + (s.custo_compra_total ?? 0), 0)
  const custo_alimentacao = ss.reduce((t, s) => t + (s.custo_alimentacao_total ?? 0), 0)
  const custos_variaveis  = ss.reduce((t, s) => t + (s.custos_variaveis_total ?? 0), 0)
  const custos_fixos      = ss.reduce((t, s) => t + (s.custos_fixos_rateados ?? 0), 0)
  const custo_total       = custo_compra + custo_alimentacao + custos_variaveis + custos_fixos
  const lucro_total       = ss.reduce((t, s) => t + (s.lucro_total ?? 0), 0)
  const qtd_animais       = qtdAnimaisCount ?? 0
  const lucro_por_animal  = qtd_animais > 0 ? lucro_total / qtd_animais : 0
  const margem_pct        = receita_liquida > 0 ? (lucro_total / receita_liquida) * 100 : 0

  const custo_pastagem      = ss.reduce((t, s) => t + (s.custo_alimentacao_pastagem_total ?? 0) + (s.custo_operacional_pastagem_total ?? 0), 0)
  const custo_confinamento  = ss.reduce((t, s) => t + (s.custo_alimentacao_confinamento_total ?? 0) + (s.custo_operacional_confinamento_total ?? 0), 0)
  const custo_misto         = ss.reduce((t, s) => t + (s.custo_alimentacao_misto_total ?? 0) + (s.custo_operacional_misto_total ?? 0), 0)
  const ganho_pastagem      = ss.reduce((t, s) => t + (s.ganho_peso_pastagem_total ?? 0), 0)
  const ganho_confinamento  = ss.reduce((t, s) => t + (s.ganho_peso_confinamento_total ?? 0), 0)
  const ganho_misto         = ss.reduce((t, s) => t + (s.ganho_peso_misto_total ?? 0), 0)

  return {
    receita_bruta, total_comissoes, total_encargos, receita_liquida,
    custo_compra, custo_alimentacao, custos_variaveis, custos_fixos, custo_total,
    lucro_total, qtd_saidas: ss.length, qtd_animais, lucro_por_animal, margem_pct,
    custo_pastagem, custo_confinamento, custo_misto, ganho_pastagem, ganho_confinamento, ganho_misto,
  }
}

// ─── Fazenda Hoje (foto do momento: animais ativos por lote, ciclo e dieta) ────
export interface AnimalHoje {
  id: string
  codigo: string
  brinco: string
  peso_entrada: number
  data_entrada: string | null
  lote_id: string | null
  ciclo_atual: number
  fornecedor: string
  sexo: 'M' | 'F' | null
}

export interface LinhaHoje extends AnimalHoje {
  loteNome: string
  cicloNumero: number | null
  cicloNome: string
  tipoCiclo: string | null
  dietaId: string | null
  dietaNome: string
  dataPrevistaFim: string | null
  emEspera: boolean
}

const addDias = (dataStr: string, dias: number): string => {
  const d = new Date(dataStr + 'T00:00:00')
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

const hojeISO = (): string => new Date().toISOString().slice(0, 10)

export async function carregarAnimaisHoje(userId: string): Promise<AnimalHoje[]> {
  const { data } = await supabase
    .from('animais')
    .select('id, codigo, brinco, peso_entrada, data_entrada, lote_atual_id, ciclo_atual, sexo, compras(origem_texto, parceiros(nome))')
    .eq('user_id', userId).eq('status', 'ativo')

  const lista: AnimalHoje[] = (data ?? []).map((a: any) => ({
    id: a.id,
    codigo: a.codigo,
    brinco: a.brinco,
    peso_entrada: a.peso_entrada,
    data_entrada: a.data_entrada,
    lote_id: a.lote_atual_id,
    ciclo_atual: a.ciclo_atual,
    fornecedor: a.compras?.parceiros?.nome ?? a.compras?.origem_texto ?? 'Não informado',
    sexo: a.sexo ?? null,
  }))
  return lista
}

// Ciclo "de agora" é o ciclo_atual do PRÓPRIO ANIMAL (não mais o do lote
// como um todo) — com avanço de ciclo parcial, animais do mesmo lote podem
// estar em ciclos diferentes ao mesmo tempo. A data prevista de fim é
// calculada (data_inicio + dias_planejados) pois o ciclo só ganha data_fim
// real quando é encerrado (avançarCiclo). Por isso essa data pode ficar no
// passado sem que nada mude automaticamente: é só uma projeção, o sistema
// nunca fecha o ciclo sozinho.
//
// "emEspera": true quando a data prevista já passou E o lote não tem, em
// ciclos_lote, nenhum ciclo com número maior que o ciclo deste animal (ou
// seja, não há próximo ciclo cadastrado pra assumir esse animal).
export function infoCicloHoje(
  ciclosPorLote: Record<string, CicloLote[]>, loteId: string | null, cicloNumero: number | null,
) {
  if (!loteId || cicloNumero == null) return null
  const ciclosDoLote = ciclosPorLote[loteId] ?? []
  const ciclo = ciclosDoLote.find(c => c.numero === cicloNumero)
  const dataPrevistaFim = ciclo?.data_inicio && ciclo?.dias_planejados
    ? addDias(ciclo.data_inicio, ciclo.dias_planejados)
    : null
  const temProximoCiclo = ciclosDoLote.some(c => c.numero > cicloNumero)
  const emEspera = !!dataPrevistaFim && dataPrevistaFim < hojeISO() && !temProximoCiclo
  return {
    numero: cicloNumero,
    nome: ciclo?.nome ?? `Ciclo ${cicloNumero}`,
    tipoCiclo: ciclo?.tipo_ciclo ?? null,
    dietaId: ciclo?.dieta_id ?? null,
    dataPrevistaFim,
    emEspera,
  }
}

export function montarLinhasHoje(
  animais: AnimalHoje[], lotes: Lote[], ciclosPorLote: Record<string, CicloLote[]>, dietaNomePorId: Record<string, string>,
): LinhaHoje[] {
  return animais.map(a => {
    const lote = lotes.find(l => l.id === a.lote_id)
    const ciclo = infoCicloHoje(ciclosPorLote, a.lote_id, a.ciclo_atual)
    return {
      ...a,
      loteNome: lote?.nome_lote ?? '— (sem lote)',
      cicloNumero: ciclo?.numero ?? null,
      cicloNome: ciclo?.nome ?? '—',
      tipoCiclo: ciclo?.tipoCiclo ?? null,
      dietaId: ciclo?.dietaId ?? null,
      dietaNome: ciclo?.dietaId ? (dietaNomePorId[ciclo.dietaId] ?? 'Dieta removida') : 'Sem dieta / Pastagem',
      dataPrevistaFim: ciclo?.dataPrevistaFim ?? null,
      emEspera: ciclo?.emEspera ?? false,
    }
  })
}

// Cards por ciclo: agrupados por lote + ciclo, pois a data prevista e o tipo
// de ciclo variam entre lotes mesmo quando o número do ciclo é o mesmo.
export function agruparHojePorCiclo(filtradas: LinhaHoje[]) {
  const mapa: Record<string, {
    loteId: string; loteNome: string; cicloNumero: number | null; cicloNome: string
    tipoCiclo: string | null; dataPrevistaFim: string | null; emEspera: boolean; qtd: number
    dataEntradaMin: string | null; dataEntradaMax: string | null
  }> = {}
  for (const l of filtradas) {
    const chave = `${l.lote_id ?? 'sem-lote'}__${l.cicloNumero}`
    if (!mapa[chave]) {
      mapa[chave] = {
        loteId: l.lote_id ?? '', loteNome: l.loteNome, cicloNumero: l.cicloNumero, cicloNome: l.cicloNome,
        tipoCiclo: l.tipoCiclo, dataPrevistaFim: l.dataPrevistaFim, emEspera: l.emEspera, qtd: 0,
        dataEntradaMin: null, dataEntradaMax: null,
      }
    }
    mapa[chave].qtd++
    if (l.data_entrada) {
      const g = mapa[chave]
      if (!g.dataEntradaMin || l.data_entrada < g.dataEntradaMin) g.dataEntradaMin = l.data_entrada
      if (!g.dataEntradaMax || l.data_entrada > g.dataEntradaMax) g.dataEntradaMax = l.data_entrada
    }
  }
  return Object.values(mapa).sort((a, b) =>
    a.loteNome.localeCompare(b.loteNome) || (a.cicloNumero ?? 0) - (b.cicloNumero ?? 0)
  )
}

// Cards por dieta: só dietas que têm algum animal ativo consumindo agora.
export function agruparHojePorDieta(filtradas: LinhaHoje[]) {
  const mapa: Record<string, { dietaId: string | null; dietaNome: string; qtd: number }> = {}
  for (const l of filtradas) {
    const chave = l.dietaId ?? 'sem-dieta'
    if (!mapa[chave]) mapa[chave] = { dietaId: l.dietaId, dietaNome: l.dietaNome, qtd: 0 }
    mapa[chave].qtd++
  }
  return Object.values(mapa).sort((a, b) => b.qtd - a.qtd)
}

// ─── Custos variáveis somados por animal ──────────────────────────────────────
// Custo acumulado exibido = alimentação + operacional (motor) + custos
// variáveis do animal — mesma composição usada na venda, no Ranking e no
// detalhe do lote.
export async function somarCustosVariaveisPorAnimal(animalIds: string[]): Promise<Record<string, number>> {
  const dados = await buscarPorIds<{ animal_id: string; valor: number }>(animalIds, (idsChunk, from, to) =>
    supabase.from('custos_variaveis_animal').select('animal_id, valor').in('animal_id', idsChunk).range(from, to))
  const porAnimal: Record<string, number> = {}
  for (const c of dados) porAnimal[c.animal_id] = (porAnimal[c.animal_id] ?? 0) + Number(c.valor)
  return porAnimal
}

// ─── Estado de hoje de um lote (ponto de partida do Simulador) ────────────────
// Animais ativos, peso médio projetado na data pelo motor de custo e
// investimento médio já feito por cabeça (compra + custo acumulado de
// alimentação/operacional + custos variáveis).
export async function estadoAtualLote(userId: string, loteId: string, dataReferencia: string): Promise<
  { erro: string } | { erro: null; qtdAnimais: number; pesoMedio: number; compraMediaPorCabeca: number; custoAnteriorPorCabeca: number }
> {
  const animais = await buscarTudoPaginado<{ id: string; valor_compra: number | null }>((from, to) =>
    supabase.from('animais').select('id, valor_compra').eq('lote_atual_id', loteId).eq('status', 'ativo').range(from, to))
  if (animais.length === 0) return { erro: 'Esse lote não tem animais ativos' }
  const ids = animais.map(a => a.id)
  const [resultados, custoVarPorAnimal] = await Promise.all([
    calcularCustosEmLote(userId, ids, dataReferencia),
    somarCustosVariaveisPorAnimal(ids),
  ])
  let n = 0, pesoSoma = 0, compraSoma = 0, custoSoma = 0
  for (const a of animais) {
    const r = resultados[a.id]
    if (!r) continue
    n++
    pesoSoma += r.peso
    compraSoma += Number(a.valor_compra ?? 0)
    custoSoma += r.custoAcumulado + (custoVarPorAnimal[a.id] ?? 0)
  }
  if (n === 0) return { erro: 'Não foi possível calcular o estado dos animais desse lote' }
  return { erro: null, qtdAnimais: n, pesoMedio: pesoSoma / n, compraMediaPorCabeca: compraSoma / n, custoAnteriorPorCabeca: custoSoma / n }
}
