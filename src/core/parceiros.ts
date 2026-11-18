// ─── Portal de parceiros: regras compartilhadas ───────────────────────────────
// Usado pelo app (confinamais.com e parceiros.confinamais.com) e pela rotina
// diária (api/parceiros-diario.ts). Quantidades do portal em kg de matéria
// natural (MN). O estoque do Confina+ é mantido em kg de MS (ver estoque.ts):
// a conversão usa o % MS do ingrediente do produtor, ou o do produto do
// fornecedor, ou 100%.
import { supabase } from './db.js'
import { toDay } from '../lib/custoAnimal.js'
import { calcularResumos, carregarEntradasIngrediente } from './estoque.js'
import { carregarFornecimentosDoUsuario } from '../lib/fornecimentosDb.js'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type PapelMembro = 'gestor' | 'vendedor'
export type ModoCliente = 'confina' | 'estoque'
export type StatusPedido = 'novo' | 'em_cotacao' | 'cotado' | 'aprovado' | 'entregue' | 'cancelado'
export type OrigemPedido = 'cliente' | 'alerta' | 'vendedor'
export type CategoriaProduto = 'racao' | 'nucleo' | 'mineral' | 'grao' | 'farelo' | 'volumoso' | 'outro' | 'dieta'

export interface Fornecedor {
  id: string
  nome: string
  opcao_integrada: boolean
  opcao_plataforma: boolean
  ativo: boolean
  email_contato: string | null
  stripe_customer_id: string | null
  stripe_subscription_id: string | null
  stripe_item_clientes_id: string | null
  cobranca_status: string | null
  clientes_cobrados: number | null
  cobranca_sincronizada_em: string | null
  created_at: string
}

export interface MembroFornecedor {
  id: string
  fornecedor_id: string
  user_id: string
  papel: PapelMembro
  nome: string | null
  email: string | null
  telefone: string | null
  ativo: boolean
}

export interface ClienteFornecedor {
  id: string
  fornecedor_id: string
  user_id: string
  vendedor_id: string | null
  modo: ModoCliente
  nome_fazenda: string | null
  responsavel: string | null
  email: string | null
  telefone: string | null
  municipio: string | null
  uf: string | null
  janela_consumo_dias: number
  cabecas: number | null
  dietas_em_uso: string[] | null
  resumo_atualizado_em: string | null
  ativo: boolean
  created_at: string
  rota_id: string | null
  endereco_entrega: string | null
  link_maps: string | null
}

export interface ConviteFornecedor {
  id: string
  fornecedor_id: string
  email: string
  nome: string | null
  papel: PapelMembro | 'cliente'
  modo: ModoCliente | null
  vendedor_id: string | null
  token: string
  enviado_em: string | null
  aceito_em: string | null
  expira_em: string
  created_at: string
}

export interface ProdutoFornecedor {
  id: string
  fornecedor_id: string
  nome: string
  categoria: CategoriaProduto
  tipo_dieta: 'concentrado' | 'volumoso'
  embalagem: string | null
  peso_embalagem_kg: number | null
  pedido_minimo_kg: number | null
  prazo_entrega_dias: number | null
  regiao: string | null
  pct_ms: number | null
  visivel: boolean
  dias_alerta: number
  kg_minimo_alerta: number | null
  // Dieta (categoria 'dieta'): ração pronta (vendida como produto) ou receita.
  modo_dieta: 'pronta' | 'receita' | null
  descricao: string | null
  ciclo_recomendado: number | null
  gmd_esperado: number | null
  gmd_esperado_concentrado: number | null
  pct_consumo_pv_ms: number | null
  pct_concentrado: number | null
  pct_volumoso: number | null
  nutricional: Nutricional | null
  especies: Especie[]
}

// Espécies a que o produto ou a dieta se destina. O produtor do Confina+
// (bovino de corte) só vê o que inclui bovino de corte.
export type Especie = 'bovino_corte' | 'bovino_leite' | 'suino' | 'ovino' | 'equino' | 'aves'
export const ESPECIES: Especie[] = ['bovino_corte', 'bovino_leite', 'suino', 'ovino', 'equino', 'aves']
export const ROTULO_ESPECIE: Record<Especie, string> = {
  bovino_corte: 'Bovino corte', bovino_leite: 'Bovino leite', suino: 'Suíno', ovino: 'Ovino', equino: 'Equino', aves: 'Aves',
}
export const paraConfina = (p: Pick<ProdutoFornecedor, 'especies'>) => (p.especies ?? ['bovino_corte']).includes('bovino_corte')

// Níveis nutricionais da dieta (% da MS; ionóforo em texto livre).
export interface Nutricional {
  pb?: number | null; ndt?: number | null; ca?: number | null; p?: number | null
  na?: number | null; fdn?: number | null; ee?: number | null; ionoforo?: string | null
}
export const CAMPOS_NUTRICIONAIS: Array<[keyof Nutricional, string]> = [
  ['pb', 'PB (%)'], ['ndt', 'NDT (%)'], ['ca', 'Ca (%)'], ['p', 'P (%)'], ['na', 'Na (%)'], ['fdn', 'FDN (%)'], ['ee', 'EE (%)'],
]

// Item da composição da dieta (preço só para a equipe do fornecedor).
export interface ItemDieta {
  id?: string
  origem: 'produto' | 'insumo_padrao' | 'livre'
  produto_id: string | null
  insumo_id: string | null
  nome: string | null
  tipo: 'concentrado' | 'volumoso'
  pct_participacao: number
  pct_ms: number | null
  preco_kg: number | null
  ordem?: number
}

// Produto que pode ser pedido e ter estoque: tudo menos dieta-receita.
export const vendavel = (p: Pick<ProdutoFornecedor, 'categoria' | 'modo_dieta'>) =>
  p.categoria !== 'dieta' || p.modo_dieta === 'pronta'

// Custo por kg de MS da dieta: cada lado (concentrado e volumoso) é a média
// de R$/kg MS dos itens (preço por kg MN / % MS), ponderada pela participação.
// Null quando falta preço ou % MS em algum item com participação.
export function custoKgMsDieta(pctConcentrado: number, pctVolumoso: number, itens: ItemDieta[]): number | null {
  let total = 0
  for (const [tipo, pctLado] of [['concentrado', pctConcentrado], ['volumoso', pctVolumoso]] as const) {
    if (!(pctLado > 0)) continue
    let lado = 0
    for (const i of itens.filter(x => x.tipo === tipo && x.pct_participacao > 0)) {
      if (i.preco_kg == null || !(Number(i.pct_ms) > 0)) return null
      lado += (i.pct_participacao / 100) * (Number(i.preco_kg) / (Number(i.pct_ms) / 100))
    }
    total += (pctLado / 100) * lado
  }
  return Math.round(total * 10000) / 10000
}

// % MS da mistura de um lado da dieta (participações em base MS).
export function pctMsMistura(itens: ItemDieta[], tipo: 'concentrado' | 'volumoso'): number | null {
  const lado = itens.filter(i => i.tipo === tipo && i.pct_participacao > 0)
  if (lado.length === 0 || lado.some(i => !(Number(i.pct_ms) > 0))) return null
  const soma = lado.reduce((s, i) => s + i.pct_participacao, 0)
  const mn = lado.reduce((s, i) => s + i.pct_participacao / Number(i.pct_ms), 0)
  return Math.round((soma / mn) * 10) / 10
}

// Dieta como o cliente vê (sem preço), via dietas_fornecedor_publicadas().
export interface DietaPublicada {
  id: string
  nome: string
  descricao: string | null
  modo_dieta: 'pronta' | 'receita'
  ciclo_recomendado: number | null
  gmd_esperado: number | null
  gmd_esperado_concentrado: number | null
  pct_consumo_pv_ms: number | null
  pct_concentrado: number | null
  pct_volumoso: number | null
  pct_ms: number | null
  nutricional: Nutricional | null
  embalagem: string | null
  itens: Array<{
    origem: ItemDieta['origem']; produto_id: string | null; insumo_id: string | null; tipo: 'concentrado' | 'volumoso'
    pct_participacao: number; pct_ms: number | null; nome: string; categoria: string | null
  }>
}

export interface EstoqueCliente {
  id?: string
  cliente_id: string
  produto_id: string
  saldo_kg: number | null
  consumo_dia_kg: number | null
  consumo_previsto_dia_kg: number | null
  consumo_real_dia_kg: number | null
  dias_cobertura: number | null
  data_fim: string | null
  atualizado_em?: string
}

export interface MovimentoEstoque {
  id: string
  user_id: string
  produto_id: string
  tipo: 'entrada' | 'baixa' | 'ajuste'
  data: string
  quantidade_kg: number
  observacoes: string | null
  created_at: string
  automatico: boolean
  criado_por: string | null
  pedido_id: string | null
}

// Consumo informado por produto (kg de MN por dia; unidade só para exibição).
export interface ConsumoInformado {
  id?: string
  cliente_id: string
  produto_id: string
  kg_dia: number
  unidade: UnidadeConsumo
  vigente_desde: string
  atualizado_em?: string
}
export type UnidadeConsumo = 'dia' | 'semana' | 'mes'
export const DIAS_UNIDADE: Record<UnidadeConsumo, number> = { dia: 1, semana: 7, mes: 30 }
export const ROTULO_UNIDADE: Record<UnidadeConsumo, string> = { dia: 'dia', semana: 'semana', mes: 'mês' }

export interface RotaEntrega {
  id: string
  fornecedor_id: string
  nome: string
  municipios: string[]
}

export interface PedidoFornecedor {
  id: string
  numero: number
  fornecedor_id: string
  cliente_id: string
  vendedor_id: string | null
  produto_id: string | null
  produto_nome: string | null
  origem: OrigemPedido
  status: StatusPedido
  quantidade_kg: number | null
  data_entrega: string | null
  observacoes: string | null
  estoque_info: { saldo_kg?: number | null; consumo_dia_kg?: number | null; data_fim?: string | null; dias_cobertura?: number | null } | null
  preco_kg: number | null
  valor_total: number | null
  resposta: string | null
  notificado_em: string | null
  estoque_lancado_em: string | null
  rota_entrega_id: string | null
  created_at: string
  updated_at: string
}

// ─── Rótulos ──────────────────────────────────────────────────────────────────

export const ROTULO_STATUS: Record<StatusPedido, string> = {
  novo: 'Novo', em_cotacao: 'Em cotação', cotado: 'Cotado', aprovado: 'Aprovado', entregue: 'Entregue', cancelado: 'Cancelado',
}
export const CLASSE_STATUS: Record<StatusPedido, string> = {
  novo: 'badge-blue', em_cotacao: 'badge-amber', cotado: 'badge-amber', aprovado: 'badge-green', entregue: 'badge-gray', cancelado: 'badge-gray',
}
export const ROTULO_ORIGEM: Record<OrigemPedido, string> = {
  cliente: 'Solicitação do cliente', alerta: 'Alerta de estoque', vendedor: 'Lançado pelo vendedor',
}
export const ROTULO_CATEGORIA: Record<CategoriaProduto, string> = {
  racao: 'Ração', nucleo: 'Núcleo', mineral: 'Mineral', grao: 'Grão', farelo: 'Farelo', volumoso: 'Volumoso', outro: 'Outro', dieta: 'Dieta',
}
// Categoria do ingrediente no cadastro do produtor (ingredientes_produtor).
export const CATEGORIA_INGREDIENTE: Record<CategoriaProduto, string> = {
  racao: 'concentrado_energetico', nucleo: 'mineral_aditivo', mineral: 'mineral_aditivo', grao: 'concentrado_energetico',
  farelo: 'concentrado_proteico', volumoso: 'volumoso', outro: 'subproduto', dieta: 'concentrado_energetico',
}

// ─── Datas e previsão ─────────────────────────────────────────────────────────

export const hojeISO = () => new Date().toISOString().slice(0, 10)

export function somarDias(iso: string, dias: number): string {
  const d = new Date(iso.slice(0, 10) + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

// Dias de cobertura e data prevista de fim do estoque. Sem saldo conhecido
// ou sem consumo, não há previsão.
export function previsaoFim(saldoKg: number | null, consumoDiaKg: number | null, hoje = hojeISO()): { dias_cobertura: number | null; data_fim: string | null } {
  if (saldoKg == null || consumoDiaKg == null || !(consumoDiaKg > 0)) return { dias_cobertura: null, data_fim: null }
  const dias = Math.max(0, saldoKg) / consumoDiaKg
  return { dias_cobertura: Math.round(dias * 10) / 10, data_fim: somarDias(hoje, Math.floor(dias)) }
}

// Produto em alerta: cobertura abaixo dos dias de alerta do produto, ou
// saldo abaixo do kg mínimo configurado. Sem saldo conhecido, sem alerta.
export function emAlerta(produto: Pick<ProdutoFornecedor, 'dias_alerta' | 'kg_minimo_alerta'>, est: Pick<EstoqueCliente, 'saldo_kg' | 'dias_cobertura'> | undefined): boolean {
  if (!est || est.saldo_kg == null) return false
  if (est.dias_cobertura != null && est.dias_cobertura < produto.dias_alerta) return true
  if (produto.kg_minimo_alerta != null && est.saldo_kg < produto.kg_minimo_alerta) return true
  return false
}

// Quantidade sugerida para cobrir N dias de consumo, arredondada para cima
// em embalagens e respeitando o pedido mínimo.
export function quantidadeSugerida(produto: Pick<ProdutoFornecedor, 'peso_embalagem_kg' | 'pedido_minimo_kg'>, consumoDiaKg: number | null, dias: number): number {
  let q = consumoDiaKg != null && consumoDiaKg > 0 ? consumoDiaKg * dias : 0
  if (produto.peso_embalagem_kg && produto.peso_embalagem_kg > 0 && q > 0) q = Math.ceil(q / produto.peso_embalagem_kg) * produto.peso_embalagem_kg
  if (produto.pedido_minimo_kg && q < produto.pedido_minimo_kg) q = produto.pedido_minimo_kg
  return Math.round(q)
}

// Data de entrega sugerida: um dia antes do fim previsto, nunca antes de
// hoje mais o prazo de entrega do produto.
export function dataEntregaSugerida(produto: Pick<ProdutoFornecedor, 'prazo_entrega_dias'>, dataFim: string | null, hoje = hojeISO()): string {
  const minima = somarDias(hoje, produto.prazo_entrega_dias ?? 0)
  if (!dataFim) return minima
  const antes = somarDias(dataFim, -1)
  return antes < minima ? minima : antes
}

// ─── Conta só de estoque ──────────────────────────────────────────────────────

export type OrigemConsumo = 'baixas' | 'informado' | null

export interface ResumoSimples { saldo_kg: number | null; consumo_dia_kg: number; origem: OrigemConsumo }

// Saldo pelos movimentos (entrada soma, baixa subtrai, ajuste substitui o
// saldo pelo contado). Consumo para a previsão:
//  - com baixas lançadas à mão na janela: média delas;
//  - senão, o consumo informado do produto;
//  - senão, a média das baixas (automáticas) da janela.
export function resumoEstoqueSimples(
  movimentos: MovimentoEstoque[], janelaDias: number, hoje = hojeISO(), informados: Record<string, number> = {},
): Record<string, ResumoSimples> {
  const porProduto: Record<string, MovimentoEstoque[]> = {}
  for (const m of movimentos) (porProduto[m.produto_id] ??= []).push(m)
  const inicioJanela = somarDias(hoje, -(janelaDias - 1))
  const ordemTipo = { entrada: 0, baixa: 1, ajuste: 2 } as const
  const resultado: Record<string, ResumoSimples> = {}
  const ids = new Set([...Object.keys(porProduto), ...Object.keys(informados)])
  for (const produtoId of ids) {
    const lista = porProduto[produtoId] ?? []
    const ordenada = [...lista].sort((a, b) => a.data.localeCompare(b.data) || ordemTipo[a.tipo] - ordemTipo[b.tipo] || a.created_at.localeCompare(b.created_at))
    let saldo = 0
    let manuais = 0
    let todas = 0
    for (const m of ordenada) {
      if (m.data > hoje) continue
      const q = Number(m.quantidade_kg)
      if (m.tipo === 'entrada') saldo += q
      else if (m.tipo === 'baixa') {
        saldo -= q
        if (m.data >= inicioJanela) { todas += q; if (!m.automatico) manuais += q }
      } else saldo = q
    }
    let consumo = 0
    let origem: OrigemConsumo = null
    if (manuais > 0) { consumo = manuais / janelaDias; origem = 'baixas' }
    else if (informados[produtoId] != null) { consumo = informados[produtoId]; origem = 'informado' }
    else if (todas > 0) { consumo = todas / janelaDias; origem = 'baixas' }
    resultado[produtoId] = { saldo_kg: lista.length > 0 ? Math.round(saldo * 100) / 100 : null, consumo_dia_kg: consumo, origem }
  }
  return resultado
}

// Baixas automáticas pelo consumo informado, do último dia com baixa
// automática (ou do início da vigência) até hoje, no máximo 30 dias para
// trás. Não gera quando há baixa lançada à mão na janela, nem abaixo de zero.
export function gerarBaixasAutomaticas(
  movimentos: MovimentoEstoque[], informados: ConsumoInformado[], janelaDias: number, hoje = hojeISO(),
): Array<{ produto_id: string; data: string; quantidade_kg: number }> {
  const inicioJanela = somarDias(hoje, -(janelaDias - 1))
  const saida: Array<{ produto_id: string; data: string; quantidade_kg: number }> = []
  for (const inf of informados) {
    if (!(inf.kg_dia > 0)) continue
    const doProduto = movimentos.filter(m => m.produto_id === inf.produto_id)
    if (doProduto.length === 0) continue
    if (doProduto.some(m => m.tipo === 'baixa' && !m.automatico && m.data >= inicioJanela && m.data <= hoje)) continue
    const ultimaAuto = doProduto.filter(m => m.automatico).map(m => m.data).sort().pop()
    let dia = [ultimaAuto ? somarDias(ultimaAuto, 1) : inf.vigente_desde, inf.vigente_desde, somarDias(hoje, -29)].sort().pop() as string
    let saldo = resumoEstoqueSimples(doProduto, janelaDias, somarDias(dia, -1))[inf.produto_id]?.saldo_kg ?? 0
    // movimentos posteriores a "dia" entram na conta dia a dia
    while (dia <= hoje) {
      const doDia = doProduto.filter(m => m.data === dia)
      for (const m of doDia) {
        if (m.tipo === 'entrada') saldo += Number(m.quantidade_kg)
        else if (m.tipo === 'baixa') saldo -= Number(m.quantidade_kg)
        else saldo = Number(m.quantidade_kg)
      }
      const q = Math.min(inf.kg_dia, Math.max(0, saldo))
      if (q > 0) { saida.push({ produto_id: inf.produto_id, data: dia, quantidade_kg: Math.round(q * 100) / 100 }); saldo -= q }
      dia = somarDias(dia, 1)
    }
  }
  return saida
}

export async function carregarConsumoInformado(clienteId: string): Promise<ConsumoInformado[]> {
  const { data } = await supabase.from('fornecedor_consumo_informado').select('*').eq('cliente_id', clienteId)
  return (data ?? []) as ConsumoInformado[]
}

export async function carregarMovimentos(userId: string): Promise<MovimentoEstoque[]> {
  const lista: MovimentoEstoque[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase.from('estoque_movimentos').select('*')
      .eq('user_id', userId).order('data', { ascending: false }).order('created_at', { ascending: false })
      .range(from, from + 999)
    if (error || !data) break
    lista.push(...(data as MovimentoEstoque[]))
    if (data.length < 1000) break
  }
  return lista
}

// ─── Cliente do Confina+ ──────────────────────────────────────────────────────

interface IngredienteVinculado { id: string; pct_ms: number | null; fornecedor_produto_id: string }

function somaJanela(porDia: Record<number, number> | undefined, hojeDia: number, janela: number): number {
  if (!porDia) return 0
  let s = 0
  for (let d = hojeDia - janela + 1; d <= hojeDia; d++) s += porDia[d] ?? 0
  return s
}

// Estoque dos produtos do fornecedor na conta do Confina+: saldo do kardex
// de ingredientes (ver estoque.ts) e consumo médio da janela, convertidos
// para kg de MN. Previsto = consumo teórico das dietas; realizado =
// fornecimentos de ração feita na fazenda registrados na janela (só existe
// quando o produtor registra fornecimentos).
export async function calcularEstoqueClienteConfina(
  userId: string, cliente: Pick<ClienteFornecedor, 'id' | 'janela_consumo_dias'>, produtos: ProdutoFornecedor[], hoje = hojeISO(),
): Promise<EstoqueCliente[]> {
  const { data: ingData } = await supabase.from('ingredientes_produtor')
    .select('id, pct_ms, fornecedor_produto_id').eq('user_id', userId).not('fornecedor_produto_id', 'is', null)
  const ingredientes = (ingData ?? []) as IngredienteVinculado[]
  if (ingredientes.length === 0) return []
  const produtoPorId = new Map(produtos.map(p => [p.id, p]))
  const janela = cliente.janela_consumo_dias || 7
  const hojeDia = toDay(hoje)

  const entradas = await carregarEntradasIngrediente(userId)
  const resumos = await calcularResumos(userId, entradas)

  // Realizado: itens de fornecimentos "feita na fazenda" na janela (kg MN).
  const idsIngredientes = new Set(ingredientes.map(i => i.id))
  const realPorIngrediente: Record<string, number> = {}
  const fornecimentos = await carregarFornecimentosDoUsuario(userId)
  for (const f of fornecimentos) {
    if (f.modo !== 'feita_na_fazenda') continue
    const dia = toDay(f.data)
    if (dia > hojeDia || dia < hojeDia - janela + 1) continue
    for (const item of f.itens) {
      const [origem, id] = item.chave.split(':')
      if (origem !== 'ingrediente_produtor' || !idsIngredientes.has(id)) continue
      realPorIngrediente[id] = (realPorIngrediente[id] ?? 0) + item.kg
    }
  }
  const temRealizado = Object.keys(realPorIngrediente).length > 0
  const teoricos = temRealizado ? await calcularResumos(userId, entradas, { somenteTeorico: true }) : null

  const linhas: EstoqueCliente[] = []
  for (const ing of ingredientes) {
    const produto = produtoPorId.get(ing.fornecedor_produto_id)
    if (!produto) continue
    const chave = `ingrediente_produtor:${ing.id}`
    const pct = (ing.pct_ms ?? produto.pct_ms ?? 100) / 100
    const r = resumos[chave]
    const saldo = r ? r.saldoKg / pct : null
    const consumoMs = somaJanela(r?.consumoPorDia, hojeDia, janela) / janela
    const consumo = r ? consumoMs / pct : null
    const previstoMs = teoricos ? somaJanela(teoricos[chave]?.consumoPorDia, hojeDia, janela) / janela : null
    const real = realPorIngrediente[ing.id] != null ? realPorIngrediente[ing.id] / janela : null
    const prev = previsaoFim(saldo, consumo, hoje)
    linhas.push({
      cliente_id: cliente.id,
      produto_id: produto.id,
      saldo_kg: saldo != null ? Math.round(saldo * 10) / 10 : null,
      consumo_dia_kg: consumo != null ? Math.round(consumo * 10) / 10 : null,
      consumo_previsto_dia_kg: previstoMs != null ? Math.round(previstoMs / pct * 10) / 10 : null,
      consumo_real_dia_kg: real != null ? Math.round(real * 10) / 10 : null,
      ...prev,
    })
  }
  return linhas
}

// Cabeças nos lotes ativos cujo ciclo atual usa uma dieta criada a partir de
// uma dieta do fornecedor, e quais dietas do fornecedor estão em uso.
export async function calcularUsoDietas(userId: string): Promise<{ cabecas: number; dietas: string[] }> {
  const { data: dietas } = await supabase.from('dietas').select('id, fornecedor_dieta_id')
    .eq('user_id', userId).not('fornecedor_dieta_id', 'is', null)
  const lista = (dietas ?? []) as Array<{ id: string; fornecedor_dieta_id: string }>
  if (lista.length === 0) return { cabecas: 0, dietas: [] }
  const fornecedorDaDieta = new Map(lista.map(d => [d.id, d.fornecedor_dieta_id]))
  const { data: lotes } = await supabase.from('lotes').select('id, ciclo_atual').eq('user_id', userId).eq('status', 'ativo')
  const lotesAtivos = (lotes ?? []) as Array<{ id: string; ciclo_atual: number | null }>
  if (lotesAtivos.length === 0) return { cabecas: 0, dietas: [] }
  const { data: ciclos } = await supabase.from('ciclos_lote').select('lote_id, numero, dieta_id')
    .eq('user_id', userId).in('dieta_id', lista.map(d => d.id))
  const cicloAtual = new Map(lotesAtivos.map(l => [l.id, l.ciclo_atual]))
  const lotesUsando = new Set<string>()
  const emUso = new Set<string>()
  for (const c of (ciclos ?? []) as Array<{ lote_id: string; numero: number; dieta_id: string }>) {
    if (!cicloAtual.has(c.lote_id) || cicloAtual.get(c.lote_id) !== c.numero) continue
    lotesUsando.add(c.lote_id)
    const fd = fornecedorDaDieta.get(c.dieta_id)
    if (fd) emUso.add(fd)
  }
  if (lotesUsando.size === 0) return { cabecas: 0, dietas: [] }
  const { count } = await supabase.from('animais').select('id', { count: 'exact', head: true })
    .eq('user_id', userId).eq('status', 'ativo').in('lote_atual_id', Array.from(lotesUsando))
  return { cabecas: count ?? 0, dietas: Array.from(emUso) }
}

// Estoque da conta só de estoque, no mesmo formato.
export function calcularEstoqueClienteSimples(
  cliente: Pick<ClienteFornecedor, 'id' | 'janela_consumo_dias'>, movimentos: MovimentoEstoque[], hoje = hojeISO(),
  informados: ConsumoInformado[] = [],
): EstoqueCliente[] {
  const mapa = Object.fromEntries(informados.map(i => [i.produto_id, Number(i.kg_dia)]))
  const resumo = resumoEstoqueSimples(movimentos, cliente.janela_consumo_dias || 7, hoje, mapa)
  return Object.entries(resumo).map(([produtoId, r]) => {
    const consumo = r.consumo_dia_kg > 0 ? Math.round(r.consumo_dia_kg * 10) / 10 : 0
    return {
      cliente_id: cliente.id, produto_id: produtoId,
      saldo_kg: r.saldo_kg, consumo_dia_kg: consumo,
      consumo_previsto_dia_kg: mapa[produtoId] ?? null, consumo_real_dia_kg: r.origem === 'baixas' ? consumo : null,
      ...previsaoFim(r.saldo_kg, consumo, hoje),
    }
  })
}

// Grava o resumo do cliente (estoque por produto e uso das dietas) para o
// portal do vendedor.
export async function gravarResumoCliente(
  cliente: Pick<ClienteFornecedor, 'id'>, linhas: EstoqueCliente[], uso: { cabecas: number; dietas: string[] } | null,
): Promise<{ error: string | null }> {
  const agora = new Date().toISOString()
  if (linhas.length > 0) {
    const { error } = await supabase.from('fornecedor_estoque').upsert(
      linhas.map(l => ({ ...l, atualizado_em: agora })), { onConflict: 'cliente_id,produto_id' },
    )
    if (error) return { error: error.message }
  }
  const patch: Record<string, unknown> = { resumo_atualizado_em: agora }
  if (uso) { patch.cabecas = uso.cabecas; patch.dietas_em_uso = uso.dietas }
  const { error } = await supabase.from('fornecedor_clientes').update(patch).eq('id', cliente.id)
  return { error: error?.message ?? null }
}

// Recalcula e grava o resumo do cliente, conforme o tipo de conta.
export async function atualizarResumoCliente(
  userId: string, cliente: ClienteFornecedor, produtos: ProdutoFornecedor[],
): Promise<{ linhas: EstoqueCliente[]; error: string | null }> {
  if (cliente.modo === 'estoque') {
    const [movimentos, informados] = await Promise.all([carregarMovimentos(userId), carregarConsumoInformado(cliente.id)])
    const linhas = calcularEstoqueClienteSimples(cliente, movimentos, hojeISO(), informados)
    const r = await gravarResumoCliente(cliente, linhas, null)
    return { linhas, error: r.error }
  }
  const [linhas, uso] = await Promise.all([
    calcularEstoqueClienteConfina(userId, cliente, produtos),
    calcularUsoDietas(userId),
  ])
  const r = await gravarResumoCliente(cliente, linhas, uso)
  return { linhas, error: r.error }
}

// ─── Leituras do cliente ──────────────────────────────────────────────────────

export interface VinculoCliente {
  cliente: ClienteFornecedor
  fornecedor: Pick<Fornecedor, 'id' | 'nome'>
  vendedor: Pick<MembroFornecedor, 'id' | 'nome' | 'telefone' | 'email'> | null
  produtos: ProdutoFornecedor[]
}

export async function carregarVinculoCliente(userId: string): Promise<VinculoCliente | null> {
  const { data: c } = await supabase.from('fornecedor_clientes').select('*').eq('user_id', userId).eq('ativo', true).maybeSingle()
  if (!c) return null
  const cliente = c as ClienteFornecedor
  const [{ data: f }, { data: prods }, vend] = await Promise.all([
    supabase.from('fornecedores').select('id, nome').eq('id', cliente.fornecedor_id).maybeSingle(),
    supabase.from('fornecedor_produtos').select('*').eq('fornecedor_id', cliente.fornecedor_id).order('nome'),
    cliente.vendedor_id
      ? supabase.from('fornecedor_membros').select('id, nome, telefone, email').eq('id', cliente.vendedor_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  if (!f) return null
  return {
    cliente,
    fornecedor: f as Pick<Fornecedor, 'id' | 'nome'>,
    vendedor: (vend.data ?? null) as VinculoCliente['vendedor'],
    // Cliente do Confina+ (bovino de corte) só vê produtos e dietas de bovino de corte
    produtos: ((prods ?? []) as ProdutoFornecedor[]).filter(p => cliente.modo !== 'confina' || paraConfina(p)),
  }
}

export async function carregarPedidosCliente(clienteId: string): Promise<PedidoFornecedor[]> {
  const { data } = await supabase.from('fornecedor_pedidos').select('*').eq('cliente_id', clienteId)
    .order('created_at', { ascending: false }).limit(200)
  return (data ?? []) as PedidoFornecedor[]
}

export interface NovoPedidoInput {
  cliente_id: string
  produto_id: string
  quantidade_kg: number
  data_entrega: string
  observacoes?: string
  estoque_info?: PedidoFornecedor['estoque_info']
  origem?: 'cliente' | 'vendedor'
}

export async function criarPedido(input: NovoPedidoInput): Promise<{ error: string | null; pedido?: PedidoFornecedor }> {
  if (!(input.quantidade_kg > 0)) return { error: 'Informe a quantidade' }
  if (!input.data_entrega) return { error: 'Informe a data de entrega' }
  const { data, error } = await supabase.from('fornecedor_pedidos').insert({
    cliente_id: input.cliente_id,
    // Preenchido pelo gatilho a partir do vínculo do cliente.
    fornecedor_id: '00000000-0000-0000-0000-000000000000',
    produto_id: input.produto_id,
    origem: input.origem ?? 'cliente',
    status: 'novo',
    quantidade_kg: input.quantidade_kg,
    data_entrega: input.data_entrega,
    observacoes: input.observacoes || null,
    estoque_info: input.estoque_info ?? null,
  }).select().single()
  if (error) return { error: error.message }
  return { error: null, pedido: data as PedidoFornecedor }
}

// ─── WhatsApp ─────────────────────────────────────────────────────────────────

// Link wa.me com a mensagem pronta. Telefone brasileiro sem DDI ganha 55.
export function linkWhatsApp(telefone: string | null | undefined, mensagem: string): string | null {
  const digitos = (telefone ?? '').replace(/\D/g, '')
  if (digitos.length < 10) return null
  const numero = digitos.length <= 11 ? `55${digitos}` : digitos
  return `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`
}

export const fmtKg = (v: number | null | undefined) =>
  v == null ? '—' : `${Math.round(v).toLocaleString('pt-BR')} kg`

export const fmtDataBr = (iso: string | null | undefined) =>
  iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—'

// ─── Rotas de entrega ─────────────────────────────────────────────────────────

export const normalizarMunicipio = (s: string | null | undefined) =>
  (s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim().replace(/\s+/g, ' ')

// Rota do cliente: a escolhida pelo gestor, ou a que contém o município dele.
export function rotaDoCliente(cliente: Pick<ClienteFornecedor, 'rota_id' | 'municipio'>, rotas: RotaEntrega[]): RotaEntrega | null {
  if (cliente.rota_id) return rotas.find(r => r.id === cliente.rota_id) ?? null
  const m = normalizarMunicipio(cliente.municipio)
  if (!m) return null
  return rotas.find(r => r.municipios.some(x => normalizarMunicipio(x) === m)) ?? null
}

// Rota da entrega: a escolhida só para este pedido ou a rota do cliente.
export function rotaDoPedido(pedido: Pick<PedidoFornecedor, 'rota_entrega_id'>, cliente: Pick<ClienteFornecedor, 'rota_id' | 'municipio'> | null | undefined, rotas: RotaEntrega[]): RotaEntrega | null {
  if (pedido.rota_entrega_id) return rotas.find(r => r.id === pedido.rota_entrega_id) ?? null
  return cliente ? rotaDoCliente(cliente, rotas) : null
}

// Link do Google Maps do endereço de entrega: o link colado, quando existe;
// senão, uma busca pelo endereço com município e UF. Null sem endereço.
export function linkMapsCliente(c: Pick<ClienteFornecedor, 'endereco_entrega' | 'link_maps' | 'municipio' | 'uf'> | null | undefined): string | null {
  if (!c) return null
  if (c.link_maps) return c.link_maps
  if (!c.endereco_entrega) return null
  const q = [c.endereco_entrega, c.municipio, c.uf].filter(Boolean).join(', ')
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`
}
