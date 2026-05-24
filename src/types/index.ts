export type UserRole = 'admin' | 'operador' | 'consulta'
export type LoteStatus = 'ativo' | 'encerrado'
export type AnimalStatus = 'ativo' | 'vendido' | 'abatido' | 'morto' | 'transferido'
export type MovTipo = 'entrada' | 'transferencia_lote' | 'bifurcacao' | 'saida_venda' | 'saida_abate' | 'saida_transferencia' | 'saida_morte'
export type ParceiroTipo = 'fornecedor' | 'corretor' | 'frigorifico' | 'produtor'
export type ComissaoTipo = 'corretor' | 'operador' | 'outro'
export type CustoRecorrencia = 'unico' | 'semanal' | 'quinzenal' | 'mensal'

export interface Lote {
  id: string; codigo_lote: string; nome_lote: string; data_criacao: string
  ciclo_inicial: number; ciclo_atual: number; status: LoteStatus
  lote_origem_id: string | null; user_id: string; created_at: string; updated_at: string
}

export interface Animal {
  id: string; identificacao: string; peso_entrada: number; data_entrada: string
  origem: string | null; raca: string | null; idade_estimada: number | null
  valor_compra: number; lote_atual_id: string | null; status: AnimalStatus
  user_id: string; created_at: string; updated_at: string
}

export interface Movimentacao {
  id: string; animal_id: string; tipo: MovTipo
  lote_origem_id: string | null; lote_destino_id: string | null
  data: string; peso: number | null; motivo: string | null
  valor: number | null; destino_tipo: string | null; destino_id: string | null
  observacoes: string | null; user_id: string; created_at: string
}

export interface Pesagem {
  id: string; animal_id: string; data: string; peso: number
  observacoes: string | null; user_id: string; created_at: string
}

export interface ComponenteDieta {
  componente_id: string; nome: string
  percentual_peso_corporal: number; preco_kg: number
}

export interface Dieta {
  id: string; nome: string; descricao: string | null
  componentes: ComponenteDieta[]; gmd_esperado: number
  is_template: boolean; user_id: string; created_at: string; updated_at: string
}

export interface DietaLote {
  id: string; lote_id: string; dieta_id: string; ciclo: number
  data_inicio: string; data_fim: string | null; ativa: boolean
  user_id: string; created_at: string
}

export interface ComponenteAlimentar {
  id: string; nome: string; preco_atual: number; unidade: string
  user_id: string; created_at: string; updated_at: string
}

export interface Parceiro {
  id: string; nome: string; cpf_cnpj: string | null; tipo: ParceiroTipo
  contato: string | null; endereco: string | null; observacoes: string | null
  user_id: string; created_at: string; updated_at: string
}

export interface CustoFixoLote {
  id: string; lote_id: string; descricao: string
  recorrencia: CustoRecorrencia; valor: number
  data_lancamento: string; user_id: string; created_at: string
}

export interface CustoVariavelAnimal {
  id: string; animal_id: string; descricao: string; valor: number
  data_lancamento: string; user_id: string; created_at: string
}

export interface ComissaoVenda {
  id: string; movimentacao_id: string; tipo: ComissaoTipo
  parceiro_id: string | null; descricao: string | null
  percentual: number; valor_calculado: number
  user_id: string; created_at: string
}

export interface EncargoVenda {
  id: string; movimentacao_id: string; descricao: string
  base_calculo: 'receita_bruta' | 'valor_fixo'
  percentual: number | null; valor_fixo: number | null
  valor_calculado: number; user_id: string; created_at: string
}

export interface RendimentoFaixa {
  id: string; peso_min: number; peso_max: number
  rendimento_percentual: number; user_id: string; created_at: string
}

export interface BonusFaixa {
  id: string; peso_min: number; peso_max: number
  bonus_por_kg: number; user_id: string; created_at: string
}

export interface ResultadoVenda {
  peso_final: number; ganho_total: number; dias_confinamento: number; gmd: number
  rendimento_pct: number; peso_carcaca: number; bonus_por_kg: number; valor_bonus: number
  receita_bruta: number; total_comissoes: number; total_encargos: number; receita_liquida: number
  custo_compra: number; custo_alimentacao: number; custos_variaveis: number; rateio_fixo: number
  custo_total: number; lucro: number; margem_pct: number; roi_pct: number; custo_por_kg: number
}
