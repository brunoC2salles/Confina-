import { useCallback } from 'react'
import { RENDIMENTO_PADRAO_PCT } from '@/lib/calculations'

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface PontoProjecao {
  dia: number
  data: string
  ciclo_nome: string
  peso: number
  peso_carcaca: number
  receita_bruta: number
  custo_alimentacao_acumulado: number
  custo_total: number
  lucro: number
  lucro_por_animal: number
}

export interface ResultadoProjecao {
  curva_real: PontoProjecao[]
  curva_esperada: PontoProjecao[]
  dia_ideal_real: PontoProjecao | null
  dia_ideal_esperado: PontoProjecao | null
}

// Ciclo configurado pelo produtor — agora traz dados da dieta em vez de custo_dia fixo
export interface CicloProjecao {
  numero: number
  nome: string
  dias_planejados: number
  gmd_esperado: number | null
  // Dados da dieta vinculada (para calcular custo por dia com peso variável)
  pct_consumo_pv_ms: number | null
  custo_kg_ms: number | null
}

export interface InputProjecao {
  // Estado atual do lote
  peso_medio_atual: number
  qtd_animais: number
  gmd_real: number | null
  data_hoje: string

  // Custos já incorridos
  custo_compra_total: number
  custo_alimentacao_acumulado: number

  // Custo/dia atual do lote (fallback quando ciclo não tem dieta configurada)
  custo_alimentacao_dia: number

  // Ciclos planejados pelo produtor
  ciclos_config: CicloProjecao[]

  // Preço e deduções
  preco_valor: number
  modo_preco: 'kg_vivo' | 'arroba'
  pct_comissao: number
  pct_encargo: number

  // Faixas do frigorífico
  faixas_rendimento: Array<{ peso_min: number; peso_max: number; rendimento_pct: number }>
  faixas_bonus: Array<{ peso_min: number; peso_max: number; bonus_kg: number }>
}

// ─── Funções auxiliares ───────────────────────────────────────────────────────

const ARROBA_KG = 15

function getRendimento(peso: number, faixas: InputProjecao['faixas_rendimento']): number {
  const f = faixas.find(f => peso >= f.peso_min && peso <= f.peso_max)
  return f ? f.rendimento_pct / 100 : RENDIMENTO_PADRAO_PCT / 100
}

function getBonus(peso: number, faixas: InputProjecao['faixas_bonus']): number {
  const f = faixas.find(f => peso >= f.peso_min && peso <= f.peso_max)
  return f ? f.bonus_kg : 0
}

// Retorna o ciclo ativo em um dado dia (0-indexed, dia 0 = hoje)
function cicloAtivoNoDia(dia: number, ciclos: CicloProjecao[]): CicloProjecao | null {
  if (ciclos.length === 0) return null
  let acumulado = 0
  for (const c of ciclos) {
    acumulado += c.dias_planejados
    if (dia < acumulado) return c
  }
  return ciclos[ciclos.length - 1]
}

/**
 * Pré-computa arrays de peso e custo acumulado por dia (0..maxDia).
 *
 * usarCiclos=true: usa GMD e dados de dieta dos ciclos (curva esperada).
 * usarCiclos=false: usa gmdFallback e custoDiaFallback constantes (curva real).
 */
function preComputarSeries(
  maxDia: number,
  pesoInicial: number,
  qtdAnimais: number,
  ciclos: CicloProjecao[],
  gmdFallback: number,
  custoDiaFallback: number,
  usarCiclos: boolean,
): { peso: number[]; custoFuturo: number[]; cicloDia: (CicloProjecao | null)[] } {
  const peso: number[] = new Array(maxDia + 1)
  const custoFuturo: number[] = new Array(maxDia + 1)
  const cicloDia: (CicloProjecao | null)[] = new Array(maxDia + 1)

  peso[0] = pesoInicial
  custoFuturo[0] = 0
  cicloDia[0] = usarCiclos ? cicloAtivoNoDia(0, ciclos) : null

  for (let d = 1; d <= maxDia; d++) {
    const cicloDoDia = usarCiclos ? cicloAtivoNoDia(d - 1, ciclos) : null
    cicloDia[d] = cicloDoDia

    // Ganho de peso do dia (usa GMD do ciclo ativo em (d-1), ou fallback)
    const gmd = usarCiclos
      ? (cicloDoDia?.gmd_esperado ?? gmdFallback)
      : gmdFallback
    peso[d] = peso[d - 1] + gmd

    // Custo do dia (usa peso ao início do dia, pct e custo_kg_ms do ciclo)
    let custoDoDia: number
    if (usarCiclos && cicloDoDia?.pct_consumo_pv_ms != null && cicloDoDia?.custo_kg_ms != null) {
      custoDoDia = peso[d - 1] * (cicloDoDia.pct_consumo_pv_ms / 100) * cicloDoDia.custo_kg_ms * qtdAnimais
    } else {
      custoDoDia = custoDiaFallback
    }
    custoFuturo[d] = custoFuturo[d - 1] + custoDoDia
  }
  return { peso, custoFuturo, cicloDia }
}

function calcularPontoDoDia(
  dia: number,
  peso: number,
  ciclo: CicloProjecao | null,
  custoAlimentacaoFuturo: number,
  input: InputProjecao,
): PontoProjecao {
  const rendimento = getRendimento(peso, input.faixas_rendimento)
  const bonus = getBonus(peso, input.faixas_bonus)
  const peso_carcaca_animal = peso * rendimento
  const peso_carcaca_total = peso_carcaca_animal * input.qtd_animais

  let receita_bruta: number
  if (input.modo_preco === 'arroba') {
    const arrobas_total = peso_carcaca_total / ARROBA_KG
    receita_bruta = arrobas_total * input.preco_valor
  } else {
    receita_bruta = peso * input.qtd_animais * input.preco_valor
  }
  receita_bruta += peso_carcaca_total * bonus

  const custo_total =
    input.custo_compra_total +
    input.custo_alimentacao_acumulado +
    custoAlimentacaoFuturo

  const deducoes = receita_bruta * ((input.pct_comissao + input.pct_encargo) / 100)
  const receita_liquida = receita_bruta - deducoes
  const lucro = receita_liquida - custo_total
  const lucro_por_animal = input.qtd_animais > 0 ? lucro / input.qtd_animais : 0

  const dataObj = new Date(input.data_hoje + 'T12:00:00')
  dataObj.setDate(dataObj.getDate() + dia)

  return {
    dia,
    data: dataObj.toISOString().split('T')[0],
    ciclo_nome: ciclo?.nome ?? 'Confinamento',
    peso: Math.round(peso * 10) / 10,
    peso_carcaca: Math.round(peso_carcaca_total * 10) / 10,
    receita_bruta: Math.round(receita_bruta * 100) / 100,
    custo_alimentacao_acumulado: Math.round((input.custo_alimentacao_acumulado + custoAlimentacaoFuturo) * 100) / 100,
    custo_total: Math.round(custo_total * 100) / 100,
    lucro: Math.round(lucro * 100) / 100,
    lucro_por_animal: Math.round(lucro_por_animal * 100) / 100,
  }
}

function encontrarDiaIdeal(curva: PontoProjecao[]): PontoProjecao | null {
  if (curva.length === 0) return null
  return curva.reduce((melhor, p) => p.lucro > melhor.lucro ? p : melhor, curva[0])
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useProjecao() {
  const calcular = useCallback((input: InputProjecao): ResultadoProjecao => {
    const diasCiclos = input.ciclos_config.reduce((s, c) => s + c.dias_planejados, 0)
    const dias = Math.min(Math.max(diasCiclos, 30), 500)
    const curva_real: PontoProjecao[] = []
    const curva_esperada: PontoProjecao[] = []

    const temGmdReal = input.gmd_real != null && input.gmd_real > 0
    const temCiclosComGmd = input.ciclos_config.some(c => c.gmd_esperado != null && c.gmd_esperado > 0)

    if (temGmdReal) {
      const serie = preComputarSeries(
        dias, input.peso_medio_atual, input.qtd_animais,
        input.ciclos_config, input.gmd_real!, input.custo_alimentacao_dia, false
      )
      for (let d = 0; d <= dias; d++) {
        curva_real.push(calcularPontoDoDia(d, serie.peso[d], null, serie.custoFuturo[d], input))
      }
    }

    if (temCiclosComGmd) {
      const serie = preComputarSeries(
        dias, input.peso_medio_atual, input.qtd_animais,
        input.ciclos_config, 0, input.custo_alimentacao_dia, true
      )
      for (let d = 0; d <= dias; d++) {
        curva_esperada.push(calcularPontoDoDia(d, serie.peso[d], serie.cicloDia[d], serie.custoFuturo[d], input))
      }
    }

    return {
      curva_real,
      curva_esperada,
      dia_ideal_real: encontrarDiaIdeal(curva_real),
      dia_ideal_esperado: encontrarDiaIdeal(curva_esperada),
    }
  }, [])

  return { calcular }
}
