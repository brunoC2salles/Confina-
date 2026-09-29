// ─── Motor de cálculo: Compras de ingredientes (ração feita na fazenda) ─────
//
// O produtor que faz a própria ração registra entradas de cada ingrediente
// (compra, produção própria ou ajuste de inventário). Este módulo calcula:
//
//  - o consumo de cada ingrediente, dia a dia, em kg de matéria natural. Nos
//    lotes sem fornecimento de ração registrado, é teórico: peso do animal x
//    consumo em MS da dieta do dia x fração de MS que o ingrediente
//    representa na dieta / % MS do ingrediente, somando todos os lotes cujas
//    dietas usam o ingrediente. A partir do primeiro fornecimento de um lote,
//    vale o que foi fornecido (baixa no dia do fornecimento, ver
//    fornecimentoRacao.ts).
//  - o kardex do ingrediente: saldo em kg (entradas - consumo teórico, com
//    ajustes de inventário substituindo o saldo pelo valor contado) e custo
//    médio ponderado por kg, recalculado a cada entrada — mesma lógica dos
//    Grupos de Consumo (ver custoRacaoGrupo.ts).
//  - o custo por kg de MS da dieta com o preço do estoque: nos dias cobertos
//    por algum período de custo de ingrediente, o preço de cada componente
//    com estoque é trocado pelo custo médio vigente; os demais componentes
//    mantêm o preço do cadastro da dieta. Fora desses dias, vale o histórico
//    de custo da dieta (dietas_historico_custo) sem alteração. Nada disso é
//    gravado na dieta — é calculado sob demanda (ver sintetizarHistoricoDieta).
//
// Limitação conhecida: a composição da dieta não tem histórico, então os
// dias passados usam a composição atual.

import {
  toDay, projetarPesoPorDia, encontrarLoteAtivo, dietaVigenteDoAnimalNoDia,
  type HistoricoCustoPonto, type PeriodoLote, type CicloInfo, type PesagemPonto,
  type CicloAnimalEvento, type TrocaDietaCiclo,
} from './custoAnimal'
import { calcularNovoPeriodo } from './custoRacaoGrupo'

export type OrigemIngrediente = 'insumo_padrao' | 'ingrediente_produtor'
export type TipoEntradaIngrediente = 'compra' | 'producao_propria' | 'ajuste'

// Identificador único do ingrediente, independente da origem.
export function chaveIngrediente(
  origem: string | null | undefined, insumoId: string | null | undefined, ingredienteProdutorId: string | null | undefined,
): string | null {
  if (origem === 'insumo_padrao' && insumoId) return `insumo_padrao:${insumoId}`
  if (origem === 'ingrediente_produtor' && ingredienteProdutorId) return `ingrediente_produtor:${ingredienteProdutorId}`
  return null
}

// ─── Composição mínima da dieta usada pelos cálculos ───────────────────────

export interface ComponenteCustoInfo {
  tipo: 'concentrado' | 'volumoso'
  chave: string | null
  pct_participacao: number | null
  // % MS efetiva do componente (manual da dieta ou a do ingrediente).
  pct_ms: number | null
  preco_kg: number | null
}

export interface DietaComposicaoInfo {
  pct_consumo_pv_ms: number | null
  pct_concentrado: number | null
  pct_volumoso: number | null
  custo_manual_ativo: boolean
  componentes: ComponenteCustoInfo[]
}

// Fração da MS total da dieta que vem deste componente (0 a 1).
export function fracaoMsComponente(dieta: DietaComposicaoInfo, c: ComponenteCustoInfo): number {
  const lado = c.tipo === 'concentrado' ? (dieta.pct_concentrado ?? 0) : (dieta.pct_volumoso ?? 0)
  return (lado / 100) * ((c.pct_participacao ?? 0) / 100)
}

// % de matéria seca da dieta como fornecida (matéria natural), calculada
// pelos componentes. Null quando algum componente não tem % MS ou
// participação, ou quando a dieta não tem componentes.
export function calcularPctMsDieta(dieta: DietaComposicaoInfo): number | null {
  if (dieta.componentes.length === 0) return null
  let somaFracao = 0
  let somaNatural = 0
  for (const c of dieta.componentes) {
    if (c.pct_ms == null || c.pct_ms <= 0 || c.pct_participacao == null) return null
    const f = fracaoMsComponente(dieta, c)
    somaFracao += f
    somaNatural += f / (c.pct_ms / 100)
  }
  if (somaFracao <= 0 || somaNatural <= 0) return null
  return (somaFracao / somaNatural) * 100
}

// Mesma fórmula de calcularCustoKgMs (useDietas.ts), com a opção de trocar o
// preço de componentes específicos (precoPorChave, R$/kg de matéria natural).
export function calcularCustoKgMsComPrecos(dieta: DietaComposicaoInfo, precoPorChave: Record<string, number>): number | null {
  const lado = (tipo: 'concentrado' | 'volumoso'): number | null => {
    const comps = dieta.componentes.filter(c => c.tipo === tipo)
    if (comps.length === 0) return 0
    let soma = 0
    for (const c of comps) {
      if (c.pct_ms == null || c.pct_ms <= 0) return null
      if (c.pct_participacao == null) return null
      const preco = c.chave != null && precoPorChave[c.chave] != null ? precoPorChave[c.chave] : c.preco_kg
      if (preco == null) return null
      soma += (preco / (c.pct_ms / 100)) * (c.pct_participacao / 100)
    }
    return soma
  }
  const cc = lado('concentrado')
  const cv = lado('volumoso')
  if (cc == null || cv == null) return null
  return cc * ((dieta.pct_concentrado ?? 0) / 100) + cv * ((dieta.pct_volumoso ?? 0) / 100)
}

// ─── Períodos de custo médio do ingrediente ────────────────────────────────

export interface PeriodoCustoIngredienteInfo {
  vigente_desde: string
  vigente_ate: string | null
  custo_medio_kg: number
}

export function periodoIngredienteNoDia(dia: number, periodos: PeriodoCustoIngredienteInfo[]): PeriodoCustoIngredienteInfo | null {
  for (const p of periodos) {
    const desde = toDay(p.vigente_desde)
    const ate = p.vigente_ate ? toDay(p.vigente_ate) : null
    if (dia >= desde && (ate === null || dia < ate)) return p
  }
  return null
}

// Preço do estoque de cada ingrediente vigente num dia (R$/kg natural).
export function precosEstoqueNoDia(dia: number, periodosPorChave: Record<string, PeriodoCustoIngredienteInfo[]>): Record<string, number> {
  const precos: Record<string, number> = {}
  for (const [chave, periodos] of Object.entries(periodosPorChave)) {
    const p = periodoIngredienteNoDia(dia, periodos)
    if (p) precos[chave] = p.custo_medio_kg
  }
  return precos
}

export function diaParaData(dia: number): string {
  return new Date(dia * 86400000).toISOString().slice(0, 10)
}

// ─── Histórico de custo da dieta com o preço do estoque ────────────────────
// Recebe o histórico gravado da dieta e devolve um histórico equivalente em
// que, a partir da primeira entrada de qualquer ingrediente da dieta, cada
// trecho entre mudanças de custo médio dos ingredientes tem o custo por kg de
// MS recalculado com o preço do estoque. Antes disso, o histórico gravado é
// mantido. Se a dieta não permite o cálculo pelos componentes (falta % MS ou
// preço), devolve o histórico original sem alteração.
export function sintetizarHistoricoDieta(
  historico: HistoricoCustoPonto[],
  dieta: DietaComposicaoInfo,
  periodosPorChave: Record<string, PeriodoCustoIngredienteInfo[]>,
): HistoricoCustoPonto[] {
  const chavesComEstoque = Array.from(new Set(
    dieta.componentes.map(c => c.chave).filter((k): k is string => !!k && (periodosPorChave[k]?.length ?? 0) > 0),
  ))
  if (chavesComEstoque.length === 0) return historico
  if (calcularCustoKgMsComPrecos(dieta, {}) == null) return historico

  const pontos = new Set<number>()
  for (const k of chavesComEstoque) {
    for (const p of periodosPorChave[k]) {
      pontos.add(toDay(p.vigente_desde))
      if (p.vigente_ate) pontos.add(toDay(p.vigente_ate))
    }
  }
  const ordenados = Array.from(pontos).sort((a, b) => a - b)
  const primeiro = ordenados[0]

  const resultado: HistoricoCustoPonto[] = []
  for (const h of historico) {
    const desde = toDay(h.vigente_desde)
    if (desde >= primeiro) continue
    const ate = h.vigente_ate ? Math.min(toDay(h.vigente_ate), primeiro) : primeiro
    resultado.push({ custo_kg_ms: h.custo_kg_ms, vigente_desde: h.vigente_desde, vigente_ate: diaParaData(ate) })
  }

  const periodosRelevantes: Record<string, PeriodoCustoIngredienteInfo[]> = {}
  for (const k of chavesComEstoque) periodosRelevantes[k] = periodosPorChave[k]

  for (let i = 0; i < ordenados.length; i++) {
    const dia = ordenados[i]
    const proximo = ordenados[i + 1]
    const custo = calcularCustoKgMsComPrecos(dieta, precosEstoqueNoDia(dia, periodosRelevantes))
    resultado.push({
      custo_kg_ms: custo,
      vigente_desde: diaParaData(dia),
      vigente_ate: proximo !== undefined ? diaParaData(proximo) : null,
    })
  }
  return resultado
}

// ─── Consumo teórico dos ingredientes, dia a dia ───────────────────────────

export interface AnimalConsumoIngredienteInput {
  animal: { peso_entrada: number; data_entrada: string }
  pesagens: PesagemPonto[]
  periodos: PeriodoLote[]
  eventosCiclo: CicloAnimalEvento[]
}

// Retorna chave do ingrediente -> dia (toDay) -> kg de matéria natural.
// Só calcula as chaves pedidas (chavesAlvo) e os dias em [diaInicial, diaFinalExclusivo).
// inicioCoberturaPorLote: a partir desse dia o lote tem fornecimento de
// ração registrado, que substitui o teórico (ver fornecimentoRacao.ts) —
// dias do lote a partir dele não entram aqui.
export function calcularConsumoIngredientesPorDia(
  animais: AnimalConsumoIngredienteInput[],
  ciclos: CicloInfo[],
  trocasDieta: TrocaDietaCiclo[],
  dietas: Record<string, DietaComposicaoInfo>,
  chavesAlvo: Set<string>,
  diaInicial: number,
  diaFinalExclusivo: number,
  inicioCoberturaPorLote: Record<string, number> = {},
): Record<string, Record<number, number>> {
  // Por dieta: lista de (chave, kg natural por kg de MS consumida).
  const fatoresPorDieta: Record<string, Array<{ chave: string; fator: number }>> = {}
  for (const [dietaId, d] of Object.entries(dietas)) {
    const fatores: Array<{ chave: string; fator: number }> = []
    for (const c of d.componentes) {
      if (!c.chave || !chavesAlvo.has(c.chave)) continue
      if (c.pct_ms == null || c.pct_ms <= 0) continue
      const f = fracaoMsComponente(d, c)
      if (f <= 0) continue
      fatores.push({ chave: c.chave, fator: f / (c.pct_ms / 100) })
    }
    if (fatores.length > 0 && d.pct_consumo_pv_ms != null) fatoresPorDieta[dietaId] = fatores
  }

  const resultado: Record<string, Record<number, number>> = {}
  if (Object.keys(fatoresPorDieta).length === 0) return resultado

  for (const a of animais) {
    const pesoPorDia = projetarPesoPorDia(a.animal, a.pesagens, a.periodos, ciclos, diaInicial, diaFinalExclusivo, a.eventosCiclo)
    for (const [diaStr, peso] of Object.entries(pesoPorDia)) {
      const dia = Number(diaStr)
      const periodo = encontrarLoteAtivo(dia, a.periodos)
      if (!periodo) continue
      const inicioCobertura = inicioCoberturaPorLote[periodo.lote_id]
      if (inicioCobertura !== undefined && dia >= inicioCobertura) continue
      const dietaId = dietaVigenteDoAnimalNoDia(periodo.lote_id, dia, ciclos, a.eventosCiclo, trocasDieta)
      if (!dietaId) continue
      const fatores = fatoresPorDieta[dietaId]
      if (!fatores) continue
      const consumoMs = peso * ((dietas[dietaId].pct_consumo_pv_ms as number) / 100)
      for (const { chave, fator } of fatores) {
        const porDia = (resultado[chave] ??= {})
        porDia[dia] = (porDia[dia] ?? 0) + consumoMs * fator
      }
    }
  }
  return resultado
}

// ─── Kardex do ingrediente ─────────────────────────────────────────────────

export interface EntradaIngredienteInfo {
  id: string
  tipo: TipoEntradaIngrediente
  data: string
  quantidade_kg: number
  valor_total: number
  created_at?: string
}

export interface PeriodoKardexCalculado {
  compra_id: string
  vigente_desde: string
  vigente_ate: string | null
  saldo_kg_inicio: number
  custo_medio_kg: number
}

export interface ResultadoKardex {
  periodos: PeriodoKardexCalculado[]
  totalEntradasKg: number
  totalConsumidoKg: number
  totalAjustesKg: number
  saldoKg: number
  custoMedioVigente: number | null
}

const ORDEM_TIPO: Record<TipoEntradaIngrediente, number> = { compra: 0, producao_propria: 0, ajuste: 1 }

// O consumo só passa a contar a partir da primeira entrada (antes dela não
// há estoque nem preço registrado). No mesmo dia, entradas são processadas
// antes do ajuste de inventário: o saldo contado já inclui o que entrou no
// dia. Ajuste substitui o saldo em kg pelo valor contado e não altera o
// custo médio. Cada compra ou produção própria abre um período novo de custo
// médio ponderado, com a mesma regra de calcularNovoPeriodo (grupos).
export function calcularKardexIngrediente(
  entradas: EntradaIngredienteInfo[],
  consumoPorDia: Record<number, number>,
  hojeDia: number,
): ResultadoKardex {
  const eventos = [...entradas].sort((a, b) =>
    a.data.localeCompare(b.data)
    || ORDEM_TIPO[a.tipo] - ORDEM_TIPO[b.tipo]
    || (a.created_at ?? '').localeCompare(b.created_at ?? ''))

  const diasConsumo = Object.keys(consumoPorDia).map(Number).sort((a, b) => a - b)
  let idxConsumo = 0
  let cursor: number | null = null
  let totalConsumidoKg = 0

  const consumirAte = (diaExclusivo: number): number => {
    let soma = 0
    while (idxConsumo < diasConsumo.length && diasConsumo[idxConsumo] < diaExclusivo) {
      const d = diasConsumo[idxConsumo]
      if (cursor !== null && d >= cursor) soma += consumoPorDia[d]
      idxConsumo++
    }
    return soma
  }

  let saldoKg = 0
  let custoMedio = 0
  let totalEntradasKg = 0
  let totalAjustesKg = 0
  const periodos: PeriodoKardexCalculado[] = []

  for (const e of eventos) {
    const dia = toDay(e.data)
    if (cursor === null) {
      cursor = dia
      // descarta consumo anterior à primeira entrada
      while (idxConsumo < diasConsumo.length && diasConsumo[idxConsumo] < dia) idxConsumo++
    }
    const consumido = consumirAte(dia)
    totalConsumidoKg += consumido
    saldoKg -= consumido

    if (e.tipo === 'ajuste') {
      totalAjustesKg += e.quantidade_kg - saldoKg
      saldoKg = e.quantidade_kg
      continue
    }

    const { saldoKgInicio, custoMedioKg } = calcularNovoPeriodo(saldoKg, saldoKg * custoMedio, e.quantidade_kg, e.valor_total)
    saldoKg = saldoKgInicio
    custoMedio = custoMedioKg
    totalEntradasKg += e.quantidade_kg

    const ultimo = periodos[periodos.length - 1]
    if (ultimo && ultimo.vigente_desde === e.data) {
      ultimo.compra_id = e.id
      ultimo.saldo_kg_inicio = saldoKgInicio
      ultimo.custo_medio_kg = custoMedioKg
    } else {
      if (ultimo) ultimo.vigente_ate = e.data
      periodos.push({ compra_id: e.id, vigente_desde: e.data, vigente_ate: null, saldo_kg_inicio: saldoKgInicio, custo_medio_kg: custoMedioKg })
    }
  }

  if (cursor !== null) {
    const consumido = consumirAte(hojeDia + 1)
    totalConsumidoKg += consumido
    saldoKg -= consumido
  }

  return {
    periodos,
    totalEntradasKg,
    totalConsumidoKg,
    totalAjustesKg,
    saldoKg,
    custoMedioVigente: periodos.length > 0 ? periodos[periodos.length - 1].custo_medio_kg : null,
  }
}
