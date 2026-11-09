// ─── Núcleo de dietas e ingredientes ──────────────────────────────────────────
// Tipos, cálculo de custo e operações de dietas, compartilhados entre o app
// (src/hooks/useDietas.ts) e o servidor MCP. Sem React; usuário por parâmetro.
import { supabase } from './db.js'

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface InsumoPadrao {
  id: string
  nome: string
  categoria: string
  pct_ms: number | null
  preco_referencia: number
  ativo: boolean
}

export interface IngredienteProdutor {
  id: string
  user_id: string
  nome: string
  categoria: string
  pct_ms: number | null
  preco_kg: number
  ativo: boolean
}

export interface IngredienteDisponivel {
  origem: 'insumo_padrao' | 'ingrediente_produtor'
  id: string
  nome: string
  categoria: string
  pct_ms: number | null
  preco_kg_padrao: number
}

// Ingrediente para a busca por nome na criação/edição de dietas. Inclui os
// ingredientes próprios inativos (reativados ao salvar a dieta) e, nos
// insumos padrão, o preço do produtor ("Meus preços da base") quando existe.
export interface IngredienteBusca extends IngredienteDisponivel {
  ativo: boolean
}

export interface ComponenteDieta {
  id?: string
  dieta_id?: string
  tipo: 'concentrado' | 'volumoso'
  origem_ingrediente: 'insumo_padrao' | 'ingrediente_produtor'
  insumo_id?: string | null
  ingrediente_produtor_id?: string | null
  pct_participacao: number
  preco_kg: number
  pct_ms_manual: number | null
  insumo?: InsumoPadrao | null
  ingrediente_produtor?: IngredienteProdutor | null
}

export interface Dieta {
  id: string
  nome: string
  descricao: string | null
  gmd_esperado: number
  // GMD esperado atribuído só ao concentrado (subconjunto de gmd_esperado).
  // GMD do volumoso = gmd_esperado - gmd_esperado_concentrado (derivado, não
  // armazenado). null = produtor não discriminou (dieta sem essa quebra).
  gmd_esperado_concentrado: number | null
  ciclo_recomendado: number | null
  baseada_em: string | null
  pct_consumo_pv_ms: number
  pct_concentrado: number
  pct_volumoso: number
  custo_kg_ms: number | null
  custo_manual_ativo: boolean
  custo_manual_valor: number | null
  custo_manual_unidade: 'kg' | 'ton' | null
  custo_vigente_desde?: string | null
  user_id: string
  componentes?: ComponenteDieta[]
}

export interface DietaBase {
  id: string
  nome: string
  descricao: string | null
  gmd_esperado: number | null
  gmd_esperado_concentrado: number | null
  ciclo_recomendado: number | null
  pct_consumo_pv_ms: number | null
  pct_concentrado: number | null
  pct_volumoso: number | null
  ativo: boolean
  ingredientes?: Array<{
    id: string
    insumo_id: string
    tipo: 'concentrado' | 'volumoso' | null
    pct_participacao: number | null
    insumo?: InsumoPadrao | null
  }>
}

// ─── Helpers de cálculo ───────────────────────────────────────────────────────

export function getPctMsEfetivo(c: ComponenteDieta): number | null {
  if (c.pct_ms_manual != null) return c.pct_ms_manual
  if (c.origem_ingrediente === 'insumo_padrao') return c.insumo?.pct_ms ?? null
  return c.ingrediente_produtor?.pct_ms ?? null
}

export function calcularCustoKgMsLado(componentes: ComponenteDieta[]): number | null {
  if (componentes.length === 0) return 0
  let soma = 0
  for (const c of componentes) {
    const pctMs = getPctMsEfetivo(c)
    if (pctMs == null || pctMs <= 0) return null
    if (c.preco_kg == null || c.pct_participacao == null) return null
    const custoKgMsIng = c.preco_kg / (pctMs / 100)
    soma += custoKgMsIng * (c.pct_participacao / 100)
  }
  return soma
}

export function calcularCustoKgMs(dieta: {
  pct_concentrado: number
  pct_volumoso: number
  componentes: ComponenteDieta[]
}): number | null {
  const conc = dieta.componentes.filter(c => c.tipo === 'concentrado')
  const vol = dieta.componentes.filter(c => c.tipo === 'volumoso')
  const cc = calcularCustoKgMsLado(conc)
  const cv = calcularCustoKgMsLado(vol)
  if (cc == null || cv == null) return null
  return cc * (dieta.pct_concentrado / 100) + cv * (dieta.pct_volumoso / 100)
}

export function calcularCustoDia(
  dieta: { pct_consumo_pv_ms: number; custo_kg_ms: number | null },
  pesoMedio: number,
  qtdAnimais: number
): number {
  if (!dieta.custo_kg_ms) return 0
  return pesoMedio * (dieta.pct_consumo_pv_ms / 100) * dieta.custo_kg_ms * qtdAnimais
}

// ─── Dados de dietas do produtor ──────────────────────────────────────────────

export interface DadosDietas {
  dietas: Dieta[]
  dietasBase: DietaBase[]
  insumosPadrao: InsumoPadrao[]
  ingredientesProdutorTodos: IngredienteProdutor[]
  precosProdutor: Array<{ insumo_id: string; preco_kg: number }>
}

export async function carregarInsumosPadrao(): Promise<InsumoPadrao[]> {
  const { data } = await supabase
    .from('insumos_padrao').select('*')
    .eq('ativo', true).order('categoria').order('nome')
  return (data ?? []) as InsumoPadrao[]
}

export async function carregarIngredientesProdutor(userId: string): Promise<{ ingredientesProdutorTodos: IngredienteProdutor[]; precosProdutor: Array<{ insumo_id: string; preco_kg: number }> }> {
  const [{ data }, { data: pr }] = await Promise.all([
    supabase.from('ingredientes_produtor').select('*')
      .eq('user_id', userId).order('categoria').order('nome'),
    supabase.from('precos_produtor').select('insumo_id, preco_kg').eq('user_id', userId),
  ])
  return {
    ingredientesProdutorTodos: (data ?? []) as IngredienteProdutor[],
    precosProdutor: (pr ?? []) as Array<{ insumo_id: string; preco_kg: number }>,
  }
}

export async function carregarDietasBase(): Promise<DietaBase[]> {
  const { data } = await supabase
    .from('dietas_base')
    .select('*, ingredientes:dietas_base_ingredientes(*, insumo:insumos_padrao(*))')
    .eq('ativo', true).order('nome')
  return (data ?? []) as DietaBase[]
}

export async function carregarDietas(userId: string): Promise<Dieta[]> {
  const { data } = await supabase
    .from('dietas')
    .select(`
      *,
      componentes:componentes_dieta(
        *,
        insumo:insumos_padrao(*),
        ingrediente_produtor:ingredientes_produtor(*)
      )
    `)
    .eq('user_id', userId).order('nome')
  const lista = data ?? []

  if (lista.length > 0) {
    const { data: abertos } = await supabase
      .from('dietas_historico_custo').select('dieta_id, vigente_desde')
      .in('dieta_id', lista.map((d: { id: string }) => d.id)).is('vigente_ate', null)
    const vigenteDesdePorDieta: Record<string, string> = {}
    for (const h of (abertos ?? []) as Array<{ dieta_id: string; vigente_desde: string }>) {
      vigenteDesdePorDieta[h.dieta_id] = h.vigente_desde
    }
    for (const d of lista) d.custo_vigente_desde = vigenteDesdePorDieta[d.id] ?? null
  }

  return lista as Dieta[]
}

export async function carregarDadosDietas(userId: string): Promise<DadosDietas> {
  const [insumosPadrao, ingProd, dietasBase, dietas] = await Promise.all([
    carregarInsumosPadrao(), carregarIngredientesProdutor(userId), carregarDietasBase(), carregarDietas(userId),
  ])
  return { dietas, dietasBase, insumosPadrao, ...ingProd }
}

// Listas derivadas para escolher ingredientes (mesma regra usada na tela).
export function montarIngredientesDisponiveis(
  insumosPadrao: InsumoPadrao[], ingredientesProdutorTodos: IngredienteProdutor[],
): IngredienteDisponivel[] {
  const ingredientesProdutor = ingredientesProdutorTodos.filter(i => i.ativo)
  return [
    ...insumosPadrao.map(i => ({
      origem: 'insumo_padrao' as const,
      id: i.id, nome: i.nome, categoria: i.categoria,
      pct_ms: i.pct_ms, preco_kg_padrao: i.preco_referencia ?? 0,
    })),
    ...ingredientesProdutor.map(i => ({
      origem: 'ingrediente_produtor' as const,
      id: i.id, nome: i.nome, categoria: i.categoria,
      pct_ms: i.pct_ms, preco_kg_padrao: i.preco_kg,
    })),
  ]
}

export function montarIngredientesBusca(
  insumosPadrao: InsumoPadrao[], ingredientesProdutorTodos: IngredienteProdutor[],
  precosProdutor: Array<{ insumo_id: string; preco_kg: number }>,
): IngredienteBusca[] {
  const precoProdutorPorInsumo: Record<string, number> = {}
  for (const p of precosProdutor) precoProdutorPorInsumo[p.insumo_id] = Number(p.preco_kg)
  return [
    ...insumosPadrao.map(i => ({
      origem: 'insumo_padrao' as const,
      id: i.id, nome: i.nome, categoria: i.categoria, pct_ms: i.pct_ms,
      preco_kg_padrao: precoProdutorPorInsumo[i.id] ?? i.preco_referencia ?? 0,
      ativo: true,
    })),
    ...ingredientesProdutorTodos.map(i => ({
      origem: 'ingrediente_produtor' as const,
      id: i.id, nome: i.nome, categoria: i.categoria,
      pct_ms: i.pct_ms, preco_kg_padrao: i.preco_kg,
      ativo: i.ativo,
    })),
  ]
}

// Referências usadas para calcular o custo da dieta a partir dos componentes.
// No app vêm do estado já carregado; no servidor, são lidas do banco.
export interface RefsIngredientes {
  insumosPadrao: InsumoPadrao[]
  ingredientesProdutorTodos: IngredienteProdutor[]
}

async function resolverRefs(userId: string, refs?: RefsIngredientes): Promise<RefsIngredientes> {
  if (refs) return refs
  const [insumosPadrao, { ingredientesProdutorTodos }] = await Promise.all([
    carregarInsumosPadrao(), carregarIngredientesProdutor(userId),
  ])
  return { insumosPadrao, ingredientesProdutorTodos }
}


// Cria os ingredientes novos digitados na dieta (no cadastro do produtor)
// e devolve as linhas criadas, na mesma ordem.
export async function criarIngredientesDieta(userId: string, novos: Array<{
  nome: string; categoria: string; pct_ms: number | null; preco_kg: number
}>): Promise<{ error: string | null; criados: IngredienteProdutor[] }> {
  if (novos.length === 0) return { error: null, criados: [] }
  const { data, error } = await supabase.from('ingredientes_produtor')
    .insert(novos.map(n => ({ ...n, user_id: userId, ativo: true })))
    .select()
  if (error) return { error: error.message, criados: [] }
  const criados = (data ?? []) as IngredienteProdutor[]
  const porNome = new Map(criados.map(c => [c.nome, c]))
  return { error: null, criados: novos.map(n => porNome.get(n.nome)).filter((c): c is IngredienteProdutor => !!c) }
}

// Reativa ingredientes próprios inativos escolhidos na dieta.
export async function reativarIngredientes(ids: string[]): Promise<{ error: string | null }> {
  if (ids.length === 0) return { error: null }
  const { error } = await supabase.from('ingredientes_produtor').update({ ativo: true }).in('id', ids)
  if (error) return { error: error.message }
  return { error: null }
}

export interface CriarDietaInput {
  nome: string
  descricao?: string
  gmd_esperado: number
  gmd_esperado_concentrado?: number | null
  ciclo_recomendado?: number
  baseada_em?: string
  pct_consumo_pv_ms: number
  pct_concentrado: number
  pct_volumoso: number
  custo_manual_ativo?: boolean
  custo_manual_valor?: number | null
  custo_manual_unidade?: 'kg' | 'ton' | null
  componentes: Array<Omit<ComponenteDieta, 'id' | 'dieta_id' | 'insumo' | 'ingrediente_produtor'>>
}

export interface AtualizarDietaInput {
  nome?: string
  descricao?: string
  gmd_esperado?: number
  gmd_esperado_concentrado?: number | null
  ciclo_recomendado?: number
  pct_consumo_pv_ms: number
  pct_concentrado: number
  pct_volumoso: number
  custo_manual_ativo?: boolean
  custo_manual_valor?: number | null
  custo_manual_unidade?: 'kg' | 'ton' | null
  vigente_desde: string
  componentes: Array<Omit<ComponenteDieta, 'id' | 'dieta_id' | 'insumo' | 'ingrediente_produtor'>>
}

export async function criarDieta(
  userId: string, input: CriarDietaInput, extras?: IngredienteProdutor[], refsInformadas?: RefsIngredientes,
) {
  const { insumosPadrao, ingredientesProdutorTodos } = await resolverRefs(userId, refsInformadas)

  const componentesComRef = input.componentes.map(c => ({
    ...c,
    insumo: c.origem_ingrediente === 'insumo_padrao'
      ? insumosPadrao.find(i => i.id === c.insumo_id) ?? null
      : null,
    ingrediente_produtor: c.origem_ingrediente === 'ingrediente_produtor'
      ? [...ingredientesProdutorTodos, ...(extras ?? [])].find(i => i.id === c.ingrediente_produtor_id) ?? null
      : null,
  })) as ComponenteDieta[]

  const custo_kg_ms = calcularCustoKgMs({
    pct_concentrado: input.pct_concentrado,
    pct_volumoso: input.pct_volumoso,
    componentes: componentesComRef,
  })

  const { data: dieta, error: e1 } = await supabase.from('dietas').insert({
    nome: input.nome,
    descricao: input.descricao ?? null,
    gmd_esperado: input.gmd_esperado,
    gmd_esperado_concentrado: input.gmd_esperado_concentrado ?? null,
    ciclo_recomendado: input.ciclo_recomendado ?? null,
    baseada_em: input.baseada_em ?? null,
    pct_consumo_pv_ms: input.pct_consumo_pv_ms,
    pct_concentrado: input.pct_concentrado,
    pct_volumoso: input.pct_volumoso,
    custo_kg_ms,
    custo_manual_ativo: input.custo_manual_ativo ?? false,
    custo_manual_valor: input.custo_manual_ativo ? (input.custo_manual_valor ?? null) : null,
    custo_manual_unidade: input.custo_manual_ativo ? (input.custo_manual_unidade ?? null) : null,
    user_id: userId,
  }).select().single()
  if (e1) return { error: e1.message }

  if (input.componentes.length > 0) {
    const { error: e2 } = await supabase.from('componentes_dieta').insert(
      input.componentes.map(c => ({
        dieta_id: dieta.id,
        tipo: c.tipo,
        origem_ingrediente: c.origem_ingrediente,
        insumo_id: c.origem_ingrediente === 'insumo_padrao' ? c.insumo_id : null,
        ingrediente_produtor_id: c.origem_ingrediente === 'ingrediente_produtor' ? c.ingrediente_produtor_id : null,
        pct_participacao: c.pct_participacao,
        preco_kg: c.preco_kg,
        pct_ms_manual: c.pct_ms_manual,
        user_id: userId,
      }))
    )
    if (e2) return { error: e2.message }
  }

  // Abre a primeira versão do histórico de custo. Lotes e ciclos podem ser
  // cadastrados com datas retroativas usando uma dieta recém-criada, então
  // grava também uma versão retroativa com o mesmo preço cobrindo tudo antes
  // de hoje (mesmo padrão do backfill em atualizarDieta) — sem ela, os dias
  // anteriores à criação da dieta ficam sem custo de alimentação calculado.
  const hoje = new Date().toISOString().slice(0, 10)
  await supabase.from('dietas_historico_custo').insert([
    { dieta_id: dieta.id, custo_kg_ms, vigente_desde: '1970-01-01', vigente_ate: hoje, user_id: userId },
    { dieta_id: dieta.id, custo_kg_ms, vigente_desde: hoje, vigente_ate: null, user_id: userId },
  ])

  return { error: null, dieta }
}

export async function atualizarDieta(
  userId: string, id: string, input: AtualizarDietaInput, extras?: IngredienteProdutor[], refsInformadas?: RefsIngredientes,
): Promise<{ error: string | null }> {
  const { insumosPadrao, ingredientesProdutorTodos } = await resolverRefs(userId, refsInformadas)

  // Custo antigo e a versão de histórico em aberto são lidos frescos do banco
  // (não do estado do React) pra saber com certeza se o preço realmente
  // mudou e qual data é válida pra fechar a versão anterior.
  const [{ data: dietaAtual, error: eAtual }, { data: historicoAberto, error: eHist }] = await Promise.all([
    supabase.from('dietas').select('custo_kg_ms').eq('id', id).single(),
    supabase.from('dietas_historico_custo').select('id, vigente_desde').eq('dieta_id', id).is('vigente_ate', null).maybeSingle(),
  ])
  if (eAtual) return { error: eAtual.message }
  if (eHist) return { error: eHist.message }
  const custoAntigoKgMs = dietaAtual?.custo_kg_ms ?? null
  // vigente_desde vindo do banco (dietas_historico_custo) é timestamptz —
  // chega como string ISO completa ("2026-08-18T00:00:00+00:00"), não como
  // data simples ("2026-08-18") como o formulário envia. Comparar as duas
  // strings direto é incorreto (a versão "curta" sempre perde na comparação
  // lexicográfica, mesmo sendo o mesmo dia) e quebra a formatação da
  // mensagem de erro (que assume "yyyy-mm-dd"). Normaliza para data simples
  // antes de comparar e formatar.
  const historicoAbertoDataSimples = historicoAberto?.vigente_desde.slice(0, 10) ?? null
  if (historicoAbertoDataSimples && input.vigente_desde < historicoAbertoDataSimples) {
    return { error: `A data de vigência não pode ser anterior à última alteração de preço registrada (${historicoAbertoDataSimples.split('-').reverse().join('/')})` }
  }

  const componentesComRef = input.componentes.map(c => ({
    ...c,
    insumo: c.origem_ingrediente === 'insumo_padrao'
      ? insumosPadrao.find(i => i.id === c.insumo_id) ?? null
      : null,
    ingrediente_produtor: c.origem_ingrediente === 'ingrediente_produtor'
      ? [...ingredientesProdutorTodos, ...(extras ?? [])].find(i => i.id === c.ingrediente_produtor_id) ?? null
      : null,
  })) as ComponenteDieta[]

  const custo_kg_ms = calcularCustoKgMs({
    pct_concentrado: input.pct_concentrado,
    pct_volumoso: input.pct_volumoso,
    componentes: componentesComRef,
  })

  const { error: e1 } = await supabase.from('dietas').update({
    nome: input.nome,
    descricao: input.descricao ?? null,
    gmd_esperado: input.gmd_esperado,
    gmd_esperado_concentrado: input.gmd_esperado_concentrado ?? null,
    ciclo_recomendado: input.ciclo_recomendado ?? null,
    pct_consumo_pv_ms: input.pct_consumo_pv_ms,
    pct_concentrado: input.pct_concentrado,
    pct_volumoso: input.pct_volumoso,
    custo_kg_ms,
    custo_manual_ativo: input.custo_manual_ativo ?? false,
    custo_manual_valor: input.custo_manual_ativo ? (input.custo_manual_valor ?? null) : null,
    custo_manual_unidade: input.custo_manual_ativo ? (input.custo_manual_unidade ?? null) : null,
  }).eq('id', id)
  if (e1) return { error: e1.message }

  await supabase.from('componentes_dieta').delete().eq('dieta_id', id)
  if (input.componentes.length > 0) {
    const { error: e2 } = await supabase.from('componentes_dieta').insert(
      input.componentes.map(c => ({
        dieta_id: id,
        tipo: c.tipo,
        origem_ingrediente: c.origem_ingrediente,
        insumo_id: c.origem_ingrediente === 'insumo_padrao' ? c.insumo_id : null,
        ingrediente_produtor_id: c.origem_ingrediente === 'ingrediente_produtor' ? c.ingrediente_produtor_id : null,
        pct_participacao: c.pct_participacao,
        preco_kg: c.preco_kg,
        pct_ms_manual: c.pct_ms_manual,
        user_id: userId,
      }))
    )
    if (e2) return { error: e2.message }
  }

  // Só versiona se o preço por kg de MS realmente mudou (e existe um valor
  // numérico pra registrar — evita abrir uma versão nova toda vez que a
  // dieta é salva sem alteração de custo, ou quando o custo não pôde ser
  // calculado por falta de % MS de algum ingrediente).
  if (custo_kg_ms != null) {
    const precoMudou = custoAntigoKgMs == null || Math.abs(custoAntigoKgMs - custo_kg_ms) > 0.0001
    if (precoMudou) {
      if (historicoAberto) {
        // Já existe uma versão em aberto: fecha ela na data de vigência escolhida.
        const { error: eFecha } = await supabase.from('dietas_historico_custo')
          .update({ vigente_ate: input.vigente_desde }).eq('id', historicoAberto.id)
        if (eFecha) return { error: eFecha.message }
      } else if (custoAntigoKgMs != null) {
        // Dieta nunca teve histórico registrado (ex: criada antes desse recurso
        // existir) — cria uma versão retroativa com o preço antigo, cobrindo
        // tudo antes da data de vigência escolhida, pra não deixar dias sem
        // custo de alimentação calculado.
        const { error: eBackfill } = await supabase.from('dietas_historico_custo').insert({
          dieta_id: id, custo_kg_ms: custoAntigoKgMs, vigente_desde: '1970-01-01',
          vigente_ate: input.vigente_desde, user_id: userId,
        })
        if (eBackfill) return { error: eBackfill.message }
      }

      const { error: eNovo } = await supabase.from('dietas_historico_custo').insert({
        dieta_id: id, custo_kg_ms, vigente_desde: input.vigente_desde,
        vigente_ate: null, user_id: userId,
      })
      if (eNovo) return { error: eNovo.message }
    }
  }

  return { error: null }
}

export async function excluirDieta(id: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('dietas').delete().eq('id', id)
  return { error: error?.message ?? null }
}
