export type UserRole = 'admin' | 'operador' | 'consulta'
export type LoteStatus = 'ativo' | 'encerrado'
export type AnimalStatus = 'ativo' | 'vendido' | 'abatido' | 'morto' | 'transferido'
export type MovTipo =
  | 'entrada' | 'transferencia_lote' | 'bifurcacao'
  | 'saida_venda' | 'saida_abate' | 'saida_transferencia' | 'saida_morte'
export type ParceiroTipo = 'fornecedor' | 'corretor' | 'frigorifico' | 'produtor'
export type ComissaoTipo = 'corretor' | 'operador' | 'outro'
export type CategoriaCustoOperacional = 'sanitario' | 'maquinario' | 'mao_de_obra' | 'medicamentos' | 'outros'
export type MotivoEncerramento = 'venda' | 'extincao' | 'outro'
export type SaidaTipo = 'venda' | 'abate' | 'transferencia' | 'morte'
export type SaidaModo = 'peso_proprio' | 'peso_carga'
export type TipoCiclo = 'pastagem' | 'confinamento'

export interface Lote {
  id: string
  codigo_lote: string
  nome_lote: string
  prefixo: string
  data_criacao: string
  ciclo_atual: number
  num_ciclos: number
  status: LoteStatus
  preco_kg_compra: number | null
  origem_fazenda: string | null
  origem_municipio: string | null
  origem_estado: string | null
  raca_predominante: string | null
  observacoes: string | null
  preco_venda_esperado_kg: number | null
  peso_maximo_acabamento: number | null
  pct_comissao_esperada: number | null
  pct_encargo_esperado: number | null
  motivo_encerramento: MotivoEncerramento | null
  motivo_encerramento_obs: string | null
  lote_origem_id: string | null
  user_id: string
  created_at: string
  updated_at: string
}

export interface CicloLote {
  id: string
  lote_id: string
  numero: number
  nome: string
  tipo_ciclo: TipoCiclo
  dias_planejados: number
  dieta_id: string | null
  gmd_esperado: number | null
  data_inicio: string | null
  data_fim: string | null
  user_id: string
  created_at: string
}

export interface Animal {
  id: string
  codigo: string
  brinco: string
  peso_entrada: number
  data_entrada: string
  origem: string | null
  raca: string | null
  idade_estimada: number | null
  valor_compra: number
  preco_kg_compra_no_lote: number | null
  compra_id: string | null
  lote_atual_id: string | null
  status: AnimalStatus
  user_id: string
  created_at: string
  updated_at: string
}

export interface Movimentacao {
  id: string
  animal_id: string
  tipo: MovTipo
  lote_origem_id: string | null
  lote_destino_id: string | null
  data: string
  peso: number | null
  motivo: string | null
  valor: number | null
  destino_tipo: string | null
  destino_id: string | null
  observacoes: string | null
  grupo_evento_id: string | null
  saida_grupo_id: string | null
  custo_atribuido: number | null
  lucro: number | null
  user_id: string
  created_at: string
}

export interface Pesagem {
  id: string
  animal_id: string
  data: string
  peso: number
  observacoes: string | null
  user_id: string
  created_at: string
}

export interface SaidaGrupo {
  id: string
  data: string
  tipo: SaidaTipo
  modo: SaidaModo
  valor_total: number | null
  peso_total_vivo: number | null
  peso_total_carcaca: number | null
  destino_tipo: string | null
  destino_id: string | null
  observacoes: string | null
  custo_compra_total: number | null
  custo_alimentacao_total: number | null
  custos_variaveis_total: number | null
  custos_fixos_rateados: number | null
  // Quebra pastagem x confinamento — nullable porque vendas antigas (antes
  // desta coluna existir) não têm esse detalhe, só o total acima.
  custo_alimentacao_pastagem_total: number | null
  custo_alimentacao_confinamento_total: number | null
  custo_operacional_pastagem_total: number | null
  custo_operacional_confinamento_total: number | null
  ganho_peso_pastagem_total: number | null
  ganho_peso_confinamento_total: number | null
  total_comissoes: number | null
  total_encargos: number | null
  receita_bruta: number | null
  receita_liquida: number | null
  lucro_total: number | null
  margem_pct: number | null
  user_id: string
  created_at: string
}

export interface ComissaoVenda {
  id: string
  saida_grupo_id: string
  tipo: ComissaoTipo
  parceiro_id: string | null
  descricao: string | null
  percentual: number
  valor_calculado: number
  user_id: string
  created_at: string
}

export interface EncargoVenda {
  id: string
  saida_grupo_id: string
  descricao: string
  base_calculo: 'receita_bruta' | 'valor_fixo'
  percentual: number | null
  valor_fixo: number | null
  valor_calculado: number
  user_id: string
  created_at: string
}

export interface CustoVariavelAnimal {
  id: string
  animal_id: string
  descricao: string
  valor: number
  data_lancamento: string
  user_id: string
  created_at: string
}

export interface CustoOperacionalLote {
  id: string
  lote_id: string
  categoria: CategoriaCustoOperacional
  descricao: string | null
  valor: number
  data_lancamento: string
  user_id: string
  created_at: string
}

// ─── Custo real de ração do lote ───────────────────────────────────────────
// Recalibra o custo de alimentação estimado pelo motor (dieta x %MS x custo/kg)
// com o valor real gasto pelo produtor. Vale a partir de data_inicio até o
// próximo lançamento (ou até hoje, se for o mais recente) — mesma ideia de
// uma pesagem reiniciar a base do peso, mas para o custo de ração.
export interface CustoRacaoRealLote {
  id: string
  lote_id: string
  data_inicio: string
  valor_total: number
  observacoes: string | null
  user_id: string
  created_at: string
}

export interface DietaHistoricoCusto {
  id: string
  dieta_id: string
  custo_kg_ms: number | null
  vigente_desde: string
  vigente_ate: string | null
  user_id: string
}

export interface Compra {
  id: string
  lote_id: string
  parceiro_id: string | null
  origem_texto: string | null
  data: string
  preco_kg: number
  quantidade_animais: number
  peso_total: number
  valor_total: number
  observacoes: string | null
  user_id: string
  created_at: string
}

export interface Parceiro {
  id: string
  nome: string
  cpf_cnpj: string | null
  tipo: ParceiroTipo
  contato: string | null
  endereco: string | null
  observacoes: string | null
  user_id: string
  created_at: string
  updated_at: string
}

export interface RendimentoFaixa {
  id: string
  peso_min: number
  peso_max: number
  rendimento_percentual: number
  user_id: string
  created_at: string
}

export interface BonusFaixa {
  id: string
  peso_min: number
  peso_max: number
  bonus_por_kg: number
  user_id: string
  created_at: string
}

// ─── Resultado de venda (por animal, dentro de uma saída em grupo) ────────────
export interface ResultadoVendaAnimal {
  animal_id: string
  peso_vivo: number
  rendimento_pct: number
  peso_carcaca: number
  share_pct: number          // participação desse animal na carcaça total do grupo
  receita_bruta: number
  comissao: number
  encargo: number
  receita_liquida: number
  custo_compra: number
  custo_alimentacao: number
  custos_variaveis: number
  custos_fixos_rateados: number
  custo_total: number
  lucro: number
  margem_pct: number
  dias_confinamento: number
  gmd_medio: number
}
