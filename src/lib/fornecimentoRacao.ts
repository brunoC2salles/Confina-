// ─── Motor de cálculo: Fornecimento de ração ────────────────────────────────
//
// O fornecimento registra a ração efetivamente dada a um ou mais lotes numa
// data: ração comprada pronta (baixa do estoque do grupo de consumo) ou
// feita na fazenda (baixa de cada ingrediente). Regras combinadas com o
// produtor:
//
//  - a divisão entre os lotes é automática, proporcional ao consumo previsto
//    de cada lote na data (peso dos animais x consumo em MS da dieta
//    planejada), e fica gravada no registro (fracao por lote);
//  - cada fornecimento vale, para cada lote, do dia do fornecimento até o dia
//    anterior ao próximo fornecimento que incluir o lote; o último vale até
//    hoje. A partir do primeiro fornecimento de um lote, o realizado
//    substitui o teórico (custo, consumo em MS e relação concentrado:volumoso)
//    em todos os dias seguintes;
//  - dentro do período coberto, a parte do lote é distribuída entre os dias
//    proporcionalmente ao consumo previsto do lote em cada dia (dia sem
//    animal no lote não recebe nada), e depois entre os animais pelo peso
//    (ver CustoRacaoRealDiaInfo em custoAnimal.ts);
//  - o estoque baixa no dia do fornecimento, pelo que foi efetivamente usado.
//
// Todo o custo é calculado sob demanda a partir do histórico (preço do
// estoque vigente na data), como no resto do motor.

import {
  toDay, projetarPesoPorDia, encontrarLoteAtivo, dietaVigenteDoAnimalNoDia,
  type PeriodoLote, type CicloInfo, type PesagemPonto, type CicloAnimalEvento, type TrocaDietaCiclo,
} from './custoAnimal'
import {
  periodoIngredienteNoDia, precosEstoqueNoDia, calcularCustoKgMsComPrecos, fracaoMsComponente,
  type DietaComposicaoInfo, type PeriodoCustoIngredienteInfo,
} from './custoIngrediente'

export type ModoFornecimento = 'mistura_pronta' | 'feita_na_fazenda'

export interface ItemFornecimentoInfo {
  chave: string
  tipo: 'concentrado' | 'volumoso'
  kg: number
  pct_ms: number
  preco_kg_referencia: number
}

export interface FornecimentoInfo {
  id: string
  data: string
  dieta_id: string
  modo: ModoFornecimento
  grupo_id: string | null
  kg_total: number
  pct_ms: number | null
  itens: ItemFornecimentoInfo[]
  lotes: Array<{ lote_id: string; fracao: number }>
}

// ─── Totais físicos do fornecimento ────────────────────────────────────────

export interface TotaisFornecimento {
  kgNatural: number
  kgMs: number
  kgMsConcentrado: number
}

export function totaisFornecimento(f: FornecimentoInfo, dieta: DietaComposicaoInfo | undefined): TotaisFornecimento {
  if (f.modo === 'mistura_pronta') {
    const kgMs = f.kg_total * ((f.pct_ms ?? 100) / 100)
    const pctConc = dieta?.pct_concentrado ?? 0
    return { kgNatural: f.kg_total, kgMs, kgMsConcentrado: kgMs * (pctConc / 100) }
  }
  let kgNatural = 0
  let kgMs = 0
  let kgMsConcentrado = 0
  for (const i of f.itens) {
    const ms = i.kg * (i.pct_ms / 100)
    kgNatural += i.kg
    kgMs += ms
    if (i.tipo === 'concentrado') kgMsConcentrado += ms
  }
  return { kgNatural, kgMs, kgMsConcentrado }
}

// Valor em R$ do fornecimento inteiro, com o preço vigente na data dele.
//  - feita na fazenda: cada ingrediente ao custo médio do estoque na data;
//    sem estoque registrado, ao preço de referência gravado no item.
//  - mistura pronta: kg de MS x custo por kg de MS do grupo na data
//    (custoGrupoKgMs); sem período de custo do grupo, cai no custo por kg de
//    MS da dieta calculado pelos componentes (com o preço do estoque).
export function valorFornecimento(
  f: FornecimentoInfo,
  dieta: DietaComposicaoInfo | undefined,
  periodosIngrediente: Record<string, PeriodoCustoIngredienteInfo[]>,
  custoGrupoKgMs: number | null,
): number {
  const dia = toDay(f.data)
  if (f.modo === 'feita_na_fazenda') {
    let valor = 0
    for (const i of f.itens) {
      const periodo = periodoIngredienteNoDia(dia, periodosIngrediente[i.chave] ?? [])
      valor += i.kg * (periodo ? periodo.custo_medio_kg : i.preco_kg_referencia)
    }
    return valor
  }
  const { kgMs } = totaisFornecimento(f, dieta)
  if (custoGrupoKgMs != null) return kgMs * custoGrupoKgMs
  const custoDieta = dieta ? calcularCustoKgMsComPrecos(dieta, precosEstoqueNoDia(dia, periodosIngrediente)) : null
  return kgMs * (custoDieta ?? 0)
}

// ─── Itens pela composição da dieta ────────────────────────────────────────
// Abre um total em kg de matéria natural nos ingredientes da dieta, na
// proporção de matéria natural de cada componente (a participação da dieta é
// em MS; convertida pela % MS de cada um). Null quando algum componente não
// tem % MS ou participação.
export function dividirTotalPelaComposicao(
  dieta: DietaComposicaoInfo, kgTotal: number,
): Array<{ chave: string; tipo: 'concentrado' | 'volumoso'; kg: number; pct_ms: number; preco_kg: number | null }> | null {
  const partes: Array<{ chave: string; tipo: 'concentrado' | 'volumoso'; natural: number; pct_ms: number; preco_kg: number | null }> = []
  let soma = 0
  for (const c of dieta.componentes) {
    if (!c.chave || c.pct_ms == null || c.pct_ms <= 0 || c.pct_participacao == null) return null
    const natural = fracaoMsComponente(dieta, c) / (c.pct_ms / 100)
    if (natural <= 0) continue
    partes.push({ chave: c.chave, tipo: c.tipo, natural, pct_ms: c.pct_ms, preco_kg: c.preco_kg })
    soma += natural
  }
  if (partes.length === 0 || soma <= 0) return null
  return partes.map(p => ({ chave: p.chave, tipo: p.tipo, kg: kgTotal * (p.natural / soma), pct_ms: p.pct_ms, preco_kg: p.preco_kg }))
}

// ─── Consumo previsto por lote, dia a dia ──────────────────────────────────
// Peso dos animais que estavam no lote em cada dia x consumo em MS da dieta
// planejada de cada animal (ciclo/troca de dieta). Também acumula peso total,
// cabeças, concentrado previsto e ganho de peso — usados na divisão do
// fornecimento entre lotes/dias e no planejado x realizado.

export interface AnimalLoteInput {
  animal: { peso_entrada: number; data_entrada: string }
  pesagens: PesagemPonto[]
  periodos: PeriodoLote[]
  eventosCiclo: CicloAnimalEvento[]
}

export interface PrevistoDia {
  pesoTotalKg: number
  qtd: number
  consumoMsKg: number
  concentradoMsKg: number
  ganhoKg: number
  // Custo previsto (dieta planejada x custo por kg de MS da dieta no dia),
  // preenchido só quando custoKgMsDietaNoDia é informado.
  custoPrevisto: number
}

export function calcularPrevistoPorLotePorDia(
  animais: AnimalLoteInput[],
  loteIds: Set<string>,
  ciclos: CicloInfo[],
  trocasDieta: TrocaDietaCiclo[],
  dietas: Record<string, DietaComposicaoInfo>,
  diaInicial: number,
  diaFinalExclusivo: number,
  custoKgMsDietaNoDia?: (dietaId: string, dia: number) => number | null,
): Record<string, Record<number, PrevistoDia>> {
  const resultado: Record<string, Record<number, PrevistoDia>> = {}
  if (diaFinalExclusivo <= diaInicial) return resultado
  for (const a of animais) {
    if (!a.periodos.some(p => loteIds.has(p.lote_id))) continue
    const pesoPorDia = projetarPesoPorDia(a.animal, a.pesagens, a.periodos, ciclos, diaInicial, diaFinalExclusivo, a.eventosCiclo)
    for (const [diaStr, peso] of Object.entries(pesoPorDia)) {
      const dia = Number(diaStr)
      const periodo = encontrarLoteAtivo(dia, a.periodos)
      if (!periodo || !loteIds.has(periodo.lote_id)) continue
      const bucket = ((resultado[periodo.lote_id] ??= {})[dia] ??= {
        pesoTotalKg: 0, qtd: 0, consumoMsKg: 0, concentradoMsKg: 0, ganhoKg: 0, custoPrevisto: 0,
      })
      bucket.pesoTotalKg += peso
      bucket.qtd += 1
      const anterior = pesoPorDia[dia - 1]
      if (anterior !== undefined) bucket.ganhoKg += peso - anterior
      const dietaId = dietaVigenteDoAnimalNoDia(periodo.lote_id, dia, ciclos, a.eventosCiclo, trocasDieta)
      const dieta = dietaId ? dietas[dietaId] : undefined
      if (!dietaId || !dieta || dieta.pct_consumo_pv_ms == null) continue
      const consumo = peso * (dieta.pct_consumo_pv_ms / 100)
      bucket.consumoMsKg += consumo
      bucket.concentradoMsKg += consumo * ((dieta.pct_concentrado ?? 0) / 100)
      if (custoKgMsDietaNoDia) {
        const custo = custoKgMsDietaNoDia(dietaId, dia)
        if (custo != null) bucket.custoPrevisto += consumo * custo
      }
    }
  }
  return resultado
}

// ─── Divisão automática entre lotes ────────────────────────────────────────
// Proporcional ao consumo previsto de cada lote na data. Sem consumo previsto
// em nenhum (ex.: ciclos sem dieta), cai na proporção de cabeças; sem nenhum
// animal nos lotes na data, devolve null.
export function dividirEntreLotes(
  loteIds: string[],
  previstoNaData: Record<string, PrevistoDia | undefined>,
): Array<{ lote_id: string; fracao: number; consumo_previsto_ms_kg: number }> | null {
  const consumo = loteIds.map(id => previstoNaData[id]?.consumoMsKg ?? 0)
  const totalConsumo = consumo.reduce((s, v) => s + v, 0)
  if (totalConsumo > 0) {
    return loteIds.map((id, i) => ({ lote_id: id, fracao: consumo[i] / totalConsumo, consumo_previsto_ms_kg: consumo[i] }))
  }
  const cabecas = loteIds.map(id => previstoNaData[id]?.qtd ?? 0)
  const totalCabecas = cabecas.reduce((s, v) => s + v, 0)
  if (totalCabecas <= 0) return null
  return loteIds.map((id, i) => ({ lote_id: id, fracao: cabecas[i] / totalCabecas, consumo_previsto_ms_kg: 0 }))
}

// ─── Cobertura de cada fornecimento por lote ───────────────────────────────

export interface CoberturaFornecimento {
  fornecimento: FornecimentoInfo
  fracao: number
  desde: number        // dia (toDay), inclusive
  ateExclusivo: number // dia (toDay), exclusivo
}

// Para cada lote: os fornecimentos que o incluem, ordenados, cada um valendo
// até o próximo do mesmo lote (o último até hoje, inclusive). Fornecimentos
// no mesmo dia para o mesmo lote dividem o mesmo intervalo (somam).
export function coberturasPorLote(fornecimentos: FornecimentoInfo[], hojeDia: number): Record<string, CoberturaFornecimento[]> {
  const porLote: Record<string, Array<{ f: FornecimentoInfo; fracao: number; dia: number }>> = {}
  for (const f of fornecimentos) {
    const dia = toDay(f.data)
    for (const l of f.lotes) (porLote[l.lote_id] ??= []).push({ f, fracao: l.fracao, dia })
  }
  const resultado: Record<string, CoberturaFornecimento[]> = {}
  for (const [loteId, lista] of Object.entries(porLote)) {
    const dias = Array.from(new Set(lista.map(x => x.dia))).sort((a, b) => a - b)
    resultado[loteId] = lista.map(x => {
      const idx = dias.indexOf(x.dia)
      const proximo = dias[idx + 1]
      return { fornecimento: x.f, fracao: x.fracao, desde: x.dia, ateExclusivo: proximo !== undefined ? proximo : hojeDia + 1 }
    }).filter(c => c.desde <= hojeDia)
  }
  return resultado
}

// Primeiro dia coberto por fornecimento em cada lote — a partir dele, o
// teórico deixa de contar para o lote (custo e baixa de estoque).
export function inicioCoberturaPorLote(fornecimentos: FornecimentoInfo[]): Record<string, number> {
  const resultado: Record<string, number> = {}
  for (const f of fornecimentos) {
    const dia = toDay(f.data)
    for (const l of f.lotes) {
      if (resultado[l.lote_id] === undefined || dia < resultado[l.lote_id]) resultado[l.lote_id] = dia
    }
  }
  return resultado
}

// ─── Realizado do lote, dia a dia ──────────────────────────────────────────
// Distribui a parte do lote em cada fornecimento pelos dias cobertos,
// proporcional ao consumo previsto do lote no dia (sem consumo previsto em
// nenhum dia do intervalo, proporcional ao peso; sem animal nenhum, em partes
// iguais por dia).

export interface RealizadoDia {
  valor: number
  kgMs: number
  kgMsConcentrado: number
}

export function distribuirRealizadoNosDias(
  coberturas: CoberturaFornecimento[],
  previstoDoLote: Record<number, PrevistoDia>,
  totaisPorFornecimento: Record<string, TotaisFornecimento>,
  valorPorFornecimento: Record<string, number>,
): Record<number, RealizadoDia> {
  const resultado: Record<number, RealizadoDia> = {}
  for (const c of coberturas) {
    const totais = totaisPorFornecimento[c.fornecimento.id]
    if (!totais) continue
    const valor = (valorPorFornecimento[c.fornecimento.id] ?? 0) * c.fracao
    const kgMs = totais.kgMs * c.fracao
    const kgMsConc = totais.kgMsConcentrado * c.fracao

    const dias: number[] = []
    for (let d = c.desde; d < c.ateExclusivo; d++) dias.push(d)
    if (dias.length === 0) continue
    let pesos = dias.map(d => previstoDoLote[d]?.consumoMsKg ?? 0)
    if (pesos.reduce((s, v) => s + v, 0) <= 0) pesos = dias.map(d => previstoDoLote[d]?.pesoTotalKg ?? 0)
    if (pesos.reduce((s, v) => s + v, 0) <= 0) pesos = dias.map(() => 1)
    const soma = pesos.reduce((s, v) => s + v, 0)

    dias.forEach((d, i) => {
      const parte = pesos[i] / soma
      const r = (resultado[d] ??= { valor: 0, kgMs: 0, kgMsConcentrado: 0 })
      r.valor += valor * parte
      r.kgMs += kgMs * parte
      r.kgMsConcentrado += kgMsConc * parte
    })
  }
  return resultado
}
