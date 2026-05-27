import { useCallback } from 'react'

export interface PontoProjecao {
  dia: number; data: string; peso: number
  peso_carcaca: number; receita_bruta: number
  custo_total: number; lucro: number; lucro_por_animal: number
}

export interface ResultadoProjecao {
  curva_real: PontoProjecao[]
  curva_esperada: PontoProjecao[]
  dia_ideal_real: PontoProjecao | null
  dia_ideal_esperado: PontoProjecao | null
  modo_preco: 'kg_vivo' | 'arroba'
}

export interface InputProjecao {
  peso_medio_atual: number; qtd_animais: number
  gmd_real: number | null; gmd_esperado: number | null
  data_hoje: string
  custo_compra_total: number
  custo_alimentacao_acumulado: number
  custo_alimentacao_dia: number
  // Preço pode ser por kg vivo OU por arroba — informar qual
  preco_valor: number
  modo_preco: 'kg_vivo' | 'arroba'
  pct_comissao: number; pct_encargo: number
  faixas_rendimento: Array<{ peso_min: number; peso_max: number; rendimento_pct: number }>
  faixas_bonus: Array<{ peso_min: number; peso_max: number; bonus_kg: number }>
}

const ARROBA_KG = 15 // 1 arroba = 15 kg de carcaça

function getRendimento(peso: number, faixas: InputProjecao['faixas_rendimento']): number {
  const f = faixas.find(f => peso >= f.peso_min && peso <= f.peso_max)
  return f ? f.rendimento_pct / 100 : 0.54
}

function getBonus(peso: number, faixas: InputProjecao['faixas_bonus']): number {
  const f = faixas.find(f => peso >= f.peso_min && peso <= f.peso_max)
  return f ? f.bonus_kg : 0
}

function calcularPonto(dia: number, peso_medio: number, gmd: number, input: InputProjecao): PontoProjecao {
  const peso = peso_medio + gmd * dia
  const rendimento = getRendimento(peso, input.faixas_rendimento)
  const peso_carcaca_animal = peso * rendimento
  const peso_carcaca_total = peso_carcaca_animal * input.qtd_animais

  let receita_venda: number
  if (input.modo_preco === 'arroba') {
    // R$/@ → converte para R$/kg de carcaça → aplica sobre peso carcaça total
    const preco_kg_carcaca = input.preco_valor / ARROBA_KG
    receita_venda = peso_carcaca_total * preco_kg_carcaca
  } else {
    // R$/kg vivo → aplica sobre peso vivo total
    receita_venda = peso * input.qtd_animais * input.preco_valor
  }

  const bonus_kg = getBonus(peso, input.faixas_bonus)
  const receita_bonus = peso_carcaca_total * bonus_kg
  const receita_bruta = receita_venda + receita_bonus
  const deducoes = receita_bruta * ((input.pct_comissao + input.pct_encargo) / 100)
  const receita_liquida = receita_bruta - deducoes

  // Custo total: compra + alimentação acumulada até hoje + alimentação futura
  const custo_total = input.custo_compra_total
    + input.custo_alimentacao_acumulado
    + (input.custo_alimentacao_dia * dia)

  const lucro = receita_liquida - custo_total
  const lucro_por_animal = input.qtd_animais > 0 ? lucro / input.qtd_animais : 0

  const data = new Date(input.data_hoje)
  data.setDate(data.getDate() + dia)

  return {
    dia,
    data: data.toISOString().split('T')[0],
    peso: Math.round(peso * 10) / 10,
    peso_carcaca: Math.round(peso_carcaca_total * 10) / 10,
    receita_bruta: Math.round(receita_bruta * 100) / 100,
    custo_total: Math.round(custo_total * 100) / 100,
    lucro: Math.round(lucro * 100) / 100,
    lucro_por_animal: Math.round(lucro_por_animal * 100) / 100,
  }
}

function encontrarDiaIdeal(curva: PontoProjecao[]): PontoProjecao | null {
  if (curva.length === 0) return null
  return curva.reduce((melhor, ponto) => ponto.lucro > melhor.lucro ? ponto : melhor, curva[0])
}

export function useProjecao() {
  const calcular = useCallback((input: InputProjecao): ResultadoProjecao => {
    const curva_real: PontoProjecao[] = []
    const curva_esperada: PontoProjecao[] = []

    for (let dia = 0; dia <= 90; dia++) {
      if (input.gmd_real && input.gmd_real > 0)
        curva_real.push(calcularPonto(dia, input.peso_medio_atual, input.gmd_real, input))
      if (input.gmd_esperado && input.gmd_esperado > 0)
        curva_esperada.push(calcularPonto(dia, input.peso_medio_atual, input.gmd_esperado, input))
    }

    return {
      curva_real, curva_esperada,
      dia_ideal_real: encontrarDiaIdeal(curva_real),
      dia_ideal_esperado: encontrarDiaIdeal(curva_esperada),
      modo_preco: input.modo_preco,
    }
  }, [])

  return { calcular }
}
