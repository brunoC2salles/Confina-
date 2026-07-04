import { useState, useMemo, useCallback, useEffect } from 'react'
import {
  useLotes, useAnimaisDoLote, useCustoEngine, useVendas,
  type CriarLoteInput, type CicloInput, type LinhaAnimalInput,
} from '@/hooks/useLotes'
import { useDietas } from '@/hooks/useDietas'
import { useFaixas } from '@/hooks/useFaixas'
import { useProjecao } from '@/hooks/useProjecao'
import { Modal, PageHeader, EmptyState } from '@/components/common/UI'
import { fmt, fmtNum, fmtData, obterRendimento, obterBonus } from '@/lib/calculations'
import type { Lote, Animal, SaidaTipo, SaidaModo } from '@/types'
import { supabase } from '@/lib/supabase'
import { parseCsvAnimais } from '@/lib/csv'
import type { ResultadoAnimalNaData } from '@/lib/custoAnimal'

const hojeStr = () => new Date().toISOString().split('T')[0]

const cicloLabelPadrao = (n: number) =>
  ({ 1: 'Adaptação', 2: 'Crescimento', 3: 'Engorda', 4: 'Acabamento' } as Record<number, string>)[n] ?? `Ciclo ${n}`

// ═══════════════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

export default function Lotes() {
  const {
    lotesAtivos, lotesEncerrados, ciclosPorLote, resumo, loading,
    criarLote, editarCiclo, avancarCiclo, encerrarLote,
    criarAnimais, bifurcar, moverAliquota, proximoNumeroLote,
  } = useLotes()
  const { templates: dietasTemplates } = useDietas()

  const [tab, setTab] = useState<'ativos' | 'encerrados'>('ativos')
  const [showNovoLote, setShowNovoLote] = useState(false)
  const [loteRecemCriado, setLoteRecemCriado] = useState<string | null>(null)
  const [showDetalhe, setShowDetalhe] = useState<string | null>(null)
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
            const r = resumo[lote.id] ?? { qtdAtiva: 0, pesoMedioEntrada: 0 }
            const ciclos = ciclosPorLote[lote.id] ?? []
            const cicloAtual = ciclos.find(c => c.numero === lote.ciclo_atual)
            return (
              <div key={lote.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, cursor: 'pointer' }}
                onClick={() => setShowDetalhe(lote.id)}>
                <div className="flex-between">
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 600 }}>{lote.nome_lote}</div>
                    <div style={{ fontSize: 11, color: '#9e9e9e', marginTop: 2 }}>
                      {lote.codigo_lote} · prefixo &quot;{lote.prefixo}&quot;
                    </div>
                  </div>
                  <span style={{ fontSize: 11, background: '#e8f5e9', color: '#2e7d32', padding: '2px 8px', borderRadius: 20, border: '1px solid #a5d6a7' }}>
                    Ciclo {lote.ciclo_atual}/{lote.num_ciclos}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 12, fontSize: 12, color: 'var(--gray-500)' }}>
                  <span><strong>{r.qtdAtiva}</strong> animais ativos</span>
                  {r.qtdAtiva > 0 && <span>peso médio entrada: <strong>{fmtNum(r.pesoMedioEntrada, 1)} kg</strong></span>}
                </div>
                {cicloAtual && (
                  <div style={{ fontSize: 12, color: '#9e9e9e' }}>
                    {cicloAtual.nome}{cicloAtual.gmd_esperado ? ` · GMD ${cicloAtual.gmd_esperado} kg/dia` : ''}
                  </div>
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
          dietasTemplates={dietasTemplates}
          lotesAtivos={lotesAtivos}
          ciclosPorLote={ciclosPorLote}
          editarCiclo={editarCiclo}
          avancarCiclo={avancarCiclo}
          encerrarLote={encerrarLote}
          criarAnimais={criarAnimais}
          bifurcar={bifurcar}
          moverAliquota={moverAliquota}
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
  codigoSugerido, dietasTemplates, onConfirmar, onCancelar, tituloConfirmar = 'Criar lote',
}: {
  codigoSugerido: string
  dietasTemplates: Array<{ id: string; nome: string; gmd_esperado: number; pct_consumo_pv_ms: number; custo_kg_ms: number | null }>
  onConfirmar: (input: CriarLoteInput) => Promise<{ error: string | null }>
  onCancelar: () => void
  tituloConfirmar?: string
}) {
  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const [nomeLote, setNomeLote] = useState('')
  const [codigoLote, setCodigoLote] = useState(codigoSugerido)
  const [prefixo, setPrefixo] = useState('')
  const [dataCriacao, setDataCriacao] = useState(hojeStr())
  const [origemFazenda, setOrigemFazenda] = useState('')
  const [origemMunicipio, setOrigemMunicipio] = useState('')
  const [origemEstado, setOrigemEstado] = useState('')
  const [racaPredominante, setRacaPredominante] = useState('')
  const [observacoes, setObservacoes] = useState('')

  const [precoKgCompra, setPrecoKgCompra] = useState('')
  const [precoVendaEsperado, setPrecoVendaEsperado] = useState('')
  const [pesoMaxAcabamento, setPesoMaxAcabamento] = useState('600')
  const [pctComissaoEsperada, setPctComissaoEsperada] = useState('2')
  const [pctEncargoEsperado, setPctEncargoEsperado] = useState('1.5')

  const [numCiclos, setNumCiclos] = useState(4)
  const [ciclos, setCiclos] = useState<CicloInput[]>(
    Array.from({ length: 4 }, (_, i) => ({
      numero: i + 1, nome: cicloLabelPadrao(i + 1), dias_planejados: 30, dieta_id: null, gmd_esperado: null,
    }))
  )

  const ajustarNumCiclos = (n: number) => {
    const novo = Math.max(1, Math.min(8, n))
    setNumCiclos(novo)
    setCiclos(prev => {
      const arr = [...prev]
      while (arr.length < novo) {
        arr.push({ numero: arr.length + 1, nome: cicloLabelPadrao(arr.length + 1), dias_planejados: 30, dieta_id: null, gmd_esperado: null })
      }
      return arr.slice(0, novo)
    })
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
      if (!prefixo.trim()) return 'Informe o prefixo para os códigos de animal'
      if (!dataCriacao) return 'Informe a data de criação'
    }
    if (step === 2) {
      if (!precoKgCompra || Number(precoKgCompra) <= 0) return 'Informe o preço por kg de compra'
    }
    if (step === 3) {
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
      preco_kg_compra: Number(precoKgCompra),
      origem_fazenda: origemFazenda || undefined,
      origem_municipio: origemMunicipio || undefined,
      origem_estado: origemEstado || undefined,
      raca_predominante: racaPredominante || undefined,
      observacoes: observacoes || undefined,
      preco_venda_esperado_kg: precoVendaEsperado ? Number(precoVendaEsperado) : undefined,
      peso_maximo_acabamento: pesoMaxAcabamento ? Number(pesoMaxAcabamento) : undefined,
      pct_comissao_esperada: pctComissaoEsperada ? Number(pctComissaoEsperada) : undefined,
      pct_encargo_esperado: pctEncargoEsperado ? Number(pctEncargoEsperado) : undefined,
      ciclos,
    })
    setSaving(false)
    if (res.error) setErro(res.error)
  }

  const steps = ['Identificação', 'Preço de compra', 'Ciclos']

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
              <label className="form-label">Prefixo dos animais</label>
              <input className="form-input" value={prefixo} onChange={e => setPrefixo(e.target.value.toUpperCase())} placeholder="Ex: A" maxLength={6} />
              <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>
                Brinco 33 vira o código {prefixo || 'A'}33
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Data de criação</label>
              <input className="form-input" type="date" value={dataCriacao} onChange={e => setDataCriacao(e.target.value)} />
            </div>
          </div>
          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">Fazenda de origem</label>
              <input className="form-input" value={origemFazenda} onChange={e => setOrigemFazenda(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Raça predominante</label>
              <input className="form-input" value={racaPredominante} onChange={e => setRacaPredominante(e.target.value)} />
            </div>
          </div>
          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">Município de origem</label>
              <input className="form-input" value={origemMunicipio} onChange={e => setOrigemMunicipio(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Estado</label>
              <input className="form-input" value={origemEstado} onChange={e => setOrigemEstado(e.target.value.toUpperCase())} maxLength={2} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Observações</label>
            <input className="form-input" value={observacoes} onChange={e => setObservacoes(e.target.value)} />
          </div>
        </div>
      )}

      {step === 2 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Preço pago por kg vivo (R$/kg)</label>
            <input className="form-input" type="number" step="0.01" value={precoKgCompra}
              onChange={e => setPrecoKgCompra(e.target.value)} placeholder="18.50" />
            <div style={{ fontSize: 11, color: 'var(--gray-400)', marginTop: 4 }}>
              Usado para calcular o valor de compra de cada animal, de acordo com seu peso individual.
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, fontSize: 13, fontWeight: 500 }}>
            Parâmetros esperados para projeção (opcional)
          </div>
          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">Preço de venda esperado (R$/kg)</label>
              <input className="form-input" type="number" step="0.01" value={precoVendaEsperado} onChange={e => setPrecoVendaEsperado(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Peso máx. de acabamento (kg)</label>
              <input className="form-input" type="number" value={pesoMaxAcabamento} onChange={e => setPesoMaxAcabamento(e.target.value)} />
            </div>
          </div>
          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">% comissão esperada</label>
              <input className="form-input" type="number" step="0.1" value={pctComissaoEsperada} onChange={e => setPctComissaoEsperada(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">% encargo esperado</label>
              <input className="form-input" type="number" step="0.1" value={pctEncargoEsperado} onChange={e => setPctEncargoEsperado(e.target.value)} />
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="form-group">
            <label className="form-label">Número de ciclos (máx. 8)</label>
            <input className="form-input" type="number" min={1} max={8} value={numCiclos}
              onChange={e => ajustarNumCiclos(Number(e.target.value))} style={{ maxWidth: 100 }} />
          </div>
          {ciclos.map((c, idx) => (
            <div key={idx} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#2e7d32' }}>Ciclo {c.numero}</div>
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
        {step < 3 ? (
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
  onConfirmar: (input: { data_entrada: string; linhas: LinhaAnimalInput[]; origem?: string; raca?: string }) => Promise<{ error: string | null }>
}) {
  const [modo, setModo] = useState<'faixa' | 'individual' | 'csv'>('faixa')
  const [dataEntrada, setDataEntrada] = useState(hojeStr())
  const [linhas, setLinhas] = useState<LinhaAnimalInput[]>([])
  const [erro, setErro] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [faixaInicio, setFaixaInicio] = useState('')
  const [faixaFim, setFaixaFim] = useState('')
  const [pesoFaixa, setPesoFaixa] = useState('')

  const [brincoIndividual, setBrincoIndividual] = useState('')
  const [pesoIndividual, setPesoIndividual] = useState('')

  const gerarFaixa = () => {
    const ini = Number(faixaInicio), fim = Number(faixaFim), peso = Number(pesoFaixa)
    if (!ini || !fim || fim < ini) { setErro('Faixa inválida'); return }
    if (!peso || peso <= 0) { setErro('Informe o peso padrão'); return }
    if (fim - ini + 1 > 2000) { setErro('Faixa muito grande (máximo 2000 de uma vez)'); return }
    const novas: LinhaAnimalInput[] = []
    for (let n = ini; n <= fim; n++) novas.push({ brinco: String(n), peso })
    setLinhas(prev => [...prev, ...novas])
    setErro(null)
  }

  const adicionarIndividual = () => {
    if (!brincoIndividual.trim()) { setErro('Informe o brinco'); return }
    const peso = Number(pesoIndividual)
    if (!peso || peso <= 0) { setErro('Peso inválido'); return }
    setLinhas(prev => [...prev, { brinco: brincoIndividual.trim(), peso }])
    setBrincoIndividual(''); setPesoIndividual(''); setErro(null)
  }

  const importarCsv = (file: File) => {
    const reader = new FileReader()
    reader.onload = () => {
      const texto = String(reader.result ?? '')
      const { linhas: novas, erros } = parseCsvAnimais(texto)
      if (erros.length > 0) setErro(`${erros.length} linha(s) com problema — ${erros[0]}`)
      else setErro(null)
      setLinhas(prev => [...prev, ...novas])
    }
    reader.readAsText(file)
  }

  const removerLinha = (idx: number) => setLinhas(prev => prev.filter((_, i) => i !== idx))
  const atualizarPesoLinha = (idx: number, peso: number) =>
    setLinhas(prev => prev.map((l, i) => i === idx ? { ...l, peso } : l))

  const pesoTotal = linhas.reduce((s, l) => s + l.peso, 0)
  const valorTotal = pesoTotal * (lote.preco_kg_compra ?? 0)

  const confirmar = async () => {
    if (linhas.length === 0) { setErro('Adicione ao menos um animal'); return }
    const brincos = new Set<string>()
    for (const l of linhas) {
      if (brincos.has(l.brinco)) { setErro(`Brinco "${l.brinco}" duplicado na lista`); return }
      brincos.add(l.brinco)
    }
    setSaving(true); setErro(null)
    const res = await onConfirmar({ data_entrada: dataEntrada, linhas })
    setSaving(false)
    if (res.error) setErro(res.error)
  }

  return (
    <Modal open onClose={onClose} title={`Adicionar animais — ${lote.nome_lote}`} size="lg">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '75vh', overflowY: 'auto', paddingRight: 4 }}>
        <div className="form-group">
          <label className="form-label">Data de entrada</label>
          <input className="form-input" type="date" value={dataEntrada} onChange={e => setDataEntrada(e.target.value)} style={{ maxWidth: 200 }} />
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
              Arquivo .csv com duas colunas: brinco, peso (com ou sem cabeçalho).
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
                Peso total: <strong>{fmtNum(pesoTotal, 0)} kg</strong> · Valor total: <strong>{fmt(valorTotal)}</strong>
              </div>
            </div>
            <div className="table-wrap" style={{ maxHeight: 260, overflowY: 'auto' }}>
              <table>
                <thead><tr><th>Código</th><th>Brinco</th><th>Peso (kg)</th><th style={{ width: 40 }}></th></tr></thead>
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
// DETALHE DO LOTE
// ═══════════════════════════════════════════════════════════════════════════

function DetalheLote({
  loteId, onClose, dietasTemplates, lotesAtivos, ciclosPorLote,
  editarCiclo, avancarCiclo, encerrarLote, criarAnimais, bifurcar, moverAliquota, proximoNumeroLote,
}: {
  loteId: string
  onClose: () => void
  dietasTemplates: Array<{ id: string; nome: string; gmd_esperado: number; pct_consumo_pv_ms: number; custo_kg_ms: number | null }>
  lotesAtivos: Lote[]
  ciclosPorLote: Record<string, Array<{ id: string; numero: number; nome: string; dias_planejados: number; dieta_id: string | null; gmd_esperado: number | null; data_inicio: string | null; data_fim: string | null }>>
  editarCiclo: (id: string, patch: any) => Promise<{ error: string | null }>
  avancarCiclo: (loteId: string) => Promise<{ error: string | null }>
  encerrarLote: (loteId: string) => Promise<{ error: string | null }>
  criarAnimais: (input: any) => Promise<{ error: string | null }>
  bifurcar: (input: any) => Promise<{ error: string | null; lote?: Lote }>
  moverAliquota: (input: any) => Promise<{ error: string | null }>
  proximoNumeroLote: () => string
}) {
  const lote = lotesAtivos.find(l => l.id === loteId)
  const { animais, loading, fetch, registrarPesagem } = useAnimaisDoLote(loteId)
  const { calcularEmLote } = useCustoEngine()
  const { calcular: calcularProjecao } = useProjecao()
  const { rendimentos, bonus } = useFaixas()

  const [resultados, setResultados] = useState<Record<string, ResultadoAnimalNaData>>({})
  const [calculando, setCalculando] = useState(false)
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set())
  const [showAdicionarAnimais, setShowAdicionarAnimais] = useState(false)
  const [showBifurcar, setShowBifurcar] = useState(false)
  const [showMover, setShowMover] = useState(false)
  const [showVenda, setShowVenda] = useState(false)
  const [showPesagem, setShowPesagem] = useState<string | null>(null)
  const [showProjecao, setShowProjecao] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const ciclos = ciclosPorLote[loteId] ?? []

  const recalcular = useCallback(async () => {
    if (animais.length === 0) { setResultados({}); return }
    setCalculando(true)
    const res = await calcularEmLote(animais.map(a => a.id), hojeStr())
    setResultados(res)
    setCalculando(false)
  }, [animais, calcularEmLote])

  useEffect(() => { recalcular() }, [recalcular])

  if (!lote) return null

  const toggleSelecionado = (id: string) => {
    setSelecionados(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id); else n.add(id)
      return n
    })
  }

  const qtdAtiva = animais.length
  const pesoMedioHoje = qtdAtiva > 0
    ? animais.reduce((s, a) => s + (resultados[a.id]?.peso ?? a.peso_entrada), 0) / qtdAtiva
    : 0
  const custoTotalHoje = animais.reduce((s, a) => s + (resultados[a.id]?.custoAcumulado ?? 0), 0)
  const valorCompraTotal = animais.reduce((s, a) => s + a.valor_compra, 0)

  const handleAdicionarAnimais = async (input: { data_entrada: string; linhas: LinhaAnimalInput[] }) => {
    const res = await criarAnimais({ lote_id: loteId, ...input })
    if (!res.error) { setShowAdicionarAnimais(false); await fetch() }
    return res
  }

  const handleBifurcar = async (input: CriarLoteInput) => {
    const res = await bifurcar({
      lote_origem_id: loteId,
      animal_ids: Array.from(selecionados),
      data_bifurcacao: hojeStr(),
      novo_lote: input,
    })
    if (!res.error) { setShowBifurcar(false); setSelecionados(new Set()); await fetch() }
    return res
  }

  const handleMover = async (loteDestinoId: string) => {
    const res = await moverAliquota({ animal_ids: Array.from(selecionados), lote_destino_id: loteDestinoId, data: hojeStr() })
    if (!res.error) { setShowMover(false); setSelecionados(new Set()); await fetch() }
    else setErro(res.error)
  }

  const handleAvancarCiclo = async () => {
    const res = await avancarCiclo(loteId)
    if (res.error) setErro(res.error)
  }

  const projecaoInput = useMemo(() => {
    const ciclosFuturos = ciclos
      .filter(c => c.numero >= lote.ciclo_atual)
      .map(c => ({
        numero: c.numero, nome: c.nome, dias_planejados: c.dias_planejados,
        gmd_esperado: c.gmd_esperado,
        pct_consumo_pv_ms: dietasTemplates.find(d => d.id === c.dieta_id)?.pct_consumo_pv_ms ?? null,
        custo_kg_ms: dietasTemplates.find(d => d.id === c.dieta_id)?.custo_kg_ms ?? null,
      }))
    return {
      peso_medio_atual: pesoMedioHoje,
      qtd_animais: qtdAtiva,
      gmd_real: null,
      data_hoje: hojeStr(),
      custo_compra_total: valorCompraTotal,
      custo_alimentacao_acumulado: custoTotalHoje,
      custo_alimentacao_dia: 0,
      ciclos_config: ciclosFuturos,
      preco_valor: lote.preco_venda_esperado_kg ?? 0,
      modo_preco: 'kg_vivo' as const,
      pct_comissao: lote.pct_comissao_esperada ?? 0,
      pct_encargo: lote.pct_encargo_esperado ?? 0,
      faixas_rendimento: rendimentos.map(f => ({ peso_min: f.peso_min, peso_max: f.peso_max, rendimento_pct: f.rendimento_percentual })),
      faixas_bonus: bonus.map(f => ({ peso_min: f.peso_min, peso_max: f.peso_max, bonus_kg: f.bonus_por_kg })),
    }
  }, [ciclos, lote, pesoMedioHoje, qtdAtiva, valorCompraTotal, custoTotalHoje, dietasTemplates, rendimentos, bonus])

  const resultadoProjecao = showProjecao && lote.preco_venda_esperado_kg ? calcularProjecao(projecaoInput) : null

  return (
    <Modal open onClose={onClose} title={lote.nome_lote}
      subtitle={`${lote.codigo_lote} · Ciclo ${lote.ciclo_atual}/${lote.num_ciclos}`} size="lg">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxHeight: '78vh', overflowY: 'auto', paddingRight: 4 }}>

        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <ResumoCard label="Animais ativos" valor={String(qtdAtiva)} />
          <ResumoCard label="Peso médio hoje" valor={`${fmtNum(pesoMedioHoje, 1)} kg`} />
          <ResumoCard label="Custo alimentação acumulado" valor={fmt(custoTotalHoje)} destaque />
          <ResumoCard label="Valor de compra total" valor={fmt(valorCompraTotal)} />
        </div>

        <div className="flex-between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost btn-sm" onClick={handleAvancarCiclo} disabled={lote.ciclo_atual >= lote.num_ciclos}>
              Avançar ciclo
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowProjecao(v => !v)}>
              {showProjecao ? 'Ocultar projeção' : 'Ver projeção'}
            </button>
            {qtdAtiva === 0 && (
              <button className="btn btn-ghost btn-sm" style={{ color: '#b91c1c' }} onClick={() => encerrarLote(loteId)}>
                Encerrar lote
              </button>
            )}
          </div>
          <button className="btn btn-primary btn-sm" onClick={() => setShowAdicionarAnimais(true)}>+ Adicionar animais</button>
        </div>

        {showProjecao && (
          !lote.preco_venda_esperado_kg ? (
            <div style={{ padding: 10, background: 'var(--gray-50)', borderRadius: 8, fontSize: 12, color: 'var(--gray-500)' }}>
              Defina um preço de venda esperado nas configurações do lote para ver a projeção.
            </div>
          ) : resultadoProjecao?.dia_ideal_esperado ? (
            <div style={{ background: 'var(--green-bg)', borderRadius: 8, padding: '12px 14px', fontSize: 13 }}>
              <div style={{ fontWeight: 500, color: '#1b5e20', marginBottom: 6 }}>Ponto ideal de venda (projeção)</div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                <span>Dia {resultadoProjecao.dia_ideal_esperado.dia} · {fmtData(resultadoProjecao.dia_ideal_esperado.data)}</span>
                <span>Peso: <strong>{fmtNum(resultadoProjecao.dia_ideal_esperado.peso, 0)} kg</strong></span>
                <span>Lucro projetado: <strong>{fmt(resultadoProjecao.dia_ideal_esperado.lucro)}</strong></span>
              </div>
            </div>
          ) : (
            <div style={{ padding: 10, background: 'var(--gray-50)', borderRadius: 8, fontSize: 12, color: 'var(--gray-500)' }}>
              Configure GMD esperado nos ciclos restantes para calcular a projeção.
            </div>
          )
        )}

        {selecionados.size > 0 && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'var(--green-bg)', padding: '8px 12px', borderRadius: 8 }}>
            <span style={{ fontSize: 12, color: '#1b5e20' }}>{selecionados.size} selecionado(s)</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowBifurcar(true)}>Bifurcar</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowMover(true)}>Mover para outro lote</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowVenda(true)}>Vender</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setSelecionados(new Set())} style={{ marginLeft: 'auto' }}>Limpar seleção</button>
          </div>
        )}

        {loading || calculando ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
            <div className="spinner" style={{ width: 24, height: 24 }} />
          </div>
        ) : animais.length === 0 ? (
          <EmptyState icon="◆" title="Nenhum animal neste lote"
            desc="Adicione animais por faixa de brinco, individualmente ou importando um CSV."
            action={<button className="btn btn-primary" onClick={() => setShowAdicionarAnimais(true)}>Adicionar animais</button>} />
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 30 }}>
                    <input type="checkbox"
                      checked={selecionados.size === animais.length}
                      onChange={e => setSelecionados(e.target.checked ? new Set(animais.map(a => a.id)) : new Set())} />
                  </th>
                  <th>Código</th>
                  <th>Peso entrada</th>
                  <th>Peso hoje (est.)</th>
                  <th>Dias</th>
                  <th>Custo alimentação</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {animais.map(a => {
                  const r = resultados[a.id]
                  return (
                    <tr key={a.id}>
                      <td><input type="checkbox" checked={selecionados.has(a.id)} onChange={() => toggleSelecionado(a.id)} /></td>
                      <td><strong>{a.codigo}</strong></td>
                      <td>{fmtNum(a.peso_entrada, 1)} kg</td>
                      <td>{r ? `${fmtNum(r.peso, 1)} kg` : '—'}</td>
                      <td>{r ? r.diasConfinamento : '—'}</td>
                      <td>{r ? fmt(r.custoAcumulado) : '—'}</td>
                      <td>
                        <button className="btn btn-ghost btn-sm" onClick={() => setShowPesagem(a.id)}>Pesar</button>
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

      {showBifurcar && (
        <Modal open onClose={() => setShowBifurcar(false)} title="Bifurcar lote"
          subtitle={`${selecionados.size} animal(is) selecionado(s) irão para um novo lote`} size="lg">
          <FormLoteBase
            codigoSugerido={proximoNumeroLote()}
            dietasTemplates={dietasTemplates}
            onCancelar={() => setShowBifurcar(false)}
            onConfirmar={handleBifurcar}
            tituloConfirmar="Confirmar bifurcação"
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
    </Modal>
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
// MOVER ALÍQUOTA — conteúdo do modal
// ═══════════════════════════════════════════════════════════════════════════

function ModalMoverConteudo({
  lotesDisponiveis, onConfirmar, onCancelar,
}: {
  lotesDisponiveis: Lote[]
  onConfirmar: (loteDestinoId: string) => Promise<void>
  onCancelar: () => void
}) {
  const [destino, setDestino] = useState('')
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
      <div className="modal-actions">
        <button className="btn btn-ghost" onClick={onCancelar}>Cancelar</button>
        <button className="btn btn-primary" disabled={!destino || saving} onClick={async () => {
          setSaving(true); await onConfirmar(destino); setSaving(false)
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
    const { data: rows } = await supabase.from('animais').select('*').eq('lote_atual_id', loteId).eq('status', 'ativo').order('brinco')
    setAnimaisDisponiveis((rows ?? []) as Animal[])
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: '78vh', overflowY: 'auto', paddingRight: 4 }}>
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
