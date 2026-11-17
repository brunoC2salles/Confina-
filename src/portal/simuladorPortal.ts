import { useState, useEffect, useCallback, useMemo } from 'react'
import { useEstadoCache, useCarregando } from '@/lib/cacheTela'
import { supabase } from '@/lib/supabase'
import { usePortal } from '@/portal/PortalContext'
import { useDadosFornecedor } from '@/portal/useDadosFornecedor'
import { CATEGORIA_INGREDIENTE, type ItemDieta, type ProdutoFornecedor } from '@/core/parceiros'
import type { ComponenteDieta, Dieta, IngredienteDisponivel, IngredienteProdutor, InsumoPadrao } from '@/core/dietas'
import type { Simulacao } from '@/core/cadastros'
import type { SimDados } from '@/lib/simulador'

export interface SimulacaoFornecedor extends Simulacao {
  fornecedor_id: string
  membro_id: string
}

type Insumo = Pick<InsumoPadrao, 'id' | 'nome' | 'categoria' | 'pct_ms' | 'preco_referencia'>
type ItemCarregado = ItemDieta & { dieta_id: string }

export const rotuloProdutos = (fornecedorNome: string) => `Produtos ${fornecedorNome}`

// Ingredientes do simulador no portal: os produtos vendáveis do fornecedor
// (com o preço de referência) primeiro, depois os insumos padrão do Confina+.
export function montarIngredientesPortal(produtos: ProdutoFornecedor[], precos: Record<string, number>, insumos: Insumo[], fornecedorNome: string): IngredienteDisponivel[] {
  const categoria = rotuloProdutos(fornecedorNome)
  const doFornecedor: IngredienteDisponivel[] = produtos
    .filter(p => p.categoria !== 'dieta' || p.modo_dieta === 'pronta')
    .map(p => ({ origem: 'ingrediente_produtor', id: p.id, nome: p.nome, categoria, pct_ms: p.pct_ms, preco_kg_padrao: precos[p.id] ?? 0 }))
  const padrao: IngredienteDisponivel[] = insumos.map(i => ({
    origem: 'insumo_padrao', id: i.id, nome: i.nome, categoria: i.categoria, pct_ms: i.pct_ms, preco_kg_padrao: Number(i.preco_referencia ?? 0),
  }))
  return [...doFornecedor, ...padrao]
}

// Dietas do catálogo no formato das dietas do Confina+, para "copiar" no
// ciclo. A ração pronta com preço entra como um único ingrediente do lado
// vendido (o produto que o produtor compra); sem preço, entra pela
// composição. Ingredientes livres entram pelo nome, com o preço da dieta.
export function montarDietasPortal(produtos: ProdutoFornecedor[], precos: Record<string, number>, itens: ItemCarregado[], insumos: Insumo[], fornecedorNome: string): Dieta[] {
  const produtoPorId = new Map(produtos.map(p => [p.id, p]))
  const insumoPorId = new Map(insumos.map(i => [i.id, i]))
  const categoriaProdutos = rotuloProdutos(fornecedorNome)
  const comp = (tipo: 'concentrado' | 'volumoso', id: string, nome: string, categoria: string, origem: 'insumo_padrao' | 'ingrediente_produtor', pct: number, ms: number | null, preco: number): ComponenteDieta => {
    const base = { id, nome, categoria, pct_ms: ms }
    return {
      tipo, origem_ingrediente: origem,
      insumo_id: origem === 'insumo_padrao' ? id : null,
      ingrediente_produtor_id: origem === 'ingrediente_produtor' ? id : null,
      pct_participacao: pct, preco_kg: preco, pct_ms_manual: ms,
      insumo: origem === 'insumo_padrao' ? ({ ...base, preco_referencia: preco, ativo: true } as InsumoPadrao) : null,
      ingrediente_produtor: origem === 'ingrediente_produtor' ? ({ ...base, user_id: '', preco_kg: preco, ativo: true } as IngredienteProdutor) : null,
    }
  }
  return produtos.filter(p => p.categoria === 'dieta').map(d => {
    const its = itens.filter(i => i.dieta_id === d.id).sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))
    const pctC = Number(d.pct_concentrado ?? 100)
    const ladoPronto: 'concentrado' | 'volumoso' | null = d.modo_dieta === 'pronta' && precos[d.id] != null ? (pctC > 0 ? 'concentrado' : 'volumoso') : null
    const componentes: ComponenteDieta[] = []
    if (ladoPronto) componentes.push(comp(ladoPronto, d.id, d.nome, categoriaProdutos, 'ingrediente_produtor', 100, d.pct_ms, precos[d.id]))
    its.filter(i => i.tipo !== ladoPronto).forEach((i, idx) => {
      if (i.origem === 'produto' && i.produto_id) {
        const p = produtoPorId.get(i.produto_id)
        componentes.push(comp(i.tipo, i.produto_id, p?.nome ?? 'Produto', categoriaProdutos, 'ingrediente_produtor', Number(i.pct_participacao),
          i.pct_ms ?? p?.pct_ms ?? null, Number(i.preco_kg ?? precos[i.produto_id] ?? 0)))
      } else if (i.origem === 'insumo_padrao' && i.insumo_id) {
        const ins = insumoPorId.get(i.insumo_id)
        componentes.push(comp(i.tipo, i.insumo_id, ins?.nome ?? 'Insumo', ins?.categoria ?? CATEGORIA_INGREDIENTE.outro, 'insumo_padrao', Number(i.pct_participacao),
          i.pct_ms ?? ins?.pct_ms ?? null, Number(i.preco_kg ?? ins?.preco_referencia ?? 0)))
      } else {
        componentes.push(comp(i.tipo, `livre:${d.id}:${idx}`, i.nome ?? 'Ingrediente', i.tipo === 'volumoso' ? 'volumoso' : 'concentrado_energetico', 'ingrediente_produtor',
          Number(i.pct_participacao), i.pct_ms, Number(i.preco_kg ?? 0)))
      }
    })
    return {
      id: d.id, nome: d.nome, descricao: d.descricao, gmd_esperado: Number(d.gmd_esperado ?? 0),
      gmd_esperado_concentrado: d.gmd_esperado_concentrado, ciclo_recomendado: d.ciclo_recomendado, baseada_em: null,
      pct_consumo_pv_ms: Number(d.pct_consumo_pv_ms ?? 0), pct_concentrado: pctC, pct_volumoso: Number(d.pct_volumoso ?? 0),
      custo_kg_ms: null, custo_manual_ativo: false, custo_manual_valor: null, custo_manual_unidade: null, user_id: '', componentes,
    }
  })
}

// Simulações do portal (do vendedor; o gestor vê as da equipe) e os dados
// do catálogo para montar as dietas dos ciclos.
export function useSimuladorFornecedor() {
  const { membro } = usePortal()
  const { fornecedor, produtos, precos, membros, loading: carregandoDados } = useDadosFornecedor()
  const _k = fornecedor ? `useSimuladorFornecedor:${fornecedor.id}` : null
  const [simulacoes, setSimulacoes] = useEstadoCache<SimulacaoFornecedor[]>(_k && `${_k}:simulacoes`, [])
  const [insumos, setInsumos] = useEstadoCache<Insumo[]>(_k && `${_k}:insumos`, [])
  const [itens, setItens] = useEstadoCache<ItemCarregado[]>(_k && `${_k}:itens`, [])
  const [loading, setLoading] = useCarregando(_k && `${_k}:simulacoes`)

  const carregarSimulacoes = useCallback(async () => {
    if (!fornecedor) return
    const { data } = await supabase.from('fornecedor_simulacoes').select('*').eq('fornecedor_id', fornecedor.id).order('updated_at', { ascending: false })
    setSimulacoes((data ?? []) as SimulacaoFornecedor[])
  }, [fornecedor])

  const chaveDietas = produtos.filter(p => p.categoria === 'dieta').map(p => p.id).join(',')
  useEffect(() => {
    if (!fornecedor) { setLoading(false); return }
    let ativo = true
    setLoading(true)
    Promise.all([
      carregarSimulacoes(),
      supabase.from('insumos_padrao').select('id, nome, categoria, pct_ms, preco_referencia').eq('ativo', true).order('nome'),
      chaveDietas ? supabase.from('fornecedor_produto_itens').select('*').in('dieta_id', chaveDietas.split(',')) : Promise.resolve({ data: [] }),
    ]).then(([, ins, its]) => {
      if (!ativo) return
      setInsumos(((ins as { data: Insumo[] | null }).data ?? []) as Insumo[])
      setItens(((its as { data: ItemCarregado[] | null }).data ?? []) as ItemCarregado[])
      setLoading(false)
    })
    return () => { ativo = false }
  }, [fornecedor, chaveDietas, carregarSimulacoes])

  const nomeF = fornecedor?.nome ?? ''
  const ingredientes = useMemo(() => montarIngredientesPortal(produtos, precos, insumos, nomeF), [produtos, precos, insumos, nomeF])
  const dietas = useMemo(() => montarDietasPortal(produtos, precos, itens, insumos, nomeF), [produtos, precos, itens, insumos, nomeF])

  const criar = async (nome: string, dados: SimDados) => {
    if (!fornecedor || !membro) return { error: 'Somente membros da equipe criam simulações', id: null as string | null }
    const { data, error } = await supabase.from('fornecedor_simulacoes')
      .insert({ fornecedor_id: fornecedor.id, membro_id: membro.id, nome, dados }).select('id').single()
    if (error) return { error: error.message, id: null }
    await carregarSimulacoes()
    return { error: null, id: data.id as string }
  }
  const salvar = async (id: string, nome: string, dados: SimDados) => {
    const { error } = await supabase.from('fornecedor_simulacoes').update({ nome, dados, updated_at: new Date().toISOString() }).eq('id', id)
    if (error) return { error: error.message }
    await carregarSimulacoes()
    return { error: null }
  }
  const excluir = async (id: string) => {
    const { error } = await supabase.from('fornecedor_simulacoes').delete().eq('id', id)
    if (error) return { error: error.message }
    await carregarSimulacoes()
    return { error: null }
  }

  return { fornecedor, membro, membros, simulacoes, dietas, ingredientes, loading: loading || carregandoDados, criar, salvar, excluir }
}
