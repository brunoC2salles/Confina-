import type { ComponenteDieta, RendimentoFaixa, BonusFaixa, ResultadoVenda } from '@/types'

export const fmt = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

export const fmtNum = (v: number, d = 2) =>
  new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(v)

export const fmtData = (d: string) =>
  new Date(d + 'T00:00:00').toLocaleDateString('pt-BR')

export const calcularDias = (inicio: string, fim: string) => {
  const d = new Date(fim).getTime() - new Date(inicio).getTime()
  return Math.max(0, Math.floor(d / 86400000))
}

export const calcularGMD = (pi: number, pf: number, dias: number) =>
  dias > 0 ? (pf - pi) / dias : 0

export const projetarPeso = (pi: number, gmd: number, dias: number) =>
  pi + gmd * dias

export const diasParaPeso = (atual: number, alvo: number, gmd: number) =>
  gmd > 0 ? Math.ceil((alvo - atual) / gmd) : 0

export const calcularCustoDiario = (peso: number, comps: ComponenteDieta[]) =>
  comps.reduce((t, c) => t + peso * (c.percentual_peso_corporal / 100) * c.preco_kg, 0)

export const obterRendimento = (peso: number, faixas: RendimentoFaixa[]) =>
  faixas.find(f => peso >= f.peso_min && peso <= f.peso_max)?.rendimento_percentual ?? 54

export const obterBonus = (peso: number, faixas: BonusFaixa[]) =>
  faixas.find(f => peso >= f.peso_min && peso <= f.peso_max)?.bonus_por_kg ?? 0

export interface InputVenda {
  pesoEntrada: number; pesoFinal: number
  dataEntrada: string; dataSaida: string
  valorCompra: number; valorVenda: number
  custoAlimentacao: number; custosVariaveis: number; rateioFixo: number
  totalComissoes: number; totalEncargos: number
  faixasRendimento: RendimentoFaixa[]; faixasBonus: BonusFaixa[]
}

export const calcularResultadoVenda = (i: InputVenda): ResultadoVenda => {
  const dias = calcularDias(i.dataEntrada, i.dataSaida)
  const ganhoTotal = i.pesoFinal - i.pesoEntrada
  const gmd = calcularGMD(i.pesoEntrada, i.pesoFinal, dias)
  const rendPct = obterRendimento(i.pesoFinal, i.faixasRendimento)
  const pesoCarcaca = i.pesoFinal * (rendPct / 100)
  const bonusPorKg = obterBonus(i.pesoFinal, i.faixasBonus)
  const valorBonus = pesoCarcaca * bonusPorKg
  const receitaBruta = i.valorVenda + valorBonus
  const receitaLiquida = receitaBruta - i.totalComissoes - i.totalEncargos
  const custoTotal = i.valorCompra + i.custoAlimentacao + i.custosVariaveis + i.rateioFixo
  const lucro = receitaLiquida - custoTotal
  return {
    peso_final: i.pesoFinal, ganho_total: ganhoTotal, dias_confinamento: dias, gmd,
    rendimento_pct: rendPct, peso_carcaca: pesoCarcaca, bonus_por_kg: bonusPorKg, valor_bonus: valorBonus,
    receita_bruta: receitaBruta, total_comissoes: i.totalComissoes, total_encargos: i.totalEncargos,
    receita_liquida: receitaLiquida, custo_compra: i.valorCompra, custo_alimentacao: i.custoAlimentacao,
    custos_variaveis: i.custosVariaveis, rateio_fixo: i.rateioFixo, custo_total: custoTotal,
    lucro, margem_pct: receitaLiquida > 0 ? (lucro / receitaLiquida) * 100 : 0,
    roi_pct: i.valorCompra > 0 ? (lucro / i.valorCompra) * 100 : 0,
    custo_por_kg: ganhoTotal > 0 ? custoTotal / ganhoTotal : 0,
  }
}
