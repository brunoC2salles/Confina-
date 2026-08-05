import { useNavigate, useSearchParams } from 'react-router-dom'
import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  useLotes, useAnimaisDoLote, useCustoEngine, useVendas, useCustosOperacionais, useCustosRacaoReal, useCompras,
  useMovimentacoesLote, buscarPorIds,
  type CriarLoteInput, type CicloInput, type LinhaAnimalInput, type CompraInput, type CriarAnimaisInput,
  type MovimentacaoGrupoLote, type PesagemNaTroca,
} from '@/hooks/useLotes'
import { useDietas } from '@/hooks/useDietas'
import { useFaixas } from '@/hooks/useFaixas'
import { useParceiros } from '@/hooks/useHooks'
import { useProjecao, type CicloProjecao, type PontoProjecao } from '@/hooks/useProjecao'
import { Modal, PageHeader, EmptyState } from '@/components/common/UI'
import { fmt, fmtNum, fmtData, obterRendimento, obterBonus, ordenarPorBrinco } from '@/lib/calculations'
import type {
  Lote, Animal, SaidaTipo, SaidaModo, RendimentoFaixa, BonusFaixa, TipoCiclo, Compra,
  CustoOperacionalLote, CategoriaCustoOperacional, MotivoEncerramento, CustoRacaoRealLote,
} from '@/types'
import { supabase } from '@/lib/supabase'
import { parseCsvAnimais } from '@/lib/csv'
import { calcularGmdRealUltimoIntervalo, toDay } from '@/lib/custoAnimal'
import type { ResultadoAnimalNaData, EtapaResultado } from '@/lib/custoAnimal'
import type { Pesagem } from '@/types'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'

const hojeStr = () => new Date().toISOString().split('T')[0]
const fmtDataCurta = (d: string) => {
  const [, m, dd] = d.split('-')
  return `${dd}/${m}`
}

// Quando todos os animais ativos do lote estão no mesmo ciclo (caso normal,
// sem avanço parcial), mostra "Ciclo N/total" como sempre. Com ciclos
// mistos (algum animal foi adiantado via avanço parcial), mostra a
// distribuição — sem tentar resumir num único número, que deixaria de
// contar a história certa.
function rotuloCiclo(lote: Lote, dist: Record<number, number> | undefined): string {
  const entradas = Object.entries(dist ?? {}).map(([n, qtd]) => [Number(n), qtd] as [number, number])
  if (entradas.length <= 1) return `Ciclo ${lote.ciclo_atual}/${lote.num_ciclos}`
  return entradas
    .sort((a, b) => a[0] - b[0])
    .map(([numero, qtd]) => `Ciclo ${numero} (${qtd})`)
    .join(' · ')
}

const cicloLabelPadrao = (n: number) =>
  ({ 1: 'Adaptação', 2: 'Crescimento', 3: 'Engorda', 4: 'Acabamento' } as Record<number, string>)[n] ?? `Ciclo ${n}`

// ═══════════════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

export default function Lotes() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const {
    lotes, lotesAtivos, lotesEncerrados, ciclosPorLote, resumo, distribuicaoCiclos, loading,
    criarLote, editarCiclo, salvarCiclosLote, avancarCiclo, avancarCicloParcial, encerrarLote,
    criarAnimais, bifurcar, moverAliquota, excluirAnimal, proximoNumeroLote,
  } = useLotes()
  const { templates: dietasTemplates } = useDietas()

  const [tab, setTab] = useState<'ativos' | 'encerrados'>('ativos')
  const [showNovoLote, setShowNovoLote] = useState(false)
  const [loteRecemCriado, setLoteRecemCriado] = useState<string | null>(null)
  const [showDetalhe, setShowDetalhe] = useState<string | null>(searchParams.get('detalhe'))
  const [highlightAnimalId] = useState<string | null>(searchParams.get('animal'))
  const [showVendaGlobal, setShowVendaGlobal] = useState(false)
  const [erroGlobal, setErroGlobal] = useState<string | null>(null)

  const listaAtual = tab === 'ativos' ? lotesAtivos : lotesEncerrados

  const handleCriarLote = async (input: CriarLoteInput) => {
    const res = await criarLote(input)
    if (res.error) return res
    setShowNovoLote(false)
    if (res.lote) setLoteRecemCriado(res.lote.id)
    return res
  }

  return (
    <div className="page">
      <PageHeader title="Lotes"
        subtitle="Gestão de lotes e rastreamento individual dos animais"
        action={
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost" onClick={() => setShowVendaGlobal(true)}>Nova venda</button>
            <button className="btn btn-primary" onClick={() => setShowNovoLote(true)}>+ Novo lote</button>
          </div>
        } />

      <div className="tabs">
        <button className={`tab-btn${tab === 'ativos' ? ' active' : ''}`} onClick={() => setTab('ativos')}>
          Ativos ({lotesAtivos.length})
        </button>
        <button className={`tab-btn${tab === 'encerrados' ? ' active' : ''}`} onClick={() => setTab('encerrados')}>
          Encerrados ({lotesEncerrados.length})
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div className="spinner" style={{ width: 28, height: 28 }} />
        </div>
      ) : listaAtual.length === 0 ? (
        <div className="card">
          <EmptyState icon="◧" title={tab === 'ativos' ? 'Nenhum lote ativo' : 'Nenhum lote encerrado'}
            desc={tab === 'ativos' ? 'Crie um lote para começar a cadastrar animais.' : undefined}
            action={tab === 'ativos' ? <button className="btn btn-primary" onClick={() => setShowNovoLote(true)}>Criar lote</button> : undefined} />
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 12 }}>
          {listaAtual.map(lote => {
            const r = resumo[lote.id] ?? { qtdAtiva: 0, pesoMedioEntrada: 0, dataEntradaMin: null, dataEntradaMax: null }
            const ciclos = ciclosPorLote[lote.id] ?? []
            const cicloAtual = ciclos.find(c => c.numero === lote.ciclo_atual)
            return (
              <div key={lote.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer' }}
                onClick={() => setShowDetalhe(lote.id)}>
                <div className="flex-between">
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{lote.nome_lote}</div>
                    <div style={{ fontSize: 11, color: '#9e9e9e', marginTop: 2 }}>
                      {lote.codigo_lote}{lote.prefixo ? ` · prefixo "${lote.prefixo}"` : ''}
                    </div>
                  </div>
                  <span style={{ fontSize: 11, background: lote.status === 'encerrado' ? '#f5f5f5' : '#e8f5e9', color: lote.status === 'encerrado' ? '#757575' : '#2e7d32', padding: '2px 8px', borderRadius: 20, border: `1px solid ${lote.status === 'encerrado' ? '#e0e0e0' : '#a5d6a7'}` }}>
                    {lote.status === 'encerrado'
                      ? (lote.motivo_encerramento === 'venda' ? 'Vendido' : lote.motivo_encerramento === 'extincao' ? 'Extinto' : 'Encerrado')
                      : rotuloCiclo(lote, distribuicaoCiclos[lote.id])}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--gray-500)', flexWrap: 'wrap' }}>
                  <span><strong>{r.qtdAtiva}</strong> animais ativos</span>
                  {r.qtdAtiva > 0 && <span>peso médio entrada: <strong>{fmtNum(r.pesoMedioEntrada, 1)} kg</strong></span>}
                  {r.dataEntradaMin && (
                    <span>
                      entrada: <strong>
                        {r.dataEntradaMin === r.dataEntradaMax
                          ? fmtData(r.dataEntradaMin)
                          : `${fmtData(r.dataEntradaMin)} a ${fmtData(r.dataEntradaMax!)}`}
                      </strong>
                    </span>
                  )}
                </div>
                {cicloAtual && lote.status === 'ativo' && (
                  <div style={{ fontSize: 12, color: '#9e9e9e' }}>
                    {cicloAtual.nome}{cicloAtual.gmd_esperado ? ` · GMD ${cicloAtual.gmd_esperado} kg/dia` : ''}
                  </div>
                )}
                {lote.status === 'encerrado' && lote.motivo_encerramento === 'venda' && (
                  <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }}
                    onClick={e => { e.stopPropagation(); navigate(`/vendas?lote=${lote.id}`) }}>
                    Ver vendas deste lote
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ─── Modal: novo lote ─── */}
      <Modal open={showNovoLote} onClose={() => setShowNovoLote(false)} title="Novo lote" size="lg">
        <FormLoteBase
          codigoSugerido={proximoNumeroLote()}
          dietasTemplates={dietasTemplates}
          onCancelar={() => setShowNovoLote(false)}
          onConfirmar={handleCriarLote}
          prefixosAtivos={lotesAtivos.map(l => l.prefixo)}
        />
      </Modal>

      {/* ─── Após criar, oferece já adicionar animais ─── */}
      <Modal open={!!loteRecemCriado} onClose={() => setLoteRecemCriado(null)}
        title="Lote criado" subtitle="Deseja cadastrar os animais agora?">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <p style={{ fontSize: 13, color: 'var(--gray-500)' }}>
            Você pode adicionar animais agora ou depois, na tela de detalhes do lote.
          </p>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setLoteRecemCriado(null)}>Depois</button>
            <button className="btn btn-primary" onClick={() => {
              const id = loteRecemCriado
              setLoteRecemCriado(null)
              if (id) setShowDetalhe(id)
            }}>Adicionar animais</button>
          </div>
        </div>
      </Modal>

      {/* ─── Modal: detalhe do lote ─── */}
      {showDetalhe && (
        <DetalheLote
          loteId={showDetalhe}
          onClose={() => setShowDetalhe(null)}
          highlightAnimalId={highlightAnimalId}
          dietasTemplates={dietasTemplates}
          todosLotes={lotes}
          ciclosPorLote={ciclosPorLote}
          distribuicaoCiclos={distribuicaoCiclos}
          editarCiclo={editarCiclo}
          salvarCiclosLote={salvarCiclosLote}
          avancarCiclo={avancarCiclo}
          avancarCicloParcial={avancarCicloParcial}
          encerrarLote={encerrarLote}
          criarAnimais={criarAnimais}
          bifurcar={bifurcar}
          moverAliquota={moverAliquota}
          excluirAnimal={excluirAnimal}
          proximoNumeroLote={proximoNumeroLote}
        />
      )}

      {/* ─── Modal: nova venda (cross-lote) ─── */}
      {showVendaGlobal && (
        <ModalVenda
          onClose={() => setShowVendaGlobal(false)}
          lotesDisponiveis={lotesAtivos}
        />
      )}

      {erroGlobal && (
        <div style={{ position: 'fixed', bottom: 20, right: 20, background: '#ffebee', color: '#b91c1c', padding: '10px 16px', borderRadius: 8, fontSize: 13, boxShadow: '0 2px 8px rgba(0,0,0,0.15)' }}>
          {erroGlobal}
          <button onClick={() => setErroGlobal(null)} style={{ marginLeft: 10, background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c' }}>×</button>
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// FORM BASE DE LOTE (Identificação + Preço + Ciclos) — usado em novo lote e bifurcação
// ═══════════════════════════════════════════════════════════════════════════

function FormLoteBase({
  codigoSugerido, dietasTemplates, onConfirmar, onCancelar, tituloConfirmar = 'Criar lote', loteOrigem, prefixosAtivos,
}: {
  codigoSugerido: string
  dietasTemplates: Array<{ id: string; nome: string; gmd_esperado: number; pct_consumo_pv_ms: number; custo_kg_ms: number | null }>
  onConfirmar: (input: CriarLoteInput) => Promise<{ error: string | null }>
  onCancelar: () => void
  tituloConfirmar?: string
  loteOrigem?: Lote
  prefixosAtivos: string[]
}) {
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [nomeLote, setNomeLote] = useState('')
  const [codigoLote, setCodigoLote] = useState(codigoSugerido)
  const [prefixo, setPrefixo] = useState('')
  const [dataCriacao, setDataCriacao] = useState(hojeStr())
  const [racaPredominante, setRacaPredominante] = useState(loteOrigem?.raca_predominante ?? '')
  const [observacoes, setObservacoes] = useState('')

  // Município/estado são só informação geral do lote — fornecedor e preço de
  // compra agora ficam por leva de entrada (ver ModalAdicionarAnimais), não
  // mais fixos aqui, já que um lote pode reunir animais de origens diferentes.
  const [origemMunicipio, setOrigemMunicipio] = useState('')
  const [origemEstado, setOrigemEstado] = useState('')

  const [numCiclos, setNumCiclos] = useState(4)
  const [ciclos, setCiclos] = useState<CicloInput[]>(
    Array.from({ length: 4 }, (_, i) => ({
      numero: i + 1, nome: cicloLabelPadrao(i + 1), tipo_ciclo: 'confinamento' as TipoCiclo,
      dias_planejados: 30, dieta_id: null, gmd_esperado: null,
    }))
  )

  const ajustarNumCiclos = (n: number) => {
    const novo = Math.max(1, Math.min(8, n))
    setNumCiclos(novo)
    setCiclos(prev => {
      const arr = [...prev]
      while (arr.length < novo) {
        arr.push({
          numero: arr.length + 1, nome: cicloLabelPadrao(arr.length + 1), tipo_ciclo: 'confinamento' as TipoCiclo,
          dias_planejados: 30, dieta_id: null, gmd_esperado: null,
        })
      }
      return arr.slice(0, novo)
    })
  }

  // Marca/desmarca um ciclo como pastagem — ajusta o nome sugerido junto,
  // mas o usuário pode sobrescrever livremente depois.
  const alternarTipoCiclo = (idx: number) => {
    setCiclos(prev => prev.map((c, i) => {
      if (i !== idx) return c
      const novoTipo: TipoCiclo = c.tipo_ciclo === 'pastagem' ? 'confinamento' : 'pastagem'
      const nomeEraPadrao = c.nome === cicloLabelPadrao(c.numero) || c.nome === 'Pastagem'
      return { ...c, tipo_ciclo: novoTipo, nome: nomeEraPadrao ? (novoTipo === 'pastagem' ? 'Pastagem' : cicloLabelPadrao(c.numero)) : c.nome }
    }))
  }

  const updateCiclo = (idx: number, patch: Partial<CicloInput>) => {
    setCiclos(prev => prev.map((c, i) => i === idx ? { ...c, ...patch } : c))
  }

  const aplicarDietaNoCiclo = (idx: number, dietaId: string) => {
    const d = dietasTemplates.find(t => t.id === dietaId)
    updateCiclo(idx, { dieta_id: dietaId || null, gmd_esperado: d?.gmd_esperado ?? ciclos[idx].gmd_esperado })
  }

  const validarStep = (): string | null => {
    if (step === 1) {
      if (!nomeLote.trim()) return 'Informe o nome do lote'
      if (!codigoLote.trim()) return 'Informe o código do lote'
      if (!dataCriacao) return loteOrigem ? 'Informe a data da bifurcação' : 'Informe a data de criação'
      const prefixoNormalizado = prefixo.trim().toUpperCase()
      if (prefixosAtivos.some(p => (p ?? '').toUpperCase() === prefixoNormalizado)) {
        return prefixoNormalizado
          ? `Já existe um lote ativo usando o prefixo "${prefixoNormalizado}". Escolha outro prefixo.`
          : 'Já existe um lote ativo sem prefixo definido. Defina um prefixo (ex: A, B, C) para este lote.'
      }
    }
    if (step === 2) {
      for (const c of ciclos) {
        if (!c.nome.trim()) return `Ciclo ${c.numero}: informe um nome`
        if (!c.dias_planejados || c.dias_planejados <= 0) return `Ciclo ${c.numero}: dias planejados inválido`
      }
    }
    return null
  }

  const avancar = () => {
    const v = validarStep()
    if (v) { setErro(v); return }
    setErro(null)
    setStep(s => s + 1)
  }

  const confirmar = async () => {
    const v = validarStep()
    if (v) { setErro(v); return }
    setSaving(true); setErro(null)
    const res = await onConfirmar({
      nome_lote: nomeLote.trim(),
      codigo_lote: codigoLote.trim(),
      prefixo: prefixo.trim(),
      data_criacao: dataCriacao,
      num_ciclos: numCiclos,
      origem_municipio: loteOrigem ? (loteOrigem.origem_municipio ?? undefined) : (origemMunicipio || undefined),
      origem_estado: loteOrigem ? (loteOrigem.origem_estado ?? undefined) : (origemEstado || undefined),
      raca_predominante: racaPredominante || undefined,
      observacoes: observacoes || undefined,
      ciclos,
    })
    setSaving(false)
    if (res.error) setErro(res.error)
  }

  const steps = ['Identificação', 'Ciclos']

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', gap: 6 }}>
        {steps.map((s, i) => (
          <div key={s} style={{
            flex: 1, textAlign: 'center', padding: '6px 4px', borderRadius: 6, fontSize: 11,
            background: step === i + 1 ? '#2e7d32' : '#f5f5f5',
            color: step === i + 1 ? '#fff' : '#9e9e9e',
          }}>{i + 1}. {s}</div>
        ))}
      </div>

      {step === 1 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">Nome do lote</label>
              <input className="form-input" value={nomeLote} onChange={e => setNomeLote(e.target.value)} placeholder="Ex: Terneiros Safra 2026" />
            </div>
            <div className="form-group">
              <label className="form-label">Código do lote</label>
              <input className="form-input" value={codigoLote} onChange={e => setCodigoLote(e.target.value)} />
            </div>
          </div>
          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">Prefixo dos animais (opcional)</label>
              <input className="form-input" value={prefixo} onChange={e => setPrefixo(e.target.value.toUpperCase())} placeholder="Ex: A" maxLength={6} />
              <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>
                Brinco 33 vira o código {prefixo ? `${prefixo}33` : '33'}. Precisa ser diferente do prefixo de qualquer outro lote ativo — inclusive deixar em branco conta como um prefixo.
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">{loteOrigem ? 'Data da bifurcação' : 'Data de criação'}</label>
              <input className="form-input" type="date" value={dataCriacao} onChange={e => setDataCriacao(e.target.value)} />
            </div>
          </div>

          {!loteOrigem && (
            <>
              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Raça predominante</label>
                  <input className="form-input" value={racaPredominante} onChange={e => setRacaPredominante(e.target.value)} />
                </div>
                <div className="form-group">
                  <label className="form-label">Município de origem</label>
                  <input className="form-input" value={origemMunicipio} onChange={e => setOrigemMunicipio(e.target.value)} />
                </div>
              </div>
              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Estado</label>
                  <input className="form-input" value={origemEstado} onChange={e => setOrigemEstado(e.target.value.toUpperCase())} maxLength={2} />
                </div>
              </div>
              <div style={{ padding: '10px 14px', background: 'var(--gray-50)', borderRadius: 8, fontSize: 12, color: 'var(--gray-500)' }}>
                Fornecedor e preço de compra são informados por leva, na tela de &quot;Adicionar animais&quot; — um lote pode reunir animais de mais de uma origem.
              </div>
            </>
          )}

          {loteOrigem && (
            <div style={{ padding: '10px 14px', background: 'var(--gray-50)', borderRadius: 8, fontSize: 12, color: 'var(--gray-500)' }}>
              Município e estado são herdados do lote {loteOrigem.nome_lote}. Os animais bifurcados mantêm o fornecedor e o preço de compra originais.
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Observações</label>
            <input className="form-input" value={observacoes} onChange={e => setObservacoes(e.target.value)} />
          </div>
        </div>
      )}

      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Número de ciclos (máx. 8)</label>
            <input className="form-input" type="number" min={1} max={8} value={numCiclos}
              onChange={e => ajustarNumCiclos(Number(e.target.value))} style={{ maxWidth: 100 }} />
          </div>
          {ciclos.map((c, idx) => (
            <div key={idx} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#2e7d32' }}>Ciclo {c.numero}</div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--gray-500)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={c.tipo_ciclo === 'pastagem'} onChange={() => alternarTipoCiclo(idx)} />
                  É pastagem (fase anterior ao confinamento)
                </label>
              </div>
              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Nome</label>
                  <input className="form-input" value={c.nome} onChange={e => updateCiclo(idx, { nome: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Dias planejados</label>
                  <input className="form-input" type="number" value={c.dias_planejados} onChange={e => updateCiclo(idx, { dias_planejados: Number(e.target.value) })} />
                </div>
              </div>
              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Dieta</label>
                  <select className="form-input" value={c.dieta_id ?? ''} onChange={e => aplicarDietaNoCiclo(idx, e.target.value)}>
                    <option value="">Sem dieta definida</option>
                    {dietasTemplates.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">GMD esperado (kg/dia)</label>
                  <input className="form-input" type="number" step="0.01" value={c.gmd_esperado ?? ''}
                    onChange={e => updateCiclo(idx, { gmd_esperado: e.target.value ? Number(e.target.value) : null })} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {erro && <div style={{ padding: 10, background: '#ffebee', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>{erro}</div>}

      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={step === 1 ? onCancelar : () => setStep(s => s - 1)}>
          {step === 1 ? 'Cancelar' : 'Voltar'}
        </button>
        {step < 2 ? (
          <button className="btn btn-primary" onClick={avancar}>Próximo</button>
        ) : (
          <button className="btn btn-primary" onClick={confirmar} disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : tituloConfirmar}
          </button>
        )}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: ADICIONAR ANIMAIS (faixa numérica / individual / CSV)
// ═══════════════════════════════════════════════════════════════════════════

function ModalAdicionarAnimais({
  lote, onClose, onConfirmar,
}: {
  lote: Lote
  onClose: () => void
  onConfirmar: (input: { data_entrada: string; data_pesagem2?: string; linhas: LinhaAnimalInput[]; origem?: string; raca?: string; compra: CompraInput }) => Promise<{ error: string | null }>
}) {
  const { parceiros } = useParceiros()
  const fornecedoresDisponiveis = parceiros.filter(p => p.tipo === 'fornecedor' || p.tipo === 'produtor')

  const [modo, setModo] = useState<'faixa' | 'individual' | 'csv'>('faixa')
  const [dataEntrada, setDataEntrada] = useState(hojeStr())
  const [dataPesagem2, setDataPesagem2] = useState(hojeStr())
  const [linhas, setLinhas] = useState<LinhaAnimalInput[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // ─── Fornecedor e preço desta leva específica ──────────────────────────────
  const [parceiroId, setParceiroId] = useState('')
  const [origemTexto, setOrigemTexto] = useState('')
  const [precoKgLeva, setPrecoKgLeva] = useState('')

  const [faixaInicio, setFaixaInicio] = useState('')
  const [faixaFim, setFaixaFim] = useState('')
  const [pesoFaixa, setPesoFaixa] = useState('')

  const [brincoIndividual, setBrincoIndividual] = useState('')
  const [pesoIndividual, setPesoIndividual] = useState('')

  const temPeso2 = linhas.some(l => l.peso2 != null)

  const gerarFaixa = () => {
    const ini = Number(faixaInicio), fim = Number(faixaFim), peso = Number(pesoFaixa)
    if (!ini || !fim || fim < ini) { setErro('Faixa inválida'); return }
    if (!peso || peso <= 0) { setErro('Informe o peso padrão'); return }
    if (fim - ini + 1 > 2000) { setErro('Faixa muito grande (máximo 2000 de uma vez)'); return }
    const novas: LinhaAnimalInput[] = []
    for (let n = ini; n <= fim; n++) novas.push({ brinco: String(n), peso, peso2: null })
    setLinhas(prev => [...prev, ...novas])
    setErro(null)
  }

  const adicionarIndividual = () => {
    if (!brincoIndividual.trim()) { setErro('Informe o brinco'); return }
    const peso = Number(pesoIndividual)
    if (!peso || peso <= 0) { setErro('Peso inválido'); return }
    setLinhas(prev => [...prev, { brinco: brincoIndividual.trim(), peso, peso2: null }])
    setBrincoIndividual(''); setPesoIndividual(''); setErro(null)
  }

  const importarCsv = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const texto = String(reader.result ?? '')
      const { linhas: novas, erros } = parseCsvAnimais(texto)
      if (erros.length > 0) setErro(`${erros.length} linha(s) com problema — ${erros[0]}`)
      else setErro(null)
      setLinhas(prev => [...prev, ...novas.map(n => ({ brinco: n.brinco, peso: n.peso1, peso2: n.peso2 }))])
    }
    reader.readAsText(file)
  }

  const removerLinha = (idx: number) => setLinhas(prev => prev.filter((_, i) => i !== idx))
  const atualizarPesoLinha = (idx: number, peso: number) =>
    setLinhas(prev => prev.map((l, i) => i === idx ? { ...l, peso } : l))
  const atualizarPeso2Linha = (idx: number, valor: string) =>
    setLinhas(prev => prev.map((l, i) => i === idx ? { ...l, peso2: valor ? Number(valor) : null } : l))

  const pesoTotal = linhas.reduce((s, l) => s + l.peso, 0)
  const precoKgNum = Number(precoKgLeva) || 0
  const valorTotal = pesoTotal * precoKgNum

  const confirmar = async () => {
    if (linhas.length === 0) { setErro('Adicione ao menos um animal'); return }
    const brincos = new Set<string>()
    for (const l of linhas) {
      if (brincos.has(l.brinco)) { setErro(`Brinco "${l.brinco}" duplicado na lista`); return }
      brincos.add(l.brinco)
    }
    if (temPeso2 && !dataPesagem2) { setErro('Informe a data da segunda pesagem'); return }
    if (temPeso2 && dataPesagem2 < dataEntrada) { setErro('A data da segunda pesagem não pode ser anterior à data de entrada'); return }
    if (!parceiroId && !origemTexto.trim()) { setErro('Informe o fornecedor (cadastrado ou em texto livre) desta leva'); return }
    if (!precoKgNum || precoKgNum <= 0) { setErro('Informe o preço de compra por kg desta leva'); return }
    setSaving(true); setErro(null)
    const res = await onConfirmar({
      data_entrada: dataEntrada,
      data_pesagem2: temPeso2 ? dataPesagem2 : undefined,
      linhas,
      compra: {
        parceiro_id: parceiroId || null,
        origem_texto: parceiroId ? null : origemTexto.trim(),
        data: dataEntrada,
        preco_kg: precoKgNum,
      },
    })
    setSaving(false)
    if (res.error) setErro(res.error)
  }

  return (
    <Modal open onClose={onClose} title={`Adicionar animais — ${lote.nome_lote}`} size="lg">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="form-row-2">
          <div className="form-group">
            <label className="form-label">Data da 1ª pesagem (entrada)</label>
            <input className="form-input" type="date" value={dataEntrada} onChange={e => setDataEntrada(e.target.value)} />
          </div>
          {temPeso2 && (
            <div className="form-group">
              <label className="form-label">Data da 2ª pesagem</label>
              <input className="form-input" type="date" value={dataPesagem2} onChange={e => setDataPesagem2(e.target.value)} />
            </div>
          )}
        </div>

        <div style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#2e7d32' }}>Compra desta leva</div>
          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">Fornecedor cadastrado</label>
              <select className="form-input" value={parceiroId} onChange={e => { setParceiroId(e.target.value); if (e.target.value) setOrigemTexto('') }}>
                <option value="">Sem cadastro (usar texto livre)</option>
                {fornecedoresDisponiveis.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Ou fornecedor em texto livre</label>
              <input className="form-input" value={origemTexto} disabled={!!parceiroId}
                onChange={e => setOrigemTexto(e.target.value)} placeholder="Ex: Alegrete" />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Preço de compra desta leva (R$/kg)</label>
            <input className="form-input" type="number" step="0.01" value={precoKgLeva}
              onChange={e => setPrecoKgLeva(e.target.value)} placeholder="18.50" style={{ maxWidth: 200 }} />
            <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>
              Cada leva pode ter fornecedor e preço próprios — não precisa ser igual ao de outras entradas deste lote.
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6 }}>
          {(['faixa', 'individual', 'csv'] as const).map(m => (
            <button key={m} type="button"
              onClick={() => setModo(m)}
              style={{
                flex: 1, padding: '8px', borderRadius: 6, fontSize: 12, border: '1px solid var(--border)', cursor: 'pointer',
                background: modo === m ? '#2e7d32' : '#fff', color: modo === m ? '#fff' : 'var(--gray-600)',
              }}>
              {m === 'faixa' ? 'Faixa de brincos' : m === 'individual' ? 'Individual' : 'Importar CSV'}
            </button>
          ))}
        </div>

        {modo === 'faixa' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Brinco inicial</label>
              <input className="form-input" type="number" value={faixaInicio} onChange={e => setFaixaInicio(e.target.value)} placeholder="1" />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Brinco final</label>
              <input className="form-input" type="number" value={faixaFim} onChange={e => setFaixaFim(e.target.value)} placeholder="400" />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Peso padrão (kg)</label>
              <input className="form-input" type="number" step="0.1" value={pesoFaixa} onChange={e => setPesoFaixa(e.target.value)} placeholder="200" />
            </div>
            <button className="btn btn-primary" onClick={gerarFaixa} style={{ height: 38 }}>Gerar</button>
          </div>
        )}

        {modo === 'individual' && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Brinco</label>
              <input className="form-input" value={brincoIndividual} onChange={e => setBrincoIndividual(e.target.value)} />
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label">Peso (kg)</label>
              <input className="form-input" type="number" step="0.1" value={pesoIndividual} onChange={e => setPesoIndividual(e.target.value)} />
            </div>
            <button className="btn btn-primary" onClick={adicionarIndividual} style={{ height: 38 }}>Adicionar</button>
          </div>
        )}

        {modo === 'csv' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
              Arquivo .csv com as colunas: brinco, pesagem 1, pesagem 2 (a segunda pesagem é opcional, pode ficar em branco em algumas linhas). Cabeçalho opcional.
            </div>
            <input type="file" accept=".csv,text/csv" onChange={e => {
              const f = e.target.files?.[0]
              if (f) importarCsv(f)
              e.target.value = ''
            }} />
          </div>
        )}

        {linhas.length > 0 && (
          <div>
            <div className="flex-between" style={{ marginBottom: 6 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{linhas.length} animal(is) na lista</div>
              <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                Peso total (1ª pesagem): <strong>{fmtNum(pesoTotal, 0)} kg</strong> · Valor total: <strong>{fmt(valorTotal)}</strong>
              </div>
            </div>
            <div className="table-wrap" style={{ maxHeight: 260, overflowY: 'auto' }}>
              <table>
                <thead><tr><th>Código</th><th>Brinco</th><th>Peso 1 (kg)</th><th>Peso 2 (kg)</th><th style={{ width: 40 }}></th></tr></thead>
                <tbody>
                  {linhas.map((l, idx) => (
                    <tr key={idx}>
                      <td>{lote.prefixo}{l.brinco}</td>
                      <td>{l.brinco}</td>
                      <td>
                        <input className="form-input" type="number" step="0.1" value={l.peso}
                          onChange={e => atualizarPesoLinha(idx, Number(e.target.value))} style={{ maxWidth: 100, fontSize: 13 }} />
                      </td>
                      <td>
                        <input className="form-input" type="number" step="0.1" value={l.peso2 ?? ''}
                          onChange={e => atualizarPeso2Linha(idx, e.target.value)} style={{ maxWidth: 100, fontSize: 13 }} placeholder="—" />
                      </td>
                      <td>
                        <button onClick={() => removerLinha(idx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9e9e9e', fontSize: 16 }}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {erro && <div style={{ padding: 10, background: '#ffebee', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>{erro}</div>}

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={confirmar} disabled={saving || linhas.length === 0}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : `Cadastrar ${linhas.length || ''} animal(is)`}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// PROJEÇÃO: gráfico + painel ad-hoc (preço informado na hora, não pré-configurado)
// ═══════════════════════════════════════════════════════════════════════════

function GraficoCustoReceita({ curva, diaIdeal }: { curva: PontoProjecao[]; diaIdeal: PontoProjecao | null }) {
  const dados = curva.map(p => ({ data: p.data, dataLabel: fmtDataCurta(p.data), custo: p.custo_total, receita: p.receita_bruta }))

  const transicoesCiclo = useMemo(() => {
    const bounds: Array<{ data: string; nome: string }> = []
    let ultimo = ''
    for (const p of curva) {
      if (p.ciclo_nome !== ultimo) { bounds.push({ data: p.data, nome: p.ciclo_nome }); ultimo = p.ciclo_nome }
    }
    return bounds
  }, [curva])

  return (
    <div style={{ width: '100%', height: 280 }}>
      <ResponsiveContainer>
        <LineChart data={dados} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="dataLabel" tick={{ fontSize: 11 }} minTickGap={24} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} width={40} />
          <Tooltip formatter={(v: number) => fmt(v)} labelFormatter={l => `${l}`} />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          {transicoesCiclo.map((t, i) => (
            <ReferenceLine key={i} x={fmtDataCurta(t.data)} stroke="#bdbdbd" strokeDasharray="2 4"
              label={{ value: t.nome, fontSize: 9, fill: '#9e9e9e', position: 'insideTopLeft', angle: -90, offset: 6 }} />
          ))}
          {diaIdeal && (
            <ReferenceLine x={fmtDataCurta(diaIdeal.data)} stroke="#2e7d32" strokeDasharray="4 4"
              label={{ value: 'Dia ideal', fontSize: 10, fill: '#2e7d32', position: 'top' }} />
          )}
          <Line type="monotone" dataKey="custo" name="Custo total" stroke="#b91c1c" dot={false} strokeWidth={2} />
          <Line type="monotone" dataKey="receita" name="Receita bruta esperada" stroke="#2e7d32" dot={false} strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function PainelProjecao({
  pesoMedioAtual, qtdAnimais, gmdReal, custoCompraTotal, custoAlimentacaoAcumulado, ciclosConfig, rendimentos, bonus,
}: {
  pesoMedioAtual: number
  qtdAnimais: number
  gmdReal: number | null
  custoCompraTotal: number
  custoAlimentacaoAcumulado: number
  ciclosConfig: CicloProjecao[]
  rendimentos: RendimentoFaixa[]
  bonus: BonusFaixa[]
}) {
  const { calcular } = useProjecao()
  const [preco, setPreco] = useState('')
  const [pctComissao, setPctComissao] = useState('2')
  const [pctEncargo, setPctEncargo] = useState('1.5')

  const resultado = useMemo(() => {
    if (!preco || Number(preco) <= 0) return null
    return calcular({
      peso_medio_atual: pesoMedioAtual,
      qtd_animais: qtdAnimais,
      gmd_real: gmdReal,
      data_hoje: hojeStr(),
      custo_compra_total: custoCompraTotal,
      custo_alimentacao_acumulado: custoAlimentacaoAcumulado,
      custo_alimentacao_dia: 0,
      ciclos_config: ciclosConfig,
      preco_valor: Number(preco),
      modo_preco: 'kg_vivo',
      pct_comissao: Number(pctComissao) || 0,
      pct_encargo: Number(pctEncargo) || 0,
      faixas_rendimento: rendimentos.map(f => ({ peso_min: f.peso_min, peso_max: f.peso_max, rendimento_pct: f.rendimento_percentual })),
      faixas_bonus: bonus.map(f => ({ peso_min: f.peso_min, peso_max: f.peso_max, bonus_kg: f.bonus_por_kg })),
    })
  }, [preco, pctComissao, pctEncargo, pesoMedioAtual, qtdAnimais, gmdReal, custoCompraTotal, custoAlimentacaoAcumulado, ciclosConfig, rendimentos, bonus, calcular])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="form-row-3">
        <div className="form-group">
          <label className="form-label">Preço esperado (R$/kg vivo)</label>
          <input className="form-input" type="number" step="0.01" value={preco} onChange={e => setPreco(e.target.value)} placeholder="Preço de hoje ou o que espera" />
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

      {!preco || Number(preco) <= 0 ? (
        <div style={{ padding: 10, background: 'var(--gray-50)', borderRadius: 8, fontSize: 12, color: 'var(--gray-500)' }}>
          Informe um preço esperado — pode ser o preço de hoje ou o que você espera para quando pretende vender.
        </div>
      ) : resultado && resultado.curva_esperada.length > 0 ? (
        <>
          {resultado.dia_ideal_esperado && (
            <div style={{ background: 'var(--green-bg)', borderRadius: 8, padding: '12px 14px', fontSize: 13 }}>
              <div style={{ fontWeight: 500, color: '#1b5e20', marginBottom: 6 }}>Ponto ideal de venda (projeção)</div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <span>Data ideal: <strong>{fmtData(resultado.dia_ideal_esperado.data)}</strong></span>
                <span>Ciclo: {resultado.dia_ideal_esperado.ciclo_nome}</span>
                <span>Peso: <strong>{fmtNum(resultado.dia_ideal_esperado.peso, 0)} kg</strong></span>
                <span>Lucro projetado: <strong>{fmt(resultado.dia_ideal_esperado.lucro)}</strong></span>
              </div>
            </div>
          )}
          <GraficoCustoReceita curva={resultado.curva_esperada} diaIdeal={resultado.dia_ideal_esperado} />
        </>
      ) : (
        <div style={{ padding: 10, background: 'var(--gray-50)', borderRadius: 8, fontSize: 12, color: 'var(--gray-500)' }}>
          Configure o GMD esperado nos ciclos restantes para calcular a projeção.
        </div>
      )}
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// DETALHE DO LOTE
// ═══════════════════════════════════════════════════════════════════════════

function DetalheLote({
  loteId, onClose, highlightAnimalId, dietasTemplates, todosLotes, ciclosPorLote, distribuicaoCiclos,
  editarCiclo, salvarCiclosLote, avancarCiclo, avancarCicloParcial, encerrarLote, criarAnimais, bifurcar, moverAliquota, excluirAnimal, proximoNumeroLote,
}: {
  loteId: string
  onClose: () => void
  highlightAnimalId?: string | null
  dietasTemplates: Array<{ id: string; nome: string; gmd_esperado: number; pct_consumo_pv_ms: number; custo_kg_ms: number | null }>
  todosLotes: Lote[]
  ciclosPorLote: Record<string, Array<{ id: string; numero: number; nome: string; tipo_ciclo: TipoCiclo; dias_planejados: number; dieta_id: string | null; gmd_esperado: number | null; data_inicio: string | null; data_fim: string | null }>>
  distribuicaoCiclos: Record<string, Record<number, number>>
  editarCiclo: (id: string, patch: any) => Promise<{ error: string | null }>
  salvarCiclosLote: (loteId: string, dataCriacao: string, ciclos: Array<{ id?: string; numero: number; nome: string; tipo_ciclo: TipoCiclo; dias_planejados: number; dieta_id: string | null; gmd_esperado: number | null }>) => Promise<{ error: string | null }>
  avancarCiclo: (loteId: string, data?: string, pesagem?: PesagemNaTroca) => Promise<{ error: string | null }>
  avancarCicloParcial: (loteId: string, animalIds: string[], data: string, pesagem?: PesagemNaTroca) => Promise<{ error: string | null }>
  encerrarLote: (loteId: string, motivo: MotivoEncerramento, obs?: string) => Promise<{ error: string | null }>
  criarAnimais: (input: CriarAnimaisInput) => Promise<{ error: string | null }>
  bifurcar: (input: any) => Promise<{ error: string | null; lote?: Lote }>
  moverAliquota: (input: any) => Promise<{ error: string | null }>
  excluirAnimal: (animalId: string) => Promise<{ error: string | null }>
  proximoNumeroLote: () => string
}) {
  const navigate = useNavigate()
  const lote = todosLotes.find(l => l.id === loteId)
  const lotesAtivos = todosLotes.filter(l => l.status === 'ativo')
  const loteAtivo = lote?.status === 'ativo'
  const { animais, loading, fetch, registrarPesagem, editarEntrada, buscarPesagens, editarPesagem, excluirPesagem } = useAnimaisDoLote(loteId)
  const { calcularEmLote } = useCustoEngine()
  const { rendimentos, bonus } = useFaixas()
  const { custos: custosOperacionais, loading: loadingCustosOp, total: totalCustoOperacional, adicionarCusto, removerCusto } = useCustosOperacionais(loteId)
  const { custos: custosRacaoReal, loading: loadingCustosRacaoReal, adicionarCustoRacaoReal, editarCustoRacaoReal, removerCustoRacaoReal } = useCustosRacaoReal(loteId)
  const { compras, loading: loadingCompras } = useCompras(loteId)
  const { eventos: eventosMovimentacao, loading: loadingMovimentacao, editarDataEvento } = useMovimentacoesLote(loteId)
  const { parceiros } = useParceiros()
  const nomeParceiro = (id: string | null) => id ? (parceiros.find(p => p.id === id)?.nome ?? '—') : null

  const [resultados, setResultados] = useState<Record<string, ResultadoAnimalNaData>>({})
  const [custosVariaveisPorAnimal, setCustosVariaveisPorAnimal] = useState<Record<string, number>>({})
  const [calculando, setCalculando] = useState(false)
  // ─── Seleção em massa e modais ─────────────────────────────────────────────
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [showAdicionarAnimais, setShowAdicionarAnimais] = useState(false)
  const [showBifurcar, setShowBifurcar] = useState(false)
  const [showMover, setShowMover] = useState(false)
  const [showVenda, setShowVenda] = useState(false)
  const [showPesagem, setShowPesagem] = useState<string | null>(null)
  const [showEditarEntrada, setShowEditarEntrada] = useState<string | null>(null)
  const [showExcluirAnimal, setShowExcluirAnimal] = useState<string | null>(null)
  const [showProjecaoAnimal, setShowProjecaoAnimal] = useState<string | null>(null)
  const [showDetalheAnimal, setShowDetalheAnimal] = useState<string | null>(null)
  const [showResumoLote, setShowResumoLote] = useState(false)
  const [showHistoricoMovimentacoes, setShowHistoricoMovimentacoes] = useState(false)
  const [showProjecao, setShowProjecao] = useState(false)
  const [showEncerrar, setShowEncerrar] = useState(false)
  const [showCustoOperacional, setShowCustoOperacional] = useState(false)
  const [showCustoRacaoReal, setShowCustoRacaoReal] = useState(false)
  const [showCompras, setShowCompras] = useState(false)
  const [showEditarCiclos, setShowEditarCiclos] = useState(false)
  const [showDuplicados, setShowDuplicados] = useState(false)
  const [showAvancarCiclo, setShowAvancarCiclo] = useState<'total' | 'parcial' | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  const ciclos = ciclosPorLote[loteId] ?? []

  // Grupos de brincos duplicados dentro deste lote: mesmo brinco + mesmo
  // peso de entrada + mesma data de entrada — sinal de lançamento repetido
  // por engano (ex.: importação rodada duas vezes). Brinco repetido com
  // dados diferentes não entra aqui, pois pode ser só coincidência de
  // numeração entre remessas distintas.
  const gruposDuplicados = useMemo(() => {
    const mapa: Record<string, Animal[]> = {}
    for (const a of animais) {
      const chave = `${a.brinco}|${a.peso_entrada}|${a.data_entrada}`
      if (!mapa[chave]) mapa[chave] = []
      mapa[chave].push(a)
    }
    return Object.values(mapa).filter(g => g.length > 1)
  }, [animais])

  const handleExcluirSelecionados = async (ids: string[]) => {
    for (const id of ids) {
      const res = await excluirAnimal(id)
      if (res.error) return res
    }
    await fetch()
    return { error: null }
  }

  const recalcular = useCallback(async () => {
    if (animais.length === 0) { setResultados({}); setCustosVariaveisPorAnimal({}); return }
    setCalculando(true)
    const animalIds = animais.map(a => a.id)
    const [res, custosVarData] = await Promise.all([
      calcularEmLote(animalIds, hojeStr()),
      buscarPorIds<{ animal_id: string; valor: number }>(animalIds, (idsChunk, from, to) =>
        supabase.from('custos_variaveis_animal').select('animal_id, valor').in('animal_id', idsChunk).range(from, to)),
    ])
    const custosVar: Record<string, number> = {}
    for (const c of custosVarData) {
      custosVar[c.animal_id] = (custosVar[c.animal_id] ?? 0) + c.valor
    }
    setResultados(res)
    setCustosVariaveisPorAnimal(custosVar)
    setCalculando(false)
  }, [animais, calcularEmLote])

  useEffect(() => { recalcular() }, [recalcular])

  useEffect(() => {
    if (!highlightAnimalId || loading) return
    const el = document.querySelector(`[data-animal-id="${highlightAnimalId}"]`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [highlightAnimalId, loading, animais])

  // Custo acumulado exibido = alimentação + operacional (motor) + custos variáveis do animal —
  // mesma composição usada em useVendas e na página de Ranking, para não mostrar um número aqui
  // e liquidar a venda com outro.
  const custoTotalAnimal = (animalId: string) => (resultados[animalId]?.custoAcumulado ?? 0) + (custosVariaveisPorAnimal[animalId] ?? 0)

  // Este useMemo precisa ser chamado sempre, na mesma ordem, em todo render —
  // inclusive quando `lote` ainda não foi carregado (ex.: ao entrar direto
  // nesta tela vindo de Fazenda Hoje, antes de todosLotes terminar de buscar
  // os dados). Por isso usa lote?.ciclo_atual com fallback, em vez de
  // depender do `if (!lote) return null` abaixo, que só pode vir depois de
  // todos os hooks — nunca antes.
  const ciclosFuturos: CicloProjecao[] = useMemo(() => ciclos
    .filter(c => c.numero >= (lote?.ciclo_atual ?? Infinity))
    .map(c => ({
      numero: c.numero, nome: c.nome, dias_planejados: c.dias_planejados,
      gmd_esperado: c.gmd_esperado,
      pct_consumo_pv_ms: dietasTemplates.find(d => d.id === c.dieta_id)?.pct_consumo_pv_ms ?? null,
      custo_kg_ms: dietasTemplates.find(d => d.id === c.dieta_id)?.custo_kg_ms ?? null,
    })), [ciclos, lote?.ciclo_atual, dietasTemplates])

  if (!lote) return null

  const toggleSelecionado = (id: string) => {
    setSelecionados(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  // Ciclo comum dos animais selecionados — só existe (não-null) quando a
  // seleção tem pelo menos 1 animal, todos no mesmo ciclo_atual entre si, e
  // esse ciclo ainda não é o último configurado no lote. É o que habilita o
  // botão "Avançar ciclo dos selecionados".
  const animaisSelecionadosArr = animais.filter(a => selecionados.has(a.id))
  const ciclosDaSelecao = new Set(animaisSelecionadosArr.map(a => a.ciclo_atual))
  const cicloOrigemSelecao = ciclosDaSelecao.size === 1 && animaisSelecionadosArr[0].ciclo_atual < lote.num_ciclos
    ? animaisSelecionadosArr[0].ciclo_atual
    : null

  const qtdAtiva = animais.length
  const pesoMedioHoje = qtdAtiva > 0
    ? animais.reduce((s, a) => s + (resultados[a.id]?.peso ?? a.peso_entrada), 0) / qtdAtiva
    : 0
  const custoTotalHoje = animais.reduce((s, a) => s + custoTotalAnimal(a.id), 0)
  const valorCompraTotal = animais.reduce((s, a) => s + a.valor_compra, 0)

  const handleAdicionarAnimais = async (input: { data_entrada: string; data_pesagem2?: string; linhas: LinhaAnimalInput[]; origem?: string; raca?: string; compra: CompraInput }) => {
    const res = await criarAnimais({ lote_id: loteId, ...input })
    if (!res.error) { setShowAdicionarAnimais(false); await fetch() }
    return res
  }

  const handleBifurcar = async (input: CriarLoteInput) => {
    const res = await bifurcar({
      lote_origem_id: loteId,
      animal_ids: Array.from(selecionados),
      data_bifurcacao: input.data_criacao,
      novo_lote: input,
    })
    if (!res.error) { setShowBifurcar(false); setSelecionados(new Set()); await fetch() }
    return res
  }

  const handleMover = async (loteDestinoId: string, data: string) => {
    const res = await moverAliquota({ animal_ids: Array.from(selecionados), lote_destino_id: loteDestinoId, data })
    if (!res.error) { setShowMover(false); setSelecionados(new Set()); await fetch() }
    else setErro(res.error)
  }

  const handleExcluirAnimal = async (animalId: string) => {
    const res = await excluirAnimal(animalId)
    if (!res.error) { setShowExcluirAnimal(null); setSelecionados(prev => { const n = new Set(prev); n.delete(animalId); return n }); await fetch() }
    else setErro(res.error)
    return res
  }

  const handleConfirmarAvancarCicloTotal = async (data: string, pesagem?: PesagemNaTroca) => {
    const res = await avancarCiclo(loteId, data, pesagem)
    if (!res.error) setShowAvancarCiclo(null)
    return res
  }

  const handleConfirmarAvancarCicloParcial = async (data: string, pesagem?: PesagemNaTroca) => {
    const res = await avancarCicloParcial(loteId, Array.from(selecionados), data, pesagem)
    if (!res.error) { setShowAvancarCiclo(null); setSelecionados(new Set()) }
    return res
  }

  const handleEncerrar = async (motivo: MotivoEncerramento, obs?: string) => {
    const res = await encerrarLote(loteId, motivo, obs)
    if (!res.error) setShowEncerrar(false)
    return res
  }

  const gmdRealMedio = qtdAtiva > 0
    ? animais.reduce((s, a) => s + (resultados[a.id]?.gmdMedio ?? 0), 0) / qtdAtiva
    : null

  // Quebra pastagem x confinamento — só faz sentido mostrar se o lote de fato
  // tem algum ciclo marcado como pastagem configurado.
  const temCicloPastagem = ciclos.some(c => c.tipo_ciclo === 'pastagem')
  const somaPorTipo = animais.reduce((acc, a) => {
    const r = resultados[a.id]
    if (!r) return acc
    acc.ganhoPastagem += r.ganhoPesoPastagem
    acc.ganhoConfinamento += r.ganhoPesoConfinamento
    acc.custoPastagem += r.custoAlimentacaoPastagem + r.custoOperacionalPastagem
    acc.custoConfinamento += r.custoAlimentacaoConfinamento + r.custoOperacionalConfinamento
    acc.diasPastagem += r.diasEmPastagem
    acc.diasConfinamento += r.diasEmConfinamento
    return acc
  }, { ganhoPastagem: 0, ganhoConfinamento: 0, custoPastagem: 0, custoConfinamento: 0, diasPastagem: 0, diasConfinamento: 0 })

  return (
    <Modal open onClose={onClose} title={lote.nome_lote}
      subtitle={`${lote.codigo_lote} · ${rotuloCiclo(lote, distribuicaoCiclos[loteId])}${!loteAtivo ? ` · ${lote.motivo_encerramento === 'venda' ? 'Vendido' : lote.motivo_encerramento === 'extincao' ? 'Extinto' : 'Encerrado'}` : ''}`} size="xl"
      footer={selecionados.size > 0 && loteAtivo ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12, color: '#1b5e20', fontWeight: 600 }}>{selecionados.size} selecionado(s)</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelecionados(new Set())} style={{ marginLeft: 'auto' }}>Limpar seleção</button>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary btn-sm"
              disabled={cicloOrigemSelecao === null}
              title={cicloOrigemSelecao === null ? 'Selecione animais que estejam todos no mesmo ciclo' : undefined}
              onClick={() => setShowAvancarCiclo('parcial')}>
              Avançar ciclo dos selecionados
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowBifurcar(true)}>Bifurcar</button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowMover(true)}>Mover para outro lote</button>
            <button className="btn btn-primary btn-sm" onClick={() => setShowVenda(true)}>Vender</button>
          </div>
        </div>
      ) : undefined}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

        {!loteAtivo && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--gray-50)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
            <span>Lote encerrado{lote.motivo_encerramento_obs ? ` — ${lote.motivo_encerramento_obs}` : ''}. Você pode consultar o histórico, mas não pode mais editá-lo.</span>
            {lote.motivo_encerramento === 'venda' && (
              <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => navigate(`/vendas?lote=${lote.id}`)}>
                Ver vendas
              </button>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <ResumoCard label="Animais ativos" valor={String(qtdAtiva)} />
          <ResumoCard label="Peso médio hoje" valor={`${fmtNum(pesoMedioHoje, 1)} kg`} />
          <ResumoCard label="Custo acumulado" valor={fmt(custoTotalHoje)} destaque />
          <ResumoCard label="Valor de compra total" valor={fmt(valorCompraTotal)} />
          <ResumoCard label="Data de registro" valor={fmtData(lote.data_criacao)} />
        </div>

        {loteAtivo && (
          <div className="flex-between" style={{ flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowAvancarCiclo('total')} disabled={lote.ciclo_atual >= lote.num_ciclos}>
                Avançar ciclo
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowEditarCiclos(true)}>
                Editar ciclos
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowProjecao(v => !v)}>
                {showProjecao ? 'Ocultar projeção' : 'Ver projeção'}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCustoOperacional(true)}>
                Custos operacionais
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCustoRacaoReal(true)}>
                Custo real de ração
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowCompras(true)}>
                Compras
              </button>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowHistoricoMovimentacoes(true)}>
                Histórico de movimentações
              </button>
              {qtdAtiva > 0 && (
                <button className="btn btn-ghost btn-sm" onClick={() => setShowResumoLote(true)}>
                  Ver resumo do lote
                </button>
              )}
              {qtdAtiva === 0 && (
                <button className="btn btn-ghost btn-sm" style={{ color: '#b91c1c' }} onClick={() => setShowEncerrar(true)}>
                  Encerrar lote
                </button>
              )}
            </div>
            <button className="btn btn-primary btn-sm" onClick={() => setShowAdicionarAnimais(true)}>+ Adicionar animais</button>
          </div>
        )}

        {!loteAtivo && custosOperacionais.length > 0 && (
          <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setShowCustoOperacional(true)}>
            Ver custos operacionais ({fmt(totalCustoOperacional)})
          </button>
        )}

        {!loteAtivo && custosRacaoReal.length > 0 && (
          <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setShowCustoRacaoReal(true)}>
            Ver custo real de ração ({custosRacaoReal.length} lançamento{custosRacaoReal.length !== 1 ? 's' : ''})
          </button>
        )}

        {!loteAtivo && compras.length > 0 && (
          <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setShowCompras(true)}>
            Ver compras ({compras.length})
          </button>
        )}

        {!loteAtivo && eventosMovimentacao.length > 0 && (
          <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => setShowHistoricoMovimentacoes(true)}>
            Ver histórico de movimentações ({eventosMovimentacao.length})
          </button>
        )}

        {temCicloPastagem && (somaPorTipo.diasPastagem > 0 || somaPorTipo.diasConfinamento > 0) && (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '10px 14px', flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 6 }}>Pastagem (até agora)</div>
              <div style={{ fontSize: 12, display: 'flex', gap: 14 }}>
                <span>{somaPorTipo.diasPastagem} dia(s)</span>
                <span>{fmtNum(somaPorTipo.ganhoPastagem, 1)} kg ganhos</span>
                <span>{fmt(somaPorTipo.custoPastagem)} custo</span>
              </div>
            </div>
            <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '10px 14px', flex: 1, minWidth: 220 }}>
              <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 6 }}>Confinamento (até agora)</div>
              <div style={{ fontSize: 12, display: 'flex', gap: 14 }}>
                <span>{somaPorTipo.diasConfinamento} dia(s)</span>
                <span>{fmtNum(somaPorTipo.ganhoConfinamento, 1)} kg ganhos</span>
                <span>{fmt(somaPorTipo.custoConfinamento)} custo</span>
              </div>
            </div>
          </div>
        )}

        {showProjecao && (
          <PainelProjecao
            pesoMedioAtual={pesoMedioHoje} qtdAnimais={qtdAtiva} gmdReal={gmdRealMedio}
            custoCompraTotal={valorCompraTotal} custoAlimentacaoAcumulado={custoTotalHoje}
            ciclosConfig={ciclosFuturos} rendimentos={rendimentos} bonus={bonus}
          />
        )}

        {gruposDuplicados.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: '#fff8e1', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
            <span>{gruposDuplicados.length} brinco(s) com lançamento duplicado neste lote (mesmo peso e data de entrada).</span>
            <button className="btn btn-ghost btn-sm" style={{ marginLeft: 'auto' }} onClick={() => setShowDuplicados(true)}>Ver duplicados</button>
          </div>
        )}

        {loading || calculando ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
            <div className="spinner" style={{ width: 24, height: 24 }} />
          </div>
        ) : animais.length === 0 ? (
          <EmptyState icon="◆" title="Nenhum animal neste lote"
            desc={loteAtivo ? "Adicione animais por faixa de brinco, individualmente ou importando um CSV." : undefined}
            action={loteAtivo ? <button className="btn btn-primary" onClick={() => setShowAdicionarAnimais(true)}>Adicionar animais</button> : undefined} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  {loteAtivo && (
                    <th style={{ width: 30 }}>
                      <input type="checkbox"
                        checked={selecionados.size === animais.length}
                        onChange={e => setSelecionados(e.target.checked ? new Set(animais.map(a => a.id)) : new Set())} />
                    </th>
                  )}
                  <th>Código</th>
                  <th>Ciclo</th>
                  <th>Peso entrada</th>
                  <th>Data entrada</th>
                  <th>Peso hoje (est.)</th>
                  <th>Dias</th>
                  <th>Custo acumulado</th>
                  <th>Custo/kg ganho</th>
                  <th style={{ position: 'sticky', right: 0, background: 'var(--gray-50)', boxShadow: '-4px 0 6px -4px rgba(0,0,0,0.15)' }}></th>
                </tr>
              </thead>
              <tbody>
                {animais.map(a => {
                  const r = resultados[a.id]
                  const pesoAtual = r?.peso ?? a.peso_entrada
                  const ganho = pesoAtual - a.peso_entrada
                  const custoTotal = custoTotalAnimal(a.id)
                  const custoPorKg = r && ganho > 0 ? custoTotal / ganho : null
                  const destacado = a.id === highlightAnimalId
                  // Badge dourado só quando o animal está à frente do ciclo-base
                  // do lote (avanço parcial já aplicado nele) — sinaliza a
                  // distinção sem poluir a tabela quando todo mundo está igual.
                  const adiantado = a.ciclo_atual !== lote.ciclo_atual
                  return (
                    <tr key={a.id} data-animal-id={a.id}
                      style={{ cursor: 'pointer', ...(destacado ? { background: 'var(--green-bg)' } : {}) }}
                      onClick={() => setShowDetalheAnimal(a.id)}>
                      {loteAtivo && (
                        <td onClick={e => e.stopPropagation()}>
                          <input type="checkbox" checked={selecionados.has(a.id)} onChange={() => toggleSelecionado(a.id)} />
                        </td>
                      )}
                      <td><strong>{a.codigo}</strong></td>
                      <td>
                        <span style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 20,
                          background: adiantado ? '#fdf3dc' : 'var(--gray-50)',
                          color: adiantado ? '#946200' : 'var(--gray-500)',
                          border: `1px solid ${adiantado ? '#c99324' : '#e0e0e0'}`,
                        }}>
                          Ciclo {a.ciclo_atual}
                        </span>
                      </td>
                      <td>{fmtNum(a.peso_entrada, 1)} kg</td>
                      <td>{fmtData(a.data_entrada)}</td>
                      <td>{r ? `${fmtNum(r.peso, 1)} kg` : '—'}</td>
                      <td>{r ? r.diasConfinamento : '—'}</td>
                      <td>{r ? fmt(custoTotal) : '—'}</td>
                      <td>{custoPorKg != null ? `${fmt(custoPorKg)}/kg` : '—'}</td>
                      <td style={{ position: 'sticky', right: 0, background: destacado ? 'var(--green-bg)' : 'var(--white)', boxShadow: '-4px 0 6px -4px rgba(0,0,0,0.15)' }}
                        onClick={e => e.stopPropagation()}>
                        {loteAtivo && (
                          <button className="btn btn-ghost btn-sm" onClick={() => setShowPesagem(a.id)} title="Pesar" aria-label="Pesar">
                            <IconBalanca />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {erro && <div style={{ padding: 10, background: '#ffebee', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>{erro}</div>}
      </div>

      {showAdicionarAnimais && (
        <ModalAdicionarAnimais lote={lote} onClose={() => setShowAdicionarAnimais(false)} onConfirmar={handleAdicionarAnimais} />
      )}

      {showAvancarCiclo === 'total' && (
        <ModalAvancarCiclo
          titulo="Avançar ciclo"
          subtitulo={`Todo o lote ainda no ciclo ${lote.ciclo_atual} avança para o ciclo ${lote.ciclo_atual + 1}`}
          animaisAlvo={animais.filter(a => a.ciclo_atual === lote.ciclo_atual).map(a => ({ id: a.id, codigo: a.codigo, brinco: a.brinco }))}
          onClose={() => setShowAvancarCiclo(null)}
          onConfirmar={handleConfirmarAvancarCicloTotal}
        />
      )}

      {showAvancarCiclo === 'parcial' && cicloOrigemSelecao !== null && (
        <ModalAvancarCiclo
          titulo="Avançar ciclo dos selecionados"
          subtitulo={`${selecionados.size} animal(is) do ciclo ${cicloOrigemSelecao} avançam para o ciclo ${cicloOrigemSelecao + 1}`}
          animaisAlvo={animaisSelecionadosArr.map(a => ({ id: a.id, codigo: a.codigo, brinco: a.brinco }))}
          onClose={() => setShowAvancarCiclo(null)}
          onConfirmar={handleConfirmarAvancarCicloParcial}
        />
      )}

      {showBifurcar && (
        <Modal open onClose={() => setShowBifurcar(false)} title="Bifurcar lote"
          subtitle={`${selecionados.size} animal(is) selecionado(s) irão para um novo lote`} size="lg">
          <FormLoteBase
            codigoSugerido={proximoNumeroLote()}
            dietasTemplates={dietasTemplates}
            onCancelar={() => setShowBifurcar(false)}
            onConfirmar={handleBifurcar}
            tituloConfirmar="Confirmar bifurcação"
            loteOrigem={lote}
            prefixosAtivos={lotesAtivos.map(l => l.prefixo)}
          />
        </Modal>
      )}

      {showMover && (
        <Modal open onClose={() => setShowMover(false)} title="Mover para outro lote"
          subtitle={`${selecionados.size} animal(is) selecionado(s)`}>
          <ModalMoverConteudo
            lotesDisponiveis={lotesAtivos.filter(l => l.id !== loteId)}
            onConfirmar={handleMover}
            onCancelar={() => setShowMover(false)}
          />
        </Modal>
      )}

      {showVenda && (
        <ModalVenda
          onClose={() => { setShowVenda(false); setSelecionados(new Set()); fetch() }}
          lotesDisponiveis={lotesAtivos}
          animaisPreSelecionados={animais.filter(a => selecionados.has(a.id))}
          resultadosPreCalculados={resultados}
        />
      )}

      {showPesagem && (
        <ModalPesagem
          animal={animais.find(a => a.id === showPesagem)!}
          pesoEstimado={resultados[showPesagem]?.peso}
          onClose={() => setShowPesagem(null)}
          onConfirmar={async (peso, data) => {
            const res = await registrarPesagem({ animal_id: showPesagem, peso, data })
            if (!res.error) { setShowPesagem(null); await recalcular() }
            return res
          }}
        />
      )}

      {showEditarEntrada && (
        <ModalEditarEntrada
          animal={animais.find(a => a.id === showEditarEntrada)!}
          eventoEntradaNoLote={eventosMovimentacao.find(ev => ev.lote_destino_id === loteId && ev.animais.some(a => a.animal_id === showEditarEntrada)) ?? null}
          onClose={() => setShowEditarEntrada(null)}
          onConfirmar={async (peso, data) => {
            const res = await editarEntrada({ animal_id: showEditarEntrada, peso_entrada: peso, data_entrada: data })
            if (!res.error) { setShowEditarEntrada(null); await recalcular() }
            return res
          }}
          onEditarDataEvento={async (grupoEventoId, novaData) => {
            const res = await editarDataEvento(grupoEventoId, novaData)
            if (!res.error) await recalcular()
            return res
          }}
        />
      )}

      {showExcluirAnimal && (
        <ModalConfirmarExclusaoAnimal
          animal={animais.find(a => a.id === showExcluirAnimal)!}
          onClose={() => setShowExcluirAnimal(null)}
          onConfirmar={() => handleExcluirAnimal(showExcluirAnimal)}
        />
      )}

      {showDuplicados && (
        <ModalDuplicados
          grupos={gruposDuplicados}
          onClose={() => setShowDuplicados(false)}
          onExcluir={async ids => {
            const res = await handleExcluirSelecionados(ids)
            if (!res.error) setShowDuplicados(false)
            return res
          }}
        />
      )}

      {showEncerrar && (
        <ModalEncerrarLote onClose={() => setShowEncerrar(false)} onConfirmar={handleEncerrar} />
      )}

      {showCustoOperacional && (
        <ModalCustosOperacionais
          lote={lote} loteAtivo={loteAtivo}
          custos={custosOperacionais} loading={loadingCustosOp} total={totalCustoOperacional}
          onClose={() => setShowCustoOperacional(false)}
          onAdicionar={async input => { const res = await adicionarCusto(input); if (!res.error) await recalcular(); return res }}
          onRemover={async id => { await removerCusto(id); await recalcular() }}
        />
      )}

      {showCustoRacaoReal && (
        <ModalCustoRacaoReal
          lote={lote} loteAtivo={loteAtivo}
          custos={custosRacaoReal} loading={loadingCustosRacaoReal}
          onClose={() => setShowCustoRacaoReal(false)}
          onAdicionar={async input => { const res = await adicionarCustoRacaoReal(input); if (!res.error) await recalcular(); return res }}
          onEditar={async (id, input) => { const res = await editarCustoRacaoReal(id, input); if (!res.error) await recalcular(); return res }}
          onRemover={async id => { await removerCustoRacaoReal(id); await recalcular() }}
        />
      )}

      {showCompras && (
        <ModalCompras
          lote={lote} compras={compras} loading={loadingCompras} nomeParceiro={nomeParceiro}
          onClose={() => setShowCompras(false)}
        />
      )}

      {showHistoricoMovimentacoes && (
        <ModalHistoricoMovimentacoes
          lote={lote} eventos={eventosMovimentacao} loading={loadingMovimentacao} todosLotes={todosLotes}
          onClose={() => setShowHistoricoMovimentacoes(false)}
          onEditarData={async (grupoEventoId, novaData) => {
            const res = await editarDataEvento(grupoEventoId, novaData)
            if (!res.error) await recalcular()
            return res
          }}
        />
      )}

      {showEditarCiclos && (
        <ModalEditarCiclos
          lote={lote} ciclos={ciclos} dietasTemplates={dietasTemplates}
          salvarCiclosLote={salvarCiclosLote}
          onClose={() => setShowEditarCiclos(false)}
        />
      )}

      {showProjecaoAnimal && (() => {
        const animal = animais.find(a => a.id === showProjecaoAnimal)
        if (!animal) return null
        const r = resultados[animal.id]
        return (
          <Modal open onClose={() => setShowProjecaoAnimal(null)} title={`Projeção — ${animal.codigo}`} size="lg">
            <PainelProjecao
              pesoMedioAtual={r?.peso ?? animal.peso_entrada} qtdAnimais={1} gmdReal={r?.gmdMedio ?? null}
              custoCompraTotal={animal.valor_compra} custoAlimentacaoAcumulado={custoTotalAnimal(animal.id)}
              ciclosConfig={ciclosFuturos} rendimentos={rendimentos} bonus={bonus}
            />
          </Modal>
        )
      })()}

      {showDetalheAnimal && (() => {
        const animal = animais.find(a => a.id === showDetalheAnimal)
        if (!animal) return null
        return (
          <ModalDetalheAnimal
            animal={animal}
            resultado={resultados[animal.id]}
            custoTotal={custoTotalAnimal(animal.id)}
            ciclosPorLote={ciclosPorLote}
            todosLotes={todosLotes}
            buscarPesagens={buscarPesagens}
            editarPesagem={editarPesagem}
            excluirPesagem={excluirPesagem}
            calcularEmLote={calcularEmLote}
            onAlterado={recalcular}
            onClose={() => setShowDetalheAnimal(null)}
            onEditar={loteAtivo ? () => { setShowDetalheAnimal(null); setShowEditarEntrada(animal.id) } : undefined}
            onExcluir={loteAtivo ? () => { setShowDetalheAnimal(null); setShowExcluirAnimal(animal.id) } : undefined}
            onVerProjecao={() => { setShowDetalheAnimal(null); setShowProjecaoAnimal(animal.id) }}
          />
        )
      })()}

      {showResumoLote && (
        <ModalResumoLote
          lote={lote}
          animais={animais}
          resultados={resultados}
          custosVariaveisPorAnimal={custosVariaveisPorAnimal}
          ciclosPorLote={ciclosPorLote}
          todosLotes={todosLotes}
          onClose={() => setShowResumoLote(false)}
        />
      )}
    </Modal>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: DETALHE DO ANIMAL (nível individual)
// Consumo de ração, GMD real do último intervalo entre pesagens (rotulado
// "real"), custo acumulado e quebra por etapa (ciclo individual, não só
// pastagem x confinamento). Tudo calculado sob demanda — nada persistido.
// ═══════════════════════════════════════════════════════════════════════════

function nomeCiclo(
  ciclosPorLote: Record<string, Array<{ numero: number; nome: string }>>,
  loteId: string,
  numero: number,
): string {
  if (numero === 0) return 'Sem ciclo configurado'
  return ciclosPorLote[loteId]?.find(c => c.numero === numero)?.nome ?? `Ciclo ${numero}`
}

function TabelaPorEtapa({
  etapas, ciclosPorLote, todosLotes, loteAtualId,
}: {
  etapas: EtapaResultado[]
  ciclosPorLote: Record<string, Array<{ numero: number; nome: string }>>
  todosLotes: Lote[]
  loteAtualId?: string
}) {
  const ordenadas = [...etapas].sort((a, b) => a.numero - b.numero)
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Etapa</th>
            <th>Dias</th>
            <th>Ganho (kg)</th>
            <th>Consumo ração (kg)</th>
            <th>Custo alimentação</th>
            <th>Custo operacional</th>
            <th>Custo/kg ganho</th>
          </tr>
        </thead>
        <tbody>
          {ordenadas.map(e => {
            const custoTotalEtapa = e.custoAlimentacao + e.custoOperacional
            const custoPorKg = e.ganhoPeso > 0 ? custoTotalEtapa / e.ganhoPeso : null
            const nomeDoLote = todosLotes.find(l => l.id === e.lote_id)?.nome_lote
            const mostrarLote = e.lote_id !== loteAtualId && !!nomeDoLote
            return (
              <tr key={`${e.lote_id}#${e.numero}`}>
                <td>
                  {nomeCiclo(ciclosPorLote, e.lote_id, e.numero)}
                  {mostrarLote ? ` (${nomeDoLote})` : ''}
                  {e.tipoCiclo === 'pastagem' ? ' · pastagem' : ''}
                </td>
                <td>{e.dias}</td>
                <td>{fmtNum(e.ganhoPeso, 1)}</td>
                <td>{fmtNum(e.consumoRacaoKg, 1)}</td>
                <td>{fmt(e.custoAlimentacao)}</td>
                <td>{fmt(e.custoOperacional)}</td>
                <td>{custoPorKg != null ? `${fmt(custoPorKg)}/kg` : '—'}</td>
              </tr>
            )
          })}
        </tbody>
        {ordenadas.length > 1 && (() => {
          const totalDias = ordenadas.reduce((s, e) => s + e.dias, 0)
          const totalGanho = ordenadas.reduce((s, e) => s + e.ganhoPeso, 0)
          const totalConsumo = ordenadas.reduce((s, e) => s + e.consumoRacaoKg, 0)
          const totalAlimentacao = ordenadas.reduce((s, e) => s + e.custoAlimentacao, 0)
          const totalOperacional = ordenadas.reduce((s, e) => s + e.custoOperacional, 0)
          const totalCusto = totalAlimentacao + totalOperacional
          const totalCustoPorKg = totalGanho > 0 ? totalCusto / totalGanho : null
          return (
            <tfoot>
              <tr style={{ fontWeight: 600 }}>
                <td>Total</td>
                <td>{totalDias}</td>
                <td>{fmtNum(totalGanho, 1)}</td>
                <td>{fmtNum(totalConsumo, 1)}</td>
                <td>{fmt(totalAlimentacao)}</td>
                <td>{fmt(totalOperacional)}</td>
                <td>{totalCustoPorKg != null ? `${fmt(totalCustoPorKg)}/kg` : '—'}</td>
              </tr>
            </tfoot>
          )
        })()}
      </table>
    </div>
  )
}

function ModalDetalheAnimal({
  animal, resultado, custoTotal, ciclosPorLote, todosLotes, buscarPesagens, editarPesagem, excluirPesagem, calcularEmLote, onAlterado, onClose,
  onEditar, onExcluir, onVerProjecao,
}: {
  animal: Animal
  resultado?: ResultadoAnimalNaData
  custoTotal: number
  ciclosPorLote: Record<string, Array<{ numero: number; nome: string }>>
  todosLotes: Lote[]
  buscarPesagens: (animalId: string) => Promise<Pesagem[]>
  editarPesagem: (input: { id: string; animal_id: string; peso: number; data: string }) => Promise<{ error: string | null }>
  excluirPesagem: (id: string) => Promise<{ error: string | null }>
  calcularEmLote: (animalIds: string[], dataAlvo: string) => Promise<Record<string, ResultadoAnimalNaData>>
  onAlterado: () => Promise<void>
  onClose: () => void
  onEditar?: () => void
  onExcluir?: () => void
  onVerProjecao: () => void
}) {
  const [pesagens, setPesagens] = useState<Pesagem[] | undefined>(undefined)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [pesoEdit, setPesoEdit] = useState('')
  const [dataEdit, setDataEdit] = useState('')
  const [erroPesagem, setErroPesagem] = useState<string | null>(null)
  const [salvandoPesagem, setSalvandoPesagem] = useState(false)

  const carregarPesagens = useCallback(async () => {
    const lista = await buscarPesagens(animal.id)
    setPesagens([...lista].sort((a, b) => a.data.localeCompare(b.data)))
  }, [animal.id, buscarPesagens])

  useEffect(() => { setPesagens(undefined); carregarPesagens() }, [carregarPesagens])

  const gmdReal = useMemo(() => {
    if (pesagens === undefined) return undefined
    return calcularGmdRealUltimoIntervalo(
      { peso_entrada: animal.peso_entrada, data_entrada: animal.data_entrada },
      pesagens.map(p => ({ data: p.data, peso: p.peso })),
    )
  }, [pesagens, animal.peso_entrada, animal.data_entrada])

  // ─── Peso em outra data (movido pra cá — antes poluía a listagem do lote) ──
  // Datas passadas: recalcula de verdade (calcularEmLote), que já respeita
  // qualquer pesagem real registrada nesse meio-tempo — sempre exato.
  // Datas futuras: NÃO existe pesagem real possível, então a projeção usa o
  // GMD REAL do animal (último intervalo entre pesagens) como taxa de
  // crescimento, em vez do GMD genérico esperado do ciclo — é a melhor
  // estimativa disponível para ESTE animal específico. Só cai para o GMD
  // médio do ciclo se ainda não houver duas pesagens reais para calcular um
  // GMD real. Isso não afeta o motor de custo em si (Ranking, Vendas,
  // Comparativo) — é só esta consulta visual.
  const hoje = hojeStr()
  const [dataProjecao, setDataProjecao] = useState(hoje)
  const [resultadoProjecaoPassado, setResultadoProjecaoPassado] = useState<ResultadoAnimalNaData | undefined>(undefined)
  const [calculandoProjecao, setCalculandoProjecao] = useState(false)
  const dataEhHoje = dataProjecao === hoje
  const dataEhFutura = dataProjecao > hoje

  useEffect(() => {
    if (dataEhHoje || dataEhFutura) { setResultadoProjecaoPassado(undefined); return }
    let cancelado = false
    setCalculandoProjecao(true)
    calcularEmLote([animal.id], dataProjecao).then(res => {
      if (!cancelado) { setResultadoProjecaoPassado(res[animal.id]); setCalculandoProjecao(false) }
    })
    return () => { cancelado = true }
  }, [dataProjecao, dataEhHoje, dataEhFutura, animal.id, calcularEmLote])

  let pesoNaData: number | null = null
  let metodologiaNaData = ''
  if (dataEhHoje) {
    pesoNaData = resultado?.peso ?? null
    metodologiaNaData = 'peso atual estimado'
  } else if (!dataEhFutura) {
    pesoNaData = resultadoProjecaoPassado?.peso ?? null
    metodologiaNaData = 'histórico — considera qualquer pesagem real registrada até essa data'
  } else if (resultado) {
    const dias = toDay(dataProjecao) - toDay(hoje)
    const gmdUsado = gmdReal ? gmdReal.gmdReal : resultado.gmdMedio
    pesoNaData = resultado.peso + gmdUsado * dias
    metodologiaNaData = gmdReal
      ? `projeção com o GMD real do animal (${fmtNum(gmdReal.gmdReal, 3)} kg/dia, medido entre ${fmtData(gmdReal.dataAnterior)} e ${fmtData(gmdReal.dataNova)}) — não é uma pesagem real`
      : `projeção com o GMD médio desde a entrada (${fmtNum(resultado.gmdMedio, 3)} kg/dia) — ainda não há duas pesagens reais para calcular o GMD real deste animal; não é uma pesagem real`
  }

  const iniciarEdicaoPesagem = (p: Pesagem) => {
    setEditandoId(p.id); setPesoEdit(String(p.peso)); setDataEdit(p.data); setErroPesagem(null)
  }
  const cancelarEdicaoPesagem = () => { setEditandoId(null); setErroPesagem(null) }

  const salvarEdicaoPesagem = async () => {
    if (!editandoId) return
    const peso = Number(pesoEdit)
    if (!peso || peso <= 0) { setErroPesagem('Peso inválido'); return }
    if (!dataEdit) { setErroPesagem('Informe a data'); return }
    setSalvandoPesagem(true); setErroPesagem(null)
    const res = await editarPesagem({ id: editandoId, animal_id: animal.id, peso, data: dataEdit })
    setSalvandoPesagem(false)
    if (res.error) { setErroPesagem(res.error); return }
    setEditandoId(null)
    await carregarPesagens()
    await onAlterado()
  }

  const excluir = async (id: string) => {
    await excluirPesagem(id)
    await carregarPesagens()
    await onAlterado()
  }

  const ganho = resultado ? resultado.peso - animal.peso_entrada : 0
  const custoPorKgGanho = resultado && ganho > 0 ? custoTotal / ganho : null
  const etapas = resultado ? Object.values(resultado.porEtapa) : []

  return (
    <Modal open onClose={onClose} title={`Detalhes — ${animal.codigo}`}
      subtitle={`Brinco ${animal.brinco} · entrada ${fmtData(animal.data_entrada)}`} size="xl">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <ResumoCard label="Peso atual (est.)" valor={resultado ? `${fmtNum(resultado.peso, 1)} kg` : '—'} />
          <ResumoCard label="Consumo de ração (total)" valor={resultado ? `${fmtNum(resultado.consumoRacaoKg, 1)} kg` : '—'} />
          <ResumoCard label="Custo acumulado" valor={fmt(custoTotal)} destaque />
          <ResumoCard label="Custo/kg ganho" valor={custoPorKgGanho != null ? `${fmt(custoPorKgGanho)}/kg` : '—'} />
        </div>

        <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 8 }}>GMD do último intervalo entre pesagens</div>
          {gmdReal === undefined ? (
            <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>Calculando…</div>
          ) : gmdReal === null ? (
            <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>Ainda não há duas pesagens para calcular um GMD real.</div>
          ) : (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', fontSize: 13 }}>
              <span style={{ background: '#e8f5e9', color: '#1b5e20', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 }}>REAL</span>
              <span><strong>{fmtNum(gmdReal.gmdReal, 3)} kg/dia</strong></span>
              <span>{fmtNum(gmdReal.pesoAnterior, 1)} kg ({fmtData(gmdReal.dataAnterior)}) → {fmtNum(gmdReal.pesoNovo, 1)} kg ({fmtData(gmdReal.dataNova)})</span>
              <span>{gmdReal.dias} dia(s)</span>
            </div>
          )}
          {resultado && (
            <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 8 }}>
              GMD médio desde a entrada (estimado, mistura projeção e pesagens reais): {fmtNum(resultado.gmdMedio, 3)} kg/dia
            </div>
          )}
        </div>

        <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '12px 14px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
            <label className="form-label" style={{ margin: 0 }}>Ver peso em outra data</label>
            <input className="form-input" type="date" value={dataProjecao}
              onChange={e => setDataProjecao(e.target.value)} style={{ maxWidth: 170 }} />
            {!dataEhHoje && (
              <button className="btn btn-ghost btn-sm" onClick={() => setDataProjecao(hoje)}>Voltar para hoje</button>
            )}
          </div>
          {calculandoProjecao ? (
            <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>Calculando…</div>
          ) : pesoNaData != null ? (
            <>
              <div style={{ fontSize: 18, fontWeight: 600 }}>{fmtNum(pesoNaData, 1)} kg</div>
              <div style={{ fontSize: 11, color: 'var(--gray-500)', marginTop: 4 }}>{metodologiaNaData}</div>
            </>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--gray-400)' }}>—</div>
          )}
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Custo e consumo por etapa</div>
          {etapas.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>Nenhuma etapa calculada ainda.</div>
          ) : (
            <TabelaPorEtapa etapas={etapas} ciclosPorLote={ciclosPorLote} todosLotes={todosLotes} loteAtualId={animal.lote_atual_id ?? undefined} />
          )}
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Histórico de pesagens</div>
          {pesagens === undefined ? (
            <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>Carregando…</div>
          ) : pesagens.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>Nenhuma pesagem registrada além da entrada.</div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Peso</th>
                    <th>Ganho desde a pesagem anterior</th>
                    <th style={{ width: 140 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {pesagens.map((p, idx) => {
                    const anterior = idx === 0 ? animal.peso_entrada : pesagens[idx - 1].peso
                    const ganhoLinha = p.peso - anterior
                    const emEdicao = editandoId === p.id
                    return (
                      <tr key={p.id}>
                        {emEdicao ? (
                          <>
                            <td><input className="form-input" type="date" value={dataEdit} onChange={e => setDataEdit(e.target.value)} style={{ fontSize: 13 }} /></td>
                            <td><input className="form-input" type="number" step="0.1" value={pesoEdit} onChange={e => setPesoEdit(e.target.value)} style={{ maxWidth: 100, fontSize: 13 }} /></td>
                            <td colSpan={2}>
                              <div style={{ display: 'flex', gap: 6 }}>
                                <button className="btn btn-primary btn-sm" onClick={salvarEdicaoPesagem} disabled={salvandoPesagem}>Salvar</button>
                                <button className="btn btn-ghost btn-sm" onClick={cancelarEdicaoPesagem} disabled={salvandoPesagem}>Cancelar</button>
                              </div>
                            </td>
                          </>
                        ) : (
                          <>
                            <td>{fmtData(p.data)}</td>
                            <td>{fmtNum(p.peso, 1)} kg</td>
                            <td style={{ color: ganhoLinha >= 0 ? undefined : '#b91c1c' }}>{ganhoLinha >= 0 ? '+' : ''}{fmtNum(ganhoLinha, 1)} kg</td>
                            <td>
                              <div style={{ display: 'flex', gap: 4 }}>
                                <button className="btn btn-ghost btn-sm" onClick={() => iniciarEdicaoPesagem(p)}>Editar</button>
                                <button onClick={() => excluir(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9e9e9e', fontSize: 16 }}>×</button>
                              </div>
                            </td>
                          </>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          {erroPesagem && <div style={{ marginTop: 8, padding: 8, background: '#ffebee', borderRadius: 8, color: '#b91c1c', fontSize: 12 }}>{erroPesagem}</div>}
        </div>

        <div className="modal-actions">
          {onExcluir && (
            <button className="btn btn-ghost" style={{ color: '#b91c1c', marginRight: 'auto' }} onClick={onExcluir}>Excluir animal</button>
          )}
          <button className="btn btn-ghost" onClick={onVerProjecao}>Ver projeção</button>
          {onEditar && <button className="btn btn-ghost" onClick={onEditar}>Editar entrada</button>}
          <button className="btn btn-primary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </Modal>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: RESUMO DO LOTE (nível de grupo)
// Mesmos campos do detalhe individual, agregados para todos os animais
// ativos do lote — consumo total, custo total, e quebra por etapa somada.
// ═══════════════════════════════════════════════════════════════════════════

function ModalResumoLote({
  lote, animais, resultados, custosVariaveisPorAnimal, ciclosPorLote, todosLotes, onClose,
}: {
  lote: Lote
  animais: Animal[]
  resultados: Record<string, ResultadoAnimalNaData>
  custosVariaveisPorAnimal: Record<string, number>
  ciclosPorLote: Record<string, Array<{ numero: number; nome: string }>>
  todosLotes: Lote[]
  onClose: () => void
}) {
  const totais = useMemo(() => {
    let consumoRacaoKg = 0, custoAlimentacao = 0, custoOperacional = 0, custosVariaveis = 0, ganhoPeso = 0, pesoAtual = 0
    const etapasPorChave: Record<string, EtapaResultado> = {}

    for (const a of animais) {
      const r = resultados[a.id]
      if (!r) continue
      consumoRacaoKg += r.consumoRacaoKg
      custoAlimentacao += r.custoAlimentacao
      custoOperacional += r.custoOperacional
      custosVariaveis += custosVariaveisPorAnimal[a.id] ?? 0
      ganhoPeso += r.peso - a.peso_entrada
      pesoAtual += r.peso

      for (const e of Object.values(r.porEtapa)) {
        const chave = `${e.lote_id}#${e.numero}`
        if (!etapasPorChave[chave]) {
          etapasPorChave[chave] = { lote_id: e.lote_id, numero: e.numero, tipoCiclo: e.tipoCiclo, dias: 0, ganhoPeso: 0, consumoRacaoKg: 0, custoAlimentacao: 0, custoOperacional: 0 }
        }
        const acc = etapasPorChave[chave]
        acc.dias = Math.max(acc.dias, e.dias)
        acc.ganhoPeso += e.ganhoPeso
        acc.consumoRacaoKg += e.consumoRacaoKg
        acc.custoAlimentacao += e.custoAlimentacao
        acc.custoOperacional += e.custoOperacional
      }
    }

    const custoTotal = custoAlimentacao + custoOperacional + custosVariaveis
    return {
      consumoRacaoKg, custoAlimentacao, custoOperacional, custosVariaveis, custoTotal,
      ganhoPeso, pesoAtual,
      etapas: Object.values(etapasPorChave),
    }
  }, [animais, resultados, custosVariaveisPorAnimal])

  const pesoMedioAtual = animais.length > 0 ? totais.pesoAtual / animais.length : 0
  const custoPorKgGanho = totais.ganhoPeso > 0 ? totais.custoTotal / totais.ganhoPeso : null

  return (
    <Modal open onClose={onClose} title={`Resumo — ${lote.nome_lote}`}
      subtitle={`${animais.length} animal(is) ativo(s)`} size="xl">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <ResumoCard label="Peso médio atual" valor={`${fmtNum(pesoMedioAtual, 1)} kg`} />
          <ResumoCard label="Consumo de ração (total)" valor={`${fmtNum(totais.consumoRacaoKg, 0)} kg`} />
          <ResumoCard label="Custo total do grupo" valor={fmt(totais.custoTotal)} destaque />
          <ResumoCard label="Custo/kg ganho" valor={custoPorKgGanho != null ? `${fmt(custoPorKgGanho)}/kg` : '—'} />
        </div>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <ResumoCard label="Custo alimentação" valor={fmt(totais.custoAlimentacao)} />
          <ResumoCard label="Custo operacional" valor={fmt(totais.custoOperacional)} />
          <ResumoCard label="Custos variáveis" valor={fmt(totais.custosVariaveis)} />
          <ResumoCard label="Ganho de peso total" valor={`${fmtNum(totais.ganhoPeso, 1)} kg`} />
        </div>

        <div>
          <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Custo e consumo por etapa (somado do grupo)</div>
          {totais.etapas.length === 0 ? (
            <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>Nenhuma etapa calculada ainda.</div>
          ) : (
            <TabelaPorEtapa etapas={totais.etapas} ciclosPorLote={ciclosPorLote} todosLotes={todosLotes} loteAtualId={lote.id} />
          )}
        </div>

        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </Modal>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: HISTÓRICO DE MOVIMENTAÇÕES ENTRE LOTES
// Lista os eventos de bifurcação/movimentação que envolveram este lote
// (agrupados por grupo_evento_id, já que afetam vários animais de uma vez) e
// permite corrigir a data de todo o grupo — para quando o produtor registrou
// a movimentação em dia diferente do dia real em que os animais foram
// fisicamente movidos, o que distorce qual dieta/ciclo vale em cada dia no
// motor de custo. Não cobre entrada (tem correção própria) nem saída/venda.
// ═══════════════════════════════════════════════════════════════════════════

const TIPO_EVENTO_LABEL: Record<string, string> = {
  bifurcacao: 'Bifurcação',
  transferencia_lote: 'Movimentação',
}

function ModalHistoricoMovimentacoes({
  lote, eventos, loading, todosLotes, onClose, onEditarData,
}: {
  lote: Lote
  eventos: MovimentacaoGrupoLote[]
  loading: boolean
  todosLotes: Lote[]
  onClose: () => void
  onEditarData: (grupoEventoId: string, novaData: string) => Promise<{ error: string | null }>
}) {
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [novaData, setNovaData] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const nomeLote = (id: string | null) => id ? (todosLotes.find(l => l.id === id)?.nome_lote ?? '—') : '—'

  const iniciarEdicao = (ev: MovimentacaoGrupoLote) => {
    setEditandoId(ev.grupo_evento_id); setNovaData(ev.data); setErro(null)
  }

  const salvar = async (grupoEventoId: string) => {
    if (!novaData) { setErro('Informe a data'); return }
    setSaving(true); setErro(null)
    const res = await onEditarData(grupoEventoId, novaData)
    setSaving(false)
    if (res.error) { setErro(res.error); return }
    setEditandoId(null)
  }

  return (
    <Modal open onClose={onClose} title={`Histórico de movimentações — ${lote.nome_lote}`}
      subtitle="Corrija a data se a movimentação foi lançada em dia diferente do dia real — isso afeta qual dieta/ciclo é usado no cálculo de custo" size="xl">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><div className="spinner" style={{ width: 24, height: 24 }} /></div>
        ) : eventos.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--gray-500)', fontSize: 13 }}>Nenhuma bifurcação ou movimentação entre lotes envolvendo este lote ainda.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Tipo</th>
                  <th>De</th>
                  <th>Para</th>
                  <th>Animais</th>
                  <th style={{ width: 160 }}></th>
                </tr>
              </thead>
              <tbody>
                {eventos.map(ev => {
                  const emEdicao = editandoId === ev.grupo_evento_id
                  return (
                    <tr key={ev.grupo_evento_id}>
                      {emEdicao ? (
                        <>
                          <td><input className="form-input" type="date" value={novaData} onChange={e => setNovaData(e.target.value)} style={{ fontSize: 13 }} /></td>
                          <td colSpan={4} style={{ color: 'var(--gray-500)', fontSize: 12 }}>{TIPO_EVENTO_LABEL[ev.tipo] ?? ev.tipo} · {ev.animais.length} animal(is)</td>
                          <td>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-primary btn-sm" onClick={() => salvar(ev.grupo_evento_id)} disabled={saving}>Salvar</button>
                              <button className="btn btn-ghost btn-sm" onClick={() => { setEditandoId(null); setErro(null) }} disabled={saving}>Cancelar</button>
                            </div>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>{fmtData(ev.data)}</td>
                          <td>{TIPO_EVENTO_LABEL[ev.tipo] ?? ev.tipo}</td>
                          <td>{nomeLote(ev.lote_origem_id)}</td>
                          <td>{nomeLote(ev.lote_destino_id)}</td>
                          <td style={{ maxWidth: 220 }}>
                            {ev.animais.length} — {ev.animais.slice(0, 4).map(a => a.codigo).join(', ')}
                            {ev.animais.length > 4 ? ` e mais ${ev.animais.length - 4}` : ''}
                          </td>
                          <td>
                            <button className="btn btn-ghost btn-sm" onClick={() => iniciarEdicao(ev)}>Editar data</button>
                          </td>
                        </>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {erro && <div style={{ padding: 10, background: '#ffebee', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>{erro}</div>}

        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </Modal>
  )
}

// Ícone simples de balança — sem dependência de biblioteca externa, sem
// emoji, sem seta (segue o padrão visual do produto).
function IconBalanca({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3v18" />
      <path d="M5 8h14" />
      <path d="M5 8l-3 6a3 3 0 0 0 6 0z" />
      <path d="M19 8l-3 6a3 3 0 0 0 6 0z" />
      <path d="M8 21h8" />
    </svg>
  )
}

function ResumoCard({ label, valor, destaque }: { label: string; valor: string; destaque?: boolean }) {
  return (
    <div style={{ background: destaque ? 'var(--green-bg)' : 'var(--gray-50)', borderRadius: 8, padding: '10px 14px', flex: 1, minWidth: 150 }}>
      <div style={{ fontSize: 11, color: destaque ? 'var(--green)' : 'var(--gray-500)' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600, color: destaque ? 'var(--green-dark)' : undefined }}>{valor}</div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: AVANÇAR CICLO (total ou parcial) — data editável + pesagem opcional
// ═══════════════════════════════════════════════════════════════════════════

function ModalAvancarCiclo({
  titulo, subtitulo, animaisAlvo, onClose, onConfirmar,
}: {
  titulo: string
  subtitulo: string
  animaisAlvo: Array<{ id: string; codigo: string; brinco: string }>
  onClose: () => void
  onConfirmar: (data: string, pesagem?: PesagemNaTroca) => Promise<{ error: string | null }>
}) {
  const [data, setData] = useState(hojeStr())
  const [querPesagem, setQuerPesagem] = useState(false)
  const [modoPesagem, setModoPesagem] = useState<'massa' | 'individual'>('massa')
  const [pesoUnico, setPesoUnico] = useState('')
  const [pesosPorAnimal, setPesosPorAnimal] = useState<Record<string, string>>({})
  const [erro, setErro] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const confirmar = async () => {
    if (!data) { setErro('Informe a data de entrada no novo ciclo'); return }
    let pesagem: PesagemNaTroca | undefined
    if (querPesagem) {
      if (modoPesagem === 'massa') {
        const p = Number(pesoUnico)
        if (!p || p <= 0) { setErro('Informe o peso a aplicar a todos os animais'); return }
        pesagem = { modo: 'massa', pesoUnico: p }
      } else {
        const porAnimal: Record<string, number> = {}
        for (const [id, v] of Object.entries(pesosPorAnimal)) {
          const p = Number(v)
          if (p > 0) porAnimal[id] = p
        }
        pesagem = { modo: 'individual', porAnimal }
      }
    }
    setSaving(true)
    const res = await onConfirmar(data, pesagem)
    setSaving(false)
    if (res.error) setErro(res.error)
  }

  return (
    <Modal open onClose={onClose} title={titulo} subtitle={subtitulo} size="md">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="form-group">
          <label className="form-label">Data de entrada no novo ciclo</label>
          <input className="form-input" type="date" value={data} onChange={e => setData(e.target.value)} />
          <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>
            Pode ser uma data retroativa — os custos e demais variáveis são recalculados a partir dela.
          </div>
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
          <input type="checkbox" checked={querPesagem} onChange={e => setQuerPesagem(e.target.checked)} />
          Lançar pesagem nesta troca de ciclo
        </label>

        {querPesagem && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--gray-50)', borderRadius: 8, padding: 12 }}>
            <div style={{ display: 'flex', gap: 14, fontSize: 13 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="radio" checked={modoPesagem === 'massa'} onChange={() => setModoPesagem('massa')} />
                Um peso único para todos
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                <input type="radio" checked={modoPesagem === 'individual'} onChange={() => setModoPesagem('individual')} />
                Peso individual por animal
              </label>
            </div>

            {modoPesagem === 'massa' ? (
              <div className="form-group" style={{ maxWidth: 180 }}>
                <label className="form-label">Peso (kg)</label>
                <input className="form-input" type="number" step="0.1" value={pesoUnico} onChange={e => setPesoUnico(e.target.value)} />
              </div>
            ) : (
              <div style={{ maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {animaisAlvo.map(a => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, minWidth: 90 }}>{a.codigo}</span>
                    <input className="form-input" type="number" step="0.1" placeholder="kg"
                      style={{ maxWidth: 110 }}
                      value={pesosPorAnimal[a.id] ?? ''}
                      onChange={e => setPesosPorAnimal(prev => ({ ...prev, [a.id]: e.target.value }))} />
                  </div>
                ))}
                <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                  Deixe em branco os animais que não serão pesados agora.
                </div>
              </div>
            )}
          </div>
        )}

        {erro && <div style={{ padding: 10, background: '#ffebee', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>{erro}</div>}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={confirmar} disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Confirmar avanço de ciclo'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: PESAGEM INDIVIDUAL
// ═══════════════════════════════════════════════════════════════════════════

function ModalPesagem({
  animal, pesoEstimado, onClose, onConfirmar,
}: {
  animal: Animal
  pesoEstimado?: number
  onClose: () => void
  onConfirmar: (peso: number, data: string) => Promise<{ error: string | null }>
}) {
  const [peso, setPeso] = useState(pesoEstimado ? String(Math.round(pesoEstimado)) : '')
  const [data, setData] = useState(hojeStr())
  const [erro, setErro] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const confirmar = async () => {
    const p = Number(peso)
    if (!p || p <= 0) { setErro('Peso inválido'); return }
    if (data < animal.data_entrada) { setErro('A data da pesagem não pode ser anterior à entrada do animal'); return }
    setSaving(true)
    const res = await onConfirmar(p, data)
    setSaving(false)
    if (res.error) setErro(res.error)
  }

  return (
    <Modal open onClose={onClose} title={`Pesagem — ${animal.codigo}`} size="sm">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {pesoEstimado != null && (
          <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>Peso estimado hoje: {fmtNum(pesoEstimado, 1)} kg</div>
        )}
        <div className="form-row-2">
          <div className="form-group">
            <label className="form-label">Peso (kg)</label>
            <input className="form-input" type="number" step="0.1" value={peso} onChange={e => setPeso(e.target.value)} autoFocus />
          </div>
          <div className="form-group">
            <label className="form-label">Data</label>
            <input className="form-input" type="date" value={data} onChange={e => setData(e.target.value)} />
          </div>
        </div>
        {erro && <div style={{ padding: 10, background: '#ffebee', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>{erro}</div>}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={confirmar} disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Registrar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: EDITAR PESO/DATA DE ENTRADA
// ═══════════════════════════════════════════════════════════════════════════

function ModalEditarEntrada({
  animal, eventoEntradaNoLote, onClose, onConfirmar, onEditarDataEvento,
}: {
  animal: Animal
  eventoEntradaNoLote: MovimentacaoGrupoLote | null
  onClose: () => void
  onConfirmar: (peso: number, data: string) => Promise<{ error: string | null }>
  onEditarDataEvento: (grupoEventoId: string, novaData: string) => Promise<{ error: string | null }>
}) {
  const [peso, setPeso] = useState(String(animal.peso_entrada))
  const [data, setData] = useState(animal.data_entrada)
  const [erro, setErro] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [dataLote, setDataLote] = useState(eventoEntradaNoLote?.data ?? '')
  const [erroLote, setErroLote] = useState<string | null>(null)
  const [savingLote, setSavingLote] = useState(false)

  const confirmar = async () => {
    const p = Number(peso)
    if (!p || p <= 0) { setErro('Peso inválido'); return }
    if (!data) { setErro('Informe a data de entrada'); return }
    setSaving(true)
    const res = await onConfirmar(p, data)
    setSaving(false)
    if (res.error) setErro(res.error)
  }

  const confirmarDataLote = async () => {
    if (!eventoEntradaNoLote) return
    if (!dataLote) { setErroLote('Informe a data'); return }
    setSavingLote(true); setErroLote(null)
    const res = await onEditarDataEvento(eventoEntradaNoLote.grupo_evento_id, dataLote)
    setSavingLote(false)
    if (res.error) setErroLote(res.error)
  }

  return (
    <Modal open onClose={onClose} title={`Editar entrada — ${animal.codigo}`} size="sm">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
            Corrige o peso e a data de entrada cadastrados para este animal.
          </div>
          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">Peso de entrada (kg)</label>
              <input className="form-input" type="number" step="0.1" value={peso} onChange={e => setPeso(e.target.value)} autoFocus />
            </div>
            <div className="form-group">
              <label className="form-label">Data de entrada</label>
              <input className="form-input" type="date" value={data} onChange={e => setData(e.target.value)} />
            </div>
          </div>
          {erro && <div style={{ padding: 10, background: '#ffebee', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>{erro}</div>}
          <div className="modal-actions" style={{ marginTop: 0 }}>
            <button className="btn btn-primary btn-sm" onClick={confirmar} disabled={saving} style={{ marginLeft: 'auto' }}>
              {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Salvar entrada'}
            </button>
          </div>
        </div>

        {eventoEntradaNoLote && (
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
              Este animal chegou neste lote por {TIPO_EVENTO_LABEL[eventoEntradaNoLote.tipo] ?? eventoEntradaNoLote.tipo.toLowerCase()} — se a data registrada não bate com o dia real, corrija abaixo. A correção vale para todos os {eventoEntradaNoLote.animais.length} animal(is) que se moveram junto nesse evento, e recalcula o custo automaticamente.
            </div>
            <div className="form-group">
              <label className="form-label">Data em que veio para este lote</label>
              <input className="form-input" type="date" value={dataLote} onChange={e => setDataLote(e.target.value)} style={{ maxWidth: 200 }} />
            </div>
            {erroLote && <div style={{ padding: 10, background: '#ffebee', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>{erroLote}</div>}
            <div className="modal-actions" style={{ marginTop: 0 }}>
              <button className="btn btn-primary btn-sm" onClick={confirmarDataLote} disabled={savingLote} style={{ marginLeft: 'auto' }}>
                {savingLote ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Salvar data no lote'}
              </button>
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </Modal>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: ENCERRAR LOTE (pede o motivo)
// ═══════════════════════════════════════════════════════════════════════════

function ModalEncerrarLote({
  onClose, onConfirmar,
}: {
  onClose: () => void
  onConfirmar: (motivo: MotivoEncerramento, obs?: string) => Promise<{ error: string | null }>
}) {
  const [motivo, setMotivo] = useState<MotivoEncerramento>('venda')
  const [obs, setObs] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const confirmar = async () => {
    if (motivo === 'outro' && !obs.trim()) { setErro('Descreva o motivo'); return }
    setSaving(true); setErro(null)
    const res = await onConfirmar(motivo, obs || undefined)
    setSaving(false)
    if (res.error) setErro(res.error)
  }

  return (
    <Modal open onClose={onClose} title="Encerrar lote" subtitle="Qual foi o motivo do encerramento?" size="sm">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {([
            ['venda', 'Venda — todos os animais foram vendidos'],
            ['extincao', 'Extinção — o lote ficou sem animais (morte, transferência etc.)'],
            ['outro', 'Outro motivo'],
          ] as Array<[MotivoEncerramento, string]>).map(([v, label]) => (
            <label key={v} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer', background: motivo === v ? 'var(--green-bg)' : '#fff' }}>
              <input type="radio" checked={motivo === v} onChange={() => setMotivo(v)} />
              <span style={{ fontSize: 13 }}>{label}</span>
            </label>
          ))}
        </div>
        {motivo === 'outro' && (
          <div className="form-group">
            <label className="form-label">Descreva o motivo</label>
            <input className="form-input" value={obs} onChange={e => setObs(e.target.value)} autoFocus />
          </div>
        )}
        {erro && <div style={{ padding: 10, background: '#ffebee', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>{erro}</div>}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={confirmar} disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Encerrar lote'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: BRINCOS DUPLICADOS
// Lista os grupos de animais com mesmo brinco + peso + data de entrada
// dentro do lote, para o produtor escolher manualmente quais exemplares
// excluir (mantendo pelo menos um de cada grupo).
// ═══════════════════════════════════════════════════════════════════════════

function ModalDuplicados({
  grupos, onClose, onExcluir,
}: {
  grupos: Animal[][]
  onClose: () => void
  onExcluir: (ids: string[]) => Promise<{ error: string | null }>
}) {
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const toggle = (id: string) => {
    setSelecionados(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  const confirmar = async () => {
    if (selecionados.size === 0) { setErro('Marque ao menos um animal para excluir'); return }
    setSaving(true); setErro(null)
    const res = await onExcluir(Array.from(selecionados))
    setSaving(false)
    if (res.error) setErro(res.error)
  }

  return (
    <Modal open onClose={onClose} title="Brincos duplicados"
      subtitle={`${grupos.length} grupo(s) com mesmo brinco, peso e data de entrada`} size="lg">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 13, color: 'var(--gray-600)' }}>
          Marque os exemplares que devem ser excluídos em cada grupo. Mantenha ao menos um de cada — a exclusão é definitiva e apaga pesagens, movimentações e recalcula a compra correspondente.
        </div>

        {grupos.map((grupo, gi) => (
          <div key={gi} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
            <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 8 }}>Brinco {grupo[0].brinco} · {grupo.length} lançamentos</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {grupo.map(a => (
                <label key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 6, background: selecionados.has(a.id) ? '#ffebee' : 'var(--gray-50)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={selecionados.has(a.id)} onChange={() => toggle(a.id)} />
                  <span style={{ fontSize: 13 }}>
                    <strong>{a.codigo}</strong> · {fmtNum(a.peso_entrada, 1)} kg · entrada {fmtData(a.data_entrada)} · criado em {fmtData(a.created_at.slice(0, 10))}
                  </span>
                </label>
              ))}
            </div>
          </div>
        ))}

        {erro && <div style={{ padding: 10, background: '#ffebee', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>{erro}</div>}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" style={{ background: '#b91c1c' }} onClick={confirmar} disabled={saving || selecionados.size === 0}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : `Excluir ${selecionados.size || ''} selecionado(s)`}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: CONFIRMAR EXCLUSÃO DE ANIMAL
// Exclusão definitiva — usada para corrigir animal digitado errado no lote.
// Remove o registro e tudo que depende dele (pesagens, movimentações, custos
// variáveis); a compra da leva é recalculada ou removida automaticamente.
// ═══════════════════════════════════════════════════════════════════════════

function ModalConfirmarExclusaoAnimal({
  animal, onClose, onConfirmar,
}: {
  animal: Animal
  onClose: () => void
  onConfirmar: () => Promise<{ error: string | null }>
}) {
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const confirmar = async () => {
    setSaving(true); setErro(null)
    const res = await onConfirmar()
    setSaving(false)
    if (res.error) setErro(res.error)
  }

  return (
    <Modal open onClose={onClose} title="Excluir animal" subtitle={`Código ${animal.codigo} · Brinco ${animal.brinco}`} size="sm">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ padding: 10, background: '#ffebee', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>
          Esta ação é definitiva: o registro do animal, suas pesagens e movimentações serão apagados. Se ele fizer parte de uma compra com outros animais, o total da compra será recalculado. Use quando o animal foi cadastrado por engano — não para registrar venda, morte ou saída.
        </div>
        {erro && <div style={{ padding: 10, background: '#ffebee', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>{erro}</div>}
        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" style={{ background: '#b91c1c' }} onClick={confirmar} disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Excluir definitivamente'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: EDITAR CICLOS DO LOTE (dieta, dias, tipo, GMD esperado)
// Funciona pra qualquer lote — criado manualmente ou importado por planilha,
// já que os dois usam a mesma tabela ciclos_lote.
// ═══════════════════════════════════════════════════════════════════════════

function ModalEditarCiclos({
  lote, ciclos, dietasTemplates, salvarCiclosLote, onClose,
}: {
  lote: Lote
  ciclos: Array<{ id: string; numero: number; nome: string; tipo_ciclo: TipoCiclo; dias_planejados: number; dieta_id: string | null; gmd_esperado: number | null; data_inicio: string | null; data_fim: string | null }>
  dietasTemplates: Array<{ id: string; nome: string; gmd_esperado: number; pct_consumo_pv_ms: number; custo_kg_ms: number | null }>
  salvarCiclosLote: (loteId: string, dataCriacao: string, ciclos: Array<{ id?: string; numero: number; nome: string; tipo_ciclo: TipoCiclo; dias_planejados: number; dieta_id: string | null; gmd_esperado: number | null }>) => Promise<{ error: string | null }>
  onClose: () => void
}) {
  type LinhaCiclo = { id?: string; numero: number; nome: string; tipo_ciclo: TipoCiclo; dias_planejados: number; dieta_id: string | null; gmd_esperado: number | null }

  const [dataCriacao, setDataCriacao] = useState(lote.data_criacao)
  const [linhas, setLinhas] = useState<LinhaCiclo[]>(() =>
    [...ciclos].sort((a, b) => a.numero - b.numero).map(c => ({
      id: c.id, numero: c.numero, nome: c.nome, tipo_ciclo: c.tipo_ciclo,
      dias_planejados: c.dias_planejados, dieta_id: c.dieta_id, gmd_esperado: c.gmd_esperado,
    }))
  )
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  // Pré-visualização das datas resultantes — recalculada a cada mudança,
  // igual ao que vai ser gravado de verdade ao salvar.
  const datasPreview = useMemo(() => {
    const mapa: Record<number, { inicio: string; fim: string | null }> = {}
    let cursor = new Date(dataCriacao + 'T00:00:00')
    linhas.forEach((l, i) => {
      const inicio = cursor.toISOString().slice(0, 10)
      const proximo = new Date(cursor)
      proximo.setDate(proximo.getDate() + (l.dias_planejados || 0))
      const fim = i === linhas.length - 1 ? null : proximo.toISOString().slice(0, 10)
      mapa[l.numero] = { inicio, fim }
      cursor = proximo
    })
    return mapa
  }, [dataCriacao, linhas])

  const update = (idx: number, patch: Partial<LinhaCiclo>) => {
    setLinhas(prev => prev.map((l, i) => i === idx ? { ...l, ...patch } : l))
  }

  const adicionarCiclo = () => {
    if (linhas.length >= 8) { setErro('Máximo de 8 ciclos por lote'); return }
    setErro(null)
    setLinhas(prev => [...prev, {
      numero: prev.length + 1, nome: cicloLabelPadrao(prev.length + 1), tipo_ciclo: 'confinamento',
      dias_planejados: 30, dieta_id: null, gmd_esperado: null,
    }])
  }

  const removerUltimoCiclo = () => {
    if (linhas.length <= 1) { setErro('O lote precisa ter ao menos um ciclo'); return }
    setErro(null)
    setLinhas(prev => prev.slice(0, -1))
  }

  const salvar = async () => {
    for (const l of linhas) {
      if (!l.nome.trim()) { setErro(`Ciclo ${l.numero}: informe um nome`); return }
      if (!l.dias_planejados || l.dias_planejados <= 0) { setErro(`Ciclo ${l.numero}: dias planejados inválido`); return }
    }
    setSaving(true); setErro(null)
    const res = await salvarCiclosLote(lote.id, dataCriacao, linhas)
    setSaving(false)
    if (res.error) { setErro(res.error); return }
    onClose()
  }

  return (
    <Modal open onClose={onClose} title={`Editar ciclos — ${lote.nome_lote}`}
      subtitle="As datas de início/fim de cada ciclo são recalculadas automaticamente" size="lg">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="form-group">
          <label className="form-label">Data de entrada do lote</label>
          <input className="form-input" type="date" value={dataCriacao} onChange={e => setDataCriacao(e.target.value)} style={{ maxWidth: 200 }} />
          <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>
            Muda o ponto de partida de todos os ciclos — as datas abaixo se ajustam sozinhas.
          </div>
        </div>

        {linhas.map((l, idx) => {
          const preview = datasPreview[l.numero]
          return (
            <div key={idx} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#2e7d32' }}>
                  Ciclo {l.numero}{l.numero === lote.ciclo_atual ? ' (atual)' : ''}
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--gray-500)', cursor: 'pointer' }}>
                  <input type="checkbox" checked={l.tipo_ciclo === 'pastagem'}
                    onChange={() => update(idx, { tipo_ciclo: l.tipo_ciclo === 'pastagem' ? 'confinamento' : 'pastagem' })} />
                  É pastagem
                </label>
              </div>
              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Nome</label>
                  <input className="form-input" value={l.nome} onChange={e => update(idx, { nome: e.target.value })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Dias planejados</label>
                  <input className="form-input" type="number" value={l.dias_planejados}
                    onChange={e => update(idx, { dias_planejados: Number(e.target.value) })} />
                </div>
              </div>
              <div className="form-row-2">
                <div className="form-group">
                  <label className="form-label">Dieta</label>
                  <select className="form-input" value={l.dieta_id ?? ''}
                    onChange={e => update(idx, { dieta_id: e.target.value || null })}>
                    <option value="">Nenhuma (sem custo de alimentação calculado)</option>
                    {dietasTemplates.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">GMD esperado (kg/dia)</label>
                  <input className="form-input" type="number" step="0.01" value={l.gmd_esperado ?? ''}
                    onChange={e => update(idx, { gmd_esperado: e.target.value ? Number(e.target.value) : null })} />
                </div>
              </div>
              {preview && (
                <div style={{ fontSize: 11, color: 'var(--gray-400)' }}>
                  {fmtData(preview.inicio)} até {preview.fim ? fmtData(preview.fim) : 'em aberto'}
                </div>
              )}
            </div>
          )
        })}

        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-ghost btn-sm" onClick={adicionarCiclo} disabled={linhas.length >= 8}>+ Adicionar ciclo</button>
          <button className="btn btn-ghost btn-sm" style={{ color: '#b91c1c' }} onClick={removerUltimoCiclo} disabled={linhas.length <= 1}>
            Remover último ciclo
          </button>
        </div>

        {erro && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 10, fontSize: 12, color: '#b91c1c' }}>
            {erro}
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose} disabled={saving}>Cancelar</button>
          <button className="btn btn-primary" onClick={salvar} disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: CUSTOS OPERACIONAIS DO LOTE
// ═══════════════════════════════════════════════════════════════════════════

const CATEGORIAS_CUSTO_OP: Array<{ value: CategoriaCustoOperacional; label: string }> = [
  { value: 'sanitario', label: 'Sanitário' },
  { value: 'maquinario', label: 'Maquinário' },
  { value: 'mao_de_obra', label: 'Mão de obra' },
  { value: 'medicamentos', label: 'Medicamentos' },
  { value: 'outros', label: 'Outros' },
]
const categoriaCustoOpLabel = (v: string) => CATEGORIAS_CUSTO_OP.find(c => c.value === v)?.label ?? v

function ModalCustosOperacionais({
  lote, loteAtivo, custos, loading, total, onClose, onAdicionar, onRemover,
}: {
  lote: Lote
  loteAtivo: boolean
  custos: CustoOperacionalLote[]
  loading: boolean
  total: number
  onClose: () => void
  onAdicionar: (input: { categoria: CategoriaCustoOperacional; descricao?: string; valor: number; data_lancamento: string }) => Promise<{ error: string | null }>
  onRemover: (id: string) => Promise<void>
}) {
  const [categoria, setCategoria] = useState<CategoriaCustoOperacional>('sanitario')
  const [descricao, setDescricao] = useState('')
  const [valor, setValor] = useState('')
  const [data, setData] = useState(hojeStr())
  const [erro, setErro] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const adicionar = async () => {
    const v = Number(valor)
    if (!v || v <= 0) { setErro('Informe um valor válido'); return }
    setSaving(true); setErro(null)
    const res = await onAdicionar({ categoria, descricao: descricao || undefined, valor: v, data_lancamento: data })
    setSaving(false)
    if (res.error) { setErro(res.error); return }
    setDescricao(''); setValor('')
  }

  return (
    <Modal open onClose={onClose} title={`Custos operacionais — ${lote.nome_lote}`}
      subtitle="Somados ao custo do lote e divididos igualmente entre os animais ativos" size="lg">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {loteAtivo && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div className="form-group">
                <label className="form-label">Categoria</label>
                <select className="form-input" value={categoria} onChange={e => setCategoria(e.target.value as CategoriaCustoOperacional)}>
                  {CATEGORIAS_CUSTO_OP.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Data</label>
                <input className="form-input" type="date" value={data} onChange={e => setData(e.target.value)} />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8 }}>
              <div className="form-group">
                <label className="form-label">Descrição (opcional)</label>
                <input className="form-input" value={descricao} onChange={e => setDescricao(e.target.value)} placeholder="Ex: Vacina aftosa" />
              </div>
              <div className="form-group">
                <label className="form-label">Valor (R$)</label>
                <input className="form-input" type="number" step="0.01" value={valor} onChange={e => setValor(e.target.value)} />
              </div>
            </div>
            {erro && <div style={{ padding: 8, background: '#ffebee', borderRadius: 8, color: '#b91c1c', fontSize: 12 }}>{erro}</div>}
            <button className="btn btn-primary btn-sm" onClick={adicionar} disabled={saving} style={{ alignSelf: 'flex-end' }}>
              {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : '+ Adicionar custo'}
            </button>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><div className="spinner" style={{ width: 24, height: 24 }} /></div>
        ) : custos.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--gray-500)', fontSize: 13 }}>Nenhum custo operacional lançado.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Data</th><th>Categoria</th><th>Descrição</th><th>Valor</th>{loteAtivo && <th></th>}</tr></thead>
              <tbody>
                {custos.map(c => (
                  <tr key={c.id}>
                    <td>{fmtData(c.data_lancamento)}</td>
                    <td>{categoriaCustoOpLabel(c.categoria)}</td>
                    <td>{c.descricao || '—'}</td>
                    <td>{fmt(c.valor)}</td>
                    {loteAtivo && (
                      <td>
                        <button onClick={() => onRemover(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9e9e9e', fontSize: 16 }}>×</button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex-between" style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>Total lançado</span>
          <strong>{fmt(total)}</strong>
        </div>

        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </Modal>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: CUSTO REAL DE RAÇÃO (recalibração)
// Cada lançamento vale desde a data informada até o próximo lançamento (ou
// até hoje, se for o mais recente), substituindo o custo de alimentação
// estimado do motor nesse intervalo. Diferente do custo operacional, aqui dá
// pra editar um lançamento já feito, não só excluir.
// ═══════════════════════════════════════════════════════════════════════════

function ModalCustoRacaoReal({
  lote, loteAtivo, custos, loading, onClose, onAdicionar, onEditar, onRemover,
}: {
  lote: Lote
  loteAtivo: boolean
  custos: CustoRacaoRealLote[]
  loading: boolean
  onClose: () => void
  onAdicionar: (input: { data_inicio: string; valor_total: number; observacoes?: string }) => Promise<{ error: string | null }>
  onEditar: (id: string, input: { data_inicio: string; valor_total: number; observacoes?: string }) => Promise<{ error: string | null }>
  onRemover: (id: string) => Promise<void>
}) {
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [dataInicio, setDataInicio] = useState(hojeStr())
  const [valorTotal, setValorTotal] = useState('')
  const [observacoes, setObservacoes] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const limparFormulario = () => {
    setEditandoId(null); setDataInicio(hojeStr()); setValorTotal(''); setObservacoes(''); setErro(null)
  }

  const iniciarEdicao = (c: CustoRacaoRealLote) => {
    setEditandoId(c.id); setDataInicio(c.data_inicio); setValorTotal(String(c.valor_total)); setObservacoes(c.observacoes ?? ''); setErro(null)
  }

  const salvar = async () => {
    const v = Number(valorTotal)
    if (!v || v <= 0) { setErro('Informe um valor válido'); return }
    setSaving(true); setErro(null)
    const input = { data_inicio: dataInicio, valor_total: v, observacoes: observacoes || undefined }
    const res = editandoId ? await onEditar(editandoId, input) : await onAdicionar(input)
    setSaving(false)
    if (res.error) { setErro(res.error); return }
    limparFormulario()
  }

  return (
    <Modal open onClose={onClose} title={`Custo real de ração — ${lote.nome_lote}`}
      subtitle="Substitui o custo de alimentação estimado a partir da data informada, até o próximo lançamento" size="lg">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {loteAtivo && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 600 }}>{editandoId ? 'Editando lançamento' : 'Novo lançamento'}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div className="form-group">
                <label className="form-label">A partir de</label>
                <input className="form-input" type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">Valor total gasto (R$)</label>
                <input className="form-input" type="number" step="0.01" value={valorTotal} onChange={e => setValorTotal(e.target.value)} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Observações (opcional)</label>
              <input className="form-input" value={observacoes} onChange={e => setObservacoes(e.target.value)} placeholder="Ex: Nota fiscal da cooperativa" />
            </div>
            {erro && <div style={{ padding: 8, background: '#ffebee', borderRadius: 8, color: '#b91c1c', fontSize: 12 }}>{erro}</div>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {editandoId && (
                <button className="btn btn-ghost btn-sm" onClick={limparFormulario} disabled={saving}>Cancelar edição</button>
              )}
              <button className="btn btn-primary btn-sm" onClick={salvar} disabled={saving}>
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : (editandoId ? 'Salvar alteração' : '+ Lançar custo real')}
              </button>
            </div>
          </div>
        )}

        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><div className="spinner" style={{ width: 24, height: 24 }} /></div>
        ) : custos.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--gray-500)', fontSize: 13 }}>Nenhum custo real de ração lançado ainda. O motor está usando a estimativa por dieta.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>A partir de</th><th>Valor total</th><th>Observações</th>{loteAtivo && <th></th>}</tr></thead>
              <tbody>
                {custos.map(c => (
                  <tr key={c.id}>
                    <td>{fmtData(c.data_inicio)}</td>
                    <td>{fmt(c.valor_total)}</td>
                    <td>{c.observacoes || '—'}</td>
                    {loteAtivo && (
                      <td>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => iniciarEdicao(c)}>Editar</button>
                          <button onClick={() => onRemover(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9e9e9e', fontSize: 16 }}>×</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </Modal>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MODAL: COMPRAS DO LOTE (somente leitura — cada compra nasce ao "Adicionar
// animais"; aqui é só o histórico de fornecedor/preço por leva)
// ═══════════════════════════════════════════════════════════════════════════

function ModalCompras({
  lote, compras, loading, nomeParceiro, onClose,
}: {
  lote: Lote
  compras: Compra[]
  loading: boolean
  nomeParceiro: (id: string | null) => string | null
  onClose: () => void
}) {
  const valorTotal = compras.reduce((s, c) => s + c.valor_total, 0)
  const qtdTotal = compras.reduce((s, c) => s + c.quantidade_animais, 0)

  return (
    <Modal open onClose={onClose} title={`Compras — ${lote.nome_lote}`}
      subtitle="Fornecedor e preço por leva de entrada" size="lg">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><div className="spinner" style={{ width: 24, height: 24 }} /></div>
        ) : compras.length === 0 ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--gray-500)', fontSize: 13 }}>Nenhuma compra registrada ainda.</div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Data</th><th>Fornecedor</th><th>Preço/kg</th><th>Animais</th><th>Peso total</th><th>Valor total</th></tr></thead>
              <tbody>
                {compras.map(c => (
                  <tr key={c.id}>
                    <td>{fmtData(c.data)}</td>
                    <td>{nomeParceiro(c.parceiro_id) ?? c.origem_texto ?? '—'}</td>
                    <td>{fmt(c.preco_kg)}</td>
                    <td>{c.quantidade_animais}</td>
                    <td>{fmtNum(c.peso_total, 0)} kg</td>
                    <td>{fmt(c.valor_total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex-between" style={{ borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--gray-500)' }}>{qtdTotal} animal(is) · Total investido</span>
          <strong>{fmt(valorTotal)}</strong>
        </div>

        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>Fechar</button>
        </div>
      </div>
    </Modal>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MOVER ALÍQUOTA — conteúdo do modal
// ═══════════════════════════════════════════════════════════════════════════

function ModalMoverConteudo({
  lotesDisponiveis, onConfirmar, onCancelar,
}: {
  lotesDisponiveis: Lote[]
  onConfirmar: (loteDestinoId: string, data: string) => Promise<void>
  onCancelar: () => void
}) {
  const [destino, setDestino] = useState('')
  const [data, setData] = useState(hojeStr())
  const [saving, setSaving] = useState(false)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="form-group">
        <label className="form-label">Lote de destino</label>
        <select className="form-input" value={destino} onChange={e => setDestino(e.target.value)}>
          <option value="">Selecione...</option>
          {lotesDisponiveis.map(l => <option key={l.id} value={l.id}>{l.nome_lote} ({l.codigo_lote})</option>)}
        </select>
      </div>
      <div className="form-group">
        <label className="form-label">Data em que os animais foram movidos</label>
        <input className="form-input" type="date" value={data} onChange={e => setData(e.target.value)} style={{ maxWidth: 200 }} />
        <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>
          Use a data real da movimentação, não a data de hoje — isso define qual dieta/ciclo é usado no cálculo de custo a partir de agora.
        </div>
      </div>
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onCancelar}>Cancelar</button>
        <button className="btn btn-primary" disabled={!destino || !data || saving} onClick={async () => {
          setSaving(true); await onConfirmar(destino, data); setSaving(false)
        }}>
          {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Confirmar movimentação'}
        </button>
      </div>
    </div>
  )
}


// ═══════════════════════════════════════════════════════════════════════════
// MODAL: VENDA (peso próprio / peso da carga, permite misturar lotes)
// ═══════════════════════════════════════════════════════════════════════════

function ModalVenda({
  onClose, lotesDisponiveis, animaisPreSelecionados, resultadosPreCalculados,
}: {
  onClose: () => void
  lotesDisponiveis: Lote[]
  animaisPreSelecionados?: Animal[]
  resultadosPreCalculados?: Record<string, ResultadoAnimalNaData>
}) {
  const { registrarVenda } = useVendas()
  const { rendimentos, bonus } = useFaixas()
  const { calcularEmLote } = useCustoEngine()

  const [tipo, setTipo] = useState<SaidaTipo>('venda')
  const [modo, setModo] = useState<SaidaModo>('peso_proprio')
  const [data, setData] = useState(hojeStr())
  const [loteFiltro, setLoteFiltro] = useState<string>(animaisPreSelecionados ? '__preselecionado__' : '')
  const [animaisDisponiveis, setAnimaisDisponiveis] = useState<Animal[]>(animaisPreSelecionados ?? [])
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set((animaisPreSelecionados ?? []).map(a => a.id)))
  const [pesos, setPesos] = useState<Record<string, string>>({})
  const [valoresIndividuais, setValoresIndividuais] = useState<Record<string, string>>({})
  const [valorTotalCarga, setValorTotalCarga] = useState('')
  const [destinoTipo, setDestinoTipo] = useState<'corretor' | 'frigorifico' | 'produtor' | ''>('')
  const [observacoes, setObservacoes] = useState('')
  const [pctComissao, setPctComissao] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [resultado, setResultado] = useState<Array<{ animal_id: string; codigo: string; receitaBruta: number; custoTotal: number; lucro: number }> | null>(null)

  useEffect(() => {
    if (!animaisPreSelecionados) return
    const pesosIniciais: Record<string, string> = {}
    for (const a of animaisPreSelecionados) {
      const est = resultadosPreCalculados?.[a.id]?.peso ?? a.peso_entrada
      pesosIniciais[a.id] = String(Math.round(est))
    }
    setPesos(pesosIniciais)
  }, [animaisPreSelecionados, resultadosPreCalculados])

  const carregarAnimaisDoLote = async (loteId: string) => {
    setLoteFiltro(loteId)
    if (loteId === '__preselecionado__' || loteId === '') { setAnimaisDisponiveis(animaisPreSelecionados ?? []); return }
    const { data: rows } = await supabase.from('animais').select('*').eq('lote_atual_id', loteId).eq('status', 'ativo')
    setAnimaisDisponiveis(ordenarPorBrinco((rows ?? []) as Animal[]))
  }

  const toggleSelecionado = (id: string) => {
    setSelecionados(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else {
        n.add(id)
        if (!pesos[id]) {
          const a = animaisDisponiveis.find(x => x.id === id)
          if (a) setPesos(p => ({ ...p, [id]: String(a.peso_entrada) }))
        }
      }
      return n
    })
  }

  const animaisSelecionadosObj = animaisDisponiveis.filter(a => selecionados.has(a.id))

  const somaPesoCarcaca = animaisSelecionadosObj.reduce((s, a) => {
    const peso = Number(pesos[a.id]) || 0
    const rend = obterRendimento(peso, rendimentos)
    return s + peso * (rend / 100)
  }, 0)

  const validar = (): string | null => {
    if (selecionados.size === 0) return 'Selecione ao menos um animal'
    for (const a of animaisSelecionadosObj) {
      if (!pesos[a.id] || Number(pesos[a.id]) <= 0) return `Informe o peso de ${a.codigo}`
      if (modo === 'peso_proprio' && (!valoresIndividuais[a.id] || Number(valoresIndividuais[a.id]) < 0)) {
        return `Informe o valor de venda de ${a.codigo}`
      }
    }
    if (modo === 'peso_carga' && (!valorTotalCarga || Number(valorTotalCarga) <= 0)) return 'Informe o valor total da carga'
    return null
  }

  const confirmar = async () => {
    const v = validar()
    if (v) { setErro(v); return }
    setSaving(true); setErro(null)

    const comissoes = pctComissao ? [{ tipo: 'corretor' as const, percentual: Number(pctComissao) }] : []

    const res = await registrarVenda({
      tipo, modo, data,
      itens: animaisSelecionadosObj.map(a => ({
        animal_id: a.id, peso: Number(pesos[a.id]),
        valor: modo === 'peso_proprio' ? Number(valoresIndividuais[a.id]) : undefined,
      })),
      valor_total: modo === 'peso_carga' ? Number(valorTotalCarga) : undefined,
      destino_tipo: destinoTipo || undefined,
      observacoes: observacoes || undefined,
      comissoes, encargos: [],
    })
    setSaving(false)
    if (res.error) { setErro(res.error); return }
    if (res.resultadoPorAnimal) {
      setResultado(res.resultadoPorAnimal.map(r => ({
        animal_id: r.animal_id,
        codigo: animaisSelecionadosObj.find(a => a.id === r.animal_id)?.codigo ?? '',
        receitaBruta: r.receitaBruta, custoTotal: r.custoTotal, lucro: r.lucro,
      })))
    }
  }

  if (resultado) {
    const lucroTotal = resultado.reduce((s, r) => s + r.lucro, 0)
    return (
      <Modal open onClose={onClose} title="Venda registrada" size="lg">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ background: 'var(--green-bg)', borderRadius: 8, padding: '12px 14px' }}>
            <div style={{ fontSize: 12, color: '#2e7d32' }}>Lucro total da venda</div>
            <div style={{ fontSize: 22, fontWeight: 600, color: '#1b5e20' }}>{fmt(lucroTotal)}</div>
          </div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Animal</th><th>Receita bruta</th><th>Custo total</th><th>Lucro</th></tr></thead>
              <tbody>
                {resultado.map(r => (
                  <tr key={r.animal_id}>
                    <td><strong>{r.codigo}</strong></td>
                    <td>{fmt(r.receitaBruta)}</td>
                    <td>{fmt(r.custoTotal)}</td>
                    <td style={{ color: r.lucro >= 0 ? '#2e7d32' : '#b91c1c' }}>{fmt(r.lucro)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="modal-actions">
            <button className="btn btn-primary" onClick={onClose}>Fechar</button>
          </div>
        </div>
      </Modal>
    )
  }

  return (
    <Modal open onClose={onClose} title="Registrar venda / saída" size="lg">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="form-row-2">
          <div className="form-group">
            <label className="form-label">Tipo</label>
            <select className="form-input" value={tipo} onChange={e => setTipo(e.target.value as SaidaTipo)}>
              <option value="venda">Venda</option>
              <option value="abate">Abate</option>
              <option value="transferencia">Transferência (saída do sistema)</option>
              <option value="morte">Morte</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Data</label>
            <input className="form-input" type="date" value={data} onChange={e => setData(e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Modo de precificação</label>
          <div style={{ display: 'flex', gap: 6 }}>
            {(['peso_proprio', 'peso_carga'] as const).map(m => (
              <button key={m} type="button" onClick={() => setModo(m)}
                style={{ flex: 1, padding: 8, borderRadius: 6, fontSize: 12, border: '1px solid var(--border)', cursor: 'pointer',
                  background: modo === m ? '#2e7d32' : '#fff', color: modo === m ? '#fff' : 'var(--gray-600)' }}>
                {m === 'peso_proprio' ? 'Peso e valor próprios por animal' : 'Peso da carga (valor único, rateado)'}
              </button>
            ))}
          </div>
        </div>

        {!animaisPreSelecionados && (
          <div className="form-group">
            <label className="form-label">Filtrar por lote (pode escolher animais de mais de um lote)</label>
            <select className="form-input" value={loteFiltro} onChange={e => carregarAnimaisDoLote(e.target.value)}>
              <option value="">Selecione um lote para listar os animais</option>
              {lotesDisponiveis.map(l => <option key={l.id} value={l.id}>{l.nome_lote}</option>)}
            </select>
          </div>
        )}

        {animaisDisponiveis.length > 0 && (
          <div className="table-wrap" style={{ maxHeight: 260, overflowY: 'auto' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 30 }}></th>
                  <th>Código</th>
                  <th>Peso na venda (kg)</th>
                  {modo === 'peso_proprio' && <th>Valor (R$)</th>}
                </tr>
              </thead>
              <tbody>
                {animaisDisponiveis.map(a => (
                  <tr key={a.id}>
                    <td><input type="checkbox" checked={selecionados.has(a.id)} onChange={() => toggleSelecionado(a.id)} /></td>
                    <td><strong>{a.codigo}</strong></td>
                    <td>
                      <input className="form-input" type="number" step="0.1" value={pesos[a.id] ?? ''}
                        onChange={e => setPesos(p => ({ ...p, [a.id]: e.target.value }))}
                        disabled={!selecionados.has(a.id)} style={{ maxWidth: 110, fontSize: 13 }} />
                    </td>
                    {modo === 'peso_proprio' && (
                      <td>
                        <input className="form-input" type="number" step="0.01" value={valoresIndividuais[a.id] ?? ''}
                          onChange={e => setValoresIndividuais(v => ({ ...v, [a.id]: e.target.value }))}
                          disabled={!selecionados.has(a.id)} style={{ maxWidth: 130, fontSize: 13 }} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {modo === 'peso_carga' && selecionados.size > 0 && (
          <div className="form-group">
            <label className="form-label">Valor total da carga (R$)</label>
            <input className="form-input" type="number" step="0.01" value={valorTotalCarga} onChange={e => setValorTotalCarga(e.target.value)} />
            <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>
              Peso de carcaça total estimado: {fmtNum(somaPesoCarcaca, 0)} kg — a distribuição entre os animais é proporcional a esse peso.
            </div>
          </div>
        )}

        <div className="form-row-2">
          <div className="form-group">
            <label className="form-label">Destino</label>
            <select className="form-input" value={destinoTipo} onChange={e => setDestinoTipo(e.target.value as any)}>
              <option value="">Não informado</option>
              <option value="frigorifico">Frigorífico</option>
              <option value="corretor">Corretor</option>
              <option value="produtor">Outro produtor</option>
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">% comissão sobre a venda (opcional)</label>
            <input className="form-input" type="number" step="0.1" value={pctComissao} onChange={e => setPctComissao(e.target.value)} />
          </div>
        </div>

        <div className="form-group">
          <label className="form-label">Observações</label>
          <input className="form-input" value={observacoes} onChange={e => setObservacoes(e.target.value)} />
        </div>

        {erro && <div style={{ padding: 10, background: '#ffebee', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>{erro}</div>}

        <div className="modal-actions">
          <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={confirmar} disabled={saving || selecionados.size === 0}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Confirmar venda'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
