import { useState, useEffect, useCallback, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useLotes } from '@/hooks/useLotes'
import { useFaixas } from '@/hooks/useFaixas'
import { useParceiros } from '@/hooks/useHooks'
import {
  carregarDadosAtivosComparativo, agregarComparativoAtivos, agregarComparativoPorCiclo, totalComparativoPorCiclo,
  carregarVendidosComparativo, agregarComparativoVendidos, totalComparativoAtivos, totalComparativoVendidos,
  type LinhaComparativoAtivo, type LinhaComparativoVendido, type LinhaComparativoCiclo, type VendidoComparativoRaw,
  type DadosAtivosComparativo,
} from '@/core/analises'
import { PageHeader, EmptyState } from '@/components/common/UI'
import { fmt, fmtNum } from '@/lib/calculations'

type LinhaAtivo = LinhaComparativoAtivo
type LinhaVendido = LinhaComparativoVendido
type LinhaPorCiclo = LinhaComparativoCiclo
type VendidoRaw = VendidoComparativoRaw

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
  const [dadosAtivos, setDadosAtivos] = useState<DadosAtivosComparativo>({ animais: [], resultados: {}, custosVar: {}, fornecedorPorAnimal: {} })

  // ─── Lotes com animais ativos: peso/GMD/custo são o estado atual; lucro e
  // margem só aparecem se um preço esperado for informado (projeção, igual à
  // do Ranking) — sem preço, ficam em branco em vez de inventar um valor. ───
  const carregarAtivos = useCallback(async () => {
    if (!user) return
    setLoadingAtivos(true)
    setDadosAtivos(await carregarDadosAtivosComparativo(user.id))
    setLoadingAtivos(false)
  }, [user])

  // ─── Tabela de sempre: todo o processo, do jeito que já funcionava ─────────
  const ativos = useMemo<LinhaAtivo[]>(
    () => agregarComparativoAtivos(dadosAtivos, {
      preco: Number(preco) || 0, pctComissao: Number(pctComissao) || 0, pctEncargo: Number(pctEncargo) || 0,
      rendimentos, bonus, agruparPor, passaFiltroFornecedor, nomePorLote, nomeFornecedor,
    }),
    [dadosAtivos, nomePorLote, preco, pctComissao, pctEncargo, rendimentos, bonus, agruparPor, passaFiltroFornecedor, nomeFornecedor])

  // ─── Tabela por ciclo: só aparece quando o produtor marca ao menos um
  // número de ciclo. Agrega, por lote, apenas os dias/ganho/custo que
  // aconteceram DENTRO dos ciclos marcados (via porEtapa, já calculado pelo
  // motor) — não é projeção nem venda, é o que já foi vivido naquele(s)
  // ciclo(s) até hoje. Custos variáveis e valor de compra ficam de fora
  // (não são amarrados a um ciclo específico). ───
  const linhasPorCiclo = useMemo<LinhaPorCiclo[]>(
    () => agregarComparativoPorCiclo(dadosAtivos, ciclosSelecionados, { passaFiltroFornecedor, nomePorLote }),
    [dadosAtivos, ciclosSelecionados, nomePorLote, passaFiltroFornecedor])

  // Linha de média da tabela por ciclo — ponderada por animal: reconstrói as
  // somas de cada lote (média x qtd) e aplica as mesmas fórmulas das linhas,
  // como se todos os animais fossem um grupo só. Útil quando o mesmo grupo de
  // animais foi bifurcado em vários lotes ao longo do caminho.
  const totalPorCiclo = useMemo(() => totalComparativoPorCiclo(linhasPorCiclo), [linhasPorCiclo])

  // ─── Dados brutos de cada venda já registrada — ver VendidoRaw no topo. ───
  const [vendidosRaw, setVendidosRaw] = useState<VendidoRaw[]>([])

  // ─── Lotes com vendas registradas: dados realizados (peso na venda, custo e
  // lucro já liquidados na hora da venda), não é projeção. Um lote pode
  // aparecer aqui mesmo ainda ativo, se já teve alguma venda parcial. ───
  const carregarVendidos = useCallback(async () => {
    if (!user) return
    setLoadingVendidos(true)
    setVendidosRaw(await carregarVendidosComparativo(user.id))
    setLoadingVendidos(false)
  }, [user])

  // ─── Agregação dos dados brutos por lote ou por fornecedor, com o filtro de
  // fornecedor aplicado — reprocessa client-side, sem novo fetch, igual ao
  // padrão de `ativos` acima. ───
  const vendidos = useMemo<LinhaVendido[]>(
    () => agregarComparativoVendidos(vendidosRaw, { agruparPor, passaFiltroFornecedor, nomePorLote, nomeFornecedor }),
    [vendidosRaw, agruparPor, passaFiltroFornecedor, nomePorLote, nomeFornecedor])

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
  const totalAtivos = useMemo(() => totalComparativoAtivos(ativos), [ativos])

  const totalVendidos = useMemo(() => totalComparativoVendidos(vendidos), [vendidos])

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
                {totalPorCiclo && (
                  <tfoot>
                    <tr style={{ fontWeight: 600 }}>
                      <td>Média / total geral</td>
                      <td>{totalPorCiclo.qtd}</td>
                      <td>{fmtNum(totalPorCiclo.diasMedio, 1)}</td>
                      <td>{fmtNum(totalPorCiclo.ganhoMedio, 1)} kg</td>
                      <td>{fmtNum(totalPorCiclo.gmdMedio, 2)} kg/dia</td>
                      <td>{totalPorCiclo.conversao != null ? `${fmtNum(totalPorCiclo.conversao, 2)} kg/kg` : '—'}</td>
                      <td>{fmt(totalPorCiclo.custoAlimMedio)}</td>
                      <td>{fmt(totalPorCiclo.custoOpMedio)}</td>
                      <td>{totalPorCiclo.custoPorKg != null ? `${fmt(totalPorCiclo.custoPorKg)}/kg` : '—'}</td>
                    </tr>
                  </tfoot>
                )}
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
