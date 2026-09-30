import { useState, useEffect, useRef, Fragment } from 'react'
import { useGruposConsumoRacao, useResumoGrupo, type GrupoConsumoComDieta } from '@/hooks/useGruposConsumoRacao'
import { useComprasMedicamento } from '@/hooks/useComprasMedicamento'
import { useComprasOutros } from '@/hooks/useComprasOutros'
import { useComprasIngrediente } from '@/hooks/useComprasIngrediente'
import { useFornecimentosRacao, type IngredienteFornecimentoOpcao } from '@/hooks/useFornecimentosRacao'
import { chaveIngrediente, calcularPctMsDieta } from '@/lib/custoIngrediente'
import { dividirTotalPelaComposicao } from '@/lib/fornecimentoRacao'
import type { FornecimentoCompleto } from '@/lib/fornecimentosDb'
import type { CompraIngrediente } from '@/types'
import { Modal, PageHeader, EmptyState } from '@/components/common/UI'
import { fmt, fmtNum, fmtData } from '@/lib/calculations'

const formVazio = { nome: '', dieta_id: '', observacoes: '', loteIds: [] as string[] }
const formCompraVazio = { quantidade_kg: '', pct_ms: '', valor_total: '', data_compra: '', data_inicio_uso: '', parceiro_id: '', observacoes: '' }
const hojeStr = () => new Date().toISOString().slice(0, 10)

export default function Compras() {
  const { grupos, lotesAtivos, dietas, fornecedores, loading, criarGrupo, excluirGrupo } = useGruposConsumoRacao()
  const [aba, setAba] = useState<'racao' | 'medicamentos' | 'outros'>('racao')
  const [showNovo, setShowNovo] = useState(false)
  const [grupoSelecionado, setGrupoSelecionado] = useState<GrupoConsumoComDieta | null>(null)
  const [abrirCompraNoGrupo, setAbrirCompraNoGrupo] = useState(false)
  const [form, setForm] = useState(formVazio)
  const [saving, setSaving] = useState(false)
  // "Registrar Compra" na aba Ração: primeiro escolhe se é dieta pronta
  // (compra de um grupo de consumo), ingrediente (ração feita na fazenda)
  // ou fornecimento de ração aos lotes.
  const [showRegistrar, setShowRegistrar] = useState(false)
  const [tipoRegistro, setTipoRegistro] = useState<'dieta' | 'ingrediente' | 'fornecimento'>('dieta')
  const [grupoParaCompra, setGrupoParaCompra] = useState('')
  const [pedidoIngrediente, setPedidoIngrediente] = useState(0)
  const [pedidoFornecimento, setPedidoFornecimento] = useState(0)
  // Incrementado quando um fornecimento é registrado ou excluído — a seção
  // de ingredientes recarrega o estoque.
  const [versaoEstoque, setVersaoEstoque] = useState(0)

  const gruposAtivos = grupos.filter(g => g.status === 'ativo')

  const abrirRegistrar = () => { setTipoRegistro('dieta'); setGrupoParaCompra(''); setShowRegistrar(true) }

  const continuarRegistro = () => {
    if (tipoRegistro === 'ingrediente') {
      setShowRegistrar(false)
      setPedidoIngrediente(n => n + 1)
      return
    }
    if (tipoRegistro === 'fornecimento') {
      setShowRegistrar(false)
      setPedidoFornecimento(n => n + 1)
      return
    }
    const grupo = grupos.find(g => g.id === grupoParaCompra)
    if (!grupo) return
    setShowRegistrar(false)
    setAbrirCompraNoGrupo(true)
    setGrupoSelecionado(grupo)
  }

  const fecharNovo = () => { setShowNovo(false); setForm(formVazio) }

  const handleCriar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nome || !form.dieta_id) return
    setSaving(true)
    await criarGrupo({ nome: form.nome, dieta_id: form.dieta_id, observacoes: form.observacoes, loteIds: form.loteIds })
    setSaving(false)
    fecharNovo()
  }

  const toggleLote = (loteId: string) => {
    setForm(f => ({ ...f, loteIds: f.loteIds.includes(loteId) ? f.loteIds.filter(id => id !== loteId) : [...f.loteIds, loteId] }))
  }

  return (
    <div className="page">
      <PageHeader
        title="Compras"
        subtitle="Ração (compras, estoque e fornecimento), medicamentos e outras compras rateadas entre os animais"
        action={aba === 'racao' ? (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-ghost" onClick={() => setShowNovo(true)}>+ Novo grupo</button>
            <button className="btn btn-primary" onClick={abrirRegistrar}>+ Registrar Compra</button>
          </div>
        ) : undefined}
      />

      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {(['racao', 'medicamentos', 'outros'] as const).map(a => (
          <button key={a} type="button" onClick={() => setAba(a)}
            style={{ padding: '8px 16px', borderRadius: 6, fontSize: 13, border: '1px solid var(--border)', cursor: 'pointer',
              background: aba === a ? '#2e7d32' : '#fff', color: aba === a ? '#fff' : 'var(--gray-600)' }}>
            {a === 'racao' ? 'Ração' : a === 'medicamentos' ? 'Medicamentos' : 'Outros'}
          </button>
        ))}
      </div>

      {aba === 'racao' && (
      <>
      <SecaoFornecimentos pedidoRegistro={pedidoFornecimento}
        onEstoqueAlterado={() => setVersaoEstoque(n => n + 1)} />

      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Dieta pronta</div>
      <div style={{ fontSize: 13, color: '#9e9e9e', marginBottom: 12 }}>
        Ração comprada pronta, dividida entre os lotes de um grupo de consumo.
      </div>
      {loading
        ? <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" style={{ width: 28, height: 28 }} /></div>
        : grupos.length === 0
          ? <div className="card"><EmptyState icon="◻" title="Nenhum grupo de consumo" desc="Crie um grupo quando vários lotes dividirem a mesma leva de ração comprada."
              action={<button className="btn btn-primary" onClick={() => setShowNovo(true)}>Novo grupo</button>} /></div>
          : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
              {grupos.map(g => (
                <div key={g.id} className="card" style={{ cursor: 'pointer' }} onClick={() => { setAbrirCompraNoGrupo(false); setGrupoSelecionado(g) }}>
                  <div className="flex-between">
                    <strong>{g.nome}</strong>
                    <span className={`badge ${g.status === 'ativo' ? 'badge-green' : 'badge-gray'}`}>{g.status === 'ativo' ? 'Ativo' : 'Encerrado'}</span>
                  </div>
                  <div style={{ fontSize: 13, color: '#9e9e9e', marginTop: 4 }}>{g.dieta_nome ?? 'Dieta não encontrada'}</div>
                  {g.observacoes && <div style={{ fontSize: 12, color: '#bdbdbd', marginTop: 8 }}>{g.observacoes}</div>}
                </div>
              ))}
            </div>
          )
      }

      <Modal open={showNovo} onClose={fecharNovo} title="Novo grupo de consumo" size="lg">
        <form onSubmit={handleCriar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">Nome do grupo</label>
              <input className="form-input" placeholder="Ex: Currais Ciclo 2 — Terminação" value={form.nome}
                onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">Dieta</label>
              <select className="form-input" value={form.dieta_id} onChange={e => setForm(f => ({ ...f, dieta_id: e.target.value }))} required>
                <option value="">Selecione</option>
                {dietas.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Lotes que compartilham essa leva de ração</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 8, padding: 10 }}>
              {lotesAtivos.length === 0 && <span style={{ fontSize: 13, color: '#9e9e9e' }}>Nenhum lote ativo.</span>}
              {lotesAtivos.map(l => (
                <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={form.loteIds.includes(l.id)} onChange={() => toggleLote(l.id)} />
                  {l.nome_lote} <span style={{ color: '#bdbdbd' }}>({l.codigo_lote})</span>
                </label>
              ))}
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Observações</label>
            <input className="form-input" placeholder="Opcional" value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={fecharNovo}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Criar grupo'}</button>
          </div>
        </form>
      </Modal>

      {grupoSelecionado && (
        <DetalheGrupo
          grupo={grupoSelecionado}
          lotesAtivos={lotesAtivos}
          fornecedores={fornecedores}
          abrirCompraInicial={abrirCompraNoGrupo}
          onClose={() => { setGrupoSelecionado(null); setAbrirCompraNoGrupo(false) }}
          onExcluir={async () => {
            const { error } = await excluirGrupo(grupoSelecionado.id)
            if (error) { alert('Não foi possível excluir o grupo. Ele pode ter fornecimentos de ração registrados; exclua-os antes.'); return }
            setGrupoSelecionado(null); setAbrirCompraNoGrupo(false)
          }}
        />
      )}

      <Modal open={showRegistrar} onClose={() => setShowRegistrar(false)} title="Registrar compra">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-group">
            <label className="form-label">O que foi comprado?</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" name="tipo-registro" checked={tipoRegistro === 'dieta'} onChange={() => setTipoRegistro('dieta')} style={{ marginTop: 3 }} />
                <span><strong>Dieta pronta</strong><br /><span style={{ color: '#9e9e9e' }}>Ração comprada pronta para um grupo de consumo.</span></span>
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" name="tipo-registro" checked={tipoRegistro === 'ingrediente'} onChange={() => setTipoRegistro('ingrediente')} style={{ marginTop: 3 }} />
                <span><strong>Ingrediente</strong><br /><span style={{ color: '#9e9e9e' }}>Ingrediente comprado ou produzido na fazenda para a ração feita em casa.</span></span>
              </label>
              <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" name="tipo-registro" checked={tipoRegistro === 'fornecimento'} onChange={() => setTipoRegistro('fornecimento')} style={{ marginTop: 3 }} />
                <span><strong>Fornecimento</strong><br /><span style={{ color: '#9e9e9e' }}>Ração fornecida aos lotes, dividida entre eles pelo consumo previsto de cada um.</span></span>
              </label>
            </div>
          </div>

          {tipoRegistro === 'dieta' && (
            gruposAtivos.length === 0
              ? <div style={{ fontSize: 13, color: '#9e9e9e' }}>Nenhum grupo de consumo ativo. Crie um grupo em "+ Novo grupo" para registrar compras de dieta pronta.</div>
              : (
                <div className="form-group">
                  <label className="form-label">Grupo de consumo</label>
                  <select className="form-input" value={grupoParaCompra} onChange={e => setGrupoParaCompra(e.target.value)}>
                    <option value="">Selecione</option>
                    {gruposAtivos.map(g => <option key={g.id} value={g.id}>{g.nome}{g.dieta_nome ? ` (${g.dieta_nome})` : ''}</option>)}
                  </select>
                </div>
              )
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setShowRegistrar(false)}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={continuarRegistro}
              disabled={tipoRegistro === 'dieta' && !grupoParaCompra}>Continuar</button>
          </div>
        </div>
      </Modal>

      <SecaoIngredientes pedidoRegistro={pedidoIngrediente} versaoEstoque={versaoEstoque} />
      </>
      )}

      {aba === 'medicamentos' && <AbaMedicamentos />}

      {aba === 'outros' && <AbaOutros />}
    </div>
  )
}

// ─── Detalhe do grupo: membros, saldo, compras, estatística ────────────────

function DetalheGrupo({ grupo, lotesAtivos, fornecedores, abrirCompraInicial, onClose, onExcluir }: {
  grupo: GrupoConsumoComDieta
  lotesAtivos: Array<{ id: string; nome_lote: string; codigo_lote: string }>
  fornecedores: Array<{ id: string; nome: string }>
  abrirCompraInicial?: boolean
  onClose: () => void
  onExcluir: () => void
}) {
  const {
    membros, compras, lotesInfo, saldo, loading, mostrarAlertaSaldo, custoConfirmadoKg, pctMsDieta,
    registrarCompra, editarCompra, confirmarSaldoAtual, limparConfirmacaoSaldo, adicionarLote, encerrarParticipacao, rankingPorCompra,
  } = useResumoGrupo(grupo.id)

  const [showCompra, setShowCompra] = useState(false)
  const [formCompra, setFormCompra] = useState(formCompraVazio)

  // % MS sugerida para uma compra nova: a calculada pelos componentes da
  // dieta do grupo (editável). Vazia quando a dieta não permite o cálculo.
  const pctMsSugerida = pctMsDieta != null ? String(Math.round(pctMsDieta * 10) / 10) : ''
  const abrirCompra = () => { setFormCompra({ ...formCompraVazio, pct_ms: pctMsSugerida }); setShowCompra(true) }

  // Vindo de "Registrar compra" > Dieta pronta: abre o formulário assim que
  // os dados do grupo terminam de carregar (a % MS sugerida depende deles).
  const [compraInicialAberta, setCompraInicialAberta] = useState(false)
  useEffect(() => {
    if (abrirCompraInicial && !loading && !compraInicialAberta) {
      setCompraInicialAberta(true)
      abrirCompra()
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abrirCompraInicial, loading, compraInicialAberta])
  const [savingCompra, setSavingCompra] = useState(false)
  const [erroCompra, setErroCompra] = useState<string | null>(null)
  const [compraExpandida, setCompraExpandida] = useState<string | null>(null)
  const [showAddLote, setShowAddLote] = useState(false)
  const [loteParaAdicionar, setLoteParaAdicionar] = useState('')
  const [dataInicioLote, setDataInicioLote] = useState(new Date().toISOString().slice(0, 10))
  const [compraEditando, setCompraEditando] = useState<string | null>(null)
  const [formEdicao, setFormEdicao] = useState({ quantidade_kg: '', pct_ms: '', valor_total: '' })
  const [savingEdicao, setSavingEdicao] = useState(false)
  const [erroEdicao, setErroEdicao] = useState<string | null>(null)
  const [confirmandoSaldo, setConfirmandoSaldo] = useState(false)

  const loteIdsNoGrupo = new Set(membros.filter(m => !m.data_fim).map(m => m.lote_id))
  const lotesDisponiveis = lotesAtivos.filter(l => !loteIdsNoGrupo.has(l.id))

  const handleRegistrarCompra = async (e: React.FormEvent) => {
    e.preventDefault()
    setErroCompra(null)
    const quantidade_kg = Number(formCompra.quantidade_kg)
    const valor_total = Number(formCompra.valor_total)
    const pct_ms = Number(formCompra.pct_ms)
    if (!quantidade_kg || !valor_total || !formCompra.data_compra || !formCompra.data_inicio_uso) return
    setSavingCompra(true)
    const { error } = await registrarCompra({
      quantidade_kg, valor_total, pct_ms, data_compra: formCompra.data_compra, data_inicio_uso: formCompra.data_inicio_uso,
      parceiro_id: formCompra.parceiro_id || null, observacoes: formCompra.observacoes,
    })
    setSavingCompra(false)
    if (error) { setErroCompra(error); return }
    setShowCompra(false)
    setFormCompra(formCompraVazio)
  }

  const handleAdicionarLote = async () => {
    if (!loteParaAdicionar) return
    await adicionarLote(loteParaAdicionar, dataInicioLote)
    setShowAddLote(false)
    setLoteParaAdicionar('')
  }

  const abrirEdicao = (compraId: string, quantidade_kg: number, pct_ms: number | null, valor_total: number) => {
    setCompraEditando(compraId)
    setFormEdicao({ quantidade_kg: String(quantidade_kg), pct_ms: pct_ms != null ? String(pct_ms) : pctMsSugerida, valor_total: String(valor_total) })
    setErroEdicao(null)
  }

  const handleSalvarEdicao = async (compraId: string) => {
    setErroEdicao(null)
    const quantidade_kg = Number(formEdicao.quantidade_kg)
    const valor_total = Number(formEdicao.valor_total)
    const pct_ms = Number(formEdicao.pct_ms)
    if (!quantidade_kg || !valor_total) return
    setSavingEdicao(true)
    const { error } = await editarCompra(compraId, { quantidade_kg, valor_total, pct_ms })
    setSavingEdicao(false)
    if (error) { setErroEdicao(error); return }
    setCompraEditando(null)
  }

  const handleConfirmarSaldoAtual = async () => {
    setConfirmandoSaldo(true)
    await confirmarSaldoAtual()
    setConfirmandoSaldo(false)
  }

  const handleLimparConfirmacao = async () => {
    setConfirmandoSaldo(true)
    await limparConfirmacaoSaldo()
    setConfirmandoSaldo(false)
  }

  return (
    <Modal open onClose={onClose} title={grupo.nome} subtitle={grupo.dieta_nome ?? undefined} size="xl">
      {loading
        ? <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><div className="spinner" style={{ width: 24, height: 24 }} /></div>
        : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* Saldo */}
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Saldo</div>
              {!saldo
                ? <div style={{ fontSize: 13, color: '#9e9e9e' }}>Dieta sem %MS de consumo configurado — não é possível calcular saldo.</div>
                : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
                    <MetricaCard label="Comprado (MS)" valor={`${fmtNum(saldo.totalCompradoKg, 0)} kg`} />
                    <MetricaCard label="Consumido teórico (MS)" valor={`${fmtNum(saldo.totalConsumidoTeoricoKg, 0)} kg`} />
                    <MetricaCard label="Saldo (MS)" valor={`${fmtNum(saldo.saldoKg, 0)} kg`} alerta={mostrarAlertaSaldo}
                      alertaTitulo="Saldo negativo — o consumo teórico já passou do que foi comprado. Lance uma nova compra, edite uma existente, ou use “Confirmar saldo atual” se esse já for o valor final." />
                    <MetricaCard label="Custo médio/kg MS vigente" valor={saldo.custoMedioKgVigente != null ? fmt(saldo.custoMedioKgVigente) : '—'} />
                  </div>
                )}
              {saldo && Math.round(saldo.saldoKg) !== 0 && (
                <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                  {custoConfirmadoKg == null ? (
                    <button className="btn btn-ghost btn-sm" onClick={handleConfirmarSaldoAtual} disabled={confirmandoSaldo}>
                      {confirmandoSaldo ? 'Confirmando...' : 'Confirmar saldo atual'}
                    </button>
                  ) : (
                    <>
                      <span style={{ fontSize: 12, color: '#9e9e9e' }}>
                        Custo médio confirmado manualmente — quantidade e valor das compras não foram alterados.
                      </span>
                      <button className="btn btn-ghost btn-sm" onClick={handleLimparConfirmacao} disabled={confirmandoSaldo}>
                        Recalcular pelo teórico
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Membros */}
            <div>
              <div className="flex-between" style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Lotes no grupo</div>
                <button className="btn btn-ghost btn-sm" onClick={() => setShowAddLote(true)}>+ Adicionar lote</button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Lote</th><th>Desde</th><th>Até</th><th>Ações</th></tr></thead>
                  <tbody>
                    {membros.map(m => (
                      <tr key={m.id}>
                        <td>{lotesInfo[m.lote_id]?.nome_lote ?? m.lote_id}</td>
                        <td>{fmtData(m.data_inicio)}</td>
                        <td>{m.data_fim ? fmtData(m.data_fim) : <span className="badge badge-green">Ativo</span>}</td>
                        <td>
                          {!m.data_fim && (
                            <button className="btn btn-ghost btn-sm" style={{ color: '#b91c1c' }}
                              onClick={() => encerrarParticipacao(m.id, new Date().toISOString().slice(0, 10))}>
                              Encerrar participação
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {membros.length === 0 && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#9e9e9e' }}>Nenhum lote neste grupo ainda.</td></tr>}
                  </tbody>
                </table>
              </div>

              {showAddLote && (
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap', marginTop: 10 }}>
                  <div className="form-group" style={{ flex: '1 1 160px' }}>
                    <label className="form-label">Lote</label>
                    <select className="form-input" value={loteParaAdicionar} onChange={e => setLoteParaAdicionar(e.target.value)}>
                      <option value="">Selecione</option>
                      {lotesDisponiveis.map(l => <option key={l.id} value={l.id}>{l.nome_lote}</option>)}
                    </select>
                  </div>
                  <div className="form-group" style={{ flex: '1 1 140px' }}>
                    <label className="form-label">Desde</label>
                    <input type="date" className="form-input" value={dataInicioLote} onChange={e => setDataInicioLote(e.target.value)} />
                  </div>
                  <button className="btn btn-primary btn-sm" onClick={handleAdicionarLote}>Adicionar</button>
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowAddLote(false)}>Cancelar</button>
                </div>
              )}
            </div>

            {/* Compras */}
            <div>
              <div className="flex-between" style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 600 }}>Compras</div>
                <button className="btn btn-primary btn-sm" onClick={abrirCompra}>+ Registrar compra</button>
              </div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>Data compra</th><th>Início de uso</th><th>Quantidade</th><th>% MS</th><th>Valor</th><th>R$/kg</th><th></th></tr></thead>
                  <tbody>
                    {compras.map(c => (
                      <Fragment key={c.id}>
                        {compraEditando === c.id ? (
                          <tr>
                            <td>{fmtData(c.data_compra)}</td>
                            <td>{fmtData(c.data_inicio_uso)}</td>
                            <td>
                              <input type="number" step="0.01" className="form-input" style={{ width: 110 }}
                                value={formEdicao.quantidade_kg} onChange={e => setFormEdicao(f => ({ ...f, quantidade_kg: e.target.value }))} />
                            </td>
                            <td>
                              <input type="number" step="0.1" min="0" max="100" className="form-input" style={{ width: 80 }}
                                value={formEdicao.pct_ms} onChange={e => setFormEdicao(f => ({ ...f, pct_ms: e.target.value }))} />
                            </td>
                            <td>
                              <input type="number" step="0.01" className="form-input" style={{ width: 110 }}
                                value={formEdicao.valor_total} onChange={e => setFormEdicao(f => ({ ...f, valor_total: e.target.value }))} />
                            </td>
                            <td>
                              {Number(formEdicao.quantidade_kg) > 0
                                ? fmt(Number(formEdicao.valor_total) / Number(formEdicao.quantidade_kg))
                                : '—'}
                            </td>
                            <td style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-primary btn-sm" onClick={() => handleSalvarEdicao(c.id)} disabled={savingEdicao}>
                                {savingEdicao ? '...' : 'Salvar'}
                              </button>
                              <button className="btn btn-ghost btn-sm" onClick={() => setCompraEditando(null)}>Cancelar</button>
                            </td>
                          </tr>
                        ) : (
                          <tr>
                            <td>{fmtData(c.data_compra)}</td>
                            <td>{fmtData(c.data_inicio_uso)}</td>
                            <td>{fmtNum(c.quantidade_kg, 0)} kg</td>
                            <td>{c.pct_ms != null ? `${fmtNum(c.pct_ms, 1)}%` : '—'}</td>
                            <td>{fmt(c.valor_total)}</td>
                            <td>{fmt(c.valor_total / c.quantidade_kg)}</td>
                            <td style={{ display: 'flex', gap: 6 }}>
                              <button className="btn btn-ghost btn-sm" onClick={() => abrirEdicao(c.id, c.quantidade_kg, c.pct_ms, c.valor_total)}>
                                Editar
                              </button>
                              <button className="btn btn-ghost btn-sm" onClick={() => setCompraExpandida(compraExpandida === c.id ? null : c.id)}>
                                {compraExpandida === c.id ? 'Ocultar' : 'Ver estatística'}
                              </button>
                            </td>
                          </tr>
                        )}
                        {compraEditando === c.id && erroEdicao && (
                          <tr>
                            <td colSpan={7} style={{ fontSize: 12, color: '#b91c1c', paddingTop: 0 }}>{erroEdicao}</td>
                          </tr>
                        )}
                        {compraExpandida === c.id && compraEditando !== c.id && (
                          <tr>
                            <td colSpan={7} style={{ background: '#fafafa' }}>
                              <RankingCompra ranking={rankingPorCompra(c.id)} lotesInfo={lotesInfo} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                    {compras.length === 0 && <tr><td colSpan={7} style={{ textAlign: 'center', color: '#9e9e9e' }}>Nenhuma compra lançada ainda.</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-ghost" style={{ color: '#b91c1c' }} onClick={onExcluir}>Excluir grupo</button>
            </div>
          </div>
        )}

      <Modal open={showCompra} onClose={() => { setShowCompra(false); setErroCompra(null) }} title="Registrar compra">
        <form onSubmit={handleRegistrarCompra} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-row-3">
            <div className="form-group">
              <label className="form-label">Quantidade (kg)</label>
              <input type="number" step="0.01" className="form-input" value={formCompra.quantidade_kg}
                onChange={e => setFormCompra(f => ({ ...f, quantidade_kg: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">% Matéria seca</label>
              <input type="number" step="0.1" min="0.1" max="100" className="form-input" value={formCompra.pct_ms}
                onChange={e => setFormCompra(f => ({ ...f, pct_ms: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">Valor total</label>
              <input type="number" step="0.01" className="form-input" value={formCompra.valor_total}
                onChange={e => setFormCompra(f => ({ ...f, valor_total: e.target.value }))} required />
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: -6 }}>
            {pctMsDieta != null
              ? `% MS calculada pelos componentes da dieta: ${fmtNum(pctMsDieta, 1)}%. Ajuste se a ração comprada for diferente.`
              : 'A dieta não tem % MS em todos os componentes. Informe a % MS da ração comprada.'}
          </div>
          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">Data da compra</label>
              <input type="date" className="form-input" value={formCompra.data_compra}
                onChange={e => setFormCompra(f => ({ ...f, data_compra: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">Início de uso</label>
              <input type="date" className="form-input" value={formCompra.data_inicio_uso}
                onChange={e => setFormCompra(f => ({ ...f, data_inicio_uso: e.target.value }))} required />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Fornecedor</label>
            <select className="form-input" value={formCompra.parceiro_id} onChange={e => setFormCompra(f => ({ ...f, parceiro_id: e.target.value }))}>
              <option value="">Não informado</option>
              {fornecedores.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Observações</label>
            <input className="form-input" placeholder="Opcional" value={formCompra.observacoes}
              onChange={e => setFormCompra(f => ({ ...f, observacoes: e.target.value }))} />
          </div>
          {erroCompra && <div style={{ fontSize: 12, color: '#b91c1c' }}>{erroCompra}</div>}
          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => { setShowCompra(false); setErroCompra(null) }}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={savingCompra}>{savingCompra ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Registrar compra'}</button>
          </div>
        </form>
      </Modal>
    </Modal>
  )
}

function MetricaCard({ label, valor, alerta, alertaTitulo }: { label: string; valor: string; alerta?: boolean; alertaTitulo?: string }) {
  return (
    <div style={{ border: '1px solid #f0f0f0', borderRadius: 8, padding: '10px 14px' }}>
      <div style={{ fontSize: 11, color: '#9e9e9e' }}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 600 }}>
        {valor}
        {alerta && <span title={alertaTitulo} style={{ color: '#b91c1c', marginLeft: 3, cursor: 'default' }}>*</span>}
      </div>
    </div>
  )
}

function RankingCompra({ ranking, lotesInfo }: {
  ranking: Array<{ lote_id: string; kgConsumido: number; pctDoTotal: number }>
  lotesInfo: Record<string, { nome_lote: string; codigo_lote: string }>
}) {
  if (ranking.length === 0) return <div style={{ padding: 12, fontSize: 13, color: '#9e9e9e' }}>Sem consumo registrado neste período ainda.</div>
  return (
    <div style={{ padding: 12 }}>
      <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Consumo por lote nesta compra</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {ranking.map(r => (
          <div key={r.lote_id} className="flex-between" style={{ fontSize: 13 }}>
            <span>{lotesInfo[r.lote_id]?.nome_lote ?? r.lote_id}</span>
            <span>{fmtNum(r.kgConsumido, 0)} kg <span style={{ color: '#9e9e9e' }}>({fmtNum(r.pctDoTotal, 1)}%)</span></span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// FORNECIMENTO DE RAÇÃO — ração efetivamente dada aos lotes. Divisão
// automática entre os lotes pelo consumo previsto; vale do dia do
// fornecimento até o próximo do mesmo lote. Substitui o teórico no custo,
// no consumo e na baixa de estoque. Ver useFornecimentosRacao.ts e
// fornecimentoRacao.ts.
// ═══════════════════════════════════════════════════════════════════════════

interface LinhaIngredienteForm {
  chave: string
  nome: string
  tipo: 'concentrado' | 'volumoso'
  kg: string
  pct_ms: string
  preco: number
}

const formFornecimentoVazio = () => ({
  data: hojeStr(), dieta_id: '', modo: 'feita_na_fazenda' as 'feita_na_fazenda' | 'mistura_pronta',
  grupo_id: '', kg_total: '', pct_ms: '', observacoes: '', loteIds: [] as string[],
})

const arred = (v: number, casas = 1) => Math.round(v * 10 ** casas) / 10 ** casas

function SecaoFornecimentos({ pedidoRegistro, onEstoqueAlterado }: {
  pedidoRegistro: number
  onEstoqueAlterado: () => void
}) {
  const {
    fornecimentos, dietas, composicoes, lotes, dietaHojePorLote, grupos, ingredientes, indicadores,
    loading, calculandoIndicadores, registrarFornecimento, excluirFornecimento,
  } = useFornecimentosRacao()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(formFornecimentoVazio())
  const [linhas, setLinhas] = useState<LinhaIngredienteForm[]>([])
  const [avisoComposicao, setAvisoComposicao] = useState<string | null>(null)
  const [ingredienteParaAdicionar, setIngredienteParaAdicionar] = useState('')
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<Array<{ lote_id: string; fracao: number }> | null>(null)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [excluindo, setExcluindo] = useState<string | null>(null)

  const nomeDieta: Record<string, string> = {}
  for (const d of dietas) nomeDieta[d.id] = d.nome
  const nomeLote: Record<string, string> = {}
  for (const l of lotes) nomeLote[l.id] = l.nome_lote
  const ingredientePorChave: Record<string, IngredienteFornecimentoOpcao> = {}
  for (const i of ingredientes) ingredientePorChave[i.chave] = i
  const nomeGrupo: Record<string, string> = {}
  for (const g of grupos) nomeGrupo[g.id] = g.nome
  const lotesAtivos = lotes.filter(l => l.status === 'ativo')
  const gruposDaDieta = grupos.filter(g => g.status === 'ativo' && g.dieta_id === form.dieta_id)
  const composicaoForm = form.dieta_id ? composicoes[form.dieta_id] : undefined
  const pctMsDietaForm = composicaoForm ? calcularPctMsDieta(composicaoForm) : null

  // Abre o total em ingredientes pela composição da dieta (ração feita na
  // fazenda). Sobrescreve os kg digitados nas linhas.
  const abrirPelaComposicao = (dietaId: string, kgTexto: string) => {
    const comp = composicoes[dietaId]
    const kg = Number(kgTexto)
    if (!comp || !(kg > 0)) { setAvisoComposicao(null); return }
    const itens = dividirTotalPelaComposicao(comp, kg)
    if (!itens) {
      setAvisoComposicao('A dieta não tem % MS e participação em todos os componentes. Informe os ingredientes abaixo.')
      return
    }
    setAvisoComposicao(null)
    setLinhas(itens.map(i => ({
      chave: i.chave,
      nome: ingredientePorChave[i.chave]?.nome ?? 'Ingrediente',
      tipo: i.tipo,
      kg: String(arred(i.kg, 1)),
      pct_ms: String(arred(i.pct_ms, 1)),
      preco: i.preco_kg ?? ingredientePorChave[i.chave]?.preco_kg ?? 0,
    })))
  }

  const escolherDieta = (dietaId: string) => {
    const comp = composicoes[dietaId]
    const pctMs = comp ? calcularPctMsDieta(comp) : null
    setForm(f => ({
      ...f,
      dieta_id: dietaId,
      grupo_id: '',
      pct_ms: pctMs != null ? String(arred(pctMs, 1)) : '',
      loteIds: lotesAtivos.filter(l => dietaHojePorLote[l.id] === dietaId).map(l => l.id),
    }))
    if (form.modo === 'feita_na_fazenda') {
      setLinhas([])
      abrirPelaComposicao(dietaId, form.kg_total)
    }
  }

  const abrirNovo = () => {
    setForm(formFornecimentoVazio())
    setLinhas([])
    setAvisoComposicao(null)
    setErro(null)
    setResultado(null)
    setShowForm(true)
  }

  // Pedido vindo de "Registrar Compra" > Fornecimento, no cabeçalho da página. Guarda o último pedido
  // atendido para não reabrir o formulário quando a seção é montada de novo.
  const ultimoPedido = useRef(pedidoRegistro)
  useEffect(() => {
    if (pedidoRegistro !== ultimoPedido.current) { ultimoPedido.current = pedidoRegistro; abrirNovo() }
  }, [pedidoRegistro])

  const adicionarIngrediente = () => {
    const opcao = ingredientePorChave[ingredienteParaAdicionar]
    if (!opcao || linhas.some(l => l.chave === opcao.chave)) return
    const doComponente = composicaoForm?.componentes.find(c => c.chave === opcao.chave)
    setLinhas(ls => [...ls, {
      chave: opcao.chave,
      nome: opcao.nome,
      tipo: doComponente?.tipo ?? opcao.tipoPadrao,
      kg: '',
      pct_ms: doComponente?.pct_ms != null ? String(doComponente.pct_ms) : (opcao.pct_ms != null ? String(opcao.pct_ms) : ''),
      preco: doComponente?.preco_kg ?? opcao.preco_kg,
    }])
    setIngredienteParaAdicionar('')
  }

  const totalLinhas = linhas.reduce((s, l) => s + (Number(l.kg) || 0), 0)

  const toggleLote = (id: string) =>
    setForm(f => ({ ...f, loteIds: f.loteIds.includes(id) ? f.loteIds.filter(x => x !== id) : [...f.loteIds, id] }))

  const handleRegistrar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    setSaving(true)
    const res = await registrarFornecimento({
      data: form.data,
      dieta_id: form.dieta_id,
      modo: form.modo,
      grupo_id: form.grupo_id || null,
      kg_total: Number(form.kg_total),
      pct_ms: form.pct_ms === '' ? null : Number(form.pct_ms),
      itens: linhas.map(l => ({ chave: l.chave, tipo: l.tipo, kg: Number(l.kg) || 0, pct_ms: Number(l.pct_ms) || 0, preco_kg_referencia: l.preco })),
      loteIds: form.loteIds,
      observacoes: form.observacoes,
    })
    setSaving(false)
    if (res.error && !res.divisao) { setErro(res.error); return }
    if (res.error) setErro(res.error)
    setResultado(res.divisao ?? [])
    onEstoqueAlterado()
  }

  const handleExcluir = async (f: FornecimentoCompleto) => {
    if (!confirm('Excluir este fornecimento? O custo dos lotes e os estoques serão recalculados.')) return
    setExcluindo(f.id)
    const { error } = await excluirFornecimento(f)
    setExcluindo(null)
    if (error) alert(error)
    onEstoqueAlterado()
  }

  const fmtIndicador = (v: number | null, tipo: 'pct' | 'moeda' | 'num') =>
    v == null ? '—' : tipo === 'pct' ? `${fmtNum(v, 2)}%` : tipo === 'moeda' ? fmt(v) : fmtNum(v, 2)
  const diferenca = (plan: number | null, real: number | null) => {
    if (plan == null || real == null || plan === 0) return '—'
    const d = ((real - plan) / plan) * 100
    return `${d > 0 ? '+' : ''}${fmtNum(d, 1)}%`
  }

  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Fornecimento de ração</div>
      <div style={{ fontSize: 13, color: '#9e9e9e', marginBottom: 12 }}>
        Ração efetivamente fornecida aos lotes, dividida entre eles pelo consumo previsto de cada um.
        Vale do dia do fornecimento até o próximo do mesmo lote, e substitui o consumo teórico no custo e na baixa de estoque.
      </div>

      {loading
        ? <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><div className="spinner" style={{ width: 24, height: 24 }} /></div>
        : fornecimentos.length === 0
          ? <div className="card"><EmptyState icon="" title="Nenhum fornecimento registrado" desc="Registre a ração fornecida aos lotes para que custo, consumo e estoque passem a usar o realizado."
              action={<button className="btn btn-primary" onClick={abrirNovo}>Registrar Compra</button>} /></div>
          : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Data</th><th>Dieta</th><th>Origem</th><th>Quantidade</th><th>Lotes</th><th></th></tr></thead>
                <tbody>
                  {fornecimentos.map(f => (
                    <Fragment key={f.id}>
                      <tr>
                        <td>{fmtData(f.data)}</td>
                        <td>{nomeDieta[f.dieta_id] ?? '—'}</td>
                        <td>{f.modo === 'mistura_pronta' ? `Mistura pronta${f.grupo_id && nomeGrupo[f.grupo_id] ? ` (${nomeGrupo[f.grupo_id]})` : ''}` : 'Feita na fazenda'}</td>
                        <td>{fmtNum(f.kg_total, 0)} kg</td>
                        <td>{f.lotes.map(l => nomeLote[l.lote_id] ?? 'Lote').join(', ')}</td>
                        <td style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => setExpandido(expandido === f.id ? null : f.id)}>
                            {expandido === f.id ? 'Ocultar' : 'Detalhes'}
                          </button>
                          <button className="btn btn-ghost btn-sm" style={{ color: '#b91c1c' }} disabled={excluindo === f.id} onClick={() => handleExcluir(f)}>
                            {excluindo === f.id ? '...' : 'Excluir'}
                          </button>
                        </td>
                      </tr>
                      {expandido === f.id && (
                        <tr>
                          <td colSpan={6} style={{ background: '#fafafa' }}>
                            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                              {f.observacoes && <div style={{ fontSize: 12, color: '#9e9e9e' }}>{f.observacoes}</div>}
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Divisão entre os lotes</div>
                                {f.lotesDetalhe.map(l => (
                                  <div key={l.lote_id} className="flex-between" style={{ fontSize: 13 }}>
                                    <span>{nomeLote[l.lote_id] ?? 'Lote'}</span>
                                    <span>{fmtNum(f.kg_total * l.fracao, 0)} kg <span style={{ color: '#9e9e9e' }}>({fmtNum(l.fracao * 100, 1)}%)</span></span>
                                  </div>
                                ))}
                              </div>
                              {f.modo === 'feita_na_fazenda' ? (
                                <div>
                                  <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Ingredientes</div>
                                  {f.itens.map(i => (
                                    <div key={i.chave} className="flex-between" style={{ fontSize: 13 }}>
                                      <span>{ingredientePorChave[i.chave]?.nome ?? 'Ingrediente'} <span style={{ color: '#bdbdbd' }}>({i.tipo === 'concentrado' ? 'concentrado' : 'volumoso'}, {fmtNum(i.pct_ms, 1)}% MS)</span></span>
                                      <span>{fmtNum(i.kg, 1)} kg</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <div style={{ fontSize: 13 }}>Matéria seca da mistura: {f.pct_ms != null ? `${fmtNum(f.pct_ms, 1)}%` : '—'}</div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )
      }

      {/* Planejado x realizado */}
      {!loading && fornecimentos.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <div className="flex-between" style={{ marginBottom: 4, gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13, fontWeight: 600 }}>Planejado x realizado</div>
            {calculandoIndicadores && <span style={{ fontSize: 12, color: '#9e9e9e', display: 'flex', alignItems: 'center', gap: 6 }}><span className="spinner" style={{ width: 12, height: 12 }} />Calculando</span>}
          </div>
          <div style={{ fontSize: 13, color: '#9e9e9e', marginBottom: 12 }}>
            Por lote, desde o primeiro fornecimento. Planejado: dieta dos ciclos do lote. Realizado: ração fornecida.
            Conversão: kg de MS de concentrado por kg de peso ganho.
          </div>
          {!calculandoIndicadores && indicadores.length === 0
            ? <div style={{ fontSize: 13, color: '#9e9e9e' }}>Sem fornecimentos até hoje.</div>
            : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
                {indicadores.map(ind => (
                  <div key={ind.lote_id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    <div style={{ padding: '12px 14px 6px' }}>
                      <strong>{nomeLote[ind.lote_id] ?? 'Lote'}</strong>
                      <div style={{ fontSize: 12, color: '#9e9e9e' }}>desde {fmtData(ind.desde)} · {ind.dias} dia{ind.dias !== 1 ? 's' : ''}</div>
                    </div>
                    <div className="table-wrap">
                      <table>
                        <thead><tr><th></th><th>Planejado</th><th>Realizado</th><th>Diferença</th></tr></thead>
                        <tbody>
                          {([
                            ['Consumo MS (% PV)', 'consumoPctPv', 'pct'],
                            ['Concentrado na MS', 'pctConcentrado', 'pct'],
                            ['Custo por cabeça/dia', 'custoCabecaDia', 'moeda'],
                            ['Custo por kg ganho', 'custoKgGanho', 'moeda'],
                            ['Conversão', 'conversao', 'num'],
                          ] as const).map(([rotulo, campo, tipo]) => (
                            <tr key={campo}>
                              <td style={{ fontSize: 12 }}>{rotulo}</td>
                              <td>{fmtIndicador(ind.planejado[campo], tipo)}</td>
                              <td>{fmtIndicador(ind.realizado[campo], tipo)}</td>
                              <td style={{ color: '#9e9e9e' }}>{diferenca(ind.planejado[campo], ind.realizado[campo])}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      )}

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Registrar Compra" size="lg">
        {resultado ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: 14, background: 'var(--green-bg)', borderRadius: 8 }}>
              <div style={{ fontSize: 13, color: 'var(--green)' }}>Fornecimento registrado</div>
              <div style={{ fontSize: 13, marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {resultado.map(r => (
                  <div key={r.lote_id} className="flex-between">
                    <span>{nomeLote[r.lote_id] ?? 'Lote'}</span>
                    <span>{fmtNum(r.fracao * 100, 1)}%</span>
                  </div>
                ))}
              </div>
            </div>
            {erro && <div style={{ fontSize: 12, color: '#b91c1c' }}>{erro}</div>}
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setShowForm(false)}>Fechar</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleRegistrar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label">Data do fornecimento</label>
                <input type="date" className="form-input" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Dieta</label>
                <select className="form-input" value={form.dieta_id} onChange={e => escolherDieta(e.target.value)} required>
                  <option value="">Selecione</option>
                  {dietas.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Origem da ração</label>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 13 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="radio" name="modo-fornecimento" checked={form.modo === 'feita_na_fazenda'}
                    onChange={() => { setForm(f => ({ ...f, modo: 'feita_na_fazenda' })); if (form.dieta_id && linhas.length === 0) abrirPelaComposicao(form.dieta_id, form.kg_total) }} />
                  Feita na fazenda
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="radio" name="modo-fornecimento" checked={form.modo === 'mistura_pronta'}
                    onChange={() => setForm(f => ({ ...f, modo: 'mistura_pronta' }))} />
                  Mistura pronta (comprada)
                </label>
              </div>
            </div>

            {form.modo === 'mistura_pronta' ? (
              <>
                {form.dieta_id && gruposDaDieta.length === 0 && (
                  <div style={{ fontSize: 12, color: '#b91c1c' }}>
                    Nenhum grupo de consumo ativo com esta dieta. Crie um em "+ Novo grupo" para registrar a compra da mistura.
                  </div>
                )}
                <div className="form-row-3">
                  <div className="form-group">
                    <label className="form-label">Grupo de consumo</label>
                    <select className="form-input" value={form.grupo_id} onChange={e => setForm(f => ({ ...f, grupo_id: e.target.value }))} required>
                      <option value="">Selecione</option>
                      {gruposDaDieta.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">Quantidade (kg)</label>
                    <input type="number" step="0.01" min="0" className="form-input" value={form.kg_total}
                      onChange={e => setForm(f => ({ ...f, kg_total: e.target.value }))} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">% Matéria seca</label>
                    <input type="number" step="0.1" min="0.1" max="100" className="form-input" value={form.pct_ms}
                      onChange={e => setForm(f => ({ ...f, pct_ms: e.target.value }))} required />
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="form-group">
                  <label className="form-label">Quantidade total (kg)</label>
                  <input type="number" step="0.01" min="0" className="form-input" value={form.kg_total}
                    onChange={e => { const v = e.target.value; setForm(f => ({ ...f, kg_total: v })); if (form.dieta_id) abrirPelaComposicao(form.dieta_id, v) }} />
                  <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>
                    Dividida nos ingredientes pela composição da dieta. Ajuste os kg abaixo se a mistura foi diferente.
                  </div>
                </div>
                {avisoComposicao && <div style={{ fontSize: 12, color: '#b91c1c' }}>{avisoComposicao}</div>}
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Ingrediente</th><th>Tipo</th><th>kg</th><th>% MS</th><th></th></tr></thead>
                    <tbody>
                      {linhas.map((l, idx) => (
                        <tr key={l.chave}>
                          <td>{l.nome}</td>
                          <td>
                            <select className="form-input" style={{ minWidth: 110 }} value={l.tipo}
                              onChange={e => setLinhas(ls => ls.map((x, i) => i === idx ? { ...x, tipo: e.target.value as 'concentrado' | 'volumoso' } : x))}>
                              <option value="concentrado">Concentrado</option>
                              <option value="volumoso">Volumoso</option>
                            </select>
                          </td>
                          <td>
                            <input type="number" step="0.01" min="0" className="form-input" style={{ width: 100 }} value={l.kg}
                              onChange={e => setLinhas(ls => ls.map((x, i) => i === idx ? { ...x, kg: e.target.value } : x))} />
                          </td>
                          <td>
                            <input type="number" step="0.1" min="0.1" max="100" className="form-input" style={{ width: 80 }} value={l.pct_ms}
                              onChange={e => setLinhas(ls => ls.map((x, i) => i === idx ? { ...x, pct_ms: e.target.value } : x))} />
                          </td>
                          <td>
                            <button type="button" className="btn btn-ghost btn-sm" style={{ color: '#b91c1c' }}
                              onClick={() => setLinhas(ls => ls.filter((_, i) => i !== idx))}>Remover</button>
                          </td>
                        </tr>
                      ))}
                      {linhas.length === 0 && <tr><td colSpan={5} style={{ textAlign: 'center', color: '#9e9e9e' }}>Escolha a dieta e informe a quantidade total, ou adicione os ingredientes.</td></tr>}
                    </tbody>
                  </table>
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div className="form-group" style={{ flex: '1 1 200px' }}>
                    <label className="form-label">Adicionar ingrediente</label>
                    <select className="form-input" value={ingredienteParaAdicionar} onChange={e => setIngredienteParaAdicionar(e.target.value)}>
                      <option value="">Selecione</option>
                      {ingredientes.filter(i => i.ativo && !linhas.some(l => l.chave === i.chave)).map(i => (
                        <option key={i.chave} value={i.chave}>{i.nome}</option>
                      ))}
                    </select>
                  </div>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={adicionarIngrediente} disabled={!ingredienteParaAdicionar}>Adicionar</button>
                </div>
                <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                  Total dos ingredientes: {fmtNum(totalLinhas, 1)} kg{pctMsDietaForm != null ? ` · % MS da dieta: ${fmtNum(pctMsDietaForm, 1)}%` : ''}
                </div>
              </>
            )}

            <div className="form-group">
              <label className="form-label">Lotes que receberam</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 200, overflowY: 'auto', border: '1px solid #f0f0f0', borderRadius: 8, padding: 10 }}>
                {lotesAtivos.length === 0 && <span style={{ fontSize: 13, color: '#9e9e9e' }}>Nenhum lote ativo.</span>}
                {lotesAtivos.map(l => (
                  <label key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" checked={form.loteIds.includes(l.id)} onChange={() => toggleLote(l.id)} />
                    {l.nome_lote} <span style={{ color: '#bdbdbd' }}>({l.codigo_lote})</span>
                    {form.dieta_id && dietaHojePorLote[l.id] === form.dieta_id && <span style={{ fontSize: 11, color: '#2e7d32' }}>dieta planejada</span>}
                  </label>
                ))}
              </div>
              <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 4 }}>
                A quantidade é dividida automaticamente entre os lotes marcados, pelo consumo previsto de cada um na data.
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Observações</label>
              <input className="form-input" placeholder="Opcional" value={form.observacoes} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
            </div>

            {erro && <div style={{ fontSize: 12, color: '#b91c1c' }}>{erro}</div>}

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Registrar Compra'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// INGREDIENTES — ração feita na fazenda. Entradas por ingrediente (compra ou
// produção própria), estoque teórico e ajuste de inventário. O custo médio
// do estoque vira o preço do ingrediente nas dietas a partir da data de cada
// entrada. Ver useComprasIngrediente.ts e custoIngrediente.ts.
// ═══════════════════════════════════════════════════════════════════════════

const formIngredienteVazio = () => ({
  chave: '', tipo: 'compra' as 'compra' | 'producao_propria', data: hojeStr(),
  quantidade_kg: '', valor_total: '', parceiro_id: '', observacoes: '',
})

const ROTULO_TIPO_ENTRADA: Record<CompraIngrediente['tipo'], string> = {
  compra: 'Compra', producao_propria: 'Produção própria', ajuste: 'Ajuste de inventário',
}

function SecaoIngredientes({ pedidoRegistro, versaoEstoque }: { pedidoRegistro: number; versaoEstoque: number }) {
  const {
    entradas, ingredientes, fornecedores, resumos, loading, calculando,
    registrarEntrada, ajustarInventario, excluirEntrada, refetch,
  } = useComprasIngrediente()

  // Fornecimento registrado ou excluído muda o consumo dos ingredientes.
  const ultimaVersao = useRef(versaoEstoque)
  useEffect(() => {
    if (versaoEstoque !== ultimaVersao.current) { ultimaVersao.current = versaoEstoque; refetch() }
  }, [versaoEstoque, refetch])
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(formIngredienteVazio())
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [expandido, setExpandido] = useState<string | null>(null)
  const [ajustando, setAjustando] = useState<string | null>(null)
  const [formAjuste, setFormAjuste] = useState({ data: hojeStr(), saldo: '', observacoes: '' })
  const [savingAjuste, setSavingAjuste] = useState(false)
  const [erroAjuste, setErroAjuste] = useState<string | null>(null)

  const abrirForm = () => { setForm(formIngredienteVazio()); setErro(null); setShowForm(true) }

  // Pedido vindo de "Registrar compra" > Ingrediente, no cabeçalho da página.
  // Guarda o último pedido atendido para não reabrir o formulário quando a
  // seção é montada de novo (troca de aba).
  const ultimoPedido = useRef(pedidoRegistro)
  useEffect(() => {
    if (pedidoRegistro !== ultimoPedido.current) {
      ultimoPedido.current = pedidoRegistro
      abrirForm()
    }
  }, [pedidoRegistro])

  const nomePorChave: Record<string, string> = {}
  for (const i of ingredientes) nomePorChave[i.chave] = i.nome
  const ingredienteForm = ingredientes.find(i => i.chave === form.chave) ?? null
  const meus = ingredientes.filter(i => i.origem === 'ingrediente_produtor' && i.ativo)
  const base = ingredientes.filter(i => i.origem === 'insumo_padrao' && i.ativo)
  const fornecedorPorId: Record<string, string> = {}
  for (const f of fornecedores) fornecedorPorId[f.id] = f.nome

  const chavesComEntrada = Array.from(new Set(
    entradas.map(e => chaveIngrediente(e.origem_ingrediente, e.insumo_id, e.ingrediente_produtor_id)).filter((k): k is string => !!k),
  )).sort((a, b) => (nomePorChave[a] ?? '').localeCompare(nomePorChave[b] ?? ''))

  const quantidadeForm = Number(form.quantidade_kg)
  const valorForm = Number(form.valor_total)

  const handleRegistrar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    if (!form.chave || !form.data || form.quantidade_kg === '' || form.valor_total === '') return
    setSaving(true)
    const { error } = await registrarEntrada({
      chave: form.chave, tipo: form.tipo, data: form.data,
      quantidade_kg: quantidadeForm, valor_total: valorForm,
      parceiro_id: form.parceiro_id || null, observacoes: form.observacoes,
    })
    setSaving(false)
    if (error) { setErro(error); return }
    setShowForm(false)
  }

  const abrirAjuste = (chave: string) => {
    setAjustando(ajustando === chave ? null : chave)
    setFormAjuste({ data: hojeStr(), saldo: '', observacoes: '' })
    setErroAjuste(null)
  }

  const handleAjuste = async (chave: string) => {
    setErroAjuste(null)
    if (!formAjuste.data || formAjuste.saldo === '') return
    setSavingAjuste(true)
    const { error } = await ajustarInventario(chave, formAjuste.data, Number(formAjuste.saldo), formAjuste.observacoes)
    setSavingAjuste(false)
    if (error) { setErroAjuste(error); return }
    setAjustando(null)
  }

  const handleExcluir = async (entrada: CompraIngrediente) => {
    if (!confirm('Excluir esta entrada? O saldo e o custo médio do ingrediente serão recalculados.')) return
    await excluirEntrada(entrada)
  }

  return (
    <div style={{ marginTop: 32 }}>
      <div className="flex-between" style={{ marginBottom: 4, gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>Ingredientes (ração feita na fazenda)</div>
        {calculando && <span style={{ fontSize: 12, color: '#9e9e9e', display: 'flex', alignItems: 'center', gap: 6 }}><span className="spinner" style={{ width: 12, height: 12 }} />Calculando estoque</span>}
      </div>
      <div style={{ fontSize: 13, color: '#9e9e9e', marginBottom: 12 }}>
        Saldo = entradas menos o consumo, em kg de matéria natural. O consumo é o fornecido nos lotes com fornecimento registrado e o teórico nos demais lotes cujas dietas usam o ingrediente.
        O custo médio do estoque passa a ser o preço do ingrediente nas dietas a partir da data de cada entrada.
      </div>

      {loading
        ? <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><div className="spinner" style={{ width: 24, height: 24 }} /></div>
        : chavesComEntrada.length === 0
          ? <div className="card"><EmptyState icon="" title="Nenhuma entrada de ingrediente" desc="Registre a compra ou a produção própria dos ingredientes da ração feita na fazenda."
              action={<button className="btn btn-primary" onClick={abrirForm}>Registrar ingrediente</button>} /></div>
          : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Ingrediente</th><th>Entradas</th><th>Consumo</th><th>Saldo</th><th>Custo médio/kg</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {chavesComEntrada.map(chave => {
                    const r = resumos[chave]
                    const entradasDoIngrediente = entradas.filter(e => chaveIngrediente(e.origem_ingrediente, e.insumo_id, e.ingrediente_produtor_id) === chave)
                    return (
                      <Fragment key={chave}>
                        <tr>
                          <td>
                            <strong>{nomePorChave[chave] ?? 'Ingrediente removido'}</strong>
                            {r && !r.usadoEmDieta && <div style={{ fontSize: 11, color: '#9e9e9e' }}>Não usado em nenhuma dieta ou fornecimento</div>}
                          </td>
                          <td>{r ? `${fmtNum(r.totalEntradasKg, 0)} kg` : '—'}</td>
                          <td>{r ? `${fmtNum(r.totalConsumidoKg, 0)} kg` : '—'}</td>
                          <td>
                            {r ? (
                              <span style={{ color: r.saldoKg < 0 ? '#b91c1c' : undefined }}
                                title={r.saldoKg < 0 ? 'Saldo negativo: o consumo já passou das entradas. Registre uma entrada ou ajuste o inventário.' : undefined}>
                                {fmtNum(r.saldoKg, 0)} kg
                              </span>
                            ) : '—'}
                          </td>
                          <td>{r?.custoMedioVigente != null ? fmt(r.custoMedioVigente) : '—'}</td>
                          <td style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            <button className="btn btn-ghost btn-sm" onClick={() => setExpandido(expandido === chave ? null : chave)}>
                              {expandido === chave ? 'Ocultar' : 'Entradas'}
                            </button>
                            <button className="btn btn-ghost btn-sm" onClick={() => abrirAjuste(chave)}>Ajustar inventário</button>
                          </td>
                        </tr>
                        {ajustando === chave && (
                          <tr>
                            <td colSpan={6} style={{ background: '#fafafa' }}>
                              <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
                                <div style={{ fontSize: 12, color: '#9e9e9e' }}>
                                  Informe o saldo contado fisicamente. A partir da data, o saldo parte desse valor; o custo médio não muda.
                                  {r && ` Saldo teórico hoje: ${fmtNum(r.saldoKg, 0)} kg.`}
                                </div>
                                <div className="form-row-3">
                                  <div className="form-group">
                                    <label className="form-label">Data da contagem</label>
                                    <input type="date" className="form-input" value={formAjuste.data}
                                      onChange={e => setFormAjuste(f => ({ ...f, data: e.target.value }))} />
                                  </div>
                                  <div className="form-group">
                                    <label className="form-label">Saldo contado (kg)</label>
                                    <input type="number" step="0.01" min="0" className="form-input" value={formAjuste.saldo}
                                      onChange={e => setFormAjuste(f => ({ ...f, saldo: e.target.value }))} />
                                  </div>
                                  <div className="form-group">
                                    <label className="form-label">Observações</label>
                                    <input className="form-input" placeholder="Opcional" value={formAjuste.observacoes}
                                      onChange={e => setFormAjuste(f => ({ ...f, observacoes: e.target.value }))} />
                                  </div>
                                </div>
                                {erroAjuste && <div style={{ fontSize: 12, color: '#b91c1c' }}>{erroAjuste}</div>}
                                <div style={{ display: 'flex', gap: 8 }}>
                                  <button className="btn btn-primary btn-sm" onClick={() => handleAjuste(chave)} disabled={savingAjuste}>
                                    {savingAjuste ? 'Salvando...' : 'Salvar ajuste'}
                                  </button>
                                  <button className="btn btn-ghost btn-sm" onClick={() => setAjustando(null)}>Cancelar</button>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                        {expandido === chave && (
                          <tr>
                            <td colSpan={6} style={{ background: '#fafafa' }}>
                              <div className="table-wrap" style={{ padding: 8 }}>
                                <table>
                                  <thead><tr><th>Data</th><th>Tipo</th><th>Quantidade</th><th>Valor</th><th>R$/kg</th><th>Fornecedor</th><th></th></tr></thead>
                                  <tbody>
                                    {entradasDoIngrediente.map(e => (
                                      <tr key={e.id}>
                                        <td>{fmtData(e.data)}</td>
                                        <td>{ROTULO_TIPO_ENTRADA[e.tipo]}</td>
                                        <td>{e.tipo === 'ajuste' ? `Saldo contado: ${fmtNum(Number(e.quantidade_kg), 0)} kg` : `${fmtNum(Number(e.quantidade_kg), 0)} kg`}</td>
                                        <td>{e.tipo === 'ajuste' ? '—' : fmt(Number(e.valor_total))}</td>
                                        <td>{e.tipo !== 'ajuste' && Number(e.quantidade_kg) > 0 ? fmt(Number(e.valor_total) / Number(e.quantidade_kg)) : '—'}</td>
                                        <td>{e.parceiro_id ? (fornecedorPorId[e.parceiro_id] ?? '—') : '—'}</td>
                                        <td style={{ textAlign: 'right' }}>
                                          <button className="btn btn-ghost btn-sm" style={{ color: '#b91c1c' }} onClick={() => handleExcluir(e)} disabled={calculando}>Excluir</button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
      }

      <Modal open={showForm} onClose={() => setShowForm(false)} title="Registrar ingrediente" size="lg">
        <form onSubmit={handleRegistrar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="form-row-2">
            <div className="form-group">
              <label className="form-label">Ingrediente</label>
              <select className="form-input" value={form.chave} onChange={e => setForm(f => ({ ...f, chave: e.target.value }))} required>
                <option value="">Selecione</option>
                {meus.length > 0 && (
                  <optgroup label="Meus ingredientes">
                    {meus.map(i => <option key={i.chave} value={i.chave}>{i.nome}</option>)}
                  </optgroup>
                )}
                <optgroup label="Base padrão">
                  {base.map(i => <option key={i.chave} value={i.chave}>{i.nome}</option>)}
                </optgroup>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Origem</label>
              <select className="form-input" value={form.tipo}
                onChange={e => setForm(f => ({ ...f, tipo: e.target.value as 'compra' | 'producao_propria', parceiro_id: '' }))}>
                <option value="compra">Compra</option>
                <option value="producao_propria">Produção própria</option>
              </select>
            </div>
          </div>

          {ingredienteForm && (
            <div style={{ fontSize: 12, color: ingredienteForm.pct_ms == null ? '#b91c1c' : 'var(--gray-500)', marginTop: -6 }}>
              {ingredienteForm.pct_ms == null
                ? 'Ingrediente sem % MS cadastrada: o consumo teórico dele não pode ser calculado. Informe a % MS em Ingredientes.'
                : `% MS do ingrediente: ${fmtNum(ingredienteForm.pct_ms, 1)}%. Informe a quantidade em kg de matéria natural (como pesada).`}
            </div>
          )}

          <div className="form-row-3">
            <div className="form-group">
              <label className="form-label">Data da entrada</label>
              <input type="date" className="form-input" value={form.data} onChange={e => setForm(f => ({ ...f, data: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">Quantidade (kg)</label>
              <input type="number" step="0.01" min="0" className="form-input" value={form.quantidade_kg}
                onChange={e => setForm(f => ({ ...f, quantidade_kg: e.target.value }))} required />
            </div>
            <div className="form-group">
              <label className="form-label">{form.tipo === 'compra' ? 'Valor total (R$)' : 'Custo de produção (R$)'}</label>
              <input type="number" step="0.01" min="0" className="form-input" value={form.valor_total}
                onChange={e => setForm(f => ({ ...f, valor_total: e.target.value }))} required />
            </div>
          </div>

          {quantidadeForm > 0 && form.valor_total !== '' && (
            <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: -6 }}>
              {fmt(valorForm / quantidadeForm)} por kg. Entra no custo médio do estoque a partir da data da entrada.
            </div>
          )}

          {form.tipo === 'compra' && (
            <div className="form-group">
              <label className="form-label">Fornecedor</label>
              <select className="form-input" value={form.parceiro_id} onChange={e => setForm(f => ({ ...f, parceiro_id: e.target.value }))}>
                <option value="">Não informado</option>
                {fornecedores.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Observações</label>
            <input className="form-input" placeholder="Opcional" value={form.observacoes}
              onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
          </div>

          {erro && <div style={{ fontSize: 12, color: '#b91c1c' }}>{erro}</div>}

          <div className="modal-actions">
            <button type="button" className="btn btn-ghost" onClick={() => setShowForm(false)}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Registrar'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// MEDICAMENTOS — compra única rateada por cabeça entre os animais ativos de
// um ciclo (cruza qualquer lote). Ver useComprasMedicamento.ts.
// ═══════════════════════════════════════════════════════════════════════════

const formMedicamentoVazio = {
  descricao: '', ciclo_alvo: '', data_compra: hojeStr(), data_aplicacao: hojeStr(),
  valor_total: '', parceiro_id: '', observacoes: '',
}

function AbaMedicamentos() {
  const { compras, fornecedores, loading, distribuicaoPorCiclo, registrarCompra, excluirCompra, buscarDistribuicaoPorLote } = useComprasMedicamento()
  const [showNovo, setShowNovo] = useState(false)
  const [form, setForm] = useState(formMedicamentoVazio)
  const [ciclos, setCiclos] = useState<Record<number, number>>({})
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ quantidade: number; valorPorAnimal: number } | null>(null)
  const [compraExpandida, setCompraExpandida] = useState<string | null>(null)
  const [distribuicaoLote, setDistribuicaoLote] = useState<Record<string, Array<{ lote_id: string; nome_lote: string; codigo_lote: string; quantidade: number }>>>({})

  const abrirNovo = async () => {
    setForm(formMedicamentoVazio)
    setErro(null)
    setResultado(null)
    setShowNovo(true)
    setCiclos(await distribuicaoPorCiclo())
  }

  const fecharNovo = () => { setShowNovo(false); setForm(formMedicamentoVazio); setResultado(null) }

  const quantidadePrevista = form.ciclo_alvo ? (ciclos[Number(form.ciclo_alvo)] ?? 0) : 0
  const valorPorAnimalPrevisto = quantidadePrevista > 0 && Number(form.valor_total) > 0
    ? Number(form.valor_total) / quantidadePrevista : 0

  const handleRegistrar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    if (!form.descricao || !form.ciclo_alvo || !form.valor_total || !form.data_compra || !form.data_aplicacao) return
    setSaving(true)
    const res = await registrarCompra({
      descricao: form.descricao, ciclo_alvo: Number(form.ciclo_alvo),
      data_compra: form.data_compra, data_aplicacao: form.data_aplicacao,
      valor_total: Number(form.valor_total), parceiro_id: form.parceiro_id || undefined,
      observacoes: form.observacoes || undefined,
    })
    setSaving(false)
    if (res.error) { setErro(res.error); return }
    setResultado({ quantidade: res.quantidade ?? 0, valorPorAnimal: res.valorPorAnimal ?? 0 })
  }

  const toggleExpandir = async (compraId: string) => {
    if (compraExpandida === compraId) { setCompraExpandida(null); return }
    setCompraExpandida(compraId)
    if (!distribuicaoLote[compraId]) {
      const dist = await buscarDistribuicaoPorLote(compraId)
      setDistribuicaoLote(d => ({ ...d, [compraId]: dist }))
    }
  }

  const handleExcluir = async (compraId: string) => {
    if (!confirm('Excluir esta compra? Os lançamentos de custo gerados por ela em cada animal também serão removidos.')) return
    await excluirCompra(compraId)
  }

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: '#9e9e9e' }}>
          Compra única rateada em partes iguais entre os animais ativos de um ciclo — cruza qualquer lote.
        </div>
        <button className="btn btn-primary" onClick={abrirNovo}>+ Nova compra</button>
      </div>

      {loading
        ? <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" style={{ width: 28, height: 28 }} /></div>
        : compras.length === 0
          ? <div className="card"><EmptyState icon="" title="Nenhuma compra de medicamento" desc="Registre uma compra aplicada a todos os animais de um ciclo — o valor é dividido igualmente entre eles."
              action={<button className="btn btn-primary" onClick={abrirNovo}>Nova compra</button>} /></div>
          : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Descrição</th><th>Ciclo</th><th>Data aplicação</th>
                    <th>Animais</th><th>Valor total</th><th>Valor/animal</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {compras.map(c => (
                    <Fragment key={c.id}>
                      <tr>
                        <td><strong>{c.descricao}</strong></td>
                        <td>{c.ciclo_alvo}</td>
                        <td>{fmtData(c.data_aplicacao)}</td>
                        <td>{c.quantidade_animais}</td>
                        <td>{fmt(c.valor_total)}</td>
                        <td>{fmt(c.valor_por_animal)}</td>
                        <td style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => toggleExpandir(c.id)}>
                            {compraExpandida === c.id ? 'Ocultar' : 'Ver lotes'}
                          </button>
                          <button className="btn btn-ghost btn-sm" style={{ color: '#b91c1c' }} onClick={() => handleExcluir(c.id)}>Excluir</button>
                        </td>
                      </tr>
                      {compraExpandida === c.id && (
                        <tr>
                          <td colSpan={7} style={{ background: '#fafafa' }}>
                            <div style={{ padding: 12 }}>
                              {c.observacoes && <div style={{ fontSize: 12, color: '#9e9e9e', marginBottom: 8 }}>{c.observacoes}</div>}
                              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Animais atingidos por lote</div>
                              {!distribuicaoLote[c.id]
                                ? <div style={{ fontSize: 13, color: '#9e9e9e' }}>Carregando...</div>
                                : distribuicaoLote[c.id].length === 0
                                  ? <div style={{ fontSize: 13, color: '#9e9e9e' }}>Nenhum animal encontrado (podem ter sido movidos ou vendidos depois).</div>
                                  : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                      {distribuicaoLote[c.id].map(l => (
                                        <div key={l.lote_id} className="flex-between" style={{ fontSize: 13 }}>
                                          <span>{l.nome_lote} <span style={{ color: '#bdbdbd' }}>({l.codigo_lote})</span></span>
                                          <span>{l.quantidade} animais</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )
      }

      <Modal open={showNovo} onClose={fecharNovo} title="Nova compra de medicamento" size="lg">
        {resultado ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: 14, background: 'var(--green-bg)', borderRadius: 8 }}>
              <div style={{ fontSize: 13, color: 'var(--green)' }}>Compra registrada</div>
              <div style={{ fontSize: 15, marginTop: 4 }}>
                {resultado.quantidade} animais · {fmt(resultado.valorPorAnimal)} por animal
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={fecharNovo}>Fechar</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleRegistrar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group">
              <label className="form-label">Descrição</label>
              <input className="form-input" placeholder="Ex: Vacinação — Vermífugo" value={form.descricao}
                onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} required />
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label">Ciclo alvo (todos os lotes)</label>
                <select className="form-input" value={form.ciclo_alvo} onChange={e => setForm(f => ({ ...f, ciclo_alvo: e.target.value }))} required>
                  <option value="">Selecione</option>
                  {Object.keys(ciclos).sort((a, b) => Number(a) - Number(b)).map(n => (
                    <option key={n} value={n}>Ciclo {n} — {ciclos[Number(n)]} animais</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Valor total (R$)</label>
                <input className="form-input" type="number" step="0.01" value={form.valor_total}
                  onChange={e => setForm(f => ({ ...f, valor_total: e.target.value }))} required />
              </div>
            </div>

            {quantidadePrevista > 0 && Number(form.valor_total) > 0 && (
              <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                {quantidadePrevista} animais elegíveis agora → {fmt(valorPorAnimalPrevisto)} por animal.
                A quantidade final é recalculada na confirmação.
              </div>
            )}

            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label">Data da compra</label>
                <input className="form-input" type="date" value={form.data_compra}
                  onChange={e => setForm(f => ({ ...f, data_compra: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Data de aplicação</label>
                <input className="form-input" type="date" value={form.data_aplicacao}
                  onChange={e => setForm(f => ({ ...f, data_aplicacao: e.target.value }))} required />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Fornecedor</label>
              <select className="form-input" value={form.parceiro_id} onChange={e => setForm(f => ({ ...f, parceiro_id: e.target.value }))}>
                <option value="">Não informado</option>
                {fornecedores.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Observações</label>
              <input className="form-input" placeholder="Opcional" value={form.observacoes}
                onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
            </div>

            {erro && <div style={{ fontSize: 12, color: '#b91c1c' }}>{erro}</div>}

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={fecharNovo}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Registrar compra'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// OUTROS — mesma lógica de MEDICAMENTOS: compra única rateada por cabeça
// entre os animais ativos de um ciclo (cruza qualquer lote), para lançamentos
// que não são ração nem medicamento. Ver useComprasOutros.ts.
// ═══════════════════════════════════════════════════════════════════════════

const formOutrosVazio = {
  descricao: '', ciclo_alvo: '', data_compra: hojeStr(), data_aplicacao: hojeStr(),
  valor_total: '', parceiro_id: '', observacoes: '',
}

function AbaOutros() {
  const { compras, fornecedores, loading, distribuicaoPorCiclo, registrarCompra, excluirCompra, buscarDistribuicaoPorLote } = useComprasOutros()
  const [showNovo, setShowNovo] = useState(false)
  const [form, setForm] = useState(formOutrosVazio)
  const [ciclos, setCiclos] = useState<Record<number, number>>({})
  const [saving, setSaving] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ quantidade: number; valorPorAnimal: number } | null>(null)
  const [compraExpandida, setCompraExpandida] = useState<string | null>(null)
  const [distribuicaoLote, setDistribuicaoLote] = useState<Record<string, Array<{ lote_id: string; nome_lote: string; codigo_lote: string; quantidade: number }>>>({})

  const abrirNovo = async () => {
    setForm(formOutrosVazio)
    setErro(null)
    setResultado(null)
    setShowNovo(true)
    setCiclos(await distribuicaoPorCiclo())
  }

  const fecharNovo = () => { setShowNovo(false); setForm(formOutrosVazio); setResultado(null) }

  const quantidadePrevista = form.ciclo_alvo ? (ciclos[Number(form.ciclo_alvo)] ?? 0) : 0
  const valorPorAnimalPrevisto = quantidadePrevista > 0 && Number(form.valor_total) > 0
    ? Number(form.valor_total) / quantidadePrevista : 0

  const handleRegistrar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    if (!form.descricao || !form.ciclo_alvo || !form.valor_total || !form.data_compra || !form.data_aplicacao) return
    setSaving(true)
    const res = await registrarCompra({
      descricao: form.descricao, ciclo_alvo: Number(form.ciclo_alvo),
      data_compra: form.data_compra, data_aplicacao: form.data_aplicacao,
      valor_total: Number(form.valor_total), parceiro_id: form.parceiro_id || undefined,
      observacoes: form.observacoes || undefined,
    })
    setSaving(false)
    if (res.error) { setErro(res.error); return }
    setResultado({ quantidade: res.quantidade ?? 0, valorPorAnimal: res.valorPorAnimal ?? 0 })
  }

  const toggleExpandir = async (compraId: string) => {
    if (compraExpandida === compraId) { setCompraExpandida(null); return }
    setCompraExpandida(compraId)
    if (!distribuicaoLote[compraId]) {
      const dist = await buscarDistribuicaoPorLote(compraId)
      setDistribuicaoLote(d => ({ ...d, [compraId]: dist }))
    }
  }

  const handleExcluir = async (compraId: string) => {
    if (!confirm('Excluir esta compra? Os lançamentos de custo gerados por ela em cada animal também serão removidos.')) return
    await excluirCompra(compraId)
  }

  return (
    <div>
      <div className="flex-between" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 13, color: '#9e9e9e' }}>
          Compra única rateada em partes iguais entre os animais ativos de um ciclo — cruza qualquer lote.
          Use para lançamentos que não são ração nem medicamento (descreva o que é na descrição).
        </div>
        <button className="btn btn-primary" onClick={abrirNovo}>+ Nova compra</button>
      </div>

      {loading
        ? <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}><div className="spinner" style={{ width: 28, height: 28 }} /></div>
        : compras.length === 0
          ? <div className="card"><EmptyState icon="" title="Nenhuma compra em Outros" desc="Registre uma compra aplicada a todos os animais de um ciclo — o valor é dividido igualmente entre eles."
              action={<button className="btn btn-primary" onClick={abrirNovo}>Nova compra</button>} /></div>
          : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Descrição</th><th>Ciclo</th><th>Data aplicação</th>
                    <th>Animais</th><th>Valor total</th><th>Valor/animal</th><th></th>
                  </tr>
                </thead>
                <tbody>
                  {compras.map(c => (
                    <Fragment key={c.id}>
                      <tr>
                        <td><strong>{c.descricao}</strong></td>
                        <td>{c.ciclo_alvo}</td>
                        <td>{fmtData(c.data_aplicacao)}</td>
                        <td>{c.quantidade_animais}</td>
                        <td>{fmt(c.valor_total)}</td>
                        <td>{fmt(c.valor_por_animal)}</td>
                        <td style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => toggleExpandir(c.id)}>
                            {compraExpandida === c.id ? 'Ocultar' : 'Ver lotes'}
                          </button>
                          <button className="btn btn-ghost btn-sm" style={{ color: '#b91c1c' }} onClick={() => handleExcluir(c.id)}>Excluir</button>
                        </td>
                      </tr>
                      {compraExpandida === c.id && (
                        <tr>
                          <td colSpan={7} style={{ background: '#fafafa' }}>
                            <div style={{ padding: 12 }}>
                              {c.observacoes && <div style={{ fontSize: 12, color: '#9e9e9e', marginBottom: 8 }}>{c.observacoes}</div>}
                              <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Animais atingidos por lote</div>
                              {!distribuicaoLote[c.id]
                                ? <div style={{ fontSize: 13, color: '#9e9e9e' }}>Carregando...</div>
                                : distribuicaoLote[c.id].length === 0
                                  ? <div style={{ fontSize: 13, color: '#9e9e9e' }}>Nenhum animal encontrado (podem ter sido movidos ou vendidos depois).</div>
                                  : (
                                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                      {distribuicaoLote[c.id].map(l => (
                                        <div key={l.lote_id} className="flex-between" style={{ fontSize: 13 }}>
                                          <span>{l.nome_lote} <span style={{ color: '#bdbdbd' }}>({l.codigo_lote})</span></span>
                                          <span>{l.quantidade} animais</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )
      }

      <Modal open={showNovo} onClose={fecharNovo} title="Nova compra — Outros" size="lg">
        {resultado ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: 14, background: 'var(--green-bg)', borderRadius: 8 }}>
              <div style={{ fontSize: 13, color: 'var(--green)' }}>Compra registrada</div>
              <div style={{ fontSize: 15, marginTop: 4 }}>
                {resultado.quantidade} animais · {fmt(resultado.valorPorAnimal)} por animal
              </div>
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" onClick={fecharNovo}>Fechar</button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleRegistrar} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="form-group">
              <label className="form-label">Descrição</label>
              <input className="form-input" placeholder="Ex: Sal mineral extra — lote 3" value={form.descricao}
                onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} required />
            </div>

            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label">Ciclo alvo (todos os lotes)</label>
                <select className="form-input" value={form.ciclo_alvo} onChange={e => setForm(f => ({ ...f, ciclo_alvo: e.target.value }))} required>
                  <option value="">Selecione</option>
                  {Object.keys(ciclos).sort((a, b) => Number(a) - Number(b)).map(n => (
                    <option key={n} value={n}>Ciclo {n} — {ciclos[Number(n)]} animais</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Valor total (R$)</label>
                <input className="form-input" type="number" step="0.01" value={form.valor_total}
                  onChange={e => setForm(f => ({ ...f, valor_total: e.target.value }))} required />
              </div>
            </div>

            {quantidadePrevista > 0 && Number(form.valor_total) > 0 && (
              <div style={{ fontSize: 12, color: 'var(--gray-500)' }}>
                {quantidadePrevista} animais elegíveis agora → {fmt(valorPorAnimalPrevisto)} por animal.
                A quantidade final é recalculada na confirmação.
              </div>
            )}

            <div className="form-row-2">
              <div className="form-group">
                <label className="form-label">Data da compra</label>
                <input className="form-input" type="date" value={form.data_compra}
                  onChange={e => setForm(f => ({ ...f, data_compra: e.target.value }))} required />
              </div>
              <div className="form-group">
                <label className="form-label">Data de aplicação</label>
                <input className="form-input" type="date" value={form.data_aplicacao}
                  onChange={e => setForm(f => ({ ...f, data_aplicacao: e.target.value }))} required />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Fornecedor</label>
              <select className="form-input" value={form.parceiro_id} onChange={e => setForm(f => ({ ...f, parceiro_id: e.target.value }))}>
                <option value="">Não informado</option>
                {fornecedores.map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Observações</label>
              <input className="form-input" placeholder="Opcional" value={form.observacoes}
                onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} />
            </div>

            {erro && <div style={{ fontSize: 12, color: '#b91c1c' }}>{erro}</div>}

            <div className="modal-actions">
              <button type="button" className="btn btn-ghost" onClick={fecharNovo}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Registrar compra'}
              </button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
