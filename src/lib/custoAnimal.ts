// ─── Motor de peso e custo por animal (cálculo sob demanda) ───────────────────
//
// Reconstrói, para um único animal, o peso projetado e o custo acumulado
// (alimentação + operacional) até uma data qualquer, considerando:
//  - histórico de pesagens reais (reinicia a base de projeção quando existe)
//  - os lotes por onde o animal passou (via movimentacoes_animais)
//  - os ciclos de cada lote nesse período (dieta e GMD esperado vigentes)
//  - o custo por kg de MS vigente em cada dieta na data (dietas_historico_custo)
//  - custos operacionais lançados no lote (sanitário, maquinário, mão de obra,
//    medicamentos, outros), rateados igualmente entre os animais que estavam
//    ativos NAQUELE LOTE na data exata do lançamento (rateio histórico — se
//    naquele dia não havia nenhum animal registrado, cai no fallback da
//    quantidade ativa atual, resolvido antes de chegar aqui)
//
// O cálculo é feito dia a dia (não há acumulação em background), conforme
// decisão de manter o custo histórico correto mesmo se o preço de uma dieta
// mudar depois.

export interface PeriodoLote {
  lote_id: string
  data_inicio: string       // yyyy-mm-dd, inclusive
  data_fim: string | null   // null = ainda está nesse lote
}

export interface CicloInfo {
  lote_id: string
  numero: number
  dieta_id: string | null
  gmd_esperado: number | null
  data_inicio: string | null
  data_fim: string | null
}

export interface HistoricoCustoPonto {
  custo_kg_ms: number | null
  vigente_desde: string
  vigente_ate: string | null
}

export interface DietaInfo {
  pct_consumo_pv_ms: number | null
  historico: HistoricoCustoPonto[]
}

export interface PesagemPonto {
  data: string
  peso: number
}

export interface CustoOperacionalInfo {
  valor: number
  data_lancamento: string
  qtdAtivaNaData: number   // já resolvida: histórica no dia do lançamento, com fallback para a atual se não houver ninguém registrado naquele dia
}

export interface ResultadoAnimalNaData {
  peso: number
  custoAcumulado: number       // total = alimentação + operacional
  custoAlimentacao: number
  custoOperacional: number
  diasConfinamento: number
  gmdMedio: number
}

export interface MovimentoRelevante {
  tipo: string
  lote_origem_id: string | null
  lote_destino_id: string | null
  data: string
}

// ─── Helpers de data (dia inteiro desde epoch, evita drift de timezone) ───────

export function toDay(dateStr: string): number {
  return Math.floor(new Date(dateStr.slice(0, 10) + 'T00:00:00Z').getTime() / 86400000)
}

// ─── Reconstrói os períodos do animal em cada lote a partir do histórico ──────

const TIPOS_ENTRADA_LOTE = new Set(['entrada', 'transferencia_lote', 'bifurcacao'])
const TIPOS_SAIDA = new Set(['saida_venda', 'saida_abate', 'saida_transferencia', 'saida_morte'])

export function construirPeriodosDeMovimentacoes(movs: MovimentoRelevante[]): PeriodoLote[] {
  const eventos = [...movs]
    .filter(m => TIPOS_ENTRADA_LOTE.has(m.tipo) || TIPOS_SAIDA.has(m.tipo))
    .sort((a, b) => toDay(a.data) - toDay(b.data))

  const periodos: PeriodoLote[] = []
  let atual: PeriodoLote | null = null

  for (const ev of eventos) {
    if (TIPOS_ENTRADA_LOTE.has(ev.tipo)) {
      if (atual) atual.data_fim = ev.data
      if (ev.lote_destino_id) {
        atual = { lote_id: ev.lote_destino_id, data_inicio: ev.data, data_fim: null }
        periodos.push(atual)
      } else {
        atual = null
      }
    } else {
      if (atual) atual.data_fim = ev.data
      atual = null
    }
  }
  return periodos
}

// ─── Lookups pontuais ──────────────────────────────────────────────────────────

export function encontrarLoteAtivo(dia: number, periodos: PeriodoLote[]): PeriodoLote | null {
  for (const p of periodos) {
    const inicio = toDay(p.data_inicio)
    const fim = p.data_fim ? toDay(p.data_fim) : null
    if (dia >= inicio && (fim === null || dia < fim)) return p
  }
  return null
}

function encontrarCicloAtivo(loteId: string, dia: number, ciclos: CicloInfo[]): CicloInfo | null {
  const doLote = ciclos.filter(c => c.lote_id === loteId).sort((a, b) => a.numero - b.numero)
  for (const c of doLote) {
    if (!c.data_inicio) continue
    const inicio = toDay(c.data_inicio)
    const fim = c.data_fim ? toDay(c.data_fim) : null
    if (dia >= inicio && (fim === null || dia < fim)) return c
  }
  // fallback: nenhum ciclo com data batendo — usa o de menor número como base
  return doLote[0] ?? null
}

function custoVigenteNoDia(dia: number, historico: HistoricoCustoPonto[]): number | null {
  for (const h of historico) {
    const desde = toDay(h.vigente_desde)
    const ate = h.vigente_ate ? toDay(h.vigente_ate) : null
    if (dia >= desde && (ate === null || dia < ate)) return h.custo_kg_ms
  }
  return null
}

// ─── Cálculo principal ──────────────────────────────────────────────────────────

export function calcularAnimalNaData(
  dataAlvo: string,
  animal: { peso_entrada: number; data_entrada: string },
  pesagens: PesagemPonto[],
  periodos: PeriodoLote[],
  ciclos: CicloInfo[],
  dietas: Record<string, DietaInfo>,
  custosOperacionaisPorLote: Record<string, CustoOperacionalInfo[]> = {},
): ResultadoAnimalNaData {
  const diaEntrada = toDay(animal.data_entrada)
  const diaAlvo = toDay(dataAlvo)

  if (diaAlvo <= diaEntrada) {
    return { peso: animal.peso_entrada, custoAcumulado: 0, custoAlimentacao: 0, custoOperacional: 0, diasConfinamento: 0, gmdMedio: 0 }
  }

  const pesagensOrdenadas = [...pesagens].sort((a, b) => toDay(a.data) - toDay(b.data))

  // Peso é acumulado incrementalmente dia a dia (peso += gmd do ciclo vigente
  // NESSE dia), nunca recalculado como "base + tempo decorrido" — essa segunda
  // forma aplicaria retroativamente o GMD do ciclo mais recente a dias que
  // pertenceram a um ciclo anterior com GMD diferente, distorcendo o peso
  // sempre que o animal atravessa mais de um ciclo sem uma pesagem real no meio.
  let peso = animal.peso_entrada
  let custoAlimentacao = 0
  let custoOperacional = 0

  for (let dia = diaEntrada; dia < diaAlvo; dia++) {
    const pesagemHoje = pesagensOrdenadas.find(p => toDay(p.data) === dia)
    const periodo = encontrarLoteAtivo(dia, periodos)
    const ciclo = periodo ? encontrarCicloAtivo(periodo.lote_id, dia, ciclos) : null
    const gmd = ciclo?.gmd_esperado ?? 0

    if (pesagemHoje) {
      peso = pesagemHoje.peso
    } else if (dia > diaEntrada) {
      peso += gmd
    }
    // dia === diaEntrada e sem pesagem real: peso permanece o peso_entrada (sem crescimento ainda)

    const dietaInfo = ciclo?.dieta_id ? dietas[ciclo.dieta_id] : undefined
    if (dietaInfo?.pct_consumo_pv_ms != null) {
      const custoKgMs = custoVigenteNoDia(dia, dietaInfo.historico)
      if (custoKgMs != null) {
        custoAlimentacao += peso * (dietaInfo.pct_consumo_pv_ms / 100) * custoKgMs
      }
    }

    if (periodo) {
      const custosDoLote = custosOperacionaisPorLote[periodo.lote_id] ?? []
      if (custosDoLote.length > 0) {
        for (const c of custosDoLote) {
          if (toDay(c.data_lancamento) === dia) {
            custoOperacional += c.valor / Math.max(c.qtdAtivaNaData, 1)
          }
        }
      }
    }
  }

  // peso na própria dataAlvo: usa pesagem real se houver exatamente nessa data,
  // senão o valor já acumulado corretamente pelo laço acima (peso ao início de diaAlvo)
  const pesagemNoDiaAlvo = pesagensOrdenadas.find(p => toDay(p.data) === diaAlvo)
  const pesoFinal = pesagemNoDiaAlvo ? pesagemNoDiaAlvo.peso : peso

  const diasConfinamento = diaAlvo - diaEntrada
  const gmdMedio = diasConfinamento > 0 ? (pesoFinal - animal.peso_entrada) / diasConfinamento : 0

  return {
    peso: pesoFinal,
    custoAcumulado: custoAlimentacao + custoOperacional,
    custoAlimentacao, custoOperacional,
    diasConfinamento, gmdMedio,
  }
}

// ─── Utilitário: gera código do animal a partir do prefixo do lote + brinco ───

export function gerarCodigoAnimal(prefixo: string, brinco: string): string {
  return `${prefixo}${brinco}`
}
