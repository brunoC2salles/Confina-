// ─── Ferramentas do servidor MCP do Confina+ ──────────────────────────────────
// Cada ferramenta chama as mesmas funções de src/core usadas pelo app — nenhuma
// regra de negócio é reimplementada aqui. O usuário vem do token OAuth (ver
// api/mcp.ts) e o banco é acessado com esse token, então o RLS vale como no app.
// Imports relativos com extensão .js: exigência das funções Node do Vercel.
import * as lotes from '../core/lotes.js'
import * as dietas from '../core/dietas.js'
import * as cadastros from '../core/cadastros.js'
import * as rateio from '../core/comprasRateio.js'
import * as estoque from '../core/estoque.js'
import * as fornecimentos from '../core/fornecimentos.js'
import * as grupos from '../core/gruposConsumo.js'
import * as analises from '../core/analises.js'
import { ajudaEmTexto, SECOES_AJUDA } from '../core/ajuda.js'
import { supabase } from '../core/db.js'
import { calcularCenario, dadosIniciais, cicloVazio } from '../lib/simulador.js'
import type { SimDados } from '../lib/simulador'
import type { CompraIngrediente, Parceiro, RendimentoFaixa, BonusFaixa } from '../types'
import { s, type Esquema } from './esquema.js'

export interface ContextoFerramenta {
  userId: string
}

export interface Ferramenta {
  name: string
  title: string
  description: string
  inputSchema: Esquema
  // somenteLeitura: não grava nada. destrutiva: apaga ou sobrescreve dados.
  somenteLeitura: boolean
  destrutiva: boolean
  executar: (args: any, ctx: ContextoFerramenta) => Promise<unknown>
}

// Erro de regra de negócio ou de entrada: volta ao modelo como resultado com
// isError, para ele explicar ao produtor ou corrigir a chamada.
export class ErroFerramenta extends Error {}

const hoje = () => new Date().toISOString().slice(0, 10)

function falhou(res: { error: string | null }): void {
  if (res.error) throw new ErroFerramenta(res.error)
}

function exigirConfirmacao(args: { confirmar?: boolean }, oQue: string): void {
  if (args.confirmar !== true) {
    throw new ErroFerramenta(`Exclusão não executada: ${oQue}. Confirme com o produtor e chame de novo com confirmar = true.`)
  }
}

async function exigirLote(loteId: string) {
  const lote = await lotes.buscarLote(loteId)
  if (!lote) throw new ErroFerramenta('Lote não encontrado')
  return lote
}

// Nome do parceiro por id, para mostrar fornecedores nos resultados.
async function mapaParceiros(userId: string): Promise<{ lista: Parceiro[]; nome: (id: string | null) => string }> {
  const lista = await cadastros.listarParceiros(userId)
  return { lista, nome: (id: string | null) => id ? (lista.find(p => p.id === id)?.nome ?? '—') : 'Não informado' }
}

function limitar<T>(lista: T[], limite?: number): { itens: T[]; total: number; truncado: boolean } {
  const n = limite && limite > 0 ? limite : lista.length
  return { itens: lista.slice(0, n), total: lista.length, truncado: lista.length > n }
}

// ─── Esquemas reaproveitados ───────────────────────────────────────────────────

const esquemaCiclo = s.obj({
  numero: s.int('Número do ciclo (1 a 8)', { minimum: 1, maximum: 8 }),
  nome: s.texto('Nome do ciclo, ex.: Adaptação'),
  tipo_ciclo: s.opcoes('Tipo do ciclo', ['confinamento', 'pastagem', 'misto']),
  dias_planejados: s.int('Dias planejados (estimativa)', { minimum: 0 }),
  dieta_id: { ...s.id('Dieta do ciclo (ver listar_dietas); null em pastagem sem dieta'), nullable: true },
  gmd_esperado: { ...s.num('GMD esperado em kg/dia'), nullable: true },
}, ['numero', 'nome', 'tipo_ciclo', 'dias_planejados', 'dieta_id', 'gmd_esperado'])

const esquemaNovoLote = s.obj({
  nome_lote: s.texto('Nome do lote'),
  codigo_lote: s.texto('Código do lote. Se vazio, use proximo_codigo de listar_lotes'),
  prefixo: s.texto('Prefixo do código dos animais (pode ser vazio)'),
  data_criacao: s.data('Data de entrada do lote (início do primeiro ciclo)'),
  origem_municipio: s.texto('Município de origem'),
  origem_estado: s.texto('UF de origem'),
  raca_predominante: s.texto('Raça predominante'),
  observacoes: s.texto('Observações'),
  ciclos: s.lista('Ciclos do lote (até 8), normalmente começando no 1', esquemaCiclo, { minItems: 1 }),
}, ['nome_lote', 'codigo_lote', 'prefixo', 'data_criacao', 'ciclos'])

const esquemaPesagemTroca = s.obj({
  modo: s.opcoes('massa: um peso para todos; individual: um peso por animal', ['massa', 'individual']),
  peso_unico: s.num('Peso aplicado a todos (modo massa)', { minimum: 0 }),
  por_animal: s.lista('Pesos por animal (modo individual)', s.obj({ animal_id: s.id('Animal'), peso: s.num('Peso em kg', { minimum: 0 }) }, ['animal_id', 'peso'])),
}, ['modo'], 'Pesagem opcional lançada junto com a troca de ciclo')

function converterPesagemTroca(p: any): lotes.PesagemNaTroca | undefined {
  if (!p) return undefined
  const porAnimal: Record<string, number> = {}
  for (const x of p.por_animal ?? []) porAnimal[x.animal_id] = x.peso
  return { modo: p.modo, pesoUnico: p.peso_unico, porAnimal }
}

const esquemaComponente = s.obj({
  tipo: s.opcoes('Lado da dieta', ['concentrado', 'volumoso']),
  origem_ingrediente: s.opcoes('insumo_padrao (base) ou ingrediente_produtor (próprio)', ['insumo_padrao', 'ingrediente_produtor']),
  ingrediente_id: s.id('Id do ingrediente (ver listar_ingredientes)'),
  pct_participacao: s.num('% de participação dentro do lado (concentrado ou volumoso)', { minimum: 0, maximum: 100 }),
  preco_kg: s.num('Preço por kg de matéria natural usado nesta dieta', { minimum: 0 }),
  pct_ms_manual: { ...s.num('% de MS só desta dieta; null usa a do cadastro', { minimum: 0, maximum: 100 }), nullable: true },
}, ['tipo', 'origem_ingrediente', 'ingrediente_id', 'pct_participacao', 'preco_kg'])

function converterComponentes(lista: any[]) {
  return lista.map(c => ({
    tipo: c.tipo,
    origem_ingrediente: c.origem_ingrediente,
    insumo_id: c.origem_ingrediente === 'insumo_padrao' ? c.ingrediente_id : null,
    ingrediente_produtor_id: c.origem_ingrediente === 'ingrediente_produtor' ? c.ingrediente_id : null,
    pct_participacao: c.pct_participacao,
    preco_kg: c.preco_kg,
    pct_ms_manual: c.pct_ms_manual ?? null,
  }))
}

const camposDieta: Record<string, Esquema> = {
  nome: s.texto('Nome da dieta'),
  descricao: s.texto('Descrição'),
  gmd_esperado: s.num('GMD esperado em kg/dia', { minimum: 0 }),
  gmd_esperado_concentrado: { ...s.num('Parte do GMD atribuída ao concentrado (kg/dia); null se não discriminar', { minimum: 0 }), nullable: true },
  ciclo_recomendado: s.int('Ciclo recomendado'),
  pct_consumo_pv_ms: s.num('Consumo diário em % do peso vivo, em matéria seca', { minimum: 0 }),
  pct_concentrado: s.num('% de concentrado na MS', { minimum: 0, maximum: 100 }),
  pct_volumoso: s.num('% de volumoso na MS', { minimum: 0, maximum: 100 }),
  custo_manual_ativo: s.bool('Usar custo manual em vez do calculado pelos ingredientes'),
  custo_manual_valor: { ...s.num('Custo manual (R$ por kg ou por tonelada de MS)', { minimum: 0 }), nullable: true },
  custo_manual_unidade: s.opcoes('Unidade do custo manual', ['kg', 'ton']),
  componentes: s.lista('Ingredientes da dieta', esquemaComponente),
}

const esquemaSaida = s.obj({
  tipo: s.opcoes('Tipo de saída', ['venda', 'abate', 'transferencia', 'morte']),
  modo: s.opcoes('peso_proprio: valor por animal; peso_carga: valor total da carga rateado pelo peso de carcaça; rendimento_carcaca: preço por kg de carcaça e rendimento real por animal', ['peso_proprio', 'peso_carga', 'rendimento_carcaca']),
  data: s.data('Data da saída'),
  itens: s.lista('Animais da saída', s.obj({
    animal_id: s.id('Animal'),
    peso: s.num('Peso vivo na saída (kg)', { minimum: 0 }),
    valor: s.num('Valor de venda do animal (modo peso_proprio)', { minimum: 0 }),
    preco_kg_carcaca: s.num('Preço por kg de carcaça (modo rendimento_carcaca)', { minimum: 0 }),
    rendimento_abate_pct: s.num('Rendimento de abate em % (modo rendimento_carcaca)', { minimum: 0, maximum: 100 }),
  }, ['animal_id', 'peso']), { minItems: 1 }),
  valor_total: s.num('Valor total da carga (obrigatório no modo peso_carga)', { minimum: 0 }),
  destino_tipo: s.opcoes('Tipo do destino', ['corretor', 'frigorifico', 'produtor']),
  destino_id: s.id('Parceiro de destino (ver listar_parceiros)'),
  observacoes: s.texto('Observações'),
  comissoes: s.lista('Comissões em % da receita bruta', s.obj({
    tipo: s.opcoes('Tipo', ['corretor', 'operador', 'outro']),
    parceiro_id: s.id('Parceiro'),
    descricao: s.texto('Descrição'),
    percentual: s.num('% da receita bruta', { minimum: 0, maximum: 100 }),
  }, ['tipo', 'percentual'])),
  encargos: s.lista('Encargos (percentual da receita bruta ou valor fixo)', s.obj({
    descricao: s.texto('Descrição'),
    base_calculo: s.opcoes('Base', ['receita_bruta', 'valor_fixo']),
    percentual: s.num('% da receita bruta', { minimum: 0, maximum: 100 }),
    valor_fixo: s.num('Valor fixo em R$', { minimum: 0 }),
  }, ['descricao', 'base_calculo'])),
}, ['tipo', 'modo', 'data', 'itens'])

// ─── Ferramentas ───────────────────────────────────────────────────────────────

const L = (f: Omit<Ferramenta, 'somenteLeitura' | 'destrutiva'>): Ferramenta => ({ ...f, somenteLeitura: true, destrutiva: false })
const E = (f: Omit<Ferramenta, 'somenteLeitura' | 'destrutiva'>, destrutiva = false): Ferramenta => ({ ...f, somenteLeitura: false, destrutiva })

export const FERRAMENTAS: Ferramenta[] = [
  // ── Ajuda ────────────────────────────────────────────────────────────────────
  L({
    name: 'ajuda_plataforma',
    title: 'Guia de uso do Confina+',
    description: 'Guia de uso da plataforma (mesmo conteúdo do Tutorial): ingredientes, dietas, lotes, animais, importação, pesagens, comparativo, ranking, fornecedores, compras de ração e simulador. Use para tirar dúvidas de como fazer algo na plataforma.',
    inputSchema: s.obj({ secao: s.opcoes('Seção específica (opcional)', SECOES_AJUDA.map(x => x.id)) }),
    executar: async (a) => {
      if (a.secao) {
        const sec = SECOES_AJUDA.find(x => x.id === a.secao)
        return sec ?? null
      }
      return ajudaEmTexto()
    },
  }),

  // ── Visão geral ──────────────────────────────────────────────────────────────
  L({
    name: 'resumo_fazenda',
    title: 'Resumo da fazenda',
    description: 'Painel geral: animais ativos, peso médio de entrada, valor de compra investido, resultado acumulado das vendas (receita, custo, lucro) com a quebra pastagem x confinamento x misto, e os lotes ativos com animais e GMD real do ciclo.',
    inputSchema: s.obj({}),
    executar: async (_a, { userId }) => {
      const [metricas, dados] = await Promise.all([analises.carregarMetricasPainel(userId), lotes.carregarLotes(userId)])
      return {
        metricas,
        lotes_ativos: dados.lotes.filter(l => l.status === 'ativo').map(l => ({
          id: l.id, nome: l.nome_lote, codigo: l.codigo_lote, ciclo_atual: l.ciclo_atual,
          ...dados.resumo[l.id], animais_por_ciclo: dados.distribuicaoCiclos[l.id] ?? {},
        })),
      }
    },
  }),
  L({
    name: 'fazenda_hoje',
    title: 'Fazenda hoje',
    description: 'Situação de agora dos animais ativos: quantos por lote e ciclo (com data prevista de fim e se estão em espera, sem próximo ciclo cadastrado), por dieta em uso, por fornecedor e por sexo.',
    inputSchema: s.obj({ lote_id: s.id('Filtrar por um lote (opcional)') }),
    executar: async (a, { userId }) => {
      const [animais, dadosLotes, dietasProd] = await Promise.all([
        analises.carregarAnimaisHoje(userId), lotes.carregarLotes(userId), dietas.carregarDietas(userId),
      ])
      const nomeDieta: Record<string, string> = {}
      for (const d of dietasProd) nomeDieta[d.id] = d.nome
      let linhas = analises.montarLinhasHoje(animais, dadosLotes.lotes, dadosLotes.ciclosPorLote, nomeDieta)
      if (a.lote_id) linhas = linhas.filter(l => l.lote_id === a.lote_id)
      const porFornecedor: Record<string, number> = {}
      for (const l of linhas) porFornecedor[l.fornecedor] = (porFornecedor[l.fornecedor] ?? 0) + 1
      return {
        total_animais: linhas.length,
        em_espera: linhas.filter(l => l.emEspera).length,
        machos: linhas.filter(l => l.sexo === 'M').length,
        femeas: linhas.filter(l => l.sexo === 'F').length,
        por_lote_e_ciclo: analises.agruparHojePorCiclo(linhas),
        por_dieta: analises.agruparHojePorDieta(linhas),
        por_fornecedor: porFornecedor,
      }
    },
  }),

  // ── Lotes ────────────────────────────────────────────────────────────────────
  L({
    name: 'listar_lotes',
    title: 'Listar lotes',
    description: 'Lista os lotes com ciclos configurados, trocas de dieta, animais ativos, peso médio de entrada, GMD real do ciclo atual e distribuição de animais por ciclo. Traz também o próximo código de lote sugerido.',
    inputSchema: s.obj({ status: s.opcoes('Filtrar por status', ['ativo', 'encerrado', 'todos']) }),
    executar: async (a, { userId }) => {
      const dados = await lotes.carregarLotes(userId)
      const status = a.status ?? 'todos'
      return {
        proximo_codigo: lotes.proximoCodigoLote(dados.lotes),
        lotes: dados.lotes.filter(l => status === 'todos' || l.status === status).map(l => ({
          ...l,
          ciclos: dados.ciclosPorLote[l.id] ?? [],
          trocas_dieta: dados.trocasDietaPorLote[l.id] ?? [],
          resumo: dados.resumo[l.id] ?? null,
          animais_por_ciclo: dados.distribuicaoCiclos[l.id] ?? {},
        })),
      }
    },
  }),
  L({
    name: 'detalhar_lote',
    title: 'Detalhar lote',
    description: 'Detalhe de um lote: ciclos, trocas de dieta, animais ativos com peso projetado, GMD e custo acumulado na data (motor de custo + custos variáveis), levas de compra, custos operacionais, movimentações entre lotes e vendas.',
    inputSchema: s.obj({
      lote_id: s.id('Lote (ver listar_lotes)'),
      data: s.data('Data do cálculo; padrão hoje'),
      limite_animais: s.int('Máximo de animais listados (padrão 200)', { minimum: 1 }),
    }, ['lote_id']),
    executar: async (a, { userId }) => {
      const lote = await exigirLote(a.lote_id)
      const data = a.data ?? hoje()
      const [ciclos, trocas, animais, compras, custosOp, movs, saidas] = await Promise.all([
        lotes.buscarCiclosDoLote(lote.id), lotes.buscarTrocasDietaDoLote(lote.id),
        lotes.listarAnimaisDoLote(userId, lote.id), lotes.listarComprasLote(lote.id),
        lotes.listarCustosOperacionais(lote.id), lotes.listarMovimentacoesLote(userId, lote.id),
        lotes.buscarSaidasPorLote(lote.id),
      ])
      const ids = animais.map(x => x.id)
      const [custos, custosVar] = await Promise.all([
        lotes.calcularCustosEmLote(userId, ids, data), analises.somarCustosVariaveisPorAnimal(ids),
      ])
      const linhas = animais.map(x => {
        const r = custos[x.id]
        return {
          id: x.id, codigo: x.codigo, brinco: x.brinco, sexo: x.sexo, ciclo_atual: x.ciclo_atual,
          data_entrada: x.data_entrada, peso_entrada: x.peso_entrada, valor_compra: x.valor_compra,
          peso_na_data: r?.peso ?? null, gmd_medio: r?.gmdMedio ?? null, dias: r?.diasConfinamento ?? null,
          custo_alimentacao: r?.custoAlimentacao ?? null, custo_operacional: r?.custoOperacional ?? null,
          custos_variaveis: custosVar[x.id] ?? 0,
          custo_acumulado: (r?.custoAcumulado ?? 0) + (custosVar[x.id] ?? 0),
        }
      })
      const n = linhas.length
      const soma = (f: (l: typeof linhas[number]) => number) => linhas.reduce((t, l) => t + f(l), 0)
      const lista = limitar(linhas, a.limite_animais ?? 200)
      return {
        lote, data_calculo: data, ciclos, trocas_dieta: trocas,
        resumo_animais: {
          quantidade: n,
          peso_medio_na_data: n ? soma(l => l.peso_na_data ?? l.peso_entrada) / n : null,
          gmd_medio: n ? soma(l => l.gmd_medio ?? 0) / n : null,
          custo_acumulado_total: soma(l => l.custo_acumulado),
          valor_compra_total: soma(l => l.valor_compra ?? 0),
        },
        animais: lista.itens, animais_total: lista.total, animais_truncado: lista.truncado,
        levas_compra: compras,
        custos_operacionais: custosOp.map(c => ({ ...c, total_no_lancamento: c.valor * c.qtdAtivaNaData })),
        movimentacoes_entre_lotes: movs,
        vendas: saidas,
      }
    },
  }),
  E({
    name: 'criar_lote',
    title: 'Criar lote',
    description: 'Cria um lote com seus ciclos (até 8). Respeita o limite de lotes ativos do plano. Depois, use adicionar_animais.',
    inputSchema: esquemaNovoLote,
    executar: async (a, { userId }) => {
      const res = await lotes.criarLote(userId, { ...a, num_ciclos: a.ciclos.length })
      falhou(res)
      return { lote: res.lote }
    },
  }),
  E({
    name: 'renomear_lote',
    title: 'Renomear lote',
    description: 'Altera o nome de um lote.',
    inputSchema: s.obj({ lote_id: s.id('Lote'), nome_lote: s.texto('Novo nome') }, ['lote_id', 'nome_lote']),
    executar: async (a) => {
      if (!String(a.nome_lote).trim()) throw new ErroFerramenta('Informe o nome')
      falhou(await lotes.atualizarLote(a.lote_id, { nome_lote: String(a.nome_lote).trim() }))
      return { ok: true }
    },
  }),
  E({
    name: 'salvar_ciclos_lote',
    title: 'Editar ciclos do lote',
    description: 'Reescreve todos os ciclos do lote (como "Editar ciclos" no app): adiciona, altera ou remove ciclos e define a data de início real de cada um. O ciclo 1 começa na data de entrada do lote. Envie a lista completa; ciclos existentes levam o id (ver detalhar_lote) e os que não forem enviados são apagados.',
    inputSchema: s.obj({
      lote_id: s.id('Lote'),
      data_criacao: s.data('Data de entrada do lote (início do primeiro ciclo)'),
      ciclos: s.lista('Lista completa de ciclos', s.obj({
        ...esquemaCiclo.properties,
        id: s.id('Id do ciclo existente; omita para criar um novo'),
        data_inicio: { ...s.data('Data de início real do ciclo'), nullable: true },
      }, ['numero', 'nome', 'tipo_ciclo', 'dias_planejados', 'dieta_id', 'gmd_esperado', 'data_inicio']), { minItems: 1 }),
    }, ['lote_id', 'data_criacao', 'ciclos']),
    executar: async (a, { userId }) => {
      falhou(await lotes.salvarCiclosLote(userId, a.lote_id, a.data_criacao, a.ciclos))
      return { ok: true, ciclos: await lotes.buscarCiclosDoLote(a.lote_id) }
    },
  }, true),
  E({
    name: 'definir_ciclo_atual_lote',
    title: 'Definir ciclo atual do lote',
    description: 'O lote e todos os animais ativos passam a indicar outro ciclo já configurado. Muda só a identificação: datas, dieta e custos não mudam.',
    inputSchema: s.obj({ lote_id: s.id('Lote'), numero: s.int('Número do ciclo configurado', { minimum: 1 }) }, ['lote_id', 'numero']),
    executar: async (a) => { falhou(await lotes.definirCicloAtualLote(a.lote_id, a.numero)); return { ok: true } },
  }),
  E({
    name: 'renumerar_ciclo_atual_lote',
    title: 'Renumerar ciclo atual do lote',
    description: 'Troca o número do ciclo vigente do lote (ex.: 1 vira 3) em ciclos, eventos, trocas de dieta, animais e no lote. Muda só a identificação.',
    inputSchema: s.obj({ lote_id: s.id('Lote'), numero_novo: s.int('Novo número', { minimum: 1, maximum: 8 }) }, ['lote_id', 'numero_novo']),
    executar: async (a) => { falhou(await lotes.renumerarCicloAtualLote(a.lote_id, a.numero_novo)); return { ok: true } },
  }),
  E({
    name: 'avancar_ciclo',
    title: 'Avançar ciclo do lote',
    description: 'Move para o próximo ciclo todos os animais ativos que estão no ciclo atual do lote, na data escolhida (pode ser retroativa). Opcionalmente lança uma pesagem junto.',
    inputSchema: s.obj({ lote_id: s.id('Lote'), data: s.data('Data da troca; padrão hoje'), pesagem: esquemaPesagemTroca }, ['lote_id']),
    executar: async (a, { userId }) => {
      falhou(await lotes.avancarCiclo(userId, a.lote_id, a.data, converterPesagemTroca(a.pesagem)))
      return { ok: true }
    },
  }),
  E({
    name: 'avancar_ciclo_parcial',
    title: 'Avançar ciclo de animais selecionados',
    description: 'Adianta só os animais escolhidos para o próximo ciclo, sem mudar o ciclo do lote. Os animais precisam estar todos no mesmo ciclo.',
    inputSchema: s.obj({
      lote_id: s.id('Lote'), animal_ids: s.lista('Animais', s.id('Animal'), { minItems: 1 }),
      data: s.data('Data da troca'), pesagem: esquemaPesagemTroca,
    }, ['lote_id', 'animal_ids', 'data']),
    executar: async (a, { userId }) => {
      falhou(await lotes.avancarCicloParcial(userId, a.lote_id, a.animal_ids, a.data, converterPesagemTroca(a.pesagem)))
      return { ok: true }
    },
  }),
  E({
    name: 'trocar_dieta_ciclo',
    title: 'Trocar dieta no ciclo',
    description: 'Troca a dieta vigente de um ciclo em andamento, para o lote inteiro, a partir da data escolhida. O custo é recalculado só dali para frente.',
    inputSchema: s.obj({
      lote_id: s.id('Lote'), ciclo_numero: s.int('Número do ciclo', { minimum: 1 }),
      dieta_id: s.id('Nova dieta'), data: s.data('Data a partir da qual vale'),
    }, ['lote_id', 'ciclo_numero', 'dieta_id', 'data']),
    executar: async (a, { userId }) => {
      falhou(await lotes.trocarDietaCiclo(userId, a.lote_id, a.ciclo_numero, a.dieta_id, a.data))
      return { ok: true }
    },
  }),
  E({
    name: 'remover_troca_dieta',
    title: 'Remover troca de dieta',
    description: 'Apaga uma troca de dieta registrada (id em detalhar_lote, trocas_dieta). Exige confirmação do produtor.',
    inputSchema: s.obj({ troca_id: s.id('Troca de dieta'), confirmar: s.confirmar() }, ['troca_id']),
    executar: async (a) => {
      exigirConfirmacao(a, 'remover a troca de dieta')
      falhou(await lotes.removerTrocaDieta(a.troca_id))
      return { ok: true }
    },
  }, true),
  E({
    name: 'encerrar_lote',
    title: 'Encerrar lote',
    description: 'Encerra o lote (sai da lista de ativos e libera vaga no limite do plano).',
    inputSchema: s.obj({
      lote_id: s.id('Lote'), motivo: s.opcoes('Motivo', ['venda', 'extincao', 'outro']), observacao: s.texto('Detalhe do motivo'),
    }, ['lote_id', 'motivo']),
    executar: async (a) => { falhou(await lotes.encerrarLote(a.lote_id, a.motivo, a.observacao)); return { ok: true } },
  }),

  // ── Animais ──────────────────────────────────────────────────────────────────
  L({
    name: 'buscar_animais',
    title: 'Buscar animais por brinco',
    description: 'Busca animais pelo brinco (contém o texto), com o lote atual. Por padrão só ativos.',
    inputSchema: s.obj({ brinco: s.texto('Brinco ou parte dele'), incluir_inativos: s.bool('Incluir animais que já saíram') }, ['brinco']),
    executar: async (a, { userId }) => lotes.buscarAnimaisPorBrinco(userId, String(a.brinco).trim(), !!a.incluir_inativos),
  }),
  L({
    name: 'detalhar_animal',
    title: 'Detalhar animal',
    description: 'Histórico de um animal: pesagens, movimentações, custos variáveis e o cálculo do motor de custo na data (peso projetado, GMD, custos de alimentação e operacional, quebra por tipo de ciclo e por etapa).',
    inputSchema: s.obj({ animal_id: s.id('Animal (ver buscar_animais)'), data: s.data('Data do cálculo; padrão hoje') }, ['animal_id']),
    executar: async (a, { userId }) => {
      const { data: animal } = await supabase.from('animais').select('*').eq('id', a.animal_id).maybeSingle()
      if (!animal) throw new ErroFerramenta('Animal não encontrado')
      const data = a.data ?? hoje()
      const [pesagens, movimentacoes, custosVariaveis, calculo] = await Promise.all([
        lotes.buscarPesagensAnimal(a.animal_id), lotes.buscarMovimentacoesAnimal(a.animal_id),
        lotes.buscarCustosVariaveisAnimal(a.animal_id), lotes.calcularCustosEmLote(userId, [a.animal_id], data),
      ])
      const totalVar = custosVariaveis.filter(c => c.data_lancamento <= data).reduce((t, c) => t + Number(c.valor), 0)
      const r = calculo[a.animal_id] ?? null
      return {
        animal, pesagens, movimentacoes, custos_variaveis: custosVariaveis,
        calculo_na_data: r ? { data, ...r, custos_variaveis_ate_data: totalVar, custo_total_com_variaveis: r.custoAcumulado + totalVar } : null,
      }
    },
  }),
  E({
    name: 'adicionar_animais',
    title: 'Adicionar animais (leva de compra)',
    description: 'Cadastra uma leva de animais num lote, com fornecedor e preço de compra por kg próprios. Fornecedor: parceiro cadastrado (fornecedor_id) ou texto livre (fornecedor_texto). Respeita o limite de animais do plano. Brincos não podem se repetir na leva.',
    inputSchema: s.obj({
      lote_id: s.id('Lote'),
      data_entrada: s.data('Data de entrada (1ª pesagem)'),
      animais: s.lista('Animais da leva', s.obj({
        brinco: s.texto('Brinco'), peso: s.num('Peso de entrada (kg)', { minimum: 0 }),
        peso2: s.num('Segunda pesagem (kg), opcional', { minimum: 0 }),
        sexo: { ...s.opcoes('Sexo', ['M', 'F']), nullable: true },
      }, ['brinco', 'peso']), { minItems: 1 }),
      data_pesagem2: s.data('Data da segunda pesagem (obrigatória se algum animal tiver peso2)'),
      fornecedor_id: s.id('Parceiro fornecedor/produtor cadastrado'),
      fornecedor_texto: s.texto('Fornecedor em texto livre (se não cadastrado)'),
      data_compra: s.data('Data da compra; padrão a data de entrada'),
      preco_kg: s.num('Preço de compra por kg vivo', { minimum: 0 }),
      origem: s.texto('Origem'), raca: s.texto('Raça'), idade_estimada: s.num('Idade estimada (meses)', { minimum: 0 }),
      observacoes: s.texto('Observações da compra'),
    }, ['lote_id', 'data_entrada', 'animais', 'preco_kg']),
    executar: async (a, { userId }) => {
      const res = await lotes.criarAnimais(userId, {
        lote_id: a.lote_id, data_entrada: a.data_entrada, data_pesagem2: a.data_pesagem2,
        origem: a.origem, raca: a.raca, idade_estimada: a.idade_estimada,
        linhas: a.animais.map((x: any) => ({ brinco: String(x.brinco), peso: x.peso, peso2: x.peso2 ?? null, sexo: x.sexo ?? null })),
        compra: {
          parceiro_id: a.fornecedor_id ?? null, origem_texto: a.fornecedor_texto ?? null,
          data: a.data_compra ?? a.data_entrada, preco_kg: a.preco_kg, observacoes: a.observacoes,
        },
      })
      falhou(res)
      return { ok: true, quantidade: res.quantidade }
    },
  }),
  E({
    name: 'bifurcar_lote',
    title: 'Bifurcar lote',
    description: 'Separa animais de um lote em um lote novo (criado aqui, com seus ciclos). Os animais passam para o ciclo inicial do lote novo.',
    inputSchema: s.obj({
      lote_origem_id: s.id('Lote de origem'),
      animal_ids: s.lista('Animais que vão para o lote novo', s.id('Animal'), { minItems: 1 }),
      data: s.data('Data da bifurcação'),
      motivo: s.opcoes('Motivo', ['peso', 'gmd', 'sanitario', 'outro']),
      observacoes: s.texto('Observações'),
      novo_lote: esquemaNovoLote,
    }, ['lote_origem_id', 'animal_ids', 'data', 'novo_lote']),
    executar: async (a, { userId }) => {
      const res = await lotes.bifurcar(userId, {
        lote_origem_id: a.lote_origem_id, animal_ids: a.animal_ids, data_bifurcacao: a.data,
        motivo: a.motivo, observacoes: a.observacoes, novo_lote: { ...a.novo_lote, num_ciclos: a.novo_lote.ciclos.length },
      })
      falhou(res)
      return { ok: true, lote: res.lote }
    },
  }),
  E({
    name: 'mover_animais',
    title: 'Mover animais para outro lote',
    description: 'Transfere animais para outro lote existente. Os animais passam para o ciclo atual do lote de destino.',
    inputSchema: s.obj({
      animal_ids: s.lista('Animais', s.id('Animal'), { minItems: 1 }), lote_destino_id: s.id('Lote de destino'),
      data: s.data('Data da movimentação'), observacoes: s.texto('Observações'),
    }, ['animal_ids', 'lote_destino_id', 'data']),
    executar: async (a, { userId }) => { falhou(await lotes.moverAliquota(userId, a)); return { ok: true } },
  }),
  E({
    name: 'editar_data_movimentacao',
    title: 'Corrigir data de movimentação entre lotes',
    description: 'Corrige a data de uma bifurcação ou transferência (todo o grupo de animais junto). grupo_evento_id vem de detalhar_lote, movimentacoes_entre_lotes.',
    inputSchema: s.obj({ lote_id: s.id('Lote envolvido'), grupo_evento_id: s.id('Grupo do evento'), nova_data: s.data('Nova data') }, ['lote_id', 'grupo_evento_id', 'nova_data']),
    executar: async (a, { userId }) => {
      falhou(await lotes.editarDataEventoMovimentacao(userId, a.lote_id, a.grupo_evento_id, a.nova_data))
      return { ok: true }
    },
  }),
  E({
    name: 'editar_entrada_animal',
    title: 'Corrigir entrada do animal',
    description: 'Corrige peso e data de entrada de um animal. Não aceita data de entrada depois de uma pesagem já lançada.',
    inputSchema: s.obj({ animal_id: s.id('Animal'), peso_entrada: s.num('Peso de entrada (kg)', { minimum: 0 }), data_entrada: s.data('Data de entrada') }, ['animal_id', 'peso_entrada', 'data_entrada']),
    executar: async (a) => { falhou(await lotes.editarEntradaAnimal(a)); return { ok: true } },
  }),
  E({
    name: 'editar_sexo_animal',
    title: 'Definir sexo do animal',
    description: 'Define o sexo de um animal (M, F ou null para não informado).',
    inputSchema: s.obj({ animal_id: s.id('Animal'), sexo: { ...s.opcoes('Sexo', ['M', 'F']), nullable: true } }, ['animal_id', 'sexo']),
    executar: async (a) => { falhou(await lotes.editarSexoAnimal(a.animal_id, a.sexo)); return { ok: true } },
  }),
  E({
    name: 'adicionar_custo_variavel_animal',
    title: 'Lançar custo em um animal',
    description: 'Lança um custo avulso em um animal específico (entra no custo acumulado e na venda).',
    inputSchema: s.obj({ animal_id: s.id('Animal'), descricao: s.texto('Descrição'), valor: s.num('Valor em R$', { minimum: 0 }), data: s.data('Data do lançamento') }, ['animal_id', 'descricao', 'valor', 'data']),
    executar: async (a, { userId }) => {
      falhou(await lotes.adicionarCustoVariavelAnimal(userId, { animal_id: a.animal_id, descricao: a.descricao, valor: a.valor, data_lancamento: a.data }))
      return { ok: true }
    },
  }),
  E({
    name: 'excluir_animal',
    title: 'Excluir animal',
    description: 'Exclui definitivamente um animal (ex.: cadastrado por engano), com pesagens, movimentações e custos dele; a leva de compra é recalculada. Exige confirmação do produtor.',
    inputSchema: s.obj({ animal_id: s.id('Animal'), confirmar: s.confirmar() }, ['animal_id']),
    executar: async (a) => {
      exigirConfirmacao(a, 'excluir o animal e todo o histórico dele')
      falhou(await lotes.excluirAnimal(a.animal_id))
      return { ok: true }
    },
  }, true),

  // ── Pesagens ─────────────────────────────────────────────────────────────────
  E({
    name: 'registrar_pesagens',
    title: 'Registrar pesagens',
    description: 'Lança uma ou várias pesagens. A data não pode ser anterior à entrada do animal.',
    inputSchema: s.obj({
      pesagens: s.lista('Pesagens', s.obj({
        animal_id: s.id('Animal'), peso: s.num('Peso (kg)', { minimum: 0 }), data: s.data('Data da pesagem'), observacoes: s.texto('Observações'),
      }, ['animal_id', 'peso', 'data']), { minItems: 1 }),
    }, ['pesagens']),
    executar: async (a, { userId }) => {
      const ids = Array.from(new Set(a.pesagens.map((p: any) => p.animal_id as string)))
      const entradas = await lotes.buscarPorIds<{ id: string; data_entrada: string }>(ids as string[], (chunk, from, to) =>
        supabase.from('animais').select('id, data_entrada').in('id', chunk).range(from, to))
      const entradaPorId: Record<string, string> = {}
      for (const e of entradas) entradaPorId[e.id] = e.data_entrada
      for (const p of a.pesagens) {
        if (!entradaPorId[p.animal_id]) throw new ErroFerramenta(`Animal ${p.animal_id} não encontrado`)
        if (p.data < entradaPorId[p.animal_id]) throw new ErroFerramenta('A data da pesagem não pode ser anterior à entrada do animal')
      }
      if (a.pesagens.length === 1) {
        falhou(await lotes.registrarPesagemAnimal(userId, a.pesagens[0]))
      } else {
        falhou(await lotes.registrarPesagemLoteAnimais(userId, a.pesagens.map((p: any) => ({ animal_id: p.animal_id, peso: p.peso, data: p.data }))))
      }
      return { ok: true, quantidade: a.pesagens.length }
    },
  }),
  E({
    name: 'editar_pesagem',
    title: 'Corrigir pesagem',
    description: 'Corrige peso e/ou data de uma pesagem (id em detalhar_animal).',
    inputSchema: s.obj({ pesagem_id: s.id('Pesagem'), animal_id: s.id('Animal'), peso: s.num('Peso (kg)', { minimum: 0 }), data: s.data('Data') }, ['pesagem_id', 'animal_id', 'peso', 'data']),
    executar: async (a) => { falhou(await lotes.editarPesagemAnimal({ id: a.pesagem_id, animal_id: a.animal_id, peso: a.peso, data: a.data })); return { ok: true } },
  }),
  E({
    name: 'excluir_pesagem',
    title: 'Excluir pesagem',
    description: 'Apaga uma pesagem. Exige confirmação do produtor.',
    inputSchema: s.obj({ pesagem_id: s.id('Pesagem'), confirmar: s.confirmar() }, ['pesagem_id']),
    executar: async (a) => {
      exigirConfirmacao(a, 'apagar a pesagem')
      falhou(await lotes.excluirPesagemAnimal(a.pesagem_id))
      return { ok: true }
    },
  }, true),

  // ── Custos operacionais e levas de compra ────────────────────────────────────
  E({
    name: 'adicionar_custo_operacional',
    title: 'Lançar custo operacional do lote',
    description: 'Lança um custo operacional no lote. O valor é POR ANIMAL. Sem período, é rateado pelos dias de vida do animal no lote; com periodo_dias, acumula valor/dias por dia a partir da data.',
    inputSchema: s.obj({
      lote_id: s.id('Lote'),
      categoria: s.opcoes('Categoria', ['sanitario', 'maquinario', 'mao_de_obra', 'medicamentos', 'outros']),
      descricao: s.texto('Descrição'), valor: s.num('Valor por animal (R$)', { minimum: 0 }),
      data: s.data('Data do lançamento'), periodo_dias: { ...s.int('Período em dias (opcional)', { minimum: 1 }), nullable: true },
    }, ['lote_id', 'categoria', 'valor', 'data']),
    executar: async (a, { userId }) => {
      falhou(await lotes.adicionarCustoOperacional(userId, a.lote_id, {
        categoria: a.categoria, descricao: a.descricao, valor: a.valor, data_lancamento: a.data, periodo_dias: a.periodo_dias ?? null,
      }))
      return { ok: true }
    },
  }),
  E({
    name: 'remover_custo_operacional',
    title: 'Remover custo operacional',
    description: 'Apaga um custo operacional do lote (id em detalhar_lote). Exige confirmação do produtor.',
    inputSchema: s.obj({ custo_id: s.id('Custo operacional'), confirmar: s.confirmar() }, ['custo_id']),
    executar: async (a) => {
      exigirConfirmacao(a, 'apagar o custo operacional')
      falhou(await lotes.removerCustoOperacional(a.custo_id))
      return { ok: true }
    },
  }, true),
  E({
    name: 'corrigir_valor_leva_compra',
    title: 'Corrigir valor total de uma leva de compra',
    description: 'Informa o novo valor total pago por uma leva de animais; o preço por kg e o valor de compra de cada animal são recalculados pelo peso total registrado (id da leva em detalhar_lote, levas_compra).',
    inputSchema: s.obj({ compra_id: s.id('Leva de compra'), valor_total: s.num('Novo valor total (R$)', { minimum: 0 }) }, ['compra_id', 'valor_total']),
    executar: async (a) => { falhou(await lotes.atualizarValorTotalCompra(a.compra_id, a.valor_total)); return { ok: true } },
  }),

  // ── Vendas e saídas ──────────────────────────────────────────────────────────
  L({
    name: 'listar_vendas',
    title: 'Listar vendas e saídas',
    description: 'Lista as saídas registradas (venda, abate, transferência, morte) com receita, custos, lucro e margem. Opcionalmente só de um lote.',
    inputSchema: s.obj({ lote_id: s.id('Lote de origem (opcional)') }),
    executar: async (a, { userId }) => a.lote_id ? lotes.buscarSaidasPorLote(a.lote_id) : lotes.listarSaidas(userId),
  }),
  L({
    name: 'detalhar_venda',
    title: 'Detalhar venda',
    description: 'Detalhe de uma saída: destino e cada animal com peso, valor, custo atribuído e lucro.',
    inputSchema: s.obj({ saida_id: s.id('Saída (ver listar_vendas)') }, ['saida_id']),
    executar: async (a) => {
      const d = await lotes.buscarDetalheSaida(a.saida_id)
      if (!d) throw new ErroFerramenta('Saída não encontrada')
      return d
    },
  }),
  E({
    name: 'registrar_saida',
    title: 'Registrar venda ou saída',
    description: 'Registra venda, abate, transferência ou morte de animais. Calcula receita (com rendimento e bônus das faixas), comissões, encargos, custo de cada animal até a data e lucro, e retira os animais do lote. Confirme os valores com o produtor antes de chamar.',
    inputSchema: esquemaSaida,
    executar: async (a, { userId }) => {
      const res = await lotes.registrarVenda(userId, {
        tipo: a.tipo, modo: a.modo, data: a.data,
        itens: a.itens.map((i: any) => ({ animal_id: i.animal_id, peso: i.peso, valor: i.valor, precoKgCarcaca: i.preco_kg_carcaca, rendimentoAbatePct: i.rendimento_abate_pct })),
        valor_total: a.valor_total, destino_tipo: a.destino_tipo, destino_id: a.destino_id, observacoes: a.observacoes,
        comissoes: a.comissoes ?? [], encargos: a.encargos ?? [],
      })
      falhou(res)
      return { ok: true, saida: (res as { saidaGrupo?: unknown }).saidaGrupo, por_animal: (res as { resultadoPorAnimal?: unknown }).resultadoPorAnimal }
    },
  }),

  // ── Análises ─────────────────────────────────────────────────────────────────
  L({
    name: 'ranking_animais',
    title: 'Ranking de animais',
    description: 'Ordena animais por lucro, peso, ganho de peso, custo por kg ganho ou rendimento. aba ativos: projeção de hoje (lucro exige preço esperado). aba vendidos: resultado realizado. Filtros por lotes, ciclo, sexo e fornecedor; top N.',
    inputSchema: s.obj({
      aba: s.opcoes('ativos ou vendidos', ['ativos', 'vendidos']),
      criterio: s.opcoes('Critério', ['lucro', 'peso', 'ganho', 'custo_kg', 'rendimento']),
      maior_primeiro: s.bool('true (padrão): maior primeiro'),
      top: s.int('Quantidade de animais no resultado (padrão 50)', { minimum: 1 }),
      lote_ids: s.lista('Filtrar por lotes', s.id('Lote')),
      ciclos: s.lista('Filtrar por ciclo atual (só ativos)', s.int('Número do ciclo')),
      sexo: s.opcoes('Filtrar por sexo', ['M', 'F', 'nao_informado']),
      fornecedor_id: s.texto('Filtrar por fornecedor (id do parceiro ou "nao_informado")'),
      preco_kg: s.num('Preço esperado R$/kg vivo (lucro projetado dos ativos)', { minimum: 0 }),
      pct_comissao: s.num('% comissão (padrão 2)', { minimum: 0 }),
      pct_encargo: s.num('% encargo (padrão 1,5)', { minimum: 0 }),
    }, ['aba', 'criterio']),
    executar: async (a, { userId }) => {
      const [dados, faixas, parceiros] = await Promise.all([lotes.carregarLotes(userId), cadastros.listarFaixas(userId), mapaParceiros(userId)])
      const nomeLote = (id: string | null) => dados.lotes.find(l => l.id === id)?.nome_lote ?? '—'
      const passaLote = (id: string | null) => !a.lote_ids?.length || (id != null && a.lote_ids.includes(id))
      const passaSexo = (sx: string | null) => !a.sexo || (a.sexo === 'nao_informado' ? sx == null : sx === a.sexo)
      const passaForn = (f: string | null) => !a.fornecedor_id || (a.fornecedor_id === 'nao_informado' ? f == null : f === a.fornecedor_id)
      const desc = a.maior_primeiro ?? true
      const top = a.top ?? 50
      if (a.aba === 'ativos') {
        if (a.criterio === 'lucro' && !(a.preco_kg > 0)) throw new ErroFerramenta('O critério lucro nos ativos exige preco_kg')
        let linhas = await analises.carregarLinhasRankingAtivos(userId, { rendimentos: faixas.rendimentos, nomeFornecedor: parceiros.nome, nomeLote })
        linhas = analises.aplicarLucroProjetado(linhas, a.preco_kg ?? 0, a.pct_comissao ?? 2, a.pct_encargo ?? 1.5, faixas.bonus)
        linhas = linhas.filter(l => passaLote(l.loteId) && passaSexo(l.sexo) && passaForn(l.fornecedorId) && (!a.ciclos?.length || a.ciclos.includes(l.cicloAtual)))
        const ord = analises.ordenarRankingAtivos(linhas, a.criterio, desc)
        return { total_filtrado: ord.length, animais: ord.slice(0, top) }
      }
      let linhas = await analises.carregarLinhasRankingVendidos(userId, { rendimentos: faixas.rendimentos, nomeFornecedor: parceiros.nome })
      linhas = linhas.filter(l => passaLote(l.loteId) && passaSexo(l.sexo) && passaForn(l.fornecedorId))
      const ord = analises.ordenarRankingVendidos(linhas, a.criterio, desc)
      return { total_filtrado: ord.length, animais: ord.slice(0, top) }
    },
  }),
  L({
    name: 'comparativo_lotes',
    title: 'Comparativo de lotes',
    description: 'Coloca lotes (ou fornecedores) lado a lado: peso médio, GMD, conversão (concentrado / ganho atribuído ao concentrado), custo por kg ganho, valor investido, lucro e margem. aba ativos: projeção (lucro com preço esperado); vendidos: realizado. Com ciclos, traz também o recorte só daqueles ciclos.',
    inputSchema: s.obj({
      aba: s.opcoes('ativos ou vendidos', ['ativos', 'vendidos']),
      agrupar_por: s.opcoes('lote (padrão) ou fornecedor', ['lote', 'fornecedor']),
      fornecedor_id: s.texto('Filtrar por fornecedor (id do parceiro ou "nao_informado")'),
      preco_kg: s.num('Preço esperado R$/kg vivo (ativos)', { minimum: 0 }),
      pct_comissao: s.num('% comissão (padrão 2)', { minimum: 0 }),
      pct_encargo: s.num('% encargo (padrão 1,5)', { minimum: 0 }),
      ciclos: s.lista('Recorte por ciclos (só ativos)', s.int('Número do ciclo')),
    }, ['aba']),
    executar: async (a, { userId }) => {
      const [dados, faixas, parceiros] = await Promise.all([lotes.carregarLotes(userId), cadastros.listarFaixas(userId), mapaParceiros(userId)])
      const nomePorLote: Record<string, { nome: string; status: string }> = {}
      for (const l of dados.lotes) nomePorLote[l.id] = { nome: l.nome_lote, status: l.status }
      const passaFiltroFornecedor = (f: string | null) => !a.fornecedor_id || (a.fornecedor_id === 'nao_informado' ? f == null : f === a.fornecedor_id)
      const opcoes = { agruparPor: (a.agrupar_por ?? 'lote') as 'lote' | 'fornecedor', passaFiltroFornecedor, nomePorLote, nomeFornecedor: parceiros.nome }
      if (a.aba === 'ativos') {
        const dadosAtivos = await analises.carregarDadosAtivosComparativo(userId)
        const linhas = analises.agregarComparativoAtivos(dadosAtivos, {
          ...opcoes, preco: a.preco_kg ?? 0, pctComissao: a.pct_comissao ?? 2, pctEncargo: a.pct_encargo ?? 1.5,
          rendimentos: faixas.rendimentos, bonus: faixas.bonus,
        })
        const porCiclo = a.ciclos?.length ? analises.agregarComparativoPorCiclo(dadosAtivos, new Set<number>(a.ciclos), opcoes) : null
        return {
          linhas, total: analises.totalComparativoAtivos(linhas),
          por_ciclo: porCiclo, media_por_ciclo: porCiclo ? analises.totalComparativoPorCiclo(porCiclo) : null,
        }
      }
      const raw = await analises.carregarVendidosComparativo(userId)
      const linhas = analises.agregarComparativoVendidos(raw, opcoes)
      return { linhas, total: analises.totalComparativoVendidos(linhas) }
    },
  }),
  L({
    name: 'relatorio_financeiro',
    title: 'Relatório financeiro do período',
    description: 'Resumo das saídas num período: receita bruta, comissões, encargos, receita líquida, custos (compra, alimentação, variáveis, fixos), lucro, lucro por animal, margem e quebra pastagem x confinamento x misto. Use periodo ou inicio/fim.',
    inputSchema: s.obj({
      periodo: s.opcoes('Período até hoje', ['semanal', 'quinzenal', 'mensal', 'trimestral', 'semestral', 'anual']),
      inicio: s.data('Início'), fim: s.data('Fim'),
    }),
    executar: async (a, { userId }) => {
      let inicio = a.inicio, fim = a.fim
      if (!inicio || !fim) {
        const p = (a.periodo ?? 'mensal') as analises.PeriodoRelatorio
        const d = new Date()
        fim = d.toISOString().split('T')[0]
        d.setDate(d.getDate() - analises.diasPeriodoRelatorio[p])
        inicio = d.toISOString().split('T')[0]
      }
      return { inicio, fim, resumo: await analises.carregarResumoRelatorio(userId, inicio, fim) }
    },
  }),

  // ── Dietas e ingredientes ────────────────────────────────────────────────────
  L({
    name: 'listar_dietas',
    title: 'Listar dietas',
    description: 'Dietas do produtor com componentes, custo por kg de MS e data do custo vigente; e os templates base disponíveis.',
    inputSchema: s.obj({ incluir_templates: s.bool('Incluir templates base') }),
    executar: async (a, { userId }) => {
      const d = await dietas.carregarDadosDietas(userId)
      return { dietas: d.dietas, templates_base: a.incluir_templates ? d.dietasBase : undefined }
    },
  }),
  L({
    name: 'listar_ingredientes',
    title: 'Listar ingredientes',
    description: 'Ingredientes disponíveis para dietas: base padrão (com o preço do produtor em "Meus preços da base", quando houver) e ingredientes próprios (inclusive inativos), com % MS e preço.',
    inputSchema: s.obj({ busca: s.texto('Filtrar pelo nome (contém)') }),
    executar: async (a, { userId }) => {
      const d = await dietas.carregarDadosDietas(userId)
      let lista = dietas.montarIngredientesBusca(d.insumosPadrao, d.ingredientesProdutorTodos, d.precosProdutor)
      if (a.busca) {
        const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
        lista = lista.filter(i => norm(i.nome).includes(norm(a.busca)))
      }
      return lista
    },
  }),
  E({
    name: 'criar_dieta',
    title: 'Criar dieta',
    description: 'Cria uma dieta com seus ingredientes. O custo por kg de MS é calculado pelos componentes (ou custo manual). Ingredientes novos: crie antes com criar_ingrediente.',
    inputSchema: s.obj(camposDieta, ['nome', 'gmd_esperado', 'pct_consumo_pv_ms', 'pct_concentrado', 'pct_volumoso', 'componentes']),
    executar: async (a, { userId }) => {
      const res = await dietas.criarDieta(userId, { ...a, componentes: converterComponentes(a.componentes) })
      falhou(res)
      return { ok: true, dieta: (res as { dieta?: unknown }).dieta }
    },
  }),
  E({
    name: 'atualizar_dieta',
    title: 'Alterar dieta',
    description: 'Altera uma dieta (envie a composição completa). Se o custo mudar, abre uma nova versão de preço a partir de vigente_desde, preservando o histórico.',
    inputSchema: s.obj({ dieta_id: s.id('Dieta'), vigente_desde: s.data('Novo preço válido a partir de'), ...camposDieta },
      ['dieta_id', 'vigente_desde', 'pct_consumo_pv_ms', 'pct_concentrado', 'pct_volumoso', 'componentes']),
    executar: async (a, { userId }) => {
      const { dieta_id, ...resto } = a
      falhou(await dietas.atualizarDieta(userId, dieta_id, { ...resto, componentes: converterComponentes(a.componentes) }))
      return { ok: true }
    },
  }, true),
  E({
    name: 'excluir_dieta',
    title: 'Excluir dieta',
    description: 'Exclui uma dieta. Exige confirmação do produtor.',
    inputSchema: s.obj({ dieta_id: s.id('Dieta'), confirmar: s.confirmar() }, ['dieta_id']),
    executar: async (a) => {
      exigirConfirmacao(a, 'excluir a dieta')
      falhou(await dietas.excluirDieta(a.dieta_id))
      return { ok: true }
    },
  }, true),
  E({
    name: 'criar_ingrediente',
    title: 'Cadastrar ingrediente próprio',
    description: 'Cadastra um ingrediente próprio (que não está na base padrão), com categoria, % MS e preço por kg. Um nome que já existe não deve ser cadastrado de novo.',
    inputSchema: s.obj({
      nome: s.texto('Nome'), categoria: s.texto('Categoria (ex.: concentrado, volumoso, mineral)'),
      pct_ms: { ...s.num('% de matéria seca', { minimum: 0, maximum: 100 }), nullable: true }, preco_kg: s.num('Preço por kg (matéria natural)', { minimum: 0 }),
    }, ['nome', 'categoria', 'pct_ms', 'preco_kg']),
    executar: async (a, { userId }) => {
      const existentes = await dietas.carregarDadosDietas(userId)
      const lista = dietas.montarIngredientesBusca(existentes.insumosPadrao, existentes.ingredientesProdutorTodos, existentes.precosProdutor)
      const norm = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase()
      if (lista.some(i => norm(i.nome) === norm(a.nome))) throw new ErroFerramenta('Já existe um ingrediente com esse nome: use o existente')
      falhou(await cadastros.criarIngrediente(userId, a))
      return { ok: true }
    },
  }),
  E({
    name: 'atualizar_ingrediente',
    title: 'Alterar ingrediente próprio',
    description: 'Altera nome, categoria, % MS, preço ou ativa/inativa um ingrediente próprio.',
    inputSchema: s.obj({
      ingrediente_id: s.id('Ingrediente próprio'), nome: s.texto('Nome'), categoria: s.texto('Categoria'),
      pct_ms: { ...s.num('% MS', { minimum: 0, maximum: 100 }), nullable: true }, preco_kg: s.num('Preço por kg', { minimum: 0 }), ativo: s.bool('Ativo'),
    }, ['ingrediente_id']),
    executar: async (a) => {
      const { ingrediente_id, ...patch } = a
      falhou(await cadastros.atualizarIngrediente(ingrediente_id, patch))
      return { ok: true }
    },
  }),
  E({
    name: 'excluir_ingrediente',
    title: 'Excluir ingrediente próprio',
    description: 'Exclui um ingrediente próprio. Exige confirmação do produtor.',
    inputSchema: s.obj({ ingrediente_id: s.id('Ingrediente próprio'), confirmar: s.confirmar() }, ['ingrediente_id']),
    executar: async (a) => {
      exigirConfirmacao(a, 'excluir o ingrediente')
      falhou(await cadastros.excluirIngrediente(a.ingrediente_id))
      return { ok: true }
    },
  }, true),
  E({
    name: 'definir_preco_insumo_padrao',
    title: 'Definir meu preço de um insumo da base',
    description: 'Define o preço do produtor para um insumo da base padrão ("Meus preços da base").',
    inputSchema: s.obj({ insumo_id: s.id('Insumo da base padrão'), preco_kg: s.num('Preço por kg', { minimum: 0 }) }, ['insumo_id', 'preco_kg']),
    executar: async (a, { userId }) => { falhou(await cadastros.upsertPrecoProdutor(userId, a.insumo_id, a.preco_kg)); return { ok: true } },
  }),
  E({
    name: 'remover_preco_insumo_padrao',
    title: 'Remover meu preço de um insumo da base',
    description: 'Remove o preço do produtor de um insumo da base (volta ao preço de referência). Exige confirmação do produtor.',
    inputSchema: s.obj({ insumo_id: s.id('Insumo da base padrão'), confirmar: s.confirmar() }, ['insumo_id']),
    executar: async (a, { userId }) => {
      exigirConfirmacao(a, 'remover o seu preço deste insumo')
      falhou(await cadastros.removerPrecoProdutor(userId, a.insumo_id))
      return { ok: true }
    },
  }, true),

  // ── Parceiros e faixas ───────────────────────────────────────────────────────
  L({
    name: 'listar_parceiros',
    title: 'Listar parceiros',
    description: 'Fornecedores, corretores, frigoríficos e produtores cadastrados.',
    inputSchema: s.obj({ tipo: s.opcoes('Filtrar por tipo', ['fornecedor', 'corretor', 'frigorifico', 'produtor']) }),
    executar: async (a, { userId }) => {
      const lista = await cadastros.listarParceiros(userId)
      return a.tipo ? lista.filter(p => p.tipo === a.tipo) : lista
    },
  }),
  E({
    name: 'criar_parceiro',
    title: 'Cadastrar parceiro',
    description: 'Cadastra fornecedor, corretor, frigorífico ou produtor.',
    inputSchema: s.obj({
      nome: s.texto('Nome'), tipo: s.opcoes('Tipo', ['fornecedor', 'corretor', 'frigorifico', 'produtor']),
      cpf_cnpj: s.texto('CPF/CNPJ'), contato: s.texto('Contato'), endereco: s.texto('Endereço'), observacoes: s.texto('Observações'),
    }, ['nome', 'tipo']),
    executar: async (a, { userId }) => {
      falhou(await cadastros.criarParceiro(userId, {
        nome: a.nome, tipo: a.tipo, cpf_cnpj: a.cpf_cnpj ?? null, contato: a.contato ?? null,
        endereco: a.endereco ?? null, observacoes: a.observacoes ?? null,
      }))
      return { ok: true }
    },
  }),
  E({
    name: 'editar_parceiro',
    title: 'Alterar parceiro',
    description: 'Altera dados de um parceiro.',
    inputSchema: s.obj({
      parceiro_id: s.id('Parceiro'), nome: s.texto('Nome'), tipo: s.opcoes('Tipo', ['fornecedor', 'corretor', 'frigorifico', 'produtor']),
      cpf_cnpj: s.texto('CPF/CNPJ'), contato: s.texto('Contato'), endereco: s.texto('Endereço'), observacoes: s.texto('Observações'),
    }, ['parceiro_id']),
    executar: async (a) => {
      const { parceiro_id, ...patch } = a
      falhou(await cadastros.editarParceiro(parceiro_id, patch))
      return { ok: true }
    },
  }),
  E({
    name: 'excluir_parceiro',
    title: 'Excluir parceiro',
    description: 'Exclui um parceiro. Exige confirmação do produtor.',
    inputSchema: s.obj({ parceiro_id: s.id('Parceiro'), confirmar: s.confirmar() }, ['parceiro_id']),
    executar: async (a) => {
      exigirConfirmacao(a, 'excluir o parceiro')
      falhou(await cadastros.excluirParceiro(a.parceiro_id))
      return { ok: true }
    },
  }, true),
  L({
    name: 'listar_faixas',
    title: 'Faixas de rendimento e bônus',
    description: 'Faixas de rendimento de carcaça (%) e bônus (R$/kg de carcaça) por peso vivo, usadas no ranking, comparativo e venda.',
    inputSchema: s.obj({}),
    executar: async (_a, { userId }) => cadastros.listarFaixas(userId),
  }),
  E({
    name: 'salvar_faixas',
    title: 'Alterar faixas de rendimento ou bônus',
    description: 'Altera faixas existentes (ids em listar_faixas). Envie só as faixas a alterar.',
    inputSchema: s.obj({
      rendimentos: s.lista('Faixas de rendimento', s.obj({ id: s.id('Faixa'), peso_min: s.num('Peso mínimo'), peso_max: s.num('Peso máximo'), rendimento_percentual: s.num('Rendimento %') }, ['id', 'peso_min', 'peso_max', 'rendimento_percentual'])),
      bonus: s.lista('Faixas de bônus', s.obj({ id: s.id('Faixa'), peso_min: s.num('Peso mínimo'), peso_max: s.num('Peso máximo'), bonus_por_kg: s.num('Bônus R$/kg de carcaça') }, ['id', 'peso_min', 'peso_max', 'bonus_por_kg'])),
    }),
    executar: async (a) => {
      if (a.rendimentos?.length) await cadastros.salvarRendimentos(a.rendimentos as RendimentoFaixa[])
      if (a.bonus?.length) await cadastros.salvarBonus(a.bonus as BonusFaixa[])
      return { ok: true }
    },
  }, true),

  // ── Estoque de ingredientes ──────────────────────────────────────────────────
  L({
    name: 'estoque_ingredientes',
    title: 'Estoque de ingredientes',
    description: 'Entradas de ingredientes (compra, produção própria, ajuste) e o saldo de cada ingrediente em kg de MS, consumo, ajustes e custo médio vigente (R$/kg de MS). Traz as chaves de ingrediente usadas para registrar entradas.',
    inputSchema: s.obj({}),
    executar: async (_a, { userId }) => {
      const d = await estoque.carregarDadosEstoque(userId)
      const resumos = await estoque.calcularResumos(userId, d.entradas)
      return { ingredientes: d.ingredientes, fornecedores: d.fornecedores, entradas: d.entradas, saldos: Object.values(resumos).map(r => ({ ...r, periodos: undefined })) }
    },
  }),
  E({
    name: 'registrar_entrada_ingrediente',
    title: 'Registrar compra ou produção de ingrediente',
    description: 'Registra entrada no estoque: compra (com valor e fornecedor) ou produção própria (com custo de produção). Quantidade em kg de matéria natural com o % MS do material; o estoque é controlado em kg de MS. chave vem de estoque_ingredientes (ex.: ingrediente_produtor:<id>).',
    inputSchema: s.obj({
      chave: s.texto('Chave do ingrediente'), tipo: s.opcoes('Tipo', ['compra', 'producao_propria']),
      data: s.data('Data'), quantidade_kg: s.num('Quantidade em kg de matéria natural', { minimum: 0 }),
      pct_ms: { ...s.num('% MS do material; null = quantidade já é MS', { minimum: 0, maximum: 100 }), nullable: true },
      valor_total: s.num('Valor total da compra ou custo de produção (R$)', { minimum: 0 }),
      fornecedor_id: s.id('Parceiro fornecedor (compra)'), observacoes: s.texto('Observações'),
    }, ['chave', 'tipo', 'data', 'quantidade_kg', 'valor_total']),
    executar: async (a, { userId }) => {
      const r = await estoque.registrarEntradaIngrediente(userId, {
        chave: a.chave, tipo: a.tipo, data: a.data, quantidade_kg: a.quantidade_kg, pct_ms: a.pct_ms ?? null,
        valor_total: a.valor_total, parceiro_id: a.fornecedor_id ?? null, observacoes: a.observacoes,
      })
      falhou(r)
      return { ok: true }
    },
  }),
  E({
    name: 'ajustar_inventario_ingrediente',
    title: 'Ajustar inventário de ingrediente',
    description: 'Grava o saldo contado fisicamente na data (kg natural e % MS). O custo médio não muda.',
    inputSchema: s.obj({
      chave: s.texto('Chave do ingrediente'), data: s.data('Data da contagem'), saldo_contado_kg: s.num('Saldo contado em kg natural', { minimum: 0 }),
      pct_ms: { ...s.num('% MS do material contado', { minimum: 0, maximum: 100 }), nullable: true }, observacoes: s.texto('Observações'),
    }, ['chave', 'data', 'saldo_contado_kg']),
    executar: async (a, { userId }) => {
      falhou(await estoque.ajustarInventarioIngrediente(userId, a.chave, a.data, a.saldo_contado_kg, a.pct_ms ?? null, a.observacoes))
      return { ok: true }
    },
  }, true),
  E({
    name: 'excluir_entrada_ingrediente',
    title: 'Excluir entrada de ingrediente',
    description: 'Apaga uma entrada do estoque (id em estoque_ingredientes, entradas) e refaz o custo médio. Exige confirmação do produtor.',
    inputSchema: s.obj({ entrada_id: s.id('Entrada'), confirmar: s.confirmar() }, ['entrada_id']),
    executar: async (a, { userId }) => {
      exigirConfirmacao(a, 'apagar a entrada de estoque')
      const { data } = await supabase.from('compras_ingrediente').select('*').eq('id', a.entrada_id).maybeSingle()
      if (!data) throw new ErroFerramenta('Entrada não encontrada')
      falhou(await estoque.excluirEntradaIngrediente(userId, data as CompraIngrediente))
      return { ok: true }
    },
  }, true),

  // ── Fornecimento de ração ────────────────────────────────────────────────────
  L({
    name: 'fornecimentos_racao',
    title: 'Fornecimentos de ração',
    description: 'Fornecimentos registrados e o planejado x realizado por lote (consumo % PV, % concentrado, custo por cabeça/dia, custo por kg ganho, conversão). Traz também dietas, grupos de dieta pronta, lotes com a dieta planejada hoje e ingredientes (chaves) para registrar.',
    inputSchema: s.obj({ incluir_opcoes: s.bool('Incluir dietas, grupos, lotes e ingredientes para registrar um fornecimento') }),
    executar: async (a, { userId }) => {
      const d = await fornecimentos.carregarDadosFornecimento(userId)
      const indicadores = await fornecimentos.calcularIndicadoresFornecimento(userId, d.fornecimentos, d.composicoes)
      return {
        fornecimentos: d.fornecimentos, indicadores_por_lote: indicadores,
        opcoes: a.incluir_opcoes ? { dietas: d.dietas, grupos: d.grupos, lotes: d.lotes, dieta_hoje_por_lote: d.dietaHojePorLote, ingredientes: d.ingredientes } : undefined,
      }
    },
  }),
  E({
    name: 'registrar_fornecimento',
    title: 'Registrar fornecimento de ração',
    description: 'Registra a ração dada aos lotes numa data. mistura_pronta: sai de um grupo de dieta pronta (kg total e % MS). feita_na_fazenda: informe os ingredientes (chave, tipo, kg, % MS, preço). A divisão entre os lotes é automática pelo consumo previsto de cada um. Recalcula estoques.',
    inputSchema: s.obj({
      data: s.data('Data do fornecimento'), dieta_id: s.id('Dieta fornecida'),
      modo: s.opcoes('Modo', ['mistura_pronta', 'feita_na_fazenda']),
      grupo_id: { ...s.id('Grupo de dieta pronta (mistura_pronta)'), nullable: true },
      kg_total: s.num('Kg total fornecido (mistura_pronta)', { minimum: 0 }),
      pct_ms: { ...s.num('% MS da mistura (mistura_pronta)', { minimum: 0, maximum: 100 }), nullable: true },
      itens: s.lista('Ingredientes (feita_na_fazenda)', s.obj({
        chave: s.texto('Chave do ingrediente'), tipo: s.opcoes('Lado', ['concentrado', 'volumoso']),
        kg: s.num('Kg natural', { minimum: 0 }), pct_ms: s.num('% MS', { minimum: 0, maximum: 100 }),
        preco_kg_referencia: s.num('Preço por kg de referência', { minimum: 0 }),
      }, ['chave', 'tipo', 'kg', 'pct_ms', 'preco_kg_referencia'])),
      lote_ids: s.lista('Lotes que receberam', s.id('Lote'), { minItems: 1 }),
      observacoes: s.texto('Observações'),
    }, ['data', 'dieta_id', 'modo', 'lote_ids']),
    executar: async (a, { userId }) => {
      const r = await fornecimentos.registrarFornecimento(userId, {
        data: a.data, dieta_id: a.dieta_id, modo: a.modo, grupo_id: a.grupo_id ?? null, kg_total: a.kg_total ?? 0,
        pct_ms: a.pct_ms ?? null, itens: a.itens ?? [], loteIds: a.lote_ids, observacoes: a.observacoes,
      })
      falhou(r)
      return { ok: true, divisao: r.divisao }
    },
  }),
  E({
    name: 'excluir_fornecimento',
    title: 'Excluir fornecimento de ração',
    description: 'Apaga um fornecimento e recalcula os estoques. Exige confirmação do produtor.',
    inputSchema: s.obj({ fornecimento_id: s.id('Fornecimento'), confirmar: s.confirmar() }, ['fornecimento_id']),
    executar: async (a, { userId }) => {
      exigirConfirmacao(a, 'apagar o fornecimento')
      const d = await fornecimentos.carregarDadosFornecimento(userId)
      const f = d.fornecimentos.find(x => x.id === a.fornecimento_id)
      if (!f) throw new ErroFerramenta('Fornecimento não encontrado')
      falhou(await fornecimentos.excluirFornecimento(userId, f))
      return { ok: true }
    },
  }, true),

  // ── Grupos de dieta pronta ───────────────────────────────────────────────────
  L({
    name: 'listar_grupos_consumo',
    title: 'Grupos de dieta pronta',
    description: 'Grupos de consumo (lotes que dividem a mesma dieta pronta comprada), com a dieta; e lotes ativos, dietas e fornecedores para montar grupos.',
    inputSchema: s.obj({}),
    executar: async (_a, { userId }) => grupos.carregarListaGrupos(userId),
  }),
  L({
    name: 'detalhar_grupo_consumo',
    title: 'Detalhar grupo de dieta pronta',
    description: 'Membros, compras, períodos de custo médio, saldo em kg de MS (comprado, consumido, saldo, custo médio vigente), alerta de saldo negativo e o consumo por lote em cada compra.',
    inputSchema: s.obj({ grupo_id: s.id('Grupo') }, ['grupo_id']),
    executar: async (a) => {
      const { dados, saldo } = await grupos.carregarResumoGrupo(a.grupo_id)
      return {
        membros: dados.membrosArr, compras: dados.comprasArr, periodos: dados.periodosArr, lotes: dados.lotesInfo,
        pct_consumo_pv_ms: dados.pct, pct_ms_dieta: dados.pctMsDieta, custo_confirmado_kg: dados.custoConfirmadoKg, saldo,
        alerta_saldo_negativo: grupos.deveMostrarAlertaSaldo(saldo, dados.algumAnimalNaDietaHoje, dados.custoConfirmadoKg),
        consumo_por_compra: dados.comprasArr.map(c => ({ compra_id: c.id, por_lote: grupos.rankingConsumoDaCompra(dados.periodosArr, dados.consumoTeoricoPorLote, c.id) })),
      }
    },
  }),
  E({
    name: 'criar_grupo_consumo',
    title: 'Criar grupo de dieta pronta',
    description: 'Cria um grupo de lotes que dividem a mesma dieta pronta.',
    inputSchema: s.obj({ nome: s.texto('Nome'), dieta_id: s.id('Dieta pronta'), observacoes: s.texto('Observações'), lote_ids: s.lista('Lotes membros', s.id('Lote')) }, ['nome', 'dieta_id']),
    executar: async (a, { userId }) => {
      const r = await grupos.criarGrupo(userId, { nome: a.nome, dieta_id: a.dieta_id, observacoes: a.observacoes, loteIds: a.lote_ids ?? [] })
      falhou(r)
      return { ok: true, grupo_id: r.grupoId }
    },
  }),
  E({
    name: 'editar_grupo_consumo',
    title: 'Alterar grupo de dieta pronta',
    description: 'Altera nome, observações ou status (ativo/encerrado) de um grupo.',
    inputSchema: s.obj({ grupo_id: s.id('Grupo'), nome: s.texto('Nome'), observacoes: { ...s.texto('Observações'), nullable: true }, status: s.opcoes('Status', ['ativo', 'encerrado']) }, ['grupo_id']),
    executar: async (a) => {
      const { grupo_id, ...patch } = a
      falhou(await grupos.editarGrupo(grupo_id, patch))
      return { ok: true }
    },
  }),
  E({
    name: 'excluir_grupo_consumo',
    title: 'Excluir grupo de dieta pronta',
    description: 'Exclui um grupo. Exige confirmação do produtor.',
    inputSchema: s.obj({ grupo_id: s.id('Grupo'), confirmar: s.confirmar() }, ['grupo_id']),
    executar: async (a) => {
      exigirConfirmacao(a, 'excluir o grupo e as compras dele')
      falhou(await grupos.excluirGrupo(a.grupo_id))
      return { ok: true }
    },
  }, true),
  E({
    name: 'registrar_compra_grupo',
    title: 'Registrar compra de dieta pronta',
    description: 'Registra uma compra de dieta pronta no grupo e refaz a cadeia de custo médio. Desfaz qualquer confirmação de custo anterior.',
    inputSchema: s.obj({
      grupo_id: s.id('Grupo'), quantidade_kg: s.num('Quantidade em kg de matéria natural', { minimum: 0 }),
      pct_ms: s.num('% MS da ração', { minimum: 0, maximum: 100 }), valor_total: s.num('Valor total (R$)', { minimum: 0 }),
      data_compra: s.data('Data da compra'), data_inicio_uso: s.data('Data em que começou a ser usada'),
      fornecedor_id: s.id('Parceiro fornecedor'), observacoes: s.texto('Observações'),
    }, ['grupo_id', 'quantidade_kg', 'pct_ms', 'valor_total', 'data_compra', 'data_inicio_uso']),
    executar: async (a, { userId }) => {
      falhou(await grupos.registrarCompraGrupo(userId, a.grupo_id, {
        quantidade_kg: a.quantidade_kg, valor_total: a.valor_total, data_compra: a.data_compra, data_inicio_uso: a.data_inicio_uso,
        pct_ms: a.pct_ms, parceiro_id: a.fornecedor_id ?? null, observacoes: a.observacoes,
      }))
      return { ok: true }
    },
  }),
  E({
    name: 'editar_compra_grupo',
    title: 'Corrigir compra de dieta pronta',
    description: 'Corrige quantidade, valor ou % MS de uma compra do grupo e refaz a cadeia de custo médio.',
    inputSchema: s.obj({
      grupo_id: s.id('Grupo'), compra_id: s.id('Compra'), quantidade_kg: s.num('Quantidade (kg natural)', { minimum: 0 }),
      valor_total: s.num('Valor total (R$)', { minimum: 0 }), pct_ms: s.num('% MS', { minimum: 0, maximum: 100 }),
    }, ['grupo_id', 'compra_id', 'quantidade_kg', 'valor_total', 'pct_ms']),
    executar: async (a, { userId }) => {
      falhou(await grupos.editarCompraGrupo(userId, a.grupo_id, a.compra_id, { quantidade_kg: a.quantidade_kg, valor_total: a.valor_total, pct_ms: a.pct_ms }))
      return { ok: true }
    },
  }, true),
  E({
    name: 'confirmar_saldo_grupo',
    title: 'Confirmar saldo do grupo',
    description: 'Confirma que tudo o que foi comprado foi consumido: grava o preço real pago por kg de MS e o rateio passa a ser limitado ao valor pago.',
    inputSchema: s.obj({ grupo_id: s.id('Grupo') }, ['grupo_id']),
    executar: async (a) => { falhou(await grupos.confirmarSaldoGrupo(a.grupo_id)); return { ok: true } },
  }),
  E({
    name: 'limpar_confirmacao_saldo_grupo',
    title: 'Desfazer confirmação de saldo',
    description: 'Volta a usar o custo médio calculado pela quantidade comprada.',
    inputSchema: s.obj({ grupo_id: s.id('Grupo') }, ['grupo_id']),
    executar: async (a) => { falhou(await grupos.limparConfirmacaoSaldoGrupo(a.grupo_id)); return { ok: true } },
  }),
  E({
    name: 'adicionar_lote_grupo',
    title: 'Adicionar lote ao grupo',
    description: 'Inclui um lote no grupo de dieta pronta.',
    inputSchema: s.obj({ grupo_id: s.id('Grupo'), lote_id: s.id('Lote'), data_inicio: s.data('Desde (informativo)') }, ['grupo_id', 'lote_id', 'data_inicio']),
    executar: async (a, { userId }) => { falhou(await grupos.adicionarLoteGrupo(userId, a.grupo_id, a.lote_id, a.data_inicio)); return { ok: true } },
  }),
  E({
    name: 'encerrar_participacao_grupo',
    title: 'Encerrar participação de lote no grupo',
    description: 'Encerra a participação de um lote no grupo a partir da data (id da participação em detalhar_grupo_consumo, membros).',
    inputSchema: s.obj({ participacao_id: s.id('Participação'), data_fim: s.data('Até') }, ['participacao_id', 'data_fim']),
    executar: async (a) => { falhou(await grupos.encerrarParticipacaoGrupo(a.participacao_id, a.data_fim)); return { ok: true } },
  }),

  // ── Medicamentos e "Outros" (rateio por cabeça) ──────────────────────────────
  L({
    name: 'listar_compras_rateadas',
    title: 'Compras de medicamentos e outros',
    description: 'Compras de medicamentos ou "Outros" rateadas por cabeça, e a quantidade de animais ativos por ciclo (para escolher o ciclo alvo).',
    inputSchema: s.obj({ tipo: s.opcoes('medicamento ou outros', ['medicamento', 'outros']), compra_id: s.id('Ver a distribuição por lote de uma compra') }, ['tipo']),
    executar: async (a, { userId }) => {
      const [r, porCiclo] = await Promise.all([rateio.listarComprasRateio(a.tipo, userId), rateio.distribuicaoAtivosPorCiclo(userId)])
      return {
        compras: r.compras, animais_ativos_por_ciclo: porCiclo,
        distribuicao_por_lote: a.compra_id ? await rateio.distribuicaoCompraRateioPorLote(a.tipo, a.compra_id) : undefined,
      }
    },
  }),
  E({
    name: 'registrar_compra_rateada',
    title: 'Registrar compra de medicamento ou outros',
    description: 'Registra a compra e divide o valor em partes iguais entre os animais ativos que estão no ciclo alvo (todo o rebanho). O rateio é fixo no lançamento.',
    inputSchema: s.obj({
      tipo: s.opcoes('medicamento ou outros', ['medicamento', 'outros']), descricao: s.texto('O que foi comprado'),
      ciclo_alvo: s.int('Ciclo dos animais que recebem', { minimum: 1 }), data_compra: s.data('Data da compra'),
      data_aplicacao: s.data('Data de aplicação'), valor_total: s.num('Valor total (R$)', { minimum: 0 }),
      fornecedor_id: s.id('Parceiro'), observacoes: s.texto('Observações'),
    }, ['tipo', 'descricao', 'ciclo_alvo', 'data_compra', 'data_aplicacao', 'valor_total']),
    executar: async (a, { userId }) => {
      const r = await rateio.registrarCompraRateio(a.tipo, userId, {
        descricao: a.descricao, ciclo_alvo: a.ciclo_alvo, data_compra: a.data_compra, data_aplicacao: a.data_aplicacao,
        valor_total: a.valor_total, parceiro_id: a.fornecedor_id, observacoes: a.observacoes,
      })
      falhou(r)
      return { ok: true, animais: r.quantidade, valor_por_animal: r.valorPorAnimal }
    },
  }),
  E({
    name: 'excluir_compra_rateada',
    title: 'Excluir compra de medicamento ou outros',
    description: 'Apaga a compra e todos os lançamentos por animal gerados por ela. Exige confirmação do produtor.',
    inputSchema: s.obj({ tipo: s.opcoes('medicamento ou outros', ['medicamento', 'outros']), compra_id: s.id('Compra'), confirmar: s.confirmar() }, ['tipo', 'compra_id']),
    executar: async (a) => {
      exigirConfirmacao(a, 'apagar a compra e o custo lançado nos animais')
      falhou(await rateio.excluirCompraRateio(a.tipo, a.compra_id))
      return { ok: true }
    },
  }, true),

  // ── Simulador ────────────────────────────────────────────────────────────────
  L({
    name: 'listar_simulacoes',
    title: 'Listar simulações',
    description: 'Simulações salvas, com os dados completos (ponto de partida e caminhos).',
    inputSchema: s.obj({}),
    executar: async (_a, { userId }) => {
      const r = await cadastros.listarSimulacoes(userId)
      if (r.tabelaAusente) throw new ErroFerramenta('O Simulador ainda não está disponível nesta conta')
      return r.simulacoes
    },
  }),
  L({
    name: 'modelo_simulacao',
    title: 'Modelo de dados de simulação',
    description: 'Estrutura vazia de uma simulação (ponto de partida, um caminho e um ciclo) para montar os dados de criar_simulacao. Os números são texto, como no app.',
    inputSchema: s.obj({}),
    executar: async () => ({ dados: dadosIniciais(), exemplo_ciclo: cicloVazio(2) }),
  }),
  L({
    name: 'estado_lote_para_simulacao',
    title: 'Estado de hoje de um lote',
    description: 'Ponto de partida a partir de um lote: animais ativos, peso médio projetado na data, compra média e custo já incorrido por cabeça.',
    inputSchema: s.obj({ lote_id: s.id('Lote'), data: s.data('Data de referência; padrão hoje') }, ['lote_id']),
    executar: async (a, { userId }) => {
      const r = await analises.estadoAtualLote(userId, a.lote_id, a.data ?? hoje())
      if (!('qtdAnimais' in r)) throw new ErroFerramenta(r.erro)
      return r
    },
  }),
  L({
    name: 'calcular_simulacao',
    title: 'Calcular simulação',
    description: 'Calcula cada caminho de uma simulação salva (simulacao_id) ou de dados informados: dias, peso final, GMD, consumo, custos por ciclo e total, custo por kg produzido e, com preço de venda, resultado.',
    inputSchema: s.obj({ simulacao_id: s.id('Simulação salva'), dados: { type: 'object', description: 'Dados da simulação (mesma estrutura de modelo_simulacao)' } }),
    executar: async (a, { userId }) => {
      let dados: SimDados | null = a.dados ?? null
      if (a.simulacao_id) {
        const r = await cadastros.listarSimulacoes(userId)
        dados = r.simulacoes.find(x => x.id === a.simulacao_id)?.dados ?? null
        if (!dados) throw new ErroFerramenta('Simulação não encontrada')
      }
      if (!dados || !dados.partida || !Array.isArray(dados.cenarios)) throw new ErroFerramenta('Informe simulacao_id ou dados válidos')
      return dados.cenarios.map(c => {
        const r = calcularCenario(dados!.partida, c)
        return { caminho: c.nome, ...r, curva: undefined }
      })
    },
  }),
  E({
    name: 'criar_simulacao',
    title: 'Salvar nova simulação',
    description: 'Salva uma simulação nova (estrutura de modelo_simulacao).',
    inputSchema: s.obj({ nome: s.texto('Nome'), dados: { type: 'object', description: 'Dados da simulação' } }, ['nome', 'dados']),
    executar: async (a, { userId }) => {
      if (a.dados?.versao !== 1 || !a.dados.partida || !Array.isArray(a.dados.cenarios)) throw new ErroFerramenta('dados fora da estrutura de modelo_simulacao')
      const r = await cadastros.criarSimulacao(userId, a.nome, a.dados)
      falhou(r)
      return { ok: true, simulacao_id: r.id }
    },
  }),
  E({
    name: 'salvar_simulacao',
    title: 'Alterar simulação',
    description: 'Sobrescreve nome e dados de uma simulação salva.',
    inputSchema: s.obj({ simulacao_id: s.id('Simulação'), nome: s.texto('Nome'), dados: { type: 'object', description: 'Dados completos da simulação' } }, ['simulacao_id', 'nome', 'dados']),
    executar: async (a) => {
      if (a.dados?.versao !== 1 || !a.dados.partida || !Array.isArray(a.dados.cenarios)) throw new ErroFerramenta('dados fora da estrutura de modelo_simulacao')
      falhou(await cadastros.salvarSimulacao(a.simulacao_id, a.nome, a.dados))
      return { ok: true }
    },
  }, true),
  E({
    name: 'excluir_simulacao',
    title: 'Excluir simulação',
    description: 'Exclui uma simulação. Exige confirmação do produtor.',
    inputSchema: s.obj({ simulacao_id: s.id('Simulação'), confirmar: s.confirmar() }, ['simulacao_id']),
    executar: async (a) => {
      exigirConfirmacao(a, 'excluir a simulação')
      falhou(await cadastros.excluirSimulacao(a.simulacao_id))
      return { ok: true }
    },
  }, true),
]
