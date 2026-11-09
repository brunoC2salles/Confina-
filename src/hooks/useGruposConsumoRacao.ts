import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import type { SaldoGrupo, RankingLoteCompra } from '@/lib/custoRacaoGrupo'
import type { GrupoConsumoLoteRow, CompraRacaoGrupo, GrupoConsumoPeriodo } from '@/types'
import * as core from '@/core/gruposConsumo'
import type { GrupoConsumoComDieta } from '@/core/gruposConsumo'

export { recomputarGrupoCompleto, type GrupoConsumoComDieta } from '@/core/gruposConsumo'

// ─── Grupos de consumo de ração ────────────────────────────────────────────
// Regras completas (consumo teórico, saldo, cadeia de custo médio) em
// src/core/gruposConsumo.ts, compartilhado com o servidor MCP.

// Lista de grupos + dados auxiliares para os formulários. Fetch leve (sem
// cálculo de consumo/saldo) — o cálculo pesado só roda no detalhe de um grupo
// específico, em useResumoGrupo, abaixo.
export function useGruposConsumoRacao() {
  const { user } = useAuth()
  const [grupos, setGrupos] = useState<GrupoConsumoComDieta[]>([])
  const [lotesAtivos, setLotesAtivos] = useState<Array<{ id: string; nome_lote: string; codigo_lote: string }>>([])
  const [dietas, setDietas] = useState<Array<{ id: string; nome: string; pct_consumo_pv_ms: number | null }>>([])
  const [fornecedores, setFornecedores] = useState<Array<{ id: string; nome: string }>>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user) { setGrupos([]); setLoading(false); return }
    setLoading(true)
    const dados = await core.carregarListaGrupos(user.id)
    setGrupos(dados.grupos)
    setLotesAtivos(dados.lotesAtivos)
    setDietas(dados.dietas)
    setFornecedores(dados.fornecedores)
    setLoading(false)

    // Migração única da conversão para kg de MS (ver migrarGruposLegadosParaMs).
    await core.migrarGruposLegadosParaMs(user.id)
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  const criarGrupo = async (input: { nome: string; dieta_id: string; observacoes?: string; loteIds: string[] }) => {
    if (!user) return { error: 'Não autenticado', grupoId: null }
    const res = await core.criarGrupo(user.id, input)
    if (!res.error) await fetch()
    return res
  }

  const editarGrupo = async (id: string, input: { nome?: string; observacoes?: string | null; status?: 'ativo' | 'encerrado' }) => {
    const res = await core.editarGrupo(id, input)
    if (!res.error) await fetch()
    return res
  }

  const excluirGrupo = async (id: string) => {
    const res = await core.excluirGrupo(id)
    if (!res.error) await fetch()
    return res
  }

  return { grupos, lotesAtivos, dietas, fornecedores, loading, criarGrupo, editarGrupo, excluirGrupo, refetch: fetch }
}

// ─── Detalhe de um grupo: membros, compras, períodos, saldo, ranking ──────
export function useResumoGrupo(grupoId: string | null) {
  const { user } = useAuth()
  const [membros, setMembros] = useState<GrupoConsumoLoteRow[]>([])
  const [compras, setCompras] = useState<CompraRacaoGrupo[]>([])
  const [periodos, setPeriodos] = useState<GrupoConsumoPeriodo[]>([])
  const [lotesInfo, setLotesInfo] = useState<Record<string, { nome_lote: string; codigo_lote: string }>>({})
  const [saldo, setSaldo] = useState<SaldoGrupo | null>(null)
  const [consumoTeoricoPorLote, setConsumoTeoricoPorLote] =
    useState<Record<string, Record<number, { pesoTotalKg: number; qtdAtiva: number; consumoKg: number }>>>({})
  const [pctConsumoPvMs, setPctConsumoPvMs] = useState<number | null>(null)
  const [pctMsDieta, setPctMsDieta] = useState<number | null>(null)
  // Ver DadosConsumoGrupo.algumAnimalNaDietaHoje. Começa true (postura
  // conservadora): antes de carregar, prefere não sugerir "ok" indevidamente.
  const [algumAnimalNaDietaHoje, setAlgumAnimalNaDietaHoje] = useState(true)
  // R$/kg teórico confirmado manualmente (ver confirmarSaldoGrupo) — null
  // enquanto não há confirmação, ou depois que uma nova compra invalida a
  // confirmação anterior.
  const [custoConfirmadoKg, setCustoConfirmadoKg] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user || !grupoId) { setLoading(false); return }
    setLoading(true)
    const { dados, saldo: saldoCalculado } = await core.carregarResumoGrupo(grupoId)
    setMembros(dados.membrosArr)
    setCompras(dados.comprasArr)
    setPeriodos(dados.periodosArr)
    setLotesInfo(dados.lotesInfo)
    setPctConsumoPvMs(dados.pct)
    setPctMsDieta(dados.pctMsDieta)
    setConsumoTeoricoPorLote(dados.consumoTeoricoPorLote)
    setAlgumAnimalNaDietaHoje(dados.algumAnimalNaDietaHoje)
    setCustoConfirmadoKg(dados.custoConfirmadoKg)
    setSaldo(saldoCalculado)
    setLoading(false)
  }, [user, grupoId])

  useEffect(() => { fetch() }, [fetch])

  const comRecarga = async (op: Promise<{ error: string | null }>) => {
    const res = await op
    if (!res.error) await fetch()
    return res
  }

  const registrarCompra = async (input: {
    quantidade_kg: number; valor_total: number; data_compra: string; data_inicio_uso: string
    pct_ms: number
    parceiro_id?: string | null; observacoes?: string
  }) => {
    if (!user || !grupoId) return { error: 'Não autenticado' }
    return comRecarga(core.registrarCompraGrupo(user.id, grupoId, input))
  }

  const editarCompra = async (compraId: string, input: { quantidade_kg: number; valor_total: number; pct_ms: number }) => {
    if (!user || !grupoId) return { error: 'Não autenticado' }
    return comRecarga(core.editarCompraGrupo(user.id, grupoId, compraId, input))
  }

  const confirmarSaldoAtual = async () => {
    if (!user || !grupoId) return { error: 'Não autenticado' }
    return comRecarga(core.confirmarSaldoGrupo(grupoId, saldo, compras))
  }

  const limparConfirmacaoSaldo = async () => {
    if (!user || !grupoId) return { error: 'Não autenticado' }
    return comRecarga(core.limparConfirmacaoSaldoGrupo(grupoId))
  }

  const adicionarLote = async (loteId: string, dataInicio: string) => {
    if (!user || !grupoId) return { error: 'Não autenticado' }
    return comRecarga(core.adicionarLoteGrupo(user.id, grupoId, loteId, dataInicio))
  }

  const encerrarParticipacao = async (membershipId: string, dataFim: string) =>
    comRecarga(core.encerrarParticipacaoGrupo(membershipId, dataFim))

  const rankingPorCompra = useCallback((compraId: string): RankingLoteCompra[] =>
    core.rankingConsumoDaCompra(periodos, consumoTeoricoPorLote, compraId), [periodos, consumoTeoricoPorLote])

  // Só mostra o alerta de saldo negativo se ainda houver consumo em aberto
  // nessa dieta hoje E ainda não houver uma confirmação de custo vigente —
  // depois de confirmado, o rateio já está correto (capado no que foi
  // realmente pago), não precisa mais chamar atenção.
  const mostrarAlertaSaldo = core.deveMostrarAlertaSaldo(saldo, algumAnimalNaDietaHoje, custoConfirmadoKg)

  return {
    membros, compras, periodos, lotesInfo, saldo, loading, pctConsumoPvMs, pctMsDieta, mostrarAlertaSaldo, custoConfirmadoKg,
    registrarCompra, editarCompra, confirmarSaldoAtual, limparConfirmacaoSaldo, adicionarLote, encerrarParticipacao, rankingPorCompra, refetch: fetch,
  }
}
