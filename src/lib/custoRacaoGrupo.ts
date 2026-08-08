// ─── Motor de cálculo: Grupos de Consumo de Ração (compra rateada) ────────────
//
// Um "grupo de consumo" representa um conjunto de lotes que dividem
// fisicamente a mesma leva de ração comprada, para uma dieta formulada
// específica (grupo.dieta_id — pode ser diferente da dieta oficial do ciclo
// de cada lote, já que é o produtor quem confirma quais lotes de fato
// compartilham aquela leva física, não o cadastro do ciclo). O produtor
// registra compras (quantidade em kg + valor total) vinculadas ao grupo;
// este módulo calcula:
//
//  - consumo teórico em kg de cada lote, dia a dia (peso projetado dos
//    animais x %MS da dieta do grupo) — reaproveita projetarPesoPorDia de
//    custoAnimal.ts, mesma base de peso usada no resto do motor de custo.
//  - saldo em kg do grupo a qualquer momento (comprado - consumido teórico).
//    Pode ficar negativo (produtor esqueceu de lançar uma compra) — este
//    módulo não bloqueia, só reporta; a UI decide como alertar.
//  - custo médio ponderado por kg, recalculado a cada nova compra, num
//    histórico de períodos de vigência (mesmo espírito de
//    dietas_historico_custo, mas aplicado ao grupo) — o custo de dias
//    passados nunca muda quando uma compra nova entra; só o período a partir
//    da data_inicio_uso da nova compra usa o custo médio recalculado.
//  - o valor em R$ que cada lote deve absorver, dia a dia — no formato
//    exato que custosRacaoRealPorLote já espera (CustoRacaoRealDiaInfo),
//    para plugar direto no motor existente em custoAnimal.ts sem alterá-lo.
//
// Todo cálculo aqui é derivado sob demanda a partir do histórico (mesma
// filosofia de custoAnimal.ts) — nada de estado acumulado incorretamente.

import { toDay, projetarPesoPorDia, encontrarLoteAtivo } from './custoAnimal'
import type {
  PeriodoLote, CicloInfo, PesagemPonto, CicloAnimalEvento, CustoRacaoRealDiaInfo,
} from './custoAnimal'

// ─── Tipos de entrada (formato mínimo, independente do schema do Supabase) ────

export interface PeriodoCustoGrupo {
  id: string
  compra_id: string | null
  vigente_desde: string
  vigente_ate: string | null
  saldo_kg_inicio: number
  custo_medio_kg: number
}

export interface CompraGrupoInfo {
  id: string
  quantidade_kg: number
  valor_total: number
  data_compra: string
  data_inicio_uso: string
}

export interface AnimalConsumoInput {
  animal: { peso_entrada: number; data_entrada: string }
  pesagens: PesagemPonto[]
  periodos: PeriodoLote[]
  eventosCiclo: CicloAnimalEvento[]
}

// ─── Período de custo vigente num dia específico ───────────────────────────
// Mesma lógica de custoVigenteNoDia (custoAnimal.ts), aplicada ao histórico
// de períodos do grupo em vez do histórico de custo da dieta.
export function periodoVigenteNoDia(dia: number, periodos: PeriodoCustoGrupo[]): PeriodoCustoGrupo | null {
  for (const p of periodos) {
    const desde = toDay(p.vigente_desde)
    const ate = p.vigente_ate ? toDay(p.vigente_ate) : null
    if (dia >= desde && (ate === null || dia < ate)) return p
  }
  return null
}

// ─── Consumo teórico em kg, por lote, dia a dia ────────────────────────────
// Soma o peso projetado de todos os animais que estiveram em cada lote (do
// grupo) em cada dia, multiplicado pelo %MS da dieta do grupo.
export function calcularConsumoTeoricoPorLotePorDia(
  loteIds: string[],
  animaisPorLote: Record<string, AnimalConsumoInput[]>,
  ciclos: CicloInfo[],
  pctConsumoPvMs: number,
  diaInicial: number,
  diaFinalExclusivo: number,
): Record<string, Record<number, { pesoTotalKg: number; qtdAtiva: number; consumoKg: number }>> {
  const resultado: Record<string, Record<number, { pesoTotalKg: number; qtdAtiva: number; consumoKg: number }>> = {}

  for (const loteId of loteIds) {
    const animais = animaisPorLote[loteId] ?? []
    const porDia: Record<number, { pesoTotalKg: number; qtdAtiva: number; consumoKg: number }> = {}

    for (const a of animais) {
      const pesoPorDia = projetarPesoPorDia(
        a.animal, a.pesagens, a.periodos, ciclos, diaInicial, diaFinalExclusivo, a.eventosCiclo,
      )
      for (const [diaStr, peso] of Object.entries(pesoPorDia)) {
        const dia = Number(diaStr)
        const periodo = encontrarLoteAtivo(dia, a.periodos)
        if (!periodo || periodo.lote_id !== loteId) continue
        const bucket = (porDia[dia] ??= { pesoTotalKg: 0, qtdAtiva: 0, consumoKg: 0 })
        bucket.pesoTotalKg += peso
        bucket.qtdAtiva += 1
        bucket.consumoKg += peso * (pctConsumoPvMs / 100)
      }
    }
    resultado[loteId] = porDia
  }

  return resultado
}

// ─── Saldo do grupo ─────────────────────────────────────────────────────────

export interface SaldoGrupo {
  totalCompradoKg: number
  totalConsumidoTeoricoKg: number
  saldoKg: number
  custoMedioKgVigente: number | null
}

export function calcularSaldoGrupo(
  compras: CompraGrupoInfo[],
  consumoTeoricoPorLote: Record<string, Record<number, { consumoKg: number }>>,
  periodos: PeriodoCustoGrupo[],
  hojeDia: number,
): SaldoGrupo {
  const totalCompradoKg = compras.reduce((s, c) => s + c.quantidade_kg, 0)
  let totalConsumidoTeoricoKg = 0
  for (const porDia of Object.values(consumoTeoricoPorLote)) {
    for (const info of Object.values(porDia)) totalConsumidoTeoricoKg += info.consumoKg
  }
  const periodoVigente = periodoVigenteNoDia(hojeDia, periodos)
  return {
    totalCompradoKg,
    totalConsumidoTeoricoKg,
    saldoKg: totalCompradoKg - totalConsumidoTeoricoKg,
    custoMedioKgVigente: periodoVigente?.custo_medio_kg ?? null,
  }
}

// ─── Custo médio ponderado ao registrar uma nova compra ────────────────────
// saldoKgAntes / saldoValorAntes descrevem o estoque (em kg e em R$,
// valorizado ao custo médio do período anterior) no instante imediatamente
// ANTES da nova compra entrar em uso — já considerando o consumo teórico até
// a data_inicio_uso (exclusive) e todas as compras anteriores.
// Se o denominador ficar <= 0 (saldo negativo maior que a compra nova, ou
// primeira compra do grupo), o custo médio novo cai só no custo unitário da
// própria compra — não dá pra ponderar sobre estoque negativo.
export function calcularNovoPeriodo(
  saldoKgAntes: number,
  saldoValorAntes: number,
  quantidadeKg: number,
  valorCompra: number,
): { saldoKgInicio: number; custoMedioKg: number } {
  const kgDepois = saldoKgAntes + quantidadeKg
  const valorDepois = saldoValorAntes + valorCompra
  const custoMedioKg = kgDepois > 0 ? valorDepois / kgDepois : (quantidadeKg > 0 ? valorCompra / quantidadeKg : 0)
  return { saldoKgInicio: kgDepois, custoMedioKg }
}

// ─── Conversão para o formato que o motor de custo já entende ─────────────
// Produz, para um lote, o mesmo formato que custos_racao_real_lote já gera
// hoje (CustoRacaoRealDiaInfo) — o motor em custoAnimal.ts não precisa saber
// nada sobre grupos: ele só vê "custo real do dia", como já vê hoje para o
// lançamento manual. Útil para testes/depuração isolada deste módulo; a
// integração real acontece em useLotes.ts (useCustoEngine), que já tem os
// dados carregados e evita refazer as mesmas consultas.
export function gerarCustoRacaoRealPorGrupo(
  consumoPorDia: Record<number, { pesoTotalKg: number; qtdAtiva: number; consumoKg: number }>,
  periodos: PeriodoCustoGrupo[],
): Record<number, CustoRacaoRealDiaInfo[]> {
  const resultado: Record<number, CustoRacaoRealDiaInfo[]> = {}
  for (const [diaStr, info] of Object.entries(consumoPorDia)) {
    const dia = Number(diaStr)
    const periodo = periodoVigenteNoDia(dia, periodos)
    if (!periodo) continue
    const valorTotalDia = info.consumoKg * periodo.custo_medio_kg
    resultado[dia] = [{
      valorTotalDia,
      pesoTotalDia: info.pesoTotalKg,
      qtdAtivaDia: info.qtdAtiva,
      cicloNumero: null,
    }]
  }
  return resultado
}

// ─── Estatística por compra: ranking de lotes por kg consumido ────────────
// Soma o consumo teórico de cada lote só dentro da janela de vigência do
// período gerado por aquela compra (vigente_desde -> vigente_ate ou hoje).
export interface RankingLoteCompra {
  lote_id: string
  kgConsumido: number
  pctDoTotal: number
}

export function calcularRankingConsumoPorCompra(
  periodoDaCompra: PeriodoCustoGrupo,
  consumoTeoricoPorLote: Record<string, Record<number, { consumoKg: number }>>,
  hojeDia: number,
): RankingLoteCompra[] {
  const diaInicio = toDay(periodoDaCompra.vigente_desde)
  const diaFim = periodoDaCompra.vigente_ate ? toDay(periodoDaCompra.vigente_ate) : hojeDia + 1

  const porLote: Record<string, number> = {}
  let total = 0
  for (const [loteId, porDia] of Object.entries(consumoTeoricoPorLote)) {
    let soma = 0
    for (const [diaStr, info] of Object.entries(porDia)) {
      const dia = Number(diaStr)
      if (dia >= diaInicio && dia < diaFim) soma += info.consumoKg
    }
    if (soma > 0) { porLote[loteId] = soma; total += soma }
  }

  return Object.entries(porLote)
    .map(([lote_id, kgConsumido]) => ({ lote_id, kgConsumido, pctDoTotal: total > 0 ? (kgConsumido / total) * 100 : 0 }))
    .sort((a, b) => b.kgConsumido - a.kgConsumido)
}
