// ─── Simulador de caminhos ──────────────────────────────────────────────────
//
// Simulação por cabeça, do ponto de partida até a venda, passando por ciclos
// sucessivos. Cada caminho (cenário) tem seus próprios ciclos e sua própria
// venda; o ponto de partida é comum a todos os caminhos da simulação.
//
// O cálculo dia a dia segue a mesma regra do motor de custo (custoAnimal.ts):
//  - peso do dia k do ciclo = peso inicial do ciclo + k x GMD;
//  - consumo do dia (kg MS) = peso do dia x % consumo do PV em MS da dieta;
//  - custo de alimentação do dia = consumo x custo por kg de MS da dieta
//    (custo manual da dieta, quando ativo, já é R$/kg de MS — igual ao motor);
//  - concentrado consumido = consumo x % concentrado; ganho atribuído ao
//    concentrado = GMD do concentrado da dieta (sem ele, o GMD do ciclo) nos
//    dias em que a dieta tem concentrado — mesma base da Conversão do app.
// Ciclo de pastagem pode, em vez de dieta, usar um custo fixo por cabeça/dia.
// Mão de obra + estrutura entra como R$ por kg produzido no ciclo.
//
// Campos numéricos são guardados como texto (do jeito que foram digitados) e
// convertidos só no cálculo — evita problemas de edição nos inputs.

export type TipoCicloSim = 'confinamento' | 'pastagem' | 'misto'
export type CustoModoSim = 'dieta' | 'cabeca_dia'

export interface SimComponente {
  key: string
  nome: string
  categoria: string
  tipo: 'concentrado' | 'volumoso'
  origem: 'insumo_padrao' | 'ingrediente_produtor'
  ingredienteId: string
  pct_participacao: string
  pct_ms: string
  preco_kg: string
}

export interface SimDieta {
  origemNome: string | null // dieta cadastrada usada como modelo (só informativo)
  pct_consumo_pv_ms: string
  pct_concentrado: string
  pct_volumoso: string
  gmd_concentrado: string // vazio = não discriminado
  custo_manual_ativo: boolean
  custo_manual_valor: string
  custo_manual_unidade: 'kg' | 'ton'
  componentes: SimComponente[]
}

export interface SimCiclo {
  id: string
  nome: string
  tipo: TipoCicloSim
  dias: string
  gmd: string
  custoModo: CustoModoSim
  custoCabecaDia: string
  dieta: SimDieta
  estruturaPorKg: string
}

export interface SimVenda {
  precoKg: string
  pctComissao: string
  pctEncargo: string
  rendimentoPct: string // só para os indicadores por @ de carcaça
}

export interface SimCenario {
  id: string
  nome: string
  ciclos: SimCiclo[]
  venda: SimVenda
}

export interface SimPartida {
  origem: 'manual' | 'lote'
  loteId: string | null
  loteNome: string | null
  dataReferencia: string | null
  qtdAnimais: string
  pesoInicial: string
  compraModo: 'kg' | 'cabeca'
  compraValor: string
  custoAnteriorPorCabeca: string
}

export interface SimDados {
  versao: 1
  partida: SimPartida
  cenarios: SimCenario[]
  // Projeção de lucro sob demanda. Ausente em simulações antigas: nesse caso
  // fica ligada se algum caminho já tem preço de venda.
  mostrarLucro?: boolean
}

export function lucroVisivel(d: SimDados): boolean {
  return d.mostrarLucro ?? d.cenarios.some(c => num(c.venda.precoKg) > 0)
}

export const ARROBA_KG = 15
export const RENDIMENTO_PADRAO_SIM = '54'

export function novoId(): string {
  try { return crypto.randomUUID() } catch { return `${Date.now()}-${Math.random().toString(36).slice(2)}` }
}

export const num = (v: string | number | null | undefined): number => {
  if (v == null) return 0
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : 0
}

const vazio = (v: string | null | undefined) => v == null || String(v).trim() === ''

export function dietaVazia(): SimDieta {
  return {
    origemNome: null,
    pct_consumo_pv_ms: '2.2',
    pct_concentrado: '100',
    pct_volumoso: '0',
    gmd_concentrado: '',
    custo_manual_ativo: false,
    custo_manual_valor: '',
    custo_manual_unidade: 'ton',
    componentes: [],
  }
}

export function cicloVazio(numero: number): SimCiclo {
  return {
    id: novoId(),
    nome: `Ciclo ${numero}`,
    tipo: 'confinamento',
    dias: '90',
    gmd: '1.2',
    custoModo: 'dieta',
    custoCabecaDia: '',
    dieta: dietaVazia(),
    estruturaPorKg: '0',
  }
}

export function vendaPadrao(): SimVenda {
  return { precoKg: '', pctComissao: '2', pctEncargo: '1.5', rendimentoPct: RENDIMENTO_PADRAO_SIM }
}

export function cenarioVazio(numero: number): SimCenario {
  return { id: novoId(), nome: `Caminho ${numero}`, ciclos: [cicloVazio(1)], venda: vendaPadrao() }
}

export function dadosIniciais(): SimDados {
  return {
    versao: 1,
    partida: {
      origem: 'manual', loteId: null, loteNome: null, dataReferencia: null,
      qtdAnimais: '100', pesoInicial: '250', compraModo: 'kg', compraValor: '', custoAnteriorPorCabeca: '0',
    },
    cenarios: [cenarioVazio(1)],
    mostrarLucro: false,
  }
}

export function duplicarCenario(c: SimCenario, nome: string): SimCenario {
  const copia: SimCenario = JSON.parse(JSON.stringify(c))
  copia.id = novoId()
  copia.nome = nome
  copia.ciclos = copia.ciclos.map(ci => ({ ...ci, id: novoId() }))
  return copia
}

// ─── Custo por kg de MS da dieta ────────────────────────────────────────────
// Mesma fórmula de calcularCustoKgMs (useDietas.ts). Só valida o lado
// (concentrado/volumoso) que tem participação maior que zero.

export function validarDieta(d: SimDieta): string | null {
  const pcpv = num(d.pct_consumo_pv_ms)
  if (pcpv <= 0 || pcpv > 10) return '% consumo do PV em MS deve ser maior que 0 e no máximo 10'
  const pc = num(d.pct_concentrado)
  const pv = num(d.pct_volumoso)
  if (Math.abs(pc + pv - 100) > 0.01) return '% concentrado + % volumoso deve somar 100'
  if (pc > 0 && pv > 0 && !vazio(d.gmd_concentrado) && num(d.gmd_concentrado) <= 0) return 'GMD do concentrado deve ser maior que 0'
  if (d.custo_manual_ativo) {
    if (num(d.custo_manual_valor) <= 0) return 'Informe o custo manual da ração'
    return null
  }
  for (const tipo of ['concentrado', 'volumoso'] as const) {
    const pct = tipo === 'concentrado' ? pc : pv
    if (pct <= 0) continue
    const comps = d.componentes.filter(c => c.tipo === tipo)
    if (comps.length === 0) return `Adicione ingredientes ao ${tipo}`
    const soma = comps.reduce((s, c) => s + num(c.pct_participacao), 0)
    if (Math.abs(soma - 100) > 0.01) return `Soma dos % do ${tipo} deve ser 100 (atual: ${soma.toFixed(2)})`
    for (const c of comps) {
      if (num(c.pct_participacao) <= 0) return `${c.nome}: % participação deve ser maior que 0`
      if (num(c.pct_ms) <= 0) return `${c.nome}: informe a % MS`
      if (num(c.preco_kg) < 0) return `${c.nome}: preço inválido`
    }
  }
  return null
}

export function custoLadoKgMs(d: SimDieta, tipo: 'concentrado' | 'volumoso'): number | null {
  const comps = d.componentes.filter(c => c.tipo === tipo)
  if (comps.length === 0) return 0
  let soma = 0
  for (const c of comps) {
    const ms = num(c.pct_ms)
    if (ms <= 0) return null
    soma += (num(c.preco_kg) / (ms / 100)) * (num(c.pct_participacao) / 100)
  }
  return soma
}

export function custoKgMsDieta(d: SimDieta): number | null {
  if (d.custo_manual_ativo) {
    const v = num(d.custo_manual_valor)
    if (v <= 0) return null
    return d.custo_manual_unidade === 'ton' ? v / 1000 : v
  }
  const pc = num(d.pct_concentrado)
  const pv = num(d.pct_volumoso)
  const cc = pc > 0 ? custoLadoKgMs(d, 'concentrado') : 0
  const cv = pv > 0 ? custoLadoKgMs(d, 'volumoso') : 0
  if (cc == null || cv == null) return null
  return cc * (pc / 100) + cv * (pv / 100)
}

// ─── Resultado ──────────────────────────────────────────────────────────────

export interface ResultadoCiclo {
  cicloId: string
  nome: string
  tipo: TipoCicloSim
  dias: number
  diaInicio: number // dia acumulado desde o início do caminho
  pesoInicial: number
  pesoFinal: number
  ganho: number
  gmd: number
  consumoMsKg: number | null // null = ciclo com custo por cabeça/dia (sem consumo)
  consumoConcentradoKg: number
  conversao: number | null
  custoKgMs: number | null
  custoAlimentacao: number
  custoEstrutura: number
  custoTotal: number
  custoKgProduzido: number | null
  margemKg: number | null // preço líquido de venda - custo do kg produzido
  resultado: number | null // margemKg x ganho
}

export interface PontoCurva {
  dia: number
  custoAcumulado: number
  valorAnimal: number | null
  ciclo: string
}

export interface ResultadoCenario {
  cenarioId: string
  erros: string[]
  ciclos: ResultadoCiclo[]
  curva: PontoCurva[]
  diasTotais: number
  pesoInicial: number
  pesoFinal: number
  ganhoTotal: number
  gmdMedio: number
  investimentoInicial: number // compra + custo já incorrido, por cabeça
  custoCiclos: number
  custoTotal: number
  custoMedioKgProduzido: number | null
  precoLiquidoKg: number | null
  receitaBruta: number | null
  deducoes: number | null
  receitaLiquida: number | null
  lucroCabeca: number | null
  lucroTotal: number | null
  margemPct: number | null
  roiPct: number | null
  arrobasCarcaca: number
  lucroPorArroba: number | null
  qtdAnimais: number
}

export function calcularCenario(partida: SimPartida, c: SimCenario): ResultadoCenario {
  const erros: string[] = []
  const qtd = Math.max(0, Math.round(num(partida.qtdAnimais)))
  const pesoInicial = num(partida.pesoInicial)
  if (pesoInicial <= 0) erros.push('Ponto de partida: informe o peso inicial')
  if (qtd <= 0) erros.push('Ponto de partida: informe a quantidade de animais')

  const compra = partida.compraModo === 'kg' ? pesoInicial * num(partida.compraValor) : num(partida.compraValor)
  const investimentoInicial = compra + num(partida.custoAnteriorPorCabeca)

  const precoKg = num(c.venda.precoKg)
  const pctDed = num(c.venda.pctComissao) + num(c.venda.pctEncargo)
  const precoLiquidoKg = precoKg > 0 ? precoKg * (1 - pctDed / 100) : null
  if (c.ciclos.length === 0) erros.push('Adicione ao menos um ciclo')

  const ciclos: ResultadoCiclo[] = []
  const curva: PontoCurva[] = []
  let peso = pesoInicial
  let custoAcum = investimentoInicial
  let diaGlobal = 0
  curva.push({ dia: 0, custoAcumulado: custoAcum, valorAnimal: precoLiquidoKg != null ? peso * precoLiquidoKg : null, ciclo: c.ciclos[0]?.nome ?? '' })

  c.ciclos.forEach((ci, idx) => {
    const rotulo = ci.nome.trim() || `Ciclo ${idx + 1}`
    const dias = Math.max(0, Math.round(num(ci.dias)))
    const gmd = num(ci.gmd)
    if (dias <= 0) erros.push(`${rotulo}: informe os dias`)
    if (gmd < 0) erros.push(`${rotulo}: GMD não pode ser negativo`)

    const usaCabecaDia = ci.tipo === 'pastagem' && ci.custoModo === 'cabeca_dia'
    let custoKgMs: number | null = null
    let pctConsumo = 0
    let pctConc = 0
    let gmdConc = gmd
    if (usaCabecaDia) {
      if (num(ci.custoCabecaDia) < 0 || vazio(ci.custoCabecaDia)) erros.push(`${rotulo}: informe o custo por cabeça/dia`)
    } else {
      const erroDieta = validarDieta(ci.dieta)
      if (erroDieta) erros.push(`${rotulo}: ${erroDieta}`)
      custoKgMs = custoKgMsDieta(ci.dieta)
      pctConsumo = num(ci.dieta.pct_consumo_pv_ms)
      pctConc = num(ci.dieta.pct_concentrado)
      const pctVol = num(ci.dieta.pct_volumoso)
      gmdConc = pctVol <= 0 ? gmd : (vazio(ci.dieta.gmd_concentrado) ? gmd : num(ci.dieta.gmd_concentrado))
    }

    const pesoIni = peso
    let custoAlim = 0
    let consumo = 0
    let consumoConc = 0
    let ganhoConc = 0
    for (let d = 0; d < dias; d++) {
      if (usaCabecaDia) {
        custoAlim += num(ci.custoCabecaDia)
      } else {
        const consumoDia = peso * (pctConsumo / 100)
        consumo += consumoDia
        custoAlim += consumoDia * (custoKgMs ?? 0)
        if (pctConc > 0) {
          consumoConc += consumoDia * (pctConc / 100)
          ganhoConc += gmdConc
        }
      }
      peso += gmd
      diaGlobal++
      const custoEstruturaAteAqui = (peso - pesoIni) * num(ci.estruturaPorKg)
      curva.push({
        dia: diaGlobal,
        custoAcumulado: custoAcum + custoAlim + custoEstruturaAteAqui,
        valorAnimal: precoLiquidoKg != null ? peso * precoLiquidoKg : null,
        ciclo: rotulo,
      })
    }
    const ganho = peso - pesoIni
    const custoEstrutura = ganho * num(ci.estruturaPorKg)
    const custoTotal = custoAlim + custoEstrutura
    custoAcum += custoTotal
    const custoKgProduzido = ganho > 0 ? custoTotal / ganho : null
    const margemKg = precoLiquidoKg != null && custoKgProduzido != null ? precoLiquidoKg - custoKgProduzido : null
    ciclos.push({
      cicloId: ci.id, nome: rotulo, tipo: ci.tipo, dias, diaInicio: diaGlobal - dias,
      pesoInicial: pesoIni, pesoFinal: peso, ganho, gmd,
      consumoMsKg: usaCabecaDia ? null : consumo,
      consumoConcentradoKg: consumoConc,
      conversao: consumoConc > 0 && ganhoConc > 0 ? consumoConc / ganhoConc : null,
      custoKgMs: usaCabecaDia ? null : custoKgMs,
      custoAlimentacao: custoAlim, custoEstrutura, custoTotal,
      custoKgProduzido, margemKg,
      resultado: margemKg != null ? margemKg * ganho : null,
    })
  })

  const ganhoTotal = peso - pesoInicial
  const custoCiclos = ciclos.reduce((s, x) => s + x.custoTotal, 0)
  const custoTotal = investimentoInicial + custoCiclos
  const receitaBruta = precoKg > 0 ? peso * precoKg : null
  const deducoes = receitaBruta != null ? receitaBruta * (pctDed / 100) : null
  const receitaLiquida = receitaBruta != null && deducoes != null ? receitaBruta - deducoes : null
  const lucroCabeca = receitaLiquida != null ? receitaLiquida - custoTotal : null
  const arrobasCarcaca = (peso * (num(c.venda.rendimentoPct) / 100)) / ARROBA_KG

  return {
    cenarioId: c.id, erros, ciclos, curva,
    diasTotais: diaGlobal, pesoInicial, pesoFinal: peso, ganhoTotal,
    gmdMedio: diaGlobal > 0 ? ganhoTotal / diaGlobal : 0,
    investimentoInicial, custoCiclos, custoTotal,
    custoMedioKgProduzido: ganhoTotal > 0 ? custoCiclos / ganhoTotal : null,
    precoLiquidoKg, receitaBruta, deducoes, receitaLiquida, lucroCabeca,
    lucroTotal: lucroCabeca != null ? lucroCabeca * qtd : null,
    margemPct: lucroCabeca != null && receitaLiquida != null && receitaLiquida > 0 ? (lucroCabeca / receitaLiquida) * 100 : null,
    roiPct: lucroCabeca != null && custoTotal > 0 ? (lucroCabeca / custoTotal) * 100 : null,
    arrobasCarcaca,
    lucroPorArroba: lucroCabeca != null && arrobasCarcaca > 0 ? lucroCabeca / arrobasCarcaca : null,
    qtdAnimais: qtd,
  }
}
