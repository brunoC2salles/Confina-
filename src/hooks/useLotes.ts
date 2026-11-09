// Hooks de lotes, animais, custos e vendas. Toda a lógica (leitura, regras e
// gravação) está em src/core/lotes.ts, compartilhada com o servidor MCP —
// aqui fica só o estado do React e o recarregamento depois de cada operação.
import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import type {
  Lote, CicloLote, Animal, SaidaGrupo, CategoriaCustoOperacional, MotivoEncerramento,
  Compra, TrocaDietaLoteRow,
} from '@/types'
import type { ResultadoAnimalNaData } from '@/lib/custoAnimal'
import { ordenarPorBrinco } from '@/lib/calculations'
import * as core from '@/core/lotes'
import type {
  ContextoCusto, CriarLoteInput, CriarAnimaisInput, BifurcarInput, MoverAliquotaInput,
  RegistrarVendaInput, PesagemNaTroca, ResumoLote, CicloSalvarInput, MovimentacaoGrupoLote,
  CustoOperacionalComQtd, SaidaGrupoDetalhe,
} from '@/core/lotes'

export * from '@/core/lotes'

const NAO_AUTENTICADO: { error: string } = { error: 'Não autenticado' }

// Tipo de retorno de uma operação do core — mantém campos extras (ex.: lote).
type Res<F extends (...args: any[]) => Promise<unknown>> = Promise<Awaited<ReturnType<F>>>

// ─── Hook: lotes (lista + CRUD) ────────────────────────────────────────────────

export function useLotes() {
  const { user } = useAuth()
  const [lotes, setLotes] = useState<Lote[]>([])
  const [ciclosPorLote, setCiclosPorLote] = useState<Record<string, CicloLote[]>>({})
  const [resumo, setResumo] = useState<Record<string, ResumoLote>>({})
  // Quantos animais ativos de cada lote estão em cada número de ciclo — igual
  // a { [numero]: qtd }. Num lote sem avanço parcial, tem uma única chave
  // (o ciclo_atual do lote); com avanço parcial, pode ter mais de uma —
  // é o que alimenta o badge de distribuição na UI.
  const [distribuicaoCiclos, setDistribuicaoCiclos] = useState<Record<string, Record<number, number>>>({})
  // Trocas de dieta dentro do mesmo ciclo (lote inteiro), por lote — ver
  // TrocaDietaLoteRow em types/index.ts e resolverDietaIdNoDia em custoAnimal.ts.
  const [trocasDietaPorLote, setTrocasDietaPorLote] = useState<Record<string, TrocaDietaLoteRow[]>>({})
  const [loading, setLoading] = useState(true)

  const fetchLotes = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const dados = await core.carregarLotes(user.id)
    setLotes(dados.lotes)
    setCiclosPorLote(dados.ciclosPorLote)
    setTrocasDietaPorLote(dados.trocasDietaPorLote)
    setResumo(dados.resumo)
    setDistribuicaoCiclos(dados.distribuicaoCiclos)
    setLoading(false)
  }, [user])

  useEffect(() => { fetchLotes() }, [fetchLotes])

  const proximoNumeroLote = () => core.proximoCodigoLote(lotes)

  // Executa a operação do core e recarrega a lista quando deu certo.
  const comRecarga = async <R extends { error: string | null }>(op: Promise<R>): Promise<R> => {
    const res = await op
    if (!res.error) await fetchLotes()
    return res
  }

  const criarLote = async (input: CriarLoteInput): Res<typeof core.criarLote> => {
    if (!user) return NAO_AUTENTICADO
    return comRecarga(core.criarLote(user.id, input))
  }

  const atualizarLote = async (id: string, patch: Partial<Lote>) =>
    comRecarga(core.atualizarLote(id, patch))

  const editarCiclo = async (cicloId: string, patch: Partial<Pick<CicloLote, 'nome' | 'tipo_ciclo' | 'dias_planejados' | 'dieta_id' | 'gmd_esperado'>>) =>
    comRecarga(core.editarCiclo(cicloId, patch))

  // Regras completas em salvarCiclosLote (src/core/lotes.ts).
  const salvarCiclosLote = async (loteId: string, dataCriacao: string, ciclos: CicloSalvarInput[]): Res<typeof core.salvarCiclosLote> => {
    if (!user) return NAO_AUTENTICADO
    return comRecarga(core.salvarCiclosLote(user.id, loteId, dataCriacao, ciclos))
  }

  const removerCiclo = async (cicloId: string) => comRecarga(core.removerCiclo(cicloId))

  const definirCicloAtualLote = async (loteId: string, numero: number) =>
    comRecarga(core.definirCicloAtualLote(loteId, numero))

  const renumerarCicloAtualLote = async (loteId: string, numeroNovo: number) =>
    comRecarga(core.renumerarCicloAtualLote(loteId, numeroNovo))

  const avancarCiclo = async (loteId: string, data?: string, pesagem?: PesagemNaTroca): Res<typeof core.avancarCiclo> => {
    if (!user) return NAO_AUTENTICADO
    return comRecarga(core.avancarCiclo(user.id, loteId, data, pesagem))
  }

  const avancarCicloParcial = async (loteId: string, animalIds: string[], data: string, pesagem?: PesagemNaTroca): Res<typeof core.avancarCicloParcial> => {
    if (!user) return NAO_AUTENTICADO
    return comRecarga(core.avancarCicloParcial(user.id, loteId, animalIds, data, pesagem))
  }

  const trocarDietaCiclo = async (loteId: string, cicloNumero: number, dietaId: string, data: string): Res<typeof core.trocarDietaCiclo> => {
    if (!user) return NAO_AUTENTICADO
    return comRecarga(core.trocarDietaCiclo(user.id, loteId, cicloNumero, dietaId, data))
  }

  const removerTrocaDieta = async (trocaId: string) => comRecarga(core.removerTrocaDieta(trocaId))

  const encerrarLote = async (loteId: string, motivo: MotivoEncerramento, motivoObs?: string) =>
    comRecarga(core.encerrarLote(loteId, motivo, motivoObs))

  const criarAnimais = async (input: CriarAnimaisInput): Res<typeof core.criarAnimais> => {
    if (!user) return NAO_AUTENTICADO
    return comRecarga(core.criarAnimais(user.id, input))
  }

  const bifurcar = async (input: BifurcarInput): Res<typeof core.bifurcar> => {
    if (!user) return NAO_AUTENTICADO
    return comRecarga(core.bifurcar(user.id, input))
  }

  const moverAliquota = async (input: MoverAliquotaInput): Res<typeof core.moverAliquota> => {
    if (!user) return NAO_AUTENTICADO
    return comRecarga(core.moverAliquota(user.id, input))
  }

  const excluirAnimal = async (animalId: string): Res<typeof core.excluirAnimal> => {
    if (!user) return NAO_AUTENTICADO
    return comRecarga(core.excluirAnimal(animalId))
  }

  // Memoizado: sem isso, cada chamada do hook devolvia um array NOVO (mesmo
  // com os mesmos lotes dentro), e qualquer efeito que dependesse desse valor
  // (como o do Dashboard) entrava em loop — via de referência mudando a cada
  // render, disparando o efeito de novo, gerando outro render, indefinidamente.
  const lotesAtivos = useMemo(() => lotes.filter(l => l.status === 'ativo'), [lotes])
  const lotesEncerrados = useMemo(() => lotes.filter(l => l.status === 'encerrado'), [lotes])

  return {
    lotes, ciclosPorLote, resumo, distribuicaoCiclos, trocasDietaPorLote, loading,
    lotesAtivos, lotesEncerrados,
    fetchLotes, proximoNumeroLote,
    criarLote, atualizarLote, editarCiclo, salvarCiclosLote, removerCiclo, avancarCiclo, avancarCicloParcial, encerrarLote,
    trocarDietaCiclo, removerTrocaDieta, definirCicloAtualLote, renumerarCicloAtualLote,
    criarAnimais, bifurcar, moverAliquota, excluirAnimal,
  }
}

// ─── Hook: animais de um lote específico ───────────────────────────────────────

export function useAnimaisDoLote(loteId: string | null) {
  const { user } = useAuth()
  const [animais, setAnimais] = useState<Animal[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user || !loteId) { setAnimais([]); setLoading(false); return }
    setLoading(true)
    setAnimais(await core.listarAnimaisDoLote(user.id, loteId))
    setLoading(false)
  }, [user, loteId])

  useEffect(() => { fetch() }, [fetch])

  const registrarPesagem = async (input: { animal_id: string; peso: number; data: string; observacoes?: string }) => {
    if (!user) return NAO_AUTENTICADO
    return core.registrarPesagemAnimal(user.id, input)
  }

  const registrarPesagemLote = async (pesagens: Array<{ animal_id: string; peso: number; data: string }>) => {
    if (!user) return NAO_AUTENTICADO
    return core.registrarPesagemLoteAnimais(user.id, pesagens)
  }

  const editarPesagem = core.editarPesagemAnimal
  const excluirPesagem = core.excluirPesagemAnimal
  const buscarPesagens = core.buscarPesagensAnimal
  const buscarMovimentacoes = core.buscarMovimentacoesAnimal
  const buscarCustosVariaveis = core.buscarCustosVariaveisAnimal

  const adicionarCustoVariavel = async (input: { animal_id: string; descricao: string; valor: number; data_lancamento: string }) => {
    if (!user) return NAO_AUTENTICADO
    const res = await core.adicionarCustoVariavelAnimal(user.id, input)
    if (!res.error) await fetch()
    return res
  }

  const editarEntrada = async (input: { animal_id: string; peso_entrada: number; data_entrada: string }) => {
    if (!user) return NAO_AUTENTICADO
    const res = await core.editarEntradaAnimal(input)
    if (!res.error) await fetch()
    return res
  }

  const editarSexo = async (animalId: string, sexo: 'M' | 'F' | null) => {
    if (!user) return NAO_AUTENTICADO
    const res = await core.editarSexoAnimal(animalId, sexo)
    if (!res.error) await fetch()
    return res
  }

  return {
    animais, loading, fetch,
    registrarPesagem, registrarPesagemLote, editarEntrada, editarSexo,
    buscarPesagens, buscarMovimentacoes, buscarCustosVariaveis, adicionarCustoVariavel,
    editarPesagem, excluirPesagem,
  }
}

// ─── Hook: busca de animal por brinco (página Pesagens) ────────────────────────
// Permite achar um animal pelo brinco sem passar pelo lote. Todo o CRUD de
// pesagem usado aqui é o mesmo de src/core/lotes.ts — mesma fonte usada em
// Lotes.tsx e no servidor MCP, sem lógica duplicada.
export function useBuscaAnimalPorBrinco() {
  const { user } = useAuth()
  const [resultados, setResultados] = useState<Array<Animal & { lote_nome: string | null; lote_codigo: string | null }>>([])
  const [buscando, setBuscando] = useState(false)

  const buscar = useCallback(async (termo: string, incluirInativos = false) => {
    if (!user || !termo.trim()) { setResultados([]); return }
    setBuscando(true)
    const lista = await core.buscarAnimaisPorBrinco(user.id, termo.trim(), incluirInativos)
    setResultados(ordenarPorBrinco(lista))
    setBuscando(false)
  }, [user])

  return {
    resultados, buscando, buscar,
    registrarPesagem: (input: { animal_id: string; peso: number; data: string; observacoes?: string }) =>
      user ? core.registrarPesagemAnimal(user.id, input) : Promise.resolve({ error: 'Não autenticado' }),
    editarPesagem: core.editarPesagemAnimal,
    excluirPesagem: core.excluirPesagemAnimal,
    buscarPesagens: core.buscarPesagensAnimal,
    buscarMovimentacoes: core.buscarMovimentacoesAnimal,
  }
}

// ─── Hook: histórico de movimentações entre lotes (bifurcação / transferência) ─
// Ricardo (agronomista/colaborador) reportou que o produtor costuma registrar
// a movimentação de um lote pra outro em dia diferente do dia real em que o
// animal foi fisicamente movido — e como o motor de custo usa exatamente essa
// data pra decidir qual dieta/ciclo vale em cada dia, isso distorce o custo
// acumulado. Este hook lista os eventos de troca de lote (agrupados por
// grupo_evento_id, já que bifurcação/movimentação em lote afetam vários
// animais de uma vez) e permite corrigir a data de TODO o grupo junto — mais
// fiel à realidade, já que os animais daquele evento foram movidos no mesmo
// dia. Não cobre o evento de "entrada" (esse já tem correção própria em
// editarEntrada, atrelada ao peso de entrada) nem saídas/vendas (fora do
// escopo pedido).
export function useMovimentacoesLote(loteId: string | null) {
  const { user } = useAuth()
  const [eventos, setEventos] = useState<MovimentacaoGrupoLote[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user || !loteId) { setEventos([]); setLoading(false); return }
    setLoading(true)
    setEventos(await core.listarMovimentacoesLote(user.id, loteId))
    setLoading(false)
  }, [user, loteId])

  useEffect(() => { fetch() }, [fetch])

  const editarDataEvento = async (grupoEventoId: string, novaData: string) => {
    if (!user || !loteId) return NAO_AUTENTICADO
    const res = await core.editarDataEventoMovimentacao(user.id, loteId, grupoEventoId, novaData)
    if (!res.error) await fetch()
    return res
  }

  return { eventos, loading, fetch, editarDataEvento }
}

// ─── Hook: motor de custo ──────────────────────────────────────────────────────

export function useCustoEngine() {
  const { user } = useAuth()

  const construirContexto = useCallback(async (animalIds: string[]): Promise<ContextoCusto> => {
    if (!user) {
      return { animaisPorId: {}, pesagensPorAnimal: {}, periodosPorAnimal: {}, ciclos: [], dietas: {}, custosOperacionaisPorLote: {}, custosRacaoRealPorLote: {}, eventosPorAnimal: {}, trocasDieta: [] }
    }
    return core.construirContextoCusto(user.id, animalIds)
  }, [user])

  const calcularEmLote = useCallback(async (
    animalIds: string[], dataAlvo: string
  ): Promise<Record<string, ResultadoAnimalNaData>> => {
    if (!user) return {}
    return core.calcularCustosEmLote(user.id, animalIds, dataAlvo)
  }, [user])

  return { construirContexto, calcularEmLote }
}

// ─── Hook: custos operacionais de um lote ──────────────────────────────────────

export function useCustosOperacionais(loteId: string | null) {
  const { user } = useAuth()
  const [custos, setCustos] = useState<CustoOperacionalComQtd[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user || !loteId) { setCustos([]); setLoading(false); return }
    setLoading(true)
    setCustos(await core.listarCustosOperacionais(loteId))
    setLoading(false)
  }, [user, loteId])

  useEffect(() => { fetch() }, [fetch])

  const adicionarCusto = async (input: { categoria: CategoriaCustoOperacional; descricao?: string; valor: number; data_lancamento: string; periodo_dias?: number | null }) => {
    if (!user || !loteId) return NAO_AUTENTICADO
    const res = await core.adicionarCustoOperacional(user.id, loteId, input)
    if (!res.error) await fetch()
    return res
  }

  const removerCusto = async (id: string) => {
    const res = await core.removerCustoOperacional(id)
    if (!res.error) await fetch()
    return res
  }

  // valor é por animal — o total exibido é valor x quantidade de animais
  // ativos na data de cada lançamento (ver custoAnimal.ts)
  const total = custos.reduce((s, c) => s + c.valor * c.qtdAtivaNaData, 0)

  return { custos, loading, total, adicionarCusto, removerCusto }
}

// ─── Hook: compras (levas de entrada) de um lote ───────────────────────────────

export function useCompras(loteId: string | null) {
  const { user } = useAuth()
  const [compras, setCompras] = useState<Compra[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user || !loteId) { setCompras([]); setLoading(false); return }
    setLoading(true)
    setCompras(await core.listarComprasLote(loteId))
    setLoading(false)
  }, [user, loteId])

  useEffect(() => { fetch() }, [fetch])

  const atualizarValorTotalCompra = useCallback(async (compraId: string, novoValorTotal: number) => {
    const res = await core.atualizarValorTotalCompra(compraId, novoValorTotal)
    if (!res.error) await fetch()
    return res
  }, [fetch])

  return { compras, loading, fetch, atualizarValorTotalCompra }
}

// ─── Hook: listagem de vendas (saidas_grupo) ───────────────────────────────────

export function useSaidasGrupo() {
  const { user } = useAuth()
  const [saidas, setSaidas] = useState<SaidaGrupo[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTodas = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setSaidas(await core.listarSaidas(user.id))
    setLoading(false)
  }, [user])

  useEffect(() => { fetchTodas() }, [fetchTodas])

  const buscarDetalhe = (saidaGrupoId: string): Promise<SaidaGrupoDetalhe | null> => core.buscarDetalheSaida(saidaGrupoId)
  const buscarPorLote = (loteId: string): Promise<SaidaGrupo[]> => core.buscarSaidasPorLote(loteId)

  return { saidas, loading, fetchTodas, buscarDetalhe, buscarPorLote }
}

// ─── Hook: vendas ───────────────────────────────────────────────────────────────

export function useVendas() {
  const { user } = useAuth()

  const registrarVenda = async (input: RegistrarVendaInput): Res<typeof core.registrarVenda> => {
    if (!user) return NAO_AUTENTICADO
    return core.registrarVenda(user.id, input)
  }

  return { registrarVenda }
}
