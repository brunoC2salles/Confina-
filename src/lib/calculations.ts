import type { RendimentoFaixa, BonusFaixa } from '@/types'

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

export const obterRendimento = (peso: number, faixas: RendimentoFaixa[]) =>
  faixas.find(f => peso >= f.peso_min && peso <= f.peso_max)?.rendimento_percentual ?? 54

export const obterBonus = (peso: number, faixas: BonusFaixa[]) =>
  faixas.find(f => peso >= f.peso_min && peso <= f.peso_max)?.bonus_por_kg ?? 0
