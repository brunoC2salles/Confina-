// ─── Núcleo de compras rateadas por cabeça (medicamentos e "Outros") ──────────
// Medicamentos e "Outros" seguem o mesmo modelo: valor_total / quantidade de
// animais ATIVOS que estejam no ciclo alvo na data de aplicação — cruzando
// QUALQUER lote (todo o rebanho). Rateio fixo, calculado uma única vez no
// lançamento e gravado por animal em custos_variaveis_animal — sem recálculo
// automático se a lista de animais do ciclo mudar depois. Compartilhado entre
// useComprasMedicamento, useComprasOutros e o servidor MCP.
import { supabase } from './db.js'
import { buscarTudoPaginado, chunkArray } from './lotes.js'

export type TipoCompraRateio = 'medicamento' | 'outros'

const TABELA: Record<TipoCompraRateio, string> = { medicamento: 'compras_medicamento', outros: 'compras_outros' }
const COLUNA_CUSTO: Record<TipoCompraRateio, string> = { medicamento: 'compra_medicamento_id', outros: 'compra_outros_id' }

const TAMANHO_CHUNK_INSERT = 500

export interface RegistrarCompraRateioInput {
  descricao: string; ciclo_alvo: number; data_compra: string; data_aplicacao: string
  valor_total: number; parceiro_id?: string; observacoes?: string
}

export async function listarComprasRateio<T>(tipo: TipoCompraRateio, userId: string): Promise<{ compras: T[]; fornecedores: Array<{ id: string; nome: string }> }> {
  const [{ data: comprasData }, { data: parceirosData }] = await Promise.all([
    supabase.from(TABELA[tipo]).select('*').eq('user_id', userId).order('data_aplicacao', { ascending: false }),
    supabase.from('parceiros').select('id, nome').eq('user_id', userId).in('tipo', ['fornecedor', 'produtor', 'corretor']).order('nome'),
  ])
  return { compras: (comprasData ?? []) as T[], fornecedores: (parceirosData ?? []) as Array<{ id: string; nome: string }> }
}

// Quantos animais ativos existem em cada número de ciclo, cruzando todos
// os lotes — usado para o seletor de ciclo mostrar "Ciclo 2 — 663 animais"
// antes do produtor confirmar a compra.
export async function distribuicaoAtivosPorCiclo(userId: string): Promise<Record<number, number>> {
  const linhas = await buscarTudoPaginado<{ ciclo_atual: number }>((from, to) =>
    supabase.from('animais').select('ciclo_atual').eq('user_id', userId).eq('status', 'ativo').range(from, to))
  const porCiclo: Record<number, number> = {}
  for (const a of linhas) porCiclo[a.ciclo_atual] = (porCiclo[a.ciclo_atual] ?? 0) + 1
  return porCiclo
}

export async function buscarAnimaisElegiveisCiclo(userId: string, ciclo: number): Promise<string[]> {
  const linhas = await buscarTudoPaginado<{ id: string }>((from, to) =>
    supabase.from('animais').select('id').eq('user_id', userId).eq('status', 'ativo').eq('ciclo_atual', ciclo).range(from, to))
  return linhas.map(a => a.id)
}

export async function registrarCompraRateio(
  tipo: TipoCompraRateio, userId: string, input: RegistrarCompraRateioInput,
): Promise<{ error: string | null; quantidade?: number; valorPorAnimal?: number }> {
  if (!input.descricao.trim()) return { error: 'Informe a descrição' }
  if (input.valor_total <= 0) return { error: 'Informe o valor total' }

  const animalIds = await buscarAnimaisElegiveisCiclo(userId, input.ciclo_alvo)
  if (animalIds.length === 0) return { error: `Nenhum animal ativo encontrado no ciclo ${input.ciclo_alvo}` }

  const valorPorAnimal = input.valor_total / animalIds.length

  const { data: compra, error: eCompra } = await supabase.from(TABELA[tipo]).insert({
    descricao: input.descricao, ciclo_alvo: input.ciclo_alvo,
    data_compra: input.data_compra, data_aplicacao: input.data_aplicacao,
    valor_total: input.valor_total, quantidade_animais: animalIds.length, valor_por_animal: valorPorAnimal,
    parceiro_id: input.parceiro_id || null, observacoes: input.observacoes || null,
    user_id: userId,
  }).select().single()
  if (eCompra) return { error: eCompra.message }

  const linhasCusto = animalIds.map(animal_id => ({
    animal_id, descricao: input.descricao, valor: valorPorAnimal,
    data_lancamento: input.data_aplicacao, [COLUNA_CUSTO[tipo]]: compra.id, user_id: userId,
  }))
  for (const chunk of chunkArray(linhasCusto, TAMANHO_CHUNK_INSERT)) {
    const { error: eInsert } = await supabase.from('custos_variaveis_animal').insert(chunk)
    if (eInsert) {
      // Falhou no meio da inserção (ex.: mais de 500 animais, 2º lote falhou) —
      // desfaz a compra inteira em vez de deixar o cabeçalho com uma
      // quantidade_animais que não bate com os lançamentos realmente
      // gravados. O CASCADE na coluna da compra remove o que já tiver sido
      // inserido nos lotes anteriores.
      await supabase.from(TABELA[tipo]).delete().eq('id', compra.id)
      return { error: `Falha ao lançar custo nos animais: ${eInsert.message}. A compra foi desfeita, tente novamente.` }
    }
  }

  return { error: null, quantidade: animalIds.length, valorPorAnimal }
}

export async function excluirCompraRateio(tipo: TipoCompraRateio, id: string): Promise<{ error: string | null }> {
  // ON DELETE CASCADE em custos_variaveis_animal remove junto todos os
  // lançamentos por animal gerados por essa compra.
  const { error } = await supabase.from(TABELA[tipo]).delete().eq('id', id)
  return { error: error?.message ?? null }
}

// Quebra por lote dos animais atingidos por uma compra já registrada —
// mesmo espírito do "ver estatística" das compras de ração.
export async function distribuicaoCompraRateioPorLote(tipo: TipoCompraRateio, compraId: string): Promise<Array<{ lote_id: string; nome_lote: string; codigo_lote: string; quantidade: number }>> {
  const linhas = await buscarTudoPaginado<{ animal_id: string; animais: { lote_atual_id: string | null; lotes: { nome_lote: string; codigo_lote: string } | null } | null }>((from, to) =>
    supabase.from('custos_variaveis_animal')
      .select('animal_id, animais(lote_atual_id, lotes(nome_lote, codigo_lote))')
      .eq(COLUNA_CUSTO[tipo], compraId).range(from, to) as any)
  const porLote: Record<string, { nome_lote: string; codigo_lote: string; quantidade: number }> = {}
  for (const l of linhas) {
    const loteId = l.animais?.lote_atual_id
    if (!loteId) continue
    if (!porLote[loteId]) {
      porLote[loteId] = { nome_lote: l.animais?.lotes?.nome_lote ?? '—', codigo_lote: l.animais?.lotes?.codigo_lote ?? '—', quantidade: 0 }
    }
    porLote[loteId].quantidade += 1
  }
  return Object.entries(porLote).map(([lote_id, v]) => ({ lote_id, ...v })).sort((a, b) => b.quantidade - a.quantidade)
}
