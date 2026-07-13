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
const PRECO_POR_ANIMAL = 700
const AREA_RECOMENDADA_POR_ANIMAL = 80        // m²
const CAPACIDADE_POR_COCHO = 80               // animais por cocho de 8m (16m de bandeja / 0,20m)
const METRO_LINEAR_COCHO_POR_ANIMAL = 0.20    // m
const METRO_LINEAR_BEBEDOURO_POR_ANIMAL = 0.03 // m
const ESTOQUE_AGUA_POR_ANIMAL = 100           // L
const SOBRA_ARTIFICIAL_POR_ANIMAL = 4         // m²
const POCO_ARTESIANO = 25000                  // fixo, 1x por propriedade

const CUSTOS_POR_BAIA: { nome: string; valorUnitario: number }[] = [
  { nome: 'Cocho tulha (8m)',                       valorUnitario: 9000 },
  { nome: 'Cocho bebedouro + mangueiras e boias',   valorUnitario: 3000 },
  { nome: 'Sombrite (tela + esteios)',              valorUnitario: 1300 },
  { nome: 'Sombra natural',                         valorUnitario: 2000 },
  { nome: 'Cercas',                                 valorUnitario: 5000 },
  { nome: "Caixa d'água",                           valorUnitario: 8000 },
  { nome: 'Corredor de saída do gado',              valorUnitario: 1000 },
  { nome: 'Portões',                                valorUnitario: 2000 },
]

export function calcularConfinamento(input: CalculadoraInput): CalculadoraResultado {
  const numeroAnimais = Math.max(0, Math.round(input.numeroAnimais))

  // Número de cochos de 8m necessários (cada um comporta até 80 animais)
  const numeroCochos = numeroAnimais > 0
    ? Math.max(1, Math.ceil(numeroAnimais / CAPACIDADE_POR_COCHO))
    : 0

  const materiais: MaterialItem[] = CUSTOS_POR_BAIA.map((item) => ({
    nome: item.nome,
    quantidade: numeroCochos,
    unidade: 'un',
    valorUnitario: item.valorUnitario,
    valorTotal: item.valorUnitario * numeroCochos,
  }))

  materiais.push({
    nome: 'Poço artesiano',
    quantidade: 1,
    unidade: 'un',
    valorUnitario: POCO_ARTESIANO,
    valorTotal: POCO_ARTESIANO,
  })

  const precoPorAnimal = PRECO_POR_ANIMAL
  const precoTotal = PRECO_POR_ANIMAL * numeroAnimais

  const areaRecomendada = numeroAnimais * AREA_RECOMENDADA_POR_ANIMAL
  const areaSuficiente = input.areaProdutivaReal >= areaRecomendada

  return {
    numeroCochos,
    capacidadeInstalada: numeroCochos * CAPACIDADE_POR_COCHO,
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
