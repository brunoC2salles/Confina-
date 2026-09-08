import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useLotes, useCustoEngine, buscarPorIds, buscarFornecedorPorAnimal } from '@/hooks/useLotes'
import { useFaixas } from '@/hooks/useFaixas'
import { useParceiros } from '@/hooks/useHooks'
import { supabase } from '@/lib/supabase'
import { PageHeader, EmptyState } from '@/components/common/UI'
import { fmt, fmtNum, obterRendimento, obterBonus } from '@/lib/calculations'
import type { ResultadoAnimalNaData } from '@/lib/custoAnimal'

const hojeStr = () => new Date().toISOString().split('T')[0]
// Chave de agrupamento sentinela para animais sem fornecedor (parceiro_id)
// vinculado à compra — nunca colide com um UUID real de parceiro.
const SEM_FORNECEDOR = '__sem_fornecedor__'

// ─── Linha: lotes (ou fornecedores, conforme agrupamento) com animais ainda
// ativos (peso/GMD/custo atuais, lucro é projeção) ───────────────────────
interface LinhaAtivo {
  grupoId: string
  grupoNome: string
  status: string
  qtd: number
  pesoMedio: number
  gmdMedio: number
  conversao: number | null
  custoPorKg: number | null
  valorCompraTotal: number
  custoAcumuladoTotal: number
  lucroProjetado: number | null
  margemProjetada: number | null
}

// ─── Linha: lotes ou fornecedores com vendas já registradas (dados realizados,
// não projetados) ─────────────────────────────────────────────────────────
interface LinhaVendido {
  grupoId: string
  grupoNome: string
  qtd: number
  pesoMedioVenda: number
  gmdMedio: number
  conversao: number | null
  custoPorKg: number | null
  lucroTotal: number
  margemPct: number | null
  lucroPorAnimal: number
}

// ─── Linha: custo médio por ciclo, agregando os ciclos selecionados pelo
// produtor (ex: só o ciclo 2, ou ciclo 1+2 juntos) — só para lotes com
// animais ativos, já que a quebra por etapa (porEtapa) só existe no
// cálculo em tempo real do motor, não em vendas já liquidadas. ───
interface LinhaPorCiclo {
  loteId: string
  loteNome: string
  qtd: number
  diasMedio: number
  ganhoMedio: number
  gmdMedio: number
  conversao: number | null
  custoAlimMedio: number
  custoOpMedio: number
  custoPorKg: number | null
}

// ─── Dados brutos de cada venda já registrada (uma linha por animal vendido,
// sem agregar) — a agregação por lote ou por fornecedor acontece no useMemo
// `vendidos`, mesma lógica usada para animaisAtivosRaw/`ativos`. ───────────
interface VendidoRaw {
  animal_id: string
  loteOrigemId: string
  fornecedorId: string | null
  data: string
  pesoEntrada: number
  dataEntrada: string
  peso: number
  consumoConcKg: number
  ganhoConcentradoKg: number
  custoAtribuido: number
  lucro: number
  valor: number
}

type SortDir = 'asc' | 'desc'
interface SortState<T> { key: keyof T; dir: SortDir }

function ordenarLinhas<T>(arr: T[], sort: SortState<T> | null): T[] {
  if (!sort) return arr
  const { key, dir } = sort
  const copia = [...arr]
  copia.sort((a, b) => {
    const va = a[key] as unknown
    const vb = b[key] as unknown
    if (va == null && vb == null) return 0
    if (va == null) return 1
    if (vb == null) return -1
    if (typeof va === 'string' && typeof vb === 'string') {
      return va.localeCompare(vb, 'pt-BR', { numeric: true }) * (dir === 'asc' ? 1 : -1)
    }
    return ((va as number) - (vb as number)) * (dir === 'asc' ? 1 : -1)
  })
  return copia
}

function SortableTh<T>({ label, columnKey, sort, onSort }: {
  label: string
  columnKey: keyof T
  sort: SortState<T> | null
  onSort: (key: keyof T) => void
}) {
  const ativo = sort?.key === columnKey
  return (
    <th
      onClick={() => onSort(columnKey)}
      style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
      title="Clique para ordenar"
    >
      {label}{ativo ? (sort!.dir === 'asc' ? ' (crescente)' : ' (decrescente)') : ''}
    </th>
  )
}

export default function Comparativo() {
  const { user } = useAuth()
  const { lotes, ciclosPorLote } = useLotes()
  const { calcularEmLote } = useCustoEngine()
  const { rendimentos, bonus } = useFaixas()
  const { parceiros } = useParceiros()
  // Mesmo critério usado em Lotes.tsx para o seletor de fornecedor da leva.
  const fornecedoresDisponiveis = useMemo(() => parceiros.filter(p => p.tipo === 'fornecedor' || p.tipo === 'produtor'), [parceiros])
  const nomeFornecedor = useCallback((id: string | null) => id ? (parceiros.find(p => p.id === id)?.nome ?? '—') : 'Não informado', [parceiros])

  // ─── Agrupamento e filtro por fornecedor ────────────────────────────────
  // "lote": comportamento original (uma linha por lote). "fornecedor": agrega
  // cross-lote por fornecedor — útil quando um mesmo lote recebeu animais de
  // fornecedores diferentes em levas separadas (ver criarAnimais). O filtro
  // por fornecedor é independente do agrupamento: pode filtrar por um
  // fornecedor e continuar vendo as linhas por lote (só os lotes que têm
  // animal daquele fornecedor aparecem).
  const [agruparPor, setAgruparPor] = useState<'lote' | 'fornecedor'>('lote')
  const [fornecedorFiltro, setFornecedorFiltro] = useState('todos')
  const passaFiltroFornecedor = useCallback((fornecedorId: string | null) =>
    fornecedorFiltro === 'todos' || (fornecedorFiltro === 'nao_informado' ? fornecedorId == null : fornecedorId === fornecedorFiltro),
    [fornecedorFiltro])

  const [tab, setTab] = useState<'ativos' | 'vendidos'>('ativos')
  const [loadingAtivos, setLoadingAtivos] = useState(true)
  const [loadingVendidos, setLoadingVendidos] = useState(true)
  const [sortAtivos, setSortAtivos] = useState<SortState<LinhaAtivo> | null>(null)
  const [sortVendidos, setSortVendidos] = useState<SortState<LinhaVendido> | null>(null)
  const [sortPorCiclo, setSortPorCiclo] = useState<SortState<LinhaPorCiclo> | null>(null)

  const toggleSortAtivos = useCallback((key: keyof LinhaAtivo) => {
    setSortAtivos(prev => prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  }, [])
  const toggleSortVendidos = useCallback((key: keyof LinhaVendido) => {
    setSortVendidos(prev => prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  }, [])
  const toggleSortPorCiclo = useCallback((key: keyof LinhaPorCiclo) => {
    setSortPorCiclo(prev => prev?.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' })
  }, [])

  const [preco, setPreco] = useState('')
  const [pctComissao, setPctComissao] = useState('2')
  const [pctEncargo, setPctEncargo] = useState('1.5')

  // ─── Seleção de ciclos: vazio = todo o processo (comportamento padrão,
  // tabela de sempre); com números marcados, uma tabela adicional aparece
  // mostrando só o custo/ganho médio daqueles ciclos específicos. ───
  const [ciclosSelecionados, setCiclosSelecionados] = useState<Set<number>>(new Set())
  const toggleCiclo = (n: number) => {
    setCiclosSelecionados(prev => {
      const novo = new Set(prev)
      if (novo.has(n)) novo.delete(n); else novo.add(n)
      return novo
    })
  }

  const nomePorLote = useMemo(() => {
    const m: Record<string, { nome: string; status: string }> = {}
    for (const l of lotes) m[l.id] = { nome: l.nome_lote, status: l.status }
    return m
  }, [lotes])

  // Números de ciclo disponíveis para seleção — união de todos os ciclos já
  // configurados em qualquer lote ativo (cada lote pode ter uma quantidade
  // diferente de ciclos).
  const ciclosDisponiveis = useMemo(() => {
    const nums = new Set<number>()
    for (const lote of lotes) {
      if (lote.status !== 'ativo') continue
      for (const c of ciclosPorLote[lote.id] ?? []) nums.add(c.numero)
    }
    return Array.from(nums).sort((a, b) => a - b)
  }, [lotes, ciclosPorLote])

  // ─── Dados brutos dos animais ativos (guardados em estado sem agregar) ────
  // A agregação em si (por lote, ou por ciclo selecionado) acontece nos
  // useMemo abaixo — assim trocar a seleção de ciclos ou o preço esperado
  // não exige nova consulta ao banco, só reprocessa o que já foi buscado.
  const [animaisAtivosRaw, setAnimaisAtivosRaw] = useState<Array<{ id: string; peso_entrada: number; valor_compra: number; lote_atual_id: string }>>([])
  const [resultadosAtivos, setResultadosAtivos] = useState<Record<string, ResultadoAnimalNaData>>({})
  const [custosVarAtivos, setCustosVarAtivos] = useState<Record<string, number>>({})
  const [fornecedorPorAnimalAtivos, setFornecedorPorAnimalAtivos] = useState<Record<string, string | null>>({})

  // ─── Lotes com animais ativos: peso/GMD/custo são o estado atual; lucro e
  // margem só aparecem se um preço esperado for informado (projeção, igual à
  // do Ranking) — sem preço, ficam em branco em vez de inventar um valor. ───
  const carregarAtivos = useCallback(async () => {
    if (!user) return
    setLoadingAtivos(true)
    const { data: animaisData } = await supabase
      .from('animais').select('id, peso_entrada, valor_compra, lote_atual_id')
      .eq('user_id', user.id).eq('status', 'ativo')

    const lista = (animaisData ?? []) as Array<{ id: string; peso_entrada: number; valor_compra: number; lote_atual_id: string }>
    if (lista.length === 0) {
      setAnimaisAtivosRaw([]); setResultadosAtivos({}); setCustosVarAtivos({}); setFornecedorPorAnimalAtivos({}); setLoadingAtivos(false)
      return
    }

    const [resultados, custosVarData, fornecedorPorAnimal] = await Promise.all([
      calcularEmLote(lista.map(a => a.id), hojeStr()),
      buscarPorIds<{ animal_id: string; valor: number }>(lista.map(a => a.id), (idsChunk, from, to) =>
        supabase.from('custos_variaveis_animal').select('animal_id, valor').in('animal_id', idsChunk).range(from, to)),
      buscarFornecedorPorAnimal(lista.map(a => a.id)),
    ])
    const custosVarPorAnimal: Record<string, number> = {}
    for (const c of custosVarData) {
      custosVarPorAnimal[c.animal_id] = (custosVarPorAnimal[c.animal_id] ?? 0) + c.valor
    }

    setAnimaisAtivosRaw(lista)
    setResultadosAtivos(resultados)
    setCustosVarAtivos(custosVarPorAnimal)
    setFornecedorPorAnimalAtivos(fornecedorPorAnimal)
    setLoadingAtivos(false)
  }, [user, calcularEmLote])

  // ─── Tabela de sempre: todo o processo, do jeito que já funcionava ─────────
  const ativos = useMemo<LinhaAtivo[]>(() => {
    const p = Number(preco) || 0
    const pc = Number(pctComissao) || 0
    const pe = Number(pctEncargo) || 0

    const grupos: Record<string, {
      qtd: number; pesoSoma: number; gmdSoma: number; ganhoSoma: number
      consumoConcSoma: number; ganhoConcentradoSoma: number
      custoAlimSoma: number; custoOpSoma: number; custoVarSoma: number
      valorCompraSoma: number; receitaLiquidaSoma: number; custoTotalSoma: number
    }> = {}

    for (const a of animaisAtivosRaw) {
      const r = resultadosAtivos[a.id]
      if (!r) continue
      const fornecedorId = fornecedorPorAnimalAtivos[a.id] ?? null
      if (!passaFiltroFornecedor(fornecedorId)) continue
      const chave = agruparPor === 'lote' ? a.lote_atual_id : (fornecedorId ?? SEM_FORNECEDOR)
      const g = grupos[chave] ??= {
        qtd: 0, pesoSoma: 0, gmdSoma: 0, ganhoSoma: 0,
        consumoConcSoma: 0, ganhoConcentradoSoma: 0,
        custoAlimSoma: 0, custoOpSoma: 0, custoVarSoma: 0,
        valorCompraSoma: 0, receitaLiquidaSoma: 0, custoTotalSoma: 0,
      }
      const custoVar = custosVarAtivos[a.id] ?? 0
      const custoTotalAnimal = r.custoAcumulado + custoVar + a.valor_compra
      const ganho = r.peso - a.peso_entrada

      g.qtd += 1
      g.pesoSoma += r.peso
      g.gmdSoma += r.gmdMedio
      g.ganhoSoma += ganho
      g.consumoConcSoma += r.consumoConcentradoKg
      g.ganhoConcentradoSoma += r.ganhoPesoConcentrado
      g.custoAlimSoma += r.custoAlimentacao
      g.custoOpSoma += r.custoOperacional
      g.custoVarSoma += custoVar
      g.valorCompraSoma += a.valor_compra
      g.custoTotalSoma += custoTotalAnimal

      if (p > 0) {
        const rendPct = obterRendimento(r.peso, rendimentos)
        const pesoCarcaca = r.peso * (rendPct / 100)
        const valorBonus = pesoCarcaca * obterBonus(r.peso, bonus)
        const receitaBruta = r.peso * p + valorBonus
        g.receitaLiquidaSoma += receitaBruta * (1 - pc / 100 - pe / 100)
      }
    }

    return Object.entries(grupos).map(([grupoId, g]) => {
      const lucroProjetado = p > 0 ? g.receitaLiquidaSoma - g.custoTotalSoma : null
      const grupoNome = agruparPor === 'lote'
        ? (nomePorLote[grupoId]?.nome ?? '—')
        : (grupoId === SEM_FORNECEDOR ? 'Não informado' : nomeFornecedor(grupoId))
      const status = agruparPor === 'lote' ? (nomePorLote[grupoId]?.status ?? '—') : '—'
      return {
        grupoId, grupoNome, status,
        qtd: g.qtd,
        pesoMedio: g.qtd > 0 ? g.pesoSoma / g.qtd : 0,
        gmdMedio: g.qtd > 0 ? g.gmdSoma / g.qtd : 0,
        // Conversão = kg concentrado consumido / kg ganho ATRIBUÍDO ao
        // concentrado (não o ganho total do ciclo) — decisão tomada com o
        // produtor. consumoConcSoma > 0 exige que o lote de fato consuma
        // concentrado (senão "—", nunca 0,00, para pastagem pura).
        conversao: (g.consumoConcSoma > 0 && g.ganhoConcentradoSoma > 0) ? g.consumoConcSoma / g.ganhoConcentradoSoma : null,
        custoPorKg: g.ganhoSoma > 0 ? (g.custoAlimSoma + g.custoOpSoma) / g.ganhoSoma : null,
        valorCompraTotal: g.valorCompraSoma,
        custoAcumuladoTotal: g.custoAlimSoma + g.custoOpSoma + g.custoVarSoma,
        lucroProjetado,
        margemProjetada: p > 0 && g.receitaLiquidaSoma > 0 ? (lucroProjetado! / g.receitaLiquidaSoma) * 100 : null,
      }
    })
  }, [animaisAtivosRaw, resultadosAtivos, custosVarAtivos, fornecedorPorAnimalAtivos, nomePorLote, preco, pctComissao, pctEncargo, rendimentos, bonus, agruparPor, passaFiltroFornecedor, nomeFornecedor])

  // ─── Tabela por ciclo: só aparece quando o produtor marca ao menos um
  // número de ciclo. Agrega, por lote, apenas os dias/ganho/custo que
  // aconteceram DENTRO dos ciclos marcados (via porEtapa, já calculado pelo
  // motor) — não é projeção nem venda, é o que já foi vivido naquele(s)
  // ciclo(s) até hoje. Custos variáveis e valor de compra ficam de fora
  // (não são amarrados a um ciclo específico). ───
  const linhasPorCiclo = useMemo<LinhaPorCiclo[]>(() => {
    if (ciclosSelecionados.size === 0) return []

    const grupos: Record<string, {
      qtd: number; diasSoma: number; ganhoSoma: number
      consumoConcSoma: number; ganhoConcentradoSoma: number
      custoAlimSoma: number; custoOpSoma: number
    }> = {}

    for (const a of animaisAtivosRaw) {
      if (!passaFiltroFornecedor(fornecedorPorAnimalAtivos[a.id] ?? null)) continue
      const r = resultadosAtivos[a.id]
      if (!r) continue
      const etapas = Object.values(r.porEtapa).filter(e => ciclosSelecionados.has(e.numero))
      if (etapas.length === 0) continue

      const g = grupos[a.lote_atual_id] ??= { qtd: 0, diasSoma: 0, ganhoSoma: 0, consumoConcSoma: 0, ganhoConcentradoSoma: 0, custoAlimSoma: 0, custoOpSoma: 0 }
      g.qtd += 1
      for (const e of etapas) {
        g.diasSoma += e.dias
        g.ganhoSoma += e.ganhoPeso
        g.consumoConcSoma += e.consumoConcentradoKg
        g.ganhoConcentradoSoma += e.ganhoPesoConcentrado
        g.custoAlimSoma += e.custoAlimentacao
        g.custoOpSoma += e.custoOperacional
      }
    }

    return Object.entries(grupos).map(([loteId, g]) => ({
      loteId, loteNome: nomePorLote[loteId]?.nome ?? '—',
      qtd: g.qtd,
      diasMedio: g.qtd > 0 ? g.diasSoma / g.qtd : 0,
      ganhoMedio: g.qtd > 0 ? g.ganhoSoma / g.qtd : 0,
      gmdMedio: g.diasSoma > 0 ? g.ganhoSoma / g.diasSoma : 0,
      // Conversão = kg concentrado / kg ganho ATRIBUÍDO ao concentrado (ver
      // mesma decisão na tabela de lotes ativos, acima).
      conversao: (g.consumoConcSoma > 0 && g.ganhoConcentradoSoma > 0) ? g.consumoConcSoma / g.ganhoConcentradoSoma : null,
      custoAlimMedio: g.qtd > 0 ? g.custoAlimSoma / g.qtd : 0,
      custoOpMedio: g.qtd > 0 ? g.custoOpSoma / g.qtd : 0,
      custoPorKg: g.ganhoSoma > 0 ? (g.custoAlimSoma + g.custoOpSoma) / g.ganhoSoma : null,
    }))
  }, [animaisAtivosRaw, resultadosAtivos, ciclosSelecionados, nomePorLote, fornecedorPorAnimalAtivos, passaFiltroFornecedor])

  // ─── Dados brutos de cada venda já registrada — ver VendidoRaw no topo. ───
  const [vendidosRaw, setVendidosRaw] = useState<VendidoRaw[]>([])

  // ─── Lotes com vendas registradas: dados realizados (peso na venda, custo e
  // lucro já liquidados na hora da venda), não é projeção. Um lote pode
  // aparecer aqui mesmo ainda ativo, se já teve alguma venda parcial. ───
  const carregarVendidos = useCallback(async () => {
    if (!user) return
    setLoadingVendidos(true)
    const { data: movsData } = await supabase
      .from('movimentacoes_animais')
      .select('animal_id, data, peso, valor, custo_atribuido, lucro, lote_origem_id, animais(peso_entrada, data_entrada)')
      .eq('user_id', user.id).not('lucro', 'is', null)
      .in('tipo', ['saida_venda', 'saida_abate', 'saida_transferencia', 'saida_morte'])

    const movs = (movsData ?? []) as any[]

    // ─── Consumo de concentrado até a data de cada venda ───────────────────
    // Esta tabela não usa o motor de custo (só dados já liquidados salvos no
    // banco), mas a Conversão precisa do consumo de concentrado, que só o
    // motor calcula. Roda o motor uma vez por data de venda distinta
    // (agrupando os animais vendidos naquela data), reconstruindo o consumo
    // de cada animal até o dia da própria venda dele.
    const datasUnicas = Array.from(new Set(movs.map(m => m.data).filter(Boolean)))
    const consumoConcPorAnimalData: Record<string, number> = {}
    const ganhoConcentradoPorAnimalData: Record<string, number> = {}
    const consumoPromise = datasUnicas.length > 0 ? Promise.all(datasUnicas.map(async (data) => {
      const idsNaData = Array.from(new Set(
        movs.filter(m => m.data === data && m.animal_id).map(m => m.animal_id as string)
      ))
      if (idsNaData.length === 0) return
      const resultados = await calcularEmLote(idsNaData, data)
      for (const id of idsNaData) {
        const r = resultados[id]
        if (r) {
          consumoConcPorAnimalData[`${id}|${data}`] = r.consumoConcentradoKg
          ganhoConcentradoPorAnimalData[`${id}|${data}`] = r.ganhoPesoConcentrado
        }
      }
    })) : Promise.resolve([])

    const [, fornecedorPorAnimal] = await Promise.all([
      consumoPromise,
      buscarFornecedorPorAnimal(Array.from(new Set(movs.map(m => m.animal_id).filter(Boolean)))),
    ])

    const raw: VendidoRaw[] = movs
      .filter(m => m.lote_origem_id && m.animais && m.peso != null)
      .map(m => ({
        animal_id: m.animal_id,
        loteOrigemId: m.lote_origem_id as string,
        fornecedorId: fornecedorPorAnimal[m.animal_id] ?? null,
        data: m.data, pesoEntrada: m.animais.peso_entrada as number, dataEntrada: m.animais.data_entrada as string,
        peso: m.peso,
        consumoConcKg: consumoConcPorAnimalData[`${m.animal_id}|${m.data}`] ?? 0,
        ganhoConcentradoKg: ganhoConcentradoPorAnimalData[`${m.animal_id}|${m.data}`] ?? 0,
        custoAtribuido: m.custo_atribuido ?? 0, lucro: m.lucro ?? 0, valor: m.valor ?? 0,
      }))
    setVendidosRaw(raw)
    setLoadingVendidos(false)
  }, [user, calcularEmLote])

  // ─── Agregação dos dados brutos por lote ou por fornecedor, com o filtro de
  // fornecedor aplicado — reprocessa client-side, sem novo fetch, igual ao
  // padrão de `ativos` acima. ───
  const vendidos = useMemo<LinhaVendido[]>(() => {
    const grupos: Record<string, {
      qtd: number; pesoSoma: number; ganhoSoma: number; diasSoma: number
      consumoConcSoma: number; ganhoConcentradoSoma: number
      custoSoma: number; lucroSoma: number; receitaSoma: number
    }> = {}

    for (const v of vendidosRaw) {
      if (!passaFiltroFornecedor(v.fornecedorId)) continue
      const chave = agruparPor === 'lote' ? v.loteOrigemId : (v.fornecedorId ?? SEM_FORNECEDOR)
      const g = grupos[chave] ??= { qtd: 0, pesoSoma: 0, ganhoSoma: 0, diasSoma: 0, consumoConcSoma: 0, ganhoConcentradoSoma: 0, custoSoma: 0, lucroSoma: 0, receitaSoma: 0 }
      const ganho = v.peso - v.pesoEntrada
      const dias = Math.max(0, Math.floor((new Date(v.data).getTime() - new Date(v.dataEntrada).getTime()) / 86400000))

      g.qtd += 1
      g.pesoSoma += v.peso
      g.ganhoSoma += ganho
      g.diasSoma += dias
      g.consumoConcSoma += v.consumoConcKg
      g.ganhoConcentradoSoma += v.ganhoConcentradoKg
      g.custoSoma += v.custoAtribuido
      g.lucroSoma += v.lucro
      g.receitaSoma += v.valor
    }

    return Object.entries(grupos).map(([grupoId, g]) => ({
      grupoId,
      grupoNome: agruparPor === 'lote'
        ? (nomePorLote[grupoId]?.nome ?? '—')
        : (grupoId === SEM_FORNECEDOR ? 'Não informado' : nomeFornecedor(grupoId)),
      qtd: g.qtd,
      pesoMedioVenda: g.qtd > 0 ? g.pesoSoma / g.qtd : 0,
      gmdMedio: g.diasSoma > 0 ? g.ganhoSoma / g.diasSoma : 0,
      // Conversão = kg concentrado / kg ganho ATRIBUÍDO ao concentrado (ver
      // mesma decisão nas outras tabelas deste arquivo).
      conversao: (g.consumoConcSoma > 0 && g.ganhoConcentradoSoma > 0) ? g.consumoConcSoma / g.ganhoConcentradoSoma : null,
      custoPorKg: g.ganhoSoma > 0 ? g.custoSoma / g.ganhoSoma : null,
      lucroTotal: g.lucroSoma,
      margemPct: g.receitaSoma > 0 ? (g.lucroSoma / g.receitaSoma) * 100 : null,
      lucroPorAnimal: g.qtd > 0 ? g.lucroSoma / g.qtd : 0,
    }))
  }, [vendidosRaw, agruparPor, passaFiltroFornecedor, nomePorLote, nomeFornecedor])

  useEffect(() => { carregarAtivos() }, [carregarAtivos])
  useEffect(() => { carregarVendidos() }, [carregarVendidos])

  const loading = tab === 'ativos' ? loadingAtivos : loadingVendidos
  const listaVazia = tab === 'ativos' ? ativos.length === 0 : vendidos.length === 0
  const ativosOrdenados = useMemo(() => ordenarLinhas(ativos, sortAtivos), [ativos, sortAtivos])
  const vendidosOrdenados = useMemo(() => ordenarLinhas(vendidos, sortVendidos), [vendidos, sortVendidos])

  // ─── Linha de totais: soma para contagens e valores em R$ (animais, valor
  // investido, lucro); média simples entre os lotes exibidos para taxas
  // (peso médio, GMD, custo/kg, margem). Colunas sem dado em nenhum lote
  // ficam em branco. ───
  const totalAtivos = useMemo(() => {
    if (ativos.length === 0) return null
    const n = ativos.length
    const custos = ativos.map(l => l.custoPorKg).filter((v): v is number => v != null)
    const conversoes = ativos.map(l => l.conversao).filter((v): v is number => v != null)
    const lucros = ativos.map(l => l.lucroProjetado).filter((v): v is number => v != null)
    const margens = ativos.map(l => l.margemProjetada).filter((v): v is number => v != null)
    return {
      qtd: ativos.reduce((s, l) => s + l.qtd, 0),
      pesoMedio: ativos.reduce((s, l) => s + l.pesoMedio, 0) / n,
      gmdMedio: ativos.reduce((s, l) => s + l.gmdMedio, 0) / n,
      conversao: conversoes.length > 0 ? conversoes.reduce((s, v) => s + v, 0) / conversoes.length : null,
      custoPorKg: custos.length > 0 ? custos.reduce((s, v) => s + v, 0) / custos.length : null,
      valorCompraTotal: ativos.reduce((s, l) => s + l.valorCompraTotal, 0),
      lucroProjetado: lucros.length > 0 ? lucros.reduce((s, v) => s + v, 0) : null,
      margemProjetada: margens.length > 0 ? margens.reduce((s, v) => s + v, 0) / margens.length : null,
    }
  }, [ativos])

  const totalVendidos = useMemo(() => {
    if (vendidos.length === 0) return null
    const n = vendidos.length
    const custos = vendidos.map(l => l.custoPorKg).filter((v): v is number => v != null)
    const conversoes = vendidos.map(l => l.conversao).filter((v): v is number => v != null)
    const margens = vendidos.map(l => l.margemPct).filter((v): v is number => v != null)
    return {
      qtd: vendidos.reduce((s, l) => s + l.qtd, 0),
      pesoMedioVenda: vendidos.reduce((s, l) => s + l.pesoMedioVenda, 0) / n,
      gmdMedio: vendidos.reduce((s, l) => s + l.gmdMedio, 0) / n,
      conversao: conversoes.length > 0 ? conversoes.reduce((s, v) => s + v, 0) / conversoes.length : null,
      custoPorKg: custos.length > 0 ? custos.reduce((s, v) => s + v, 0) / custos.length : null,
      lucroTotal: vendidos.reduce((s, l) => s + l.lucroTotal, 0),
      margemPct: margens.length > 0 ? margens.reduce((s, v) => s + v, 0) / margens.length : null,
      lucroPorAnimal: vendidos.reduce((s, l) => s + l.lucroPorAnimal, 0) / n,
    }
  }, [vendidos])

  return (
    <div className="page">
      <PageHeader title="Comparativo de lotes" subtitle="Lotes lado a lado — peso médio, GMD, conversão, custo/kg ganho, lucro e margem" />

      <div className="tabs">
        <button className={`tab-btn${tab === 'ativos' ? ' active' : ''}`} onClick={() => setTab('ativos')}>Com animais ativos</button>
        <button className={`tab-btn${tab === 'vendidos' ? ' active' : ''}`} onClick={() => setTab('vendidos')}>Com vendas registradas</button>
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 16 }}>
        <div className="form-group" style={{ minWidth: 220 }}>
          <label className="form-label">Agrupar por</label>
          <select className="form-input" value={agruparPor} onChange={e => setAgruparPor(e.target.value as 'lote' | 'fornecedor')}>
            <option value="lote">Lote</option>
            <option value="fornecedor">Fornecedor</option>
          </select>
        </div>
        <div className="form-group" style={{ minWidth: 220 }}>
          <label className="form-label">Filtrar por fornecedor</label>
          <select className="form-input" value={fornecedorFiltro} onChange={e => setFornecedorFiltro(e.target.value)}>
            <option value="todos">Todos os fornecedores</option>
            <option value="nao_informado">Não informado</option>
            {fornecedoresDisponiveis.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </div>
      </div>
      {agruparPor === 'fornecedor' && (
        <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: -8, marginBottom: 16 }}>
          Agrupado por fornecedor — cada linha soma animais de todos os lotes que receberam leva desse fornecedor.
        </div>
      )}

      {tab === 'ativos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
            Peso, GMD e custo/kg são o estado atual dos lotes. Lucro e margem só aparecem se você informar um preço esperado — sem preço, essas colunas ficam em branco (projeção, não realizado).
          </div>
          <div className="form-row-3">
            <div className="form-group">
              <label className="form-label">Preço esperado (R$/kg vivo)</label>
              <input className="form-input" type="number" step="0.01" value={preco} onChange={e => setPreco(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">% comissão</label>
              <input className="form-input" type="number" step="0.1" value={pctComissao} onChange={e => setPctComissao(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">% encargo</label>
              <input className="form-input" type="number" step="0.1" value={pctEncargo} onChange={e => setPctEncargo(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {tab === 'ativos' && ciclosDisponiveis.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, padding: 12, border: '1px solid var(--border)', borderRadius: 8 }}>
          <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
            Marque um ou mais ciclos para ver o custo e ganho médios só naquele(s) período(s) — sem marcar nenhum, a tabela acima continua mostrando o processo todo.
          </div>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="form-label" style={{ margin: 0 }}>Ver por ciclo:</span>
            {ciclosDisponiveis.map(n => (
              <label key={n} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', padding: '4px 10px', borderRadius: 20, border: '1px solid var(--border)', background: ciclosSelecionados.has(n) ? 'var(--green-bg)' : '#fff' }}>
                <input type="checkbox" checked={ciclosSelecionados.has(n)} onChange={() => toggleCiclo(n)} />
                Ciclo {n}
              </label>
            ))}
            {ciclosSelecionados.size > 0 && (
              <button className="btn btn-ghost btn-sm" onClick={() => setCiclosSelecionados(new Set())}>Limpar seleção</button>
            )}
          </div>
        </div>
      )}

      {tab === 'ativos' && ciclosSelecionados.size > 0 && (
        <div className="card" style={{ padding: 0, marginBottom: 16 }}>
          <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--gray-500)', borderBottom: '1px solid var(--border)' }}>
            Custo e ganho médios só do(s) ciclo(s) {Array.from(ciclosSelecionados).sort((a, b) => a - b).join(', ')} — não inclui valor de compra nem custos variáveis (não são amarrados a um ciclo específico).
          </div>
          {linhasPorCiclo.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: 'var(--gray-500)', fontSize: 13 }}>Nenhum lote tem animais com dados nesse(s) ciclo(s) ainda.</div>
          ) : (
            <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
              <table>
                <thead>
                  <tr>
                    <SortableTh<LinhaPorCiclo> label="Lote" columnKey="loteNome" sort={sortPorCiclo} onSort={toggleSortPorCiclo} />
                    <SortableTh<LinhaPorCiclo> label="Animais" columnKey="qtd" sort={sortPorCiclo} onSort={toggleSortPorCiclo} />
                    <SortableTh<LinhaPorCiclo> label="Dias (ciclo)" columnKey="diasMedio" sort={sortPorCiclo} onSort={toggleSortPorCiclo} />
                    <SortableTh<LinhaPorCiclo> label="Ganho de peso (ciclo)" columnKey="ganhoMedio" sort={sortPorCiclo} onSort={toggleSortPorCiclo} />
                    <SortableTh<LinhaPorCiclo> label="GMD (ciclo)" columnKey="gmdMedio" sort={sortPorCiclo} onSort={toggleSortPorCiclo} />
                    <SortableTh<LinhaPorCiclo> label="Conversão" columnKey="conversao" sort={sortPorCiclo} onSort={toggleSortPorCiclo} />
                    <SortableTh<LinhaPorCiclo> label="Custo alimentação" columnKey="custoAlimMedio" sort={sortPorCiclo} onSort={toggleSortPorCiclo} />
                    <SortableTh<LinhaPorCiclo> label="Custo operacional" columnKey="custoOpMedio" sort={sortPorCiclo} onSort={toggleSortPorCiclo} />
                    <SortableTh<LinhaPorCiclo> label="Custo/kg ganho" columnKey="custoPorKg" sort={sortPorCiclo} onSort={toggleSortPorCiclo} />
                  </tr>
                </thead>
                <tbody>
                  {ordenarLinhas(linhasPorCiclo, sortPorCiclo).map(l => (
                    <tr key={l.loteId}>
                      <td><strong>{l.loteNome}</strong></td>
                      <td>{l.qtd}</td>
                      <td>{fmtNum(l.diasMedio, 1)}</td>
                      <td>{fmtNum(l.ganhoMedio, 1)} kg</td>
                      <td>{fmtNum(l.gmdMedio, 2)} kg/dia</td>
                      <td>{l.conversao != null ? `${fmtNum(l.conversao, 2)} kg/kg` : '—'}</td>
                      <td>{fmt(l.custoAlimMedio)}</td>
                      <td>{fmt(l.custoOpMedio)}</td>
                      <td>{l.custoPorKg != null ? `${fmt(l.custoPorKg)}/kg` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div className="spinner" style={{ width: 28, height: 28 }} />
        </div>
      ) : listaVazia ? (
        <div className="card">
          <EmptyState icon="◨" title={tab === 'ativos' ? 'Nenhum lote com animais ativos' : 'Nenhuma venda registrada ainda'} />
        </div>
      ) : tab === 'ativos' ? (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <SortableTh<LinhaAtivo> label={agruparPor === 'lote' ? 'Lote' : 'Fornecedor'} columnKey="grupoNome" sort={sortAtivos} onSort={toggleSortAtivos} />
                  <SortableTh<LinhaAtivo> label="Animais" columnKey="qtd" sort={sortAtivos} onSort={toggleSortAtivos} />
                  <SortableTh<LinhaAtivo> label="Peso médio" columnKey="pesoMedio" sort={sortAtivos} onSort={toggleSortAtivos} />
                  <SortableTh<LinhaAtivo> label="GMD" columnKey="gmdMedio" sort={sortAtivos} onSort={toggleSortAtivos} />
                  <SortableTh<LinhaAtivo> label="Conversão" columnKey="conversao" sort={sortAtivos} onSort={toggleSortAtivos} />
                  <SortableTh<LinhaAtivo> label="Custo/kg ganho" columnKey="custoPorKg" sort={sortAtivos} onSort={toggleSortAtivos} />
                  <SortableTh<LinhaAtivo> label="Valor investido" columnKey="valorCompraTotal" sort={sortAtivos} onSort={toggleSortAtivos} />
                  <SortableTh<LinhaAtivo> label="Lucro projetado" columnKey="lucroProjetado" sort={sortAtivos} onSort={toggleSortAtivos} />
                  <SortableTh<LinhaAtivo> label="Margem projetada" columnKey="margemProjetada" sort={sortAtivos} onSort={toggleSortAtivos} />
                </tr>
              </thead>
              <tbody>
                {ativosOrdenados.map(l => (
                  <tr key={l.grupoId}>
                    <td><strong>{l.grupoNome}</strong></td>
                    <td>{l.qtd}</td>
                    <td>{fmtNum(l.pesoMedio, 1)} kg</td>
                    <td>{fmtNum(l.gmdMedio, 2)} kg/dia</td>
                    <td>{l.conversao != null ? `${fmtNum(l.conversao, 2)} kg/kg` : '—'}</td>
                    <td>{l.custoPorKg != null ? `${fmt(l.custoPorKg)}/kg` : '—'}</td>
                    <td>{fmt(l.valorCompraTotal)}</td>
                    <td style={{ color: l.lucroProjetado == null ? undefined : l.lucroProjetado >= 0 ? '#2e7d32' : '#b91c1c' }}>
                      {l.lucroProjetado != null ? fmt(l.lucroProjetado) : '—'}
                    </td>
                    <td>{l.margemProjetada != null ? `${fmtNum(l.margemProjetada, 1)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
              {totalAtivos && (
                <tfoot>
                  <tr style={{ fontWeight: 600 }}>
                    <td>Média / total geral</td>
                    <td>{totalAtivos.qtd}</td>
                    <td>{fmtNum(totalAtivos.pesoMedio, 1)} kg</td>
                    <td>{fmtNum(totalAtivos.gmdMedio, 2)} kg/dia</td>
                    <td>{totalAtivos.conversao != null ? `${fmtNum(totalAtivos.conversao, 2)} kg/kg` : '—'}</td>
                    <td>{totalAtivos.custoPorKg != null ? `${fmt(totalAtivos.custoPorKg)}/kg` : '—'}</td>
                    <td>{fmt(totalAtivos.valorCompraTotal)}</td>
                    <td style={{ color: totalAtivos.lucroProjetado == null ? undefined : totalAtivos.lucroProjetado >= 0 ? '#2e7d32' : '#b91c1c' }}>
                      {totalAtivos.lucroProjetado != null ? fmt(totalAtivos.lucroProjetado) : '—'}
                    </td>
                    <td>{totalAtivos.margemProjetada != null ? `${fmtNum(totalAtivos.margemProjetada, 1)}%` : '—'}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <SortableTh<LinhaVendido> label={agruparPor === 'lote' ? 'Lote' : 'Fornecedor'} columnKey="grupoNome" sort={sortVendidos} onSort={toggleSortVendidos} />
                  <SortableTh<LinhaVendido> label="Animais vendidos" columnKey="qtd" sort={sortVendidos} onSort={toggleSortVendidos} />
                  <SortableTh<LinhaVendido> label="Peso médio na venda" columnKey="pesoMedioVenda" sort={sortVendidos} onSort={toggleSortVendidos} />
                  <SortableTh<LinhaVendido> label="GMD" columnKey="gmdMedio" sort={sortVendidos} onSort={toggleSortVendidos} />
                  <SortableTh<LinhaVendido> label="Conversão" columnKey="conversao" sort={sortVendidos} onSort={toggleSortVendidos} />
                  <SortableTh<LinhaVendido> label="Custo/kg ganho" columnKey="custoPorKg" sort={sortVendidos} onSort={toggleSortVendidos} />
                  <SortableTh<LinhaVendido> label="Lucro total" columnKey="lucroTotal" sort={sortVendidos} onSort={toggleSortVendidos} />
                  <SortableTh<LinhaVendido> label="Margem" columnKey="margemPct" sort={sortVendidos} onSort={toggleSortVendidos} />
                  <SortableTh<LinhaVendido> label="Lucro por animal" columnKey="lucroPorAnimal" sort={sortVendidos} onSort={toggleSortVendidos} />
                </tr>
              </thead>
              <tbody>
                {vendidosOrdenados.map(l => (
                  <tr key={l.grupoId}>
                    <td><strong>{l.grupoNome}</strong></td>
                    <td>{l.qtd}</td>
                    <td>{fmtNum(l.pesoMedioVenda, 1)} kg</td>
                    <td>{fmtNum(l.gmdMedio, 2)} kg/dia</td>
                    <td>{l.conversao != null ? `${fmtNum(l.conversao, 2)} kg/kg` : '—'}</td>
                    <td>{l.custoPorKg != null ? `${fmt(l.custoPorKg)}/kg` : '—'}</td>
                    <td style={{ color: l.lucroTotal >= 0 ? '#2e7d32' : '#b91c1c' }}>{fmt(l.lucroTotal)}</td>
                    <td>{l.margemPct != null ? `${fmtNum(l.margemPct, 1)}%` : '—'}</td>
                    <td>{fmt(l.lucroPorAnimal)}</td>
                  </tr>
                ))}
              </tbody>
              {totalVendidos && (
                <tfoot>
                  <tr style={{ fontWeight: 600 }}>
                    <td>Média / total geral</td>
                    <td>{totalVendidos.qtd}</td>
                    <td>{fmtNum(totalVendidos.pesoMedioVenda, 1)} kg</td>
                    <td>{fmtNum(totalVendidos.gmdMedio, 2)} kg/dia</td>
                    <td>{totalVendidos.conversao != null ? `${fmtNum(totalVendidos.conversao, 2)} kg/kg` : '—'}</td>
                    <td>{totalVendidos.custoPorKg != null ? `${fmt(totalVendidos.custoPorKg)}/kg` : '—'}</td>
                    <td style={{ color: totalVendidos.lucroTotal >= 0 ? '#2e7d32' : '#b91c1c' }}>{fmt(totalVendidos.lucroTotal)}</td>
                    <td>{totalVendidos.margemPct != null ? `${fmtNum(totalVendidos.margemPct, 1)}%` : '—'}</td>
                    <td>{fmt(totalVendidos.lucroPorAnimal)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
