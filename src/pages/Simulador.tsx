import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { useDietas } from '@/hooks/useDietas'
import { useSimulacoes, type Simulacao } from '@/hooks/useSimulacoes'
import { useCustoEngine, buscarTudoPaginado, buscarPorIds } from '@/hooks/useLotes'
import { PageHeader, EmptyState } from '@/components/common/UI'
import { CicloCard } from '@/components/simulador/CicloCard'
import { ResultadoCaminho } from '@/components/simulador/ResultadoCaminho'
import { fmt, fmtNum } from '@/lib/calculations'
import {
  calcularCenario, cicloVazio, cenarioVazio, dadosIniciais, duplicarCenario,
  type SimDados, type SimCenario, type SimPartida, type ResultadoCenario,
} from '@/lib/simulador'

const hojeStr = () => new Date().toISOString().slice(0, 10)
const fmtDataBr = (d: string) => d.split('-').reverse().join('/')
const corValor = (v: number | null) => v == null ? undefined : v >= 0 ? 'var(--green)' : 'var(--red)'

interface Aberta {
  id: string | null
  nome: string
  dados: SimDados
}

export default function Simulador() {
  const { simulacoes, loading, tabelaAusente, criarSimulacao, salvarSimulacao, excluirSimulacao } = useSimulacoes()
  const [aberta, setAberta] = useState<Aberta | null>(null)
  const [sujo, setSujo] = useState(false)

  const abrir = (s: Simulacao) => { setAberta({ id: s.id, nome: s.nome, dados: s.dados }); setSujo(false) }
  const nova = () => { setAberta({ id: null, nome: 'Nova simulação', dados: dadosIniciais() }); setSujo(true) }
  const fechar = () => {
    if (sujo && !window.confirm('Há alterações não salvas. Sair mesmo assim?')) return
    setAberta(null); setSujo(false)
  }

  if (aberta) {
    return (
      <EditorSimulacao
        aberta={aberta}
        sujo={sujo}
        onChange={a => { setAberta(a); setSujo(true) }}
        onFechar={fechar}
        onSalvar={async () => {
          if (aberta.id) {
            const r = await salvarSimulacao(aberta.id, aberta.nome.trim() || 'Simulação', aberta.dados)
            if (!r.error) setSujo(false)
            return r.error
          }
          const r = await criarSimulacao(aberta.nome.trim() || 'Simulação', aberta.dados)
          if (!r.error && r.id) { setAberta({ ...aberta, id: r.id }); setSujo(false) }
          return r.error
        }}
        onExcluir={async () => {
          if (!aberta.id) { setAberta(null); setSujo(false); return }
          if (!window.confirm(`Excluir a simulação "${aberta.nome}"?`)) return
          const r = await excluirSimulacao(aberta.id)
          if (r.error) { alert(r.error); return }
          setAberta(null); setSujo(false)
        }}
      />
    )
  }

  return (
    <div className="page">
      <PageHeader title="Simulador"
        subtitle="Monte caminhos do ciclo inicial até a venda e compare qual é mais rentável"
        action={<button className="btn btn-primary" onClick={nova} disabled={tabelaAusente}>+ Nova simulação</button>} />

      {tabelaAusente && (
        <div className="card" style={{ padding: 16, marginBottom: 16, background: '#fff8e1', borderColor: '#fde68a', fontSize: 13 }}>
          A tabela de simulações ainda não existe no banco. Rode o SQL de <code>supabase/simulacoes.sql</code> no SQL Editor do Supabase.
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div className="spinner" style={{ width: 28, height: 28 }} />
        </div>
      ) : simulacoes.length === 0 ? (
        <div className="card">
          <EmptyState icon="" title="Nenhuma simulação salva"
            desc="Crie uma simulação, defina o ponto de partida e monte um ou mais caminhos de ciclos até a venda."
            action={!tabelaAusente ? <button className="btn btn-primary" onClick={nova}>Criar simulação</button> : undefined} />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
          {simulacoes.map(s => <CardSimulacao key={s.id} s={s} onAbrir={() => abrir(s)} />)}
        </div>
      )}
    </div>
  )
}

function CardSimulacao({ s, onAbrir }: { s: Simulacao; onAbrir: () => void }) {
  const resultados = useMemo(() => s.dados.cenarios.map(c => ({ c, r: calcularCenario(s.dados.partida, c) })), [s])
  const validos = resultados.filter(x => x.r.erros.length === 0 && x.r.lucroCabeca != null)
  const melhor = validos.length > 0 ? validos.reduce((a, b) => (b.r.lucroCabeca! > a.r.lucroCabeca! ? b : a)) : null
  return (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
      <div style={{ fontSize: 15, fontWeight: 600 }}>{s.nome}</div>
      <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
        {s.dados.cenarios.length} caminho{s.dados.cenarios.length !== 1 ? 's' : ''}
        {s.dados.partida.origem === 'lote' && s.dados.partida.loteNome ? ` · lote ${s.dados.partida.loteNome}` : ''}
        {' '}· atualizada em {fmtDataBr(s.updated_at.slice(0, 10))}
      </div>
      {melhor && (
        <div style={{ fontSize: 13 }}>
          Mais rentável: <strong>{melhor.c.nome}</strong>{' '}
          <span style={{ color: corValor(melhor.r.lucroCabeca) }}>{fmt(melhor.r.lucroCabeca!)}/cabeça</span>
        </div>
      )}
      <button className="btn btn-ghost btn-sm" style={{ justifyContent: 'center', marginTop: 'auto' }} onClick={onAbrir}>Abrir</button>
    </div>
  )
}

// ─── Editor ─────────────────────────────────────────────────────────────────

function EditorSimulacao({ aberta, sujo, onChange, onFechar, onSalvar, onExcluir }: {
  aberta: Aberta
  sujo: boolean
  onChange: (a: Aberta) => void
  onFechar: () => void
  onSalvar: () => Promise<string | null>
  onExcluir: () => void
}) {
  const { dietas, ingredientesDisponiveis } = useDietas()
  const [cenarioAtivoId, setCenarioAtivoId] = useState(aberta.dados.cenarios[0]?.id ?? '')
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  const { dados } = aberta
  const setDados = (d: SimDados) => onChange({ ...aberta, dados: d })
  const setPartida = (p: Partial<SimPartida>) => setDados({ ...dados, partida: { ...dados.partida, ...p } })
  const setCenario = (c: SimCenario) => setDados({ ...dados, cenarios: dados.cenarios.map(x => x.id === c.id ? c : x) })

  const cenarioAtivo = dados.cenarios.find(c => c.id === cenarioAtivoId) ?? dados.cenarios[0]
  useEffect(() => { if (cenarioAtivo && cenarioAtivo.id !== cenarioAtivoId) setCenarioAtivoId(cenarioAtivo.id) }, [cenarioAtivo, cenarioAtivoId])

  const resultados = useMemo(() => {
    const m: Record<string, ResultadoCenario> = {}
    for (const c of dados.cenarios) m[c.id] = calcularCenario(dados.partida, c)
    return m
  }, [dados])

  const novoCaminho = () => {
    const c = cenarioVazio(dados.cenarios.length + 1)
    setDados({ ...dados, cenarios: [...dados.cenarios, c] })
    setCenarioAtivoId(c.id)
  }
  const duplicarCaminho = () => {
    if (!cenarioAtivo) return
    const c = duplicarCenario(cenarioAtivo, `${cenarioAtivo.nome} (cópia)`)
    setDados({ ...dados, cenarios: [...dados.cenarios, c] })
    setCenarioAtivoId(c.id)
  }
  const removerCaminho = () => {
    if (!cenarioAtivo || dados.cenarios.length <= 1) return
    if (!window.confirm(`Remover o caminho "${cenarioAtivo.nome}"?`)) return
    const resto = dados.cenarios.filter(c => c.id !== cenarioAtivo.id)
    setDados({ ...dados, cenarios: resto })
    setCenarioAtivoId(resto[0].id)
  }

  const salvar = async () => {
    setSalvando(true); setMsg(null)
    const erro = await onSalvar()
    setSalvando(false)
    setMsg(erro ? { tipo: 'erro', texto: erro } : { tipo: 'ok', texto: 'Simulação salva' })
  }

  const fieldLabel: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4, display: 'block' }

  return (
    <div className="page">
      <div className="flex-between" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div style={{ flex: '1 1 280px', minWidth: 0 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onFechar} style={{ marginBottom: 8 }}>Voltar às simulações</button>
          <input className="form-input" value={aberta.nome} onChange={e => onChange({ ...aberta, nome: e.target.value })}
            style={{ fontSize: 18, fontWeight: 600, height: 44 }} placeholder="Nome da simulação" />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          {msg && <span style={{ fontSize: 13, color: msg.tipo === 'ok' ? 'var(--green)' : 'var(--red)' }}>{msg.texto}</span>}
          {sujo && !msg && <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Alterações não salvas</span>}
          <button type="button" className="btn btn-ghost" style={{ color: 'var(--red)' }} onClick={onExcluir}>Excluir</button>
          <button type="button" className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {salvando ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Salvar'}
          </button>
        </div>
      </div>

      <PartidaCard partida={dados.partida} onChange={setPartida} />

      <ComparativoCaminhos cenarios={dados.cenarios} resultados={resultados} ativoId={cenarioAtivo?.id ?? ''} onSelecionar={setCenarioAtivoId} />

      {/* Seleção do caminho em edição */}
      <div className="flex-between" style={{ gap: 8, flexWrap: 'wrap', margin: '24px 0 12px' }}>
        <div className="pill-wrap" style={{ marginBottom: 0 }}>
          {dados.cenarios.map(c => (
            <button key={c.id} type="button" className={`pill${c.id === cenarioAtivo?.id ? ' active' : ''}`} onClick={() => setCenarioAtivoId(c.id)}>
              {c.nome || 'Caminho'}
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={novoCaminho}>+ Novo caminho</button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={duplicarCaminho}>Duplicar caminho</button>
          <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={removerCaminho} disabled={dados.cenarios.length <= 1}>Remover caminho</button>
        </div>
      </div>

      {cenarioAtivo && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
              <div style={{ gridColumn: 'span 2', minWidth: 0 }}>
                <label style={fieldLabel}>Nome do caminho</label>
                <input className="form-input" value={cenarioAtivo.nome} onChange={e => setCenario({ ...cenarioAtivo, nome: e.target.value })} />
              </div>
              <div>
                <label style={fieldLabel}>Preço de venda (R$/kg vivo)</label>
                <input className="form-input" type="number" step="0.01" value={cenarioAtivo.venda.precoKg}
                  onChange={e => setCenario({ ...cenarioAtivo, venda: { ...cenarioAtivo.venda, precoKg: e.target.value } })} />
              </div>
              <div>
                <label style={fieldLabel}>% comissão</label>
                <input className="form-input" type="number" step="0.1" value={cenarioAtivo.venda.pctComissao}
                  onChange={e => setCenario({ ...cenarioAtivo, venda: { ...cenarioAtivo.venda, pctComissao: e.target.value } })} />
              </div>
              <div>
                <label style={fieldLabel}>% encargos</label>
                <input className="form-input" type="number" step="0.1" value={cenarioAtivo.venda.pctEncargo}
                  onChange={e => setCenario({ ...cenarioAtivo, venda: { ...cenarioAtivo.venda, pctEncargo: e.target.value } })} />
              </div>
              <div>
                <label style={fieldLabel}>Rendimento de carcaça (%)</label>
                <input className="form-input" type="number" step="0.1" value={cenarioAtivo.venda.rendimentoPct}
                  onChange={e => setCenario({ ...cenarioAtivo, venda: { ...cenarioAtivo.venda, rendimentoPct: e.target.value } })} />
              </div>
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 6 }}>
              Venda em peso vivo. O rendimento de carcaça é usado só no indicador de lucro por @.
            </div>
          </div>

          {cenarioAtivo.ciclos.map((ci, idx) => (
            <CicloCard key={ci.id} ciclo={ci} indice={idx} total={cenarioAtivo.ciclos.length}
              dietas={dietas} ingredientes={ingredientesDisponiveis}
              onChange={novo => setCenario({ ...cenarioAtivo, ciclos: cenarioAtivo.ciclos.map(x => x.id === novo.id ? novo : x) })}
              onRemove={() => setCenario({ ...cenarioAtivo, ciclos: cenarioAtivo.ciclos.filter(x => x.id !== ci.id) })}
              onMover={dir => {
                const arr = [...cenarioAtivo.ciclos]
                const j = idx + dir
                if (j < 0 || j >= arr.length) return
                ;[arr[idx], arr[j]] = [arr[j], arr[idx]]
                setCenario({ ...cenarioAtivo, ciclos: arr })
              }} />
          ))}
          <div>
            <button type="button" className="btn btn-secondary" onClick={() => setCenario({ ...cenarioAtivo, ciclos: [...cenarioAtivo.ciclos, cicloVazio(cenarioAtivo.ciclos.length + 1)] })}>
              + Adicionar ciclo
            </button>
          </div>

          {resultados[cenarioAtivo.id] && <ResultadoCaminho r={resultados[cenarioAtivo.id]} />}
        </div>
      )}
    </div>
  )
}

// ─── Ponto de partida ───────────────────────────────────────────────────────

function PartidaCard({ partida, onChange }: { partida: SimPartida; onChange: (p: Partial<SimPartida>) => void }) {
  const { user } = useAuth()
  const { calcularEmLote } = useCustoEngine()
  const [lotes, setLotes] = useState<Array<{ id: string; nome_lote: string }>>([])
  const [loteSel, setLoteSel] = useState(partida.loteId ?? '')
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    supabase.from('lotes').select('id, nome_lote').eq('user_id', user.id).eq('status', 'ativo').order('nome_lote')
      .then(({ data }) => setLotes((data ?? []) as Array<{ id: string; nome_lote: string }>))
  }, [user])

  // Estado de hoje do lote: animais ativos, peso médio projetado hoje pelo
  // motor de custo e investimento médio já feito por cabeça (compra + custo
  // acumulado de alimentação/operacional + custos variáveis).
  const carregarLote = async () => {
    const lote = lotes.find(l => l.id === loteSel)
    if (!lote) return
    setCarregando(true); setErro(null)
    const animais = await buscarTudoPaginado<{ id: string; valor_compra: number | null }>((from, to) =>
      supabase.from('animais').select('id, valor_compra').eq('lote_atual_id', lote.id).eq('status', 'ativo').range(from, to))
    if (animais.length === 0) { setErro('Esse lote não tem animais ativos'); setCarregando(false); return }
    const ids = animais.map(a => a.id)
    const hoje = hojeStr()
    const [resultados, custosVar] = await Promise.all([
      calcularEmLote(ids, hoje),
      buscarPorIds<{ animal_id: string; valor: number }>(ids, (idsChunk, from, to) =>
        supabase.from('custos_variaveis_animal').select('animal_id, valor').in('animal_id', idsChunk).range(from, to)),
    ])
    const custoVarPorAnimal: Record<string, number> = {}
    for (const c of custosVar) custoVarPorAnimal[c.animal_id] = (custoVarPorAnimal[c.animal_id] ?? 0) + Number(c.valor)
    let n = 0, pesoSoma = 0, compraSoma = 0, custoSoma = 0
    for (const a of animais) {
      const r = resultados[a.id]
      if (!r) continue
      n++
      pesoSoma += r.peso
      compraSoma += Number(a.valor_compra ?? 0)
      custoSoma += r.custoAcumulado + (custoVarPorAnimal[a.id] ?? 0)
    }
    setCarregando(false)
    if (n === 0) { setErro('Não foi possível calcular o estado dos animais desse lote'); return }
    onChange({
      origem: 'lote', loteId: lote.id, loteNome: lote.nome_lote, dataReferencia: hoje,
      qtdAnimais: String(n),
      pesoInicial: (pesoSoma / n).toFixed(1),
      compraModo: 'cabeca',
      compraValor: (compraSoma / n).toFixed(2),
      custoAnteriorPorCabeca: (custoSoma / n).toFixed(2),
    })
  }

  const fieldLabel: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4, display: 'block' }

  return (
    <div className="card" style={{ padding: 16, marginBottom: 16 }}>
      <div className="flex-between" style={{ gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        <div style={{ fontSize: 14, fontWeight: 600 }}>Ponto de partida <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-3)' }}>· comum a todos os caminhos</span></div>
        <div className="pill-wrap" style={{ marginBottom: 0 }}>
          <button type="button" className={`pill${partida.origem === 'manual' ? ' active' : ''}`}
            onClick={() => onChange({ origem: 'manual', loteId: null, loteNome: null, dataReferencia: null })}>Informar à mão</button>
          <button type="button" className={`pill${partida.origem === 'lote' ? ' active' : ''}`}
            onClick={() => onChange({ origem: 'lote' })}>Puxar de um lote</button>
        </div>
      </div>

      {partida.origem === 'lote' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
          <div style={{ flex: '1 1 240px', minWidth: 0 }}>
            <label style={fieldLabel}>Lote ativo</label>
            <select className="form-input" value={loteSel} onChange={e => setLoteSel(e.target.value)}>
              <option value="">Selecione...</option>
              {lotes.map(l => <option key={l.id} value={l.id}>{l.nome_lote}</option>)}
            </select>
          </div>
          <button type="button" className="btn btn-secondary" onClick={carregarLote} disabled={!loteSel || carregando}>
            {carregando ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Carregar dados de hoje'}
          </button>
        </div>
      )}
      {erro && <div style={{ fontSize: 13, color: 'var(--red)', marginBottom: 8 }}>{erro}</div>}
      {partida.origem === 'lote' && partida.loteNome && partida.dataReferencia && (
        <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 12, padding: '8px 12px', background: 'var(--green-light)', borderRadius: 8 }}>
          Estado do lote <strong>{partida.loteNome}</strong> em {fmtDataBr(partida.dataReferencia)}: animais ativos, peso médio projetado no dia, valor médio de compra e custo médio já incorrido (alimentação, operacional e custos variáveis). A simulação parte desse dia. Os valores podem ser ajustados.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
        <div>
          <label style={fieldLabel}>Quantidade de animais</label>
          <input className="form-input" type="number" step="1" value={partida.qtdAnimais} onChange={e => onChange({ qtdAnimais: e.target.value })} />
        </div>
        <div>
          <label style={fieldLabel}>Peso inicial médio (kg)</label>
          <input className="form-input" type="number" step="0.1" value={partida.pesoInicial} onChange={e => onChange({ pesoInicial: e.target.value })} />
        </div>
        <div>
          <label style={fieldLabel}>Compra</label>
          <select className="form-input" value={partida.compraModo} onChange={e => onChange({ compraModo: e.target.value as 'kg' | 'cabeca' })}>
            <option value="kg">R$ por kg vivo</option>
            <option value="cabeca">R$ por cabeça</option>
          </select>
        </div>
        <div>
          <label style={fieldLabel}>{partida.compraModo === 'kg' ? 'Preço de compra (R$/kg)' : 'Valor de compra (R$/cabeça)'}</label>
          <input className="form-input" type="number" step="0.01" value={partida.compraValor} onChange={e => onChange({ compraValor: e.target.value })} />
        </div>
        <div>
          <label style={fieldLabel}>Custo já incorrido (R$/cabeça)</label>
          <input className="form-input" type="number" step="0.01" value={partida.custoAnteriorPorCabeca} onChange={e => onChange({ custoAnteriorPorCabeca: e.target.value })} />
        </div>
      </div>
    </div>
  )
}

// ─── Comparativo dos caminhos ───────────────────────────────────────────────

function ComparativoCaminhos({ cenarios, resultados, ativoId, onSelecionar }: {
  cenarios: SimCenario[]
  resultados: Record<string, ResultadoCenario>
  ativoId: string
  onSelecionar: (id: string) => void
}) {
  const validos = cenarios.map(c => resultados[c.id]).filter(r => r && r.erros.length === 0 && r.lucroCabeca != null)
  const melhorId = validos.length >= 2 ? validos.reduce((a, b) => (b.lucroCabeca! > a.lucroCabeca! ? b : a)).cenarioId : null

  type Linha = { rotulo: string; valor: (r: ResultadoCenario) => string; cor?: (r: ResultadoCenario) => string | undefined; destaque?: boolean }
  const ou = (v: number | null, f: (n: number) => string) => v == null ? '—' : f(v)
  const linhas: Linha[] = [
    { rotulo: 'Dias totais', valor: r => String(r.diasTotais) },
    { rotulo: 'Peso final', valor: r => `${fmtNum(r.pesoFinal, 1)} kg` },
    { rotulo: 'Ganho total', valor: r => `${fmtNum(r.ganhoTotal, 1)} kg` },
    { rotulo: 'GMD médio', valor: r => `${fmtNum(r.gmdMedio, 3)} kg/dia` },
    { rotulo: 'Custo médio do kg produzido', valor: r => ou(r.custoMedioKgProduzido, v => `${fmt(v)}/kg`) },
    { rotulo: 'Investimento inicial', valor: r => fmt(r.investimentoInicial) },
    { rotulo: 'Custo dos ciclos', valor: r => fmt(r.custoCiclos) },
    { rotulo: 'Custo total', valor: r => fmt(r.custoTotal) },
    { rotulo: 'Receita líquida', valor: r => ou(r.receitaLiquida, fmt) },
    { rotulo: 'Lucro por cabeça', valor: r => ou(r.lucroCabeca, fmt), cor: r => corValor(r.lucroCabeca), destaque: true },
    { rotulo: 'Lucro total', valor: r => ou(r.lucroTotal, fmt), cor: r => corValor(r.lucroTotal), destaque: true },
    { rotulo: 'Margem', valor: r => ou(r.margemPct, v => `${fmtNum(v, 1)}%`), cor: r => corValor(r.margemPct) },
    { rotulo: 'Retorno sobre o investimento', valor: r => ou(r.roiPct, v => `${fmtNum(v, 1)}%`), cor: r => corValor(r.roiPct) },
    { rotulo: 'Lucro por @ de carcaça', valor: r => ou(r.lucroPorArroba, fmt), cor: r => corValor(r.lucroPorArroba) },
  ]

  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 600 }}>
        Comparativo dos caminhos <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-3)' }}>· valores por cabeça, exceto lucro total</span>
      </div>
      <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
        <table>
          <thead>
            <tr>
              <th>Indicador</th>
              {cenarios.map(c => (
                <th key={c.id} style={{ cursor: 'pointer', background: c.id === ativoId ? 'var(--green-light)' : undefined }} onClick={() => onSelecionar(c.id)}>
                  {c.nome || 'Caminho'}
                  {melhorId === c.id && <span className="badge badge-green" style={{ marginLeft: 6 }}>Mais rentável</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map(l => (
              <tr key={l.rotulo}>
                <td style={{ fontWeight: l.destaque ? 600 : 400, whiteSpace: 'nowrap' }}>{l.rotulo}</td>
                {cenarios.map(c => {
                  const r = resultados[c.id]
                  if (!r || r.erros.length > 0) return <td key={c.id} style={{ color: 'var(--text-3)' }}>{l === linhas[0] ? 'Dados incompletos' : ''}</td>
                  return (
                    <td key={c.id} style={{ whiteSpace: 'nowrap', fontWeight: l.destaque ? 600 : 400, color: l.cor?.(r) }}>{l.valor(r)}</td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {cenarios.some(c => resultados[c.id]?.erros.length === 0 && resultados[c.id]?.lucroCabeca == null) && (
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-3)' }}>
          Lucro, margem e retorno aparecem quando o preço de venda do caminho é informado.
        </div>
      )}
    </div>
  )
}
