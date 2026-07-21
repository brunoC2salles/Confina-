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

const CUSTOS_POR_BAIA: { nome: string; valorUnitario: number }[] = [
  { nome: 'Cocho tulha (8m)',                       valorUnitario: 9000 },
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

  // Número de cochos de 8m necessários (cada um comporta até 80 animais)
  const numeroCochos = numeroAnimais > 0
    ? Math.max(1, Math.ceil(numeroAnimais / CAPACIDADE_POR_COCHO))
    : 0

  const numeroCaixasAgua = calcularNumeroCaixasAgua(numeroAnimais)

  const materiais: MaterialItem[] = CUSTOS_POR_BAIA.map((item) => ({
    nome: item.nome,
    quantidade: numeroCochos,
    unidade: 'un',
    valorUnitario: item.valorUnitario,
    valorTotal: item.valorUnitario * numeroCochos,
  }))

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
    metragemLinearCocho: numeroAnimais * METRO_LINEAR_COCHO_POR_ANIMAL,
    metragemLinearBebedouro: numeroAnimais * METRO_LINEAR_BEBEDOURO_POR_ANIMAL,
    estoqueAguaNecessario: numeroAnimais * ESTOQUE_AGUA_POR_ANIMAL,
    sobraArtificialNecessaria: numeroAnimais * SOBRA_ARTIFICIAL_POR_ANIMAL,
    materiais,
  }
}
