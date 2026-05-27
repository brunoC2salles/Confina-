import { useCallback } from 'react'

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface PontoProjecao {
  dia: number
  data: string
  ciclo_nome: string          // nome do ciclo vigente neste dia
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

// Ciclo configurado pelo produtor
export interface CicloProjecao {
  numero: number
  nome: string
  dias_planejados: number
  gmd_esperado: number | null   // kg/dia previsto para este ciclo
  custo_dia: number | null      // R$/dia deste ciclo (vem da dieta vinculada)
}

export interface InputProjecao {
  // Estado atual do lote
  peso_medio_atual: number
  qtd_animais: number
  gmd_real: number | null       // GMD calculado por pesagens reais
  data_hoje: string

  // Custos já incorridos (base fixa em todos os pontos)
  custo_compra_total: number
  custo_alimentacao_acumulado: number

  // Custo atual do dia (fallback quando ciclo não tem custo configurado)
  custo_alimentacao_dia: number

  // Ciclos planejados pelo produtor (para curva esperada por fase)
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

const ARROBA_KG = 15 // 1 arroba = 15 kg de carcaça

function getRendimento(peso: number, faixas: InputProjecao['faixas_rendimento']): number {
  const f = faixas.find(f => peso >= f.peso_min && peso <= f.peso_max)
  return f ? f.rendimento_pct / 100 : 0.54
}

function getBonus(peso: number, faixas: InputProjecao['faixas_bonus']): number {
  const f = faixas.find(f => peso >= f.peso_min && peso <= f.peso_max)
  return f ? f.bonus_kg : 0
}

/**
 * Dado um dia relativo ao dia atual, retorna qual ciclo está ativo
 * e o custo de alimentação acumulado futuro até esse dia,
 * somando custo variável por fase.
 */
function resolverCiclo(
  dia: number,
  ciclos: CicloProjecao[],
  custoDiaFallback: number
): { nome: string; gmd: number | null; custoAcumuladoFuturo: number } {
  if (ciclos.length === 0) {
    return {
      nome: 'Confinamento',
      gmd: null,
      custoAcumuladoFuturo: custoDiaFallback * dia,
    }
  }

  let custoAcumulado = 0
  let diasRestantes = dia
  let cicloAtual = ciclos[0]

  for (const ciclo of ciclos) {
    if (diasRestantes <= 0) break
    cicloAtual = ciclo
    const diasNesteCiclo = Math.min(diasRestantes, ciclo.dias_planejados)
    const custoDia = ciclo.custo_dia ?? custoDiaFallback
    custoAcumulado += diasNesteCiclo * custoDia
    diasRestantes -= diasNesteCiclo
  }

  // Se sobrou dias após o último ciclo, usa o custo do último ciclo
  if (diasRestantes > 0) {
    const custoDia = cicloAtual.custo_dia ?? custoDiaFallback
    custoAcumulado += diasRestantes * custoDia
  }

  return {
    nome: cicloAtual.nome,
    gmd: cicloAtual.gmd_esperado,
    custoAcumuladoFuturo: custoAcumulado,
  }
}

/**
 * Calcula o peso acumulado respeitando o GMD de cada fase.
 * Quando o produtor configura GMDs diferentes por ciclo,
 * o peso cresce em velocidades diferentes em cada fase.
 */
function calcularPesoComCiclos(
  dia: number,
  pesoInicial: number,
  ciclos: CicloProjecao[],
  gmdFallback: number
): number {
  if (ciclos.length === 0) return pesoInicial + gmdFallback * dia

  let peso = pesoInicial
  let diasRestantes = dia

  for (const ciclo of ciclos) {
    if (diasRestantes <= 0) break
    const diasNesteCiclo = Math.min(diasRestantes, ciclo.dias_planejados)
    const gmd = ciclo.gmd_esperado ?? gmdFallback
    peso += gmd * diasNesteCiclo
    diasRestantes -= diasNesteCiclo
  }

  // Dias além do planejamento: usa GMD do último ciclo configurado
  if (diasRestantes > 0) {
    const ultimoCiclo = ciclos[ciclos.length - 1]
    const gmd = ultimoCiclo.gmd_esperado ?? gmdFallback
    peso += gmd * diasRestantes
  }

  return peso
}

function calcularPonto(
  dia: number,
  pesoMedioAtual: number,
  gmdReal: number | null,      // null = usar ciclos para curva esperada
  input: InputProjecao,
  usarCiclos: boolean
): PontoProjecao {
  // Peso: curva real usa GMD fixo, curva esperada usa GMDs por ciclo
  const peso = usarCiclos
    ? calcularPesoComCiclos(dia, pesoMedioAtual, input.ciclos_config, 0)
    : pesoMedioAtual + (gmdReal ?? 0) * dia

  // Ciclo vigente e custo futuro acumulado
  const { nome: ciclo_nome, custoAcumuladoFuturo } = resolverCiclo(
    dia,
    usarCiclos ? input.ciclos_config : [],
    input.custo_alimentacao_dia
  )

  // Rendimento e bônus frigorífico
  const rendimento = getRendimento(peso, input.faixas_rendimento)
  const bonus = getBonus(peso, input.faixas_bonus)
  const peso_carcaca_animal = peso * rendimento
  const peso_carcaca_total = peso_carcaca_animal * input.qtd_animais

  // Receita
  let receita_bruta: number
  if (input.modo_preco === 'arroba') {
    const arrobas_total = peso_carcaca_total / ARROBA_KG
    receita_bruta = arrobas_total * input.preco_valor
  } else {
    receita_bruta = peso * input.qtd_animais * input.preco_valor
  }
  receita_bruta += peso_carcaca_total * bonus

  // Custo total = base fixa + alimentação futura projetada
  const custo_alimentacao_futuro_total = usarCiclos
    ? custoAcumuladoFuturo
    : input.custo_alimentacao_dia * dia

  const custo_total =
    input.custo_compra_total +
    input.custo_alimentacao_acumulado +
    custo_alimentacao_futuro_total

  // Lucro
  const deducoes = receita_bruta * ((input.pct_comissao + input.pct_encargo) / 100)
  const receita_liquida = receita_bruta - deducoes
  const lucro = receita_liquida - custo_total
  const lucro_por_animal = input.qtd_animais > 0 ? lucro / input.qtd_animais : 0

  // Data
  const dataObj = new Date(input.data_hoje + 'T12:00:00')
  dataObj.setDate(dataObj.getDate() + dia)

  return {
    dia,
    data: dataObj.toISOString().split('T')[0],
    ciclo_nome,
    peso: Math.round(peso * 10) / 10,
    peso_carcaca: Math.round(peso_carcaca_total * 10) / 10,
    receita_bruta: Math.round(receita_bruta * 100) / 100,
    custo_alimentacao_acumulado: Math.round((input.custo_alimentacao_acumulado + custo_alimentacao_futuro_total) * 100) / 100,
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
    const dias = 90
    const curva_real: PontoProjecao[] = []
    const curva_esperada: PontoProjecao[] = []

    for (let dia = 0; dia <= dias; dia++) {
      // Curva real: usa GMD real das pesagens, custo/dia atual (sem ciclos)
      if (input.gmd_real && input.gmd_real > 0) {
        curva_real.push(calcularPonto(dia, input.peso_medio_atual, input.gmd_real, input, false))
      }

      // Curva esperada: usa GMDs por ciclo configurados pelo produtor
      const temCiclosComGmd = input.ciclos_config.some(c => c.gmd_esperado && c.gmd_esperado > 0)
      if (temCiclosComGmd) {
        curva_esperada.push(calcularPonto(dia, input.peso_medio_atual, null, input, true))
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
