// src/lib/calculadoraConfinamento.ts
// Lógica de cálculo da Calculadora de Confinamento — Confina+
// Preços e regras de negócio válidos para 2026.

export interface CalculadoraInput {
  nomeCompleto: string
  nomePropriedade: string
  cidade: string
  areaTotal: number          // m²
  areaProdutivaReal: number  // m²
  numeroAnimais: number
}

export interface MaterialItem {
  nome: string
  quantidade: number
  unidade: string
  valorUnitario: number
  valorTotal: number
}

export interface CalculadoraResultado {
  numeroCochos: number
  capacidadeInstalada: number       // numeroCochos * 80
  numeroCaixasAgua: number
  precoPorAnimal: number
  precoTotal: number
  areaRecomendada: number           // m²
  areaSuficiente: boolean
  metragemLinearCocho: number       // m
  metragemLinearBebedouro: number   // m
  estoqueAguaNecessario: number     // L
  sobraArtificialNecessaria: number // m²
  materiais: MaterialItem[]
  materiaisCocho: MaterialItem[]
}

// ── Regras de negócio 2026 ──────────────────────────────────────────────
const AREA_RECOMENDADA_POR_ANIMAL = 200       // m²
const CAPACIDADE_POR_COCHO = 80               // animais por cocho de 8m (16m de bandeja / 0,20m)
const METRO_LINEAR_COCHO_POR_ANIMAL = 0.20    // m
const METRO_LINEAR_BEBEDOURO_POR_ANIMAL = 0.03 // m
const ESTOQUE_AGUA_POR_ANIMAL = 100           // L
const SOBRA_ARTIFICIAL_POR_ANIMAL = 4         // m²
const POCO_ARTESIANO = 25000                  // fixo, 1x por propriedade

// Caixa d'água: 20.000L, serve até 240 animais, mas a 2ª só entra a partir de 360.
// Daí em diante, a cada +240 animais entra uma nova caixa (600, 840...).
const CAIXA_AGUA_CAPACIDADE = 240
const CAIXA_AGUA_LIMIAR_2A_CAIXA = 360
const CAIXA_AGUA_VALOR_UNITARIO = 4000

// ── Cocho de alimentação — especificação de material Confina+ ──────────
// Fonte: planilha de material para cocho de 6 m fornecida por Bruno (ago/2026, v2).
// O total geral informado na planilha (R$13.563,00 / R$2.393,00 por metro) não bate
// com a soma dos 26 itens abaixo. Por decisão de Bruno, o valor cobrado pelo cocho
// na calculadora usa a SOMA RECALCULADA dos itens (R$2.419,00/m), não o total da
// planilha. Os itens em MATERIAIS_COCHO_REFERENCIA_6M são também exibidos como
// detalhamento de referência para o cliente.
const COCHO_VALOR_POR_METRO = 2419

interface MaterialCochoReferencia {
  nome: string
  quantidade6m: number
  unidade: string
  valorUnitario: number | null
  valorPorMetro: number | null
}

const MATERIAIS_COCHO_REFERENCIA_6M: MaterialCochoReferencia[] = [
  { nome: 'Tábua bandeja 3m x 20cm x 4cm', quantidade6m: 12, unidade: 'un', valorUnitario: 20.00, valorPorMetro: 40.00 },
  { nome: 'Esteios 12x12 / 3,30m', quantidade6m: 18, unidade: 'un', valorUnitario: 25.00, valorPorMetro: 75.00 },
  { nome: 'Longarinas cobertura 7x5cm x 3m', quantidade6m: 12, unidade: 'un', valorUnitario: 15.00, valorPorMetro: 30.00 },
  { nome: 'Barrote bandeja 12x12 / 1m', quantidade6m: 10, unidade: 'un', valorUnitario: 8.00, valorPorMetro: 14.00 },
  { nome: 'Barrote Tesouras 8x8cm x 2,4m', quantidade6m: 14, unidade: 'un', valorUnitario: 12.00, valorPorMetro: 28.00 },
  { nome: 'Madeira machambrada lateral 3m', quantidade6m: 30, unidade: 'm²', valorUnitario: 40.00, valorPorMetro: 200.00 },
  { nome: 'Madeira machambrada Oitão 2,5m', quantidade6m: 15, unidade: 'm²', valorUnitario: 40.00, valorPorMetro: 100.00 },
  { nome: 'Telhas Aluzinco 4m', quantidade6m: 6, unidade: 'un', valorUnitario: 184.00, valorPorMetro: 185.00 },
  { nome: 'Cantoneiras mais grossas', quantidade6m: 9, unidade: 'm', valorUnitario: 162.00, valorPorMetro: 41.00 },
  { nome: 'Cantoneiras mais finas', quantidade6m: 12.8, unidade: 'm', valorUnitario: 76.00, valorPorMetro: 27.00 },
  { nome: 'Tirante 3/8', quantidade6m: 9, unidade: 'm', valorUnitario: 92.00, valorPorMetro: 23.00 },
  { nome: 'Corrente fina', quantidade6m: 3, unidade: 'm', valorUnitario: 12.00, valorPorMetro: 6.00 },
  { nome: 'Tinta', quantidade6m: 1, unidade: 'L', valorUnitario: 65.00, valorPorMetro: 11.00 },
  { nome: 'Corda 3/8', quantidade6m: 15, unidade: 'm', valorUnitario: 8.00, valorPorMetro: 120.00 },
  { nome: 'Roldana', quantidade6m: 1, unidade: 'un', valorUnitario: 42.00, valorPorMetro: 7.00 },
  { nome: 'Prego 17x27 galvanizado', quantidade6m: 4, unidade: 'kg', valorUnitario: 20.00, valorPorMetro: 14.00 },
  { nome: 'Prego 19x39 galvanizado', quantidade6m: 2, unidade: 'kg', valorUnitario: 20.00, valorPorMetro: 7.00 },
  { nome: 'Prego 24x60', quantidade6m: 2, unidade: 'kg', valorUnitario: 20.00, valorPorMetro: 7.00 },
  { nome: 'Prego telhado', quantidade6m: 2, unidade: 'kg', valorUnitario: 25.00, valorPorMetro: 9.00 },
  { nome: 'Tijolo maciço', quantidade6m: 120, unidade: 'un', valorUnitario: 1.00, valorPorMetro: 30.00 },
  { nome: 'Tijolo 6 furos', quantidade6m: 30, unidade: 'un', valorUnitario: 1.00, valorPorMetro: 5.00 },
  { nome: 'Saco de cimento', quantidade6m: 1, unidade: 'un', valorUnitario: 59.00, valorPorMetro: 10.00 },
  { nome: 'Malha 3x2m x 15cm', quantidade6m: 6, unidade: 'un', valorUnitario: 50.00, valorPorMetro: 50.00 },
  { nome: 'Concreto', quantidade6m: 4, unidade: 'm³', valorUnitario: 950.00, valorPorMetro: 650.00 },
  { nome: 'Mão de obra (cocho construído + piso)', quantidade6m: 6, unidade: 'm', valorUnitario: 670.00, valorPorMetro: 680.00 },
  { nome: 'Mão de obra tampa 4,20m', quantidade6m: 4.2, unidade: 'm', valorUnitario: null, valorPorMetro: 50.00 },
]

function arredondar(valor: number): number {
  return Math.round(valor * 100) / 100
}

function calcularMateriaisCocho(metragemLinearCocho: number): MaterialItem[] {
  if (metragemLinearCocho <= 0) return []
  const fator = metragemLinearCocho / 6
  return MATERIAIS_COCHO_REFERENCIA_6M.map((item) => ({
    nome: item.nome,
    quantidade: arredondar(item.quantidade6m * fator),
    unidade: item.unidade,
    valorUnitario: item.valorUnitario ?? 0,
    valorTotal: item.valorPorMetro !== null ? arredondar(item.valorPorMetro * metragemLinearCocho) : 0,
  }))
}

const CUSTOS_POR_BAIA: { nome: string; valorUnitario: number }[] = [
  { nome: 'Cocho bebedouro + mangueiras e boias',   valorUnitario: 3000 },
  { nome: 'Sombrite (tela + esteios)',              valorUnitario: 1300 },
  { nome: 'Sombra natural',                         valorUnitario: 2000 },
  { nome: 'Cercas',                                 valorUnitario: 5000 },
  { nome: 'Corredor de saída do gado',              valorUnitario: 500 },
  { nome: 'Portões',                                valorUnitario: 2000 },
]

function calcularNumeroCaixasAgua(numeroAnimais: number): number {
  if (numeroAnimais <= 0) return 0
  if (numeroAnimais < CAIXA_AGUA_LIMIAR_2A_CAIXA) return 1
  return 1 + Math.ceil((numeroAnimais - (CAIXA_AGUA_LIMIAR_2A_CAIXA - 1)) / CAIXA_AGUA_CAPACIDADE)
}

export function calcularConfinamento(input: CalculadoraInput): CalculadoraResultado {
  const numeroAnimais = Math.max(0, Math.round(input.numeroAnimais))

  // Número de cochos de 8m necessários (cada um comporta até 80 animais).
  // Usado apenas para os demais itens por baia (bebedouro, sombrite, cercas etc.);
  // o custo do cocho em si passou a ser calculado por metro linear (ver abaixo).
  const numeroCochos = numeroAnimais > 0
    ? Math.max(1, Math.ceil(numeroAnimais / CAPACIDADE_POR_COCHO))
    : 0

  const numeroCaixasAgua = calcularNumeroCaixasAgua(numeroAnimais)

  const metragemLinearCocho = numeroAnimais * METRO_LINEAR_COCHO_POR_ANIMAL

  const materiais: MaterialItem[] = []

  if (metragemLinearCocho > 0) {
    materiais.push({
      nome: `Cocho de alimentação (${metragemLinearCocho.toFixed(1)} m)`,
      quantidade: arredondar(metragemLinearCocho),
      unidade: 'm',
      valorUnitario: COCHO_VALOR_POR_METRO,
      valorTotal: arredondar(metragemLinearCocho * COCHO_VALOR_POR_METRO),
    })
  }

  materiais.push(
    ...CUSTOS_POR_BAIA.map((item) => ({
      nome: item.nome,
      quantidade: numeroCochos,
      unidade: 'un',
      valorUnitario: item.valorUnitario,
      valorTotal: item.valorUnitario * numeroCochos,
    }))
  )

  materiais.push({
    nome: "Caixa d'água (20.000L)",
    quantidade: numeroCaixasAgua,
    unidade: 'un',
    valorUnitario: CAIXA_AGUA_VALOR_UNITARIO,
    valorTotal: CAIXA_AGUA_VALOR_UNITARIO * numeroCaixasAgua,
  })

  materiais.push({
    nome: 'Poço artesiano',
    quantidade: 1,
    unidade: 'un',
    valorUnitario: POCO_ARTESIANO,
    valorTotal: POCO_ARTESIANO,
  })

  const precoTotal = materiais.reduce((soma, item) => soma + item.valorTotal, 0)
  const precoPorAnimal = numeroAnimais > 0 ? precoTotal / numeroAnimais : 0

  const areaRecomendada = numeroAnimais * AREA_RECOMENDADA_POR_ANIMAL
  const areaSuficiente = input.areaProdutivaReal >= areaRecomendada

  return {
    numeroCochos,
    capacidadeInstalada: numeroCochos * CAPACIDADE_POR_COCHO,
    numeroCaixasAgua,
    precoPorAnimal,
    precoTotal,
    areaRecomendada,
    areaSuficiente,
    metragemLinearCocho,
    metragemLinearBebedouro: numeroAnimais * METRO_LINEAR_BEBEDOURO_POR_ANIMAL,
    estoqueAguaNecessario: numeroAnimais * ESTOQUE_AGUA_POR_ANIMAL,
    sobraArtificialNecessaria: numeroAnimais * SOBRA_ARTIFICIAL_POR_ANIMAL,
    materiais,
    materiaisCocho: calcularMateriaisCocho(metragemLinearCocho),
  }
}
