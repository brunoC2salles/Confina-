import { useState, useEffect, useCallback, Fragment } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Modal, EmptyState } from '@/components/common/UI'
import { ModalSolicitar } from '@/components/parceiros/ModalSolicitar'
import {
  carregarMovimentos, carregarConsumoInformado, calcularEstoqueClienteSimples, resumoEstoqueSimples, gravarResumoCliente,
  emAlerta, fmtKg, fmtDataBr, hojeISO, ROTULO_CATEGORIA, vendavel,
  type ClienteFornecedor, type ProdutoFornecedor, type MovimentoEstoque, type ConsumoInformado, type EstoqueCliente,
} from '@/core/parceiros'

const ROTULO_MOV: Record<MovimentoEstoque['tipo'], string> = { entrada: 'Entrada', baixa: 'Baixa (consumo)', ajuste: 'Ajuste de inventário' }

// Estoque da conta só de estoque, operado pelo cliente, pelo vendedor
// responsável ou pelo gestor: entradas, baixas, ajustes e consumo informado
// (kg por dia ou por semana). A previsão usa a média das baixas lançadas à
// mão na janela; sem elas, o consumo informado, que também gera a baixa
// automática diária (rotina do servidor).
export function EstoqueGerenciado({ cliente, produtos, fornecedorNome, quem, onAlterado }: {
  cliente: ClienteFornecedor
  produtos: ProdutoFornecedor[]
  fornecedorNome: string
  quem: 'cliente' | 'equipe'
  onAlterado?: () => void
}) {
  const { user } = useAuth()
  const [movs, setMovs] = useState<MovimentoEstoque[]>([])
  const [informados, setInformados] = useState<ConsumoInformado[]>([])
  const [linhas, setLinhas] = useState<Record<string, EstoqueCliente>>({})
  const [loading, setLoading] = useState(true)
  const [registrar, setRegistrar] = useState<{ produto: ProdutoFornecedor; tipo: MovimentoEstoque['tipo'] } | null>(null)
  const [form, setForm] = useState({ data: hojeISO(), quantidade: '', obs: '' })
  const [consumo, setConsumo] = useState<{ produto: ProdutoFornecedor; valor: string; unidade: 'dia' | 'semana' } | null>(null)
  const [solicitar, setSolicitar] = useState<ProdutoFornecedor | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  const carregar = useCallback(async () => {
    const [m, inf] = await Promise.all([carregarMovimentos(cliente.user_id), carregarConsumoInformado(cliente.id)])
    const calc = calcularEstoqueClienteSimples(cliente, m, hojeISO(), inf)
    setMovs(m)
    setInformados(inf)
    setLinhas(Object.fromEntries(calc.map(l => [l.produto_id, l])))
    setLoading(false)
    await gravarResumoCliente(cliente, calc, null)
  }, [cliente])
  useEffect(() => { carregar() }, [carregar])

  const depoisDeAlterar = async () => { await carregar(); onAlterado?.() }

  const origem = resumoEstoqueSimples(movs, cliente.janela_consumo_dias || 7, hojeISO(),
    Object.fromEntries(informados.map(i => [i.produto_id, Number(i.kg_dia)])))
  const informadoPor = Object.fromEntries(informados.map(i => [i.produto_id, i]))
  const comMov = new Set(movs.map(m => m.produto_id))
  const lista = produtos.filter(p => vendavel(p) && (p.visivel || comMov.has(p.id) || informadoPor[p.id]))

  const salvarMov = async () => {
    if (!registrar || !user) return
    const q = Number(form.quantidade.replace(',', '.'))
    if (form.quantidade.trim() === '' || !(q >= 0) || (registrar.tipo !== 'ajuste' && q === 0)) { setMsg({ tipo: 'erro', texto: 'Informe a quantidade' }); return }
    if (!form.data || form.data > hojeISO()) { setMsg({ tipo: 'erro', texto: 'A data não pode ser futura' }); return }
    setSalvando(true); setMsg(null)
    const { error } = await supabase.from('estoque_movimentos').insert({
      user_id: cliente.user_id, produto_id: registrar.produto.id, tipo: registrar.tipo, data: form.data,
      quantidade_kg: q, observacoes: form.obs.trim() || null, criado_por: user.id,
    })
    setSalvando(false)
    if (error) { setMsg({ tipo: 'erro', texto: error.message }); return }
    setRegistrar(null)
    await depoisDeAlterar()
  }

  const salvarConsumo = async () => {
    if (!consumo || !user) return
    const v = Number(consumo.valor.replace(',', '.'))
    if (consumo.valor.trim() === '' || !(v >= 0)) { setMsg({ tipo: 'erro', texto: 'Informe o consumo' }); return }
    const kgDia = consumo.unidade === 'semana' ? v / 7 : v
    setSalvando(true); setMsg(null)
    const atual = informadoPor[consumo.produto.id]
    const { error } = await supabase.from('fornecedor_consumo_informado').upsert({
      cliente_id: cliente.id, produto_id: consumo.produto.id, kg_dia: Math.round(kgDia * 1000) / 1000, unidade: consumo.unidade,
      vigente_desde: atual?.vigente_desde ?? hojeISO(), atualizado_por: user.id, atualizado_em: new Date().toISOString(),
    }, { onConflict: 'cliente_id,produto_id' })
    setSalvando(false)
    if (error) { setMsg({ tipo: 'erro', texto: error.message }); return }
    setConsumo(null)
    await depoisDeAlterar()
  }

  const removerConsumo = async (p: ProdutoFornecedor) => {
    const { error } = await supabase.from('fornecedor_consumo_informado').delete().eq('cliente_id', cliente.id).eq('produto_id', p.id)
    if (error) { setMsg({ tipo: 'erro', texto: error.message }); return }
    setConsumo(null)
    await depoisDeAlterar()
  }

  const excluirMov = async (m: MovimentoEstoque) => {
    if (!window.confirm(`Excluir ${ROTULO_MOV[m.tipo].toLowerCase()} de ${fmtKg(m.quantidade_kg)} em ${fmtDataBr(m.data)}?`)) return
    const { error } = await supabase.from('estoque_movimentos').delete().eq('id', m.id)
    if (error) { setMsg({ tipo: 'erro', texto: error.message }); return }
    await depoisDeAlterar()
  }

  const abrirMov = (produto: ProdutoFornecedor, tipo: MovimentoEstoque['tipo']) => {
    setMsg(null); setForm({ data: hojeISO(), quantidade: '', obs: '' }); setRegistrar({ produto, tipo })
  }
  const abrirConsumo = (produto: ProdutoFornecedor) => {
    const atual = informadoPor[produto.id]
    setMsg(null)
    setConsumo({
      produto, unidade: atual?.unidade ?? 'dia',
      valor: atual ? String(Math.round((atual.unidade === 'semana' ? Number(atual.kg_dia) * 7 : Number(atual.kg_dia)) * 10) / 10) : '',
    })
  }
  const autor = (m: MovimentoEstoque) => m.automatico ? 'Automática' : m.criado_por && m.criado_por !== cliente.user_id ? `Equipe ${fornecedorNome}` : 'Cliente'

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><div className="spinner" style={{ width: 24, height: 24 }} /></div>

  return (
    <>
      {msg && !registrar && !consumo && <div style={{ fontSize: 13, marginBottom: 12, color: msg.tipo === 'erro' ? 'var(--red)' : 'var(--green-dark)' }}>{msg.texto}</div>}
      {lista.length === 0 ? <div className="card"><EmptyState icon="◻" title="Nenhum produto" desc={`A ${fornecedorNome} ainda não publicou produtos.`} /></div> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Produto</th><th>Saldo</th><th>Consumo</th><th>Fim previsto</th><th></th></tr></thead>
          <tbody>{lista.map(p => {
            const e = linhas[p.id]
            const alerta = emAlerta(p, e)
            const doProduto = movs.filter(m => m.produto_id === p.id)
            const inf = informadoPor[p.id]
            const org = origem[p.id]?.origem
            return (
              <Fragment key={p.id}>
                <tr style={alerta ? { background: '#fff5f5' } : undefined}>
                  <td>
                    <button type="button" onClick={() => setAberto(aberto === p.id ? null : p.id)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit' }}>
                      <strong>{p.nome}</strong>
                      <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{ROTULO_CATEGORIA[p.categoria]} · {doProduto.length} movimento{doProduto.length !== 1 ? 's' : ''}</div>
                    </button>
                  </td>
                  <td>{e?.saldo_kg != null ? fmtKg(e.saldo_kg) : <span style={{ color: 'var(--text-3)' }}>Sem movimentos</span>}</td>
                  <td>
                    {e?.consumo_dia_kg ? `${fmtKg(e.consumo_dia_kg)}/dia` : '—'}
                    {org && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>{org === 'informado' ? `informado${inf?.unidade === 'semana' ? ` (${fmtKg(Number(inf.kg_dia) * 7)}/semana)` : ''}` : 'pelas baixas lançadas'}</div>}
                  </td>
                  <td>{fmtDataBr(e?.data_fim)}{e?.dias_cobertura != null && <span className={`badge ${alerta ? 'badge-red' : 'badge-green'}`} style={{ marginLeft: 8 }}>{Math.floor(e.dias_cobertura)} dias</span>}</td>
                  <td style={{ whiteSpace: 'nowrap', textAlign: 'right' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => abrirMov(p, 'entrada')}>Entrada</button>
                    <button className="btn btn-ghost btn-sm" style={{ marginLeft: 6 }} onClick={() => abrirMov(p, 'baixa')}>Baixa</button>
                    <button className="btn btn-ghost btn-sm" style={{ marginLeft: 6 }} onClick={() => abrirMov(p, 'ajuste')}>Ajuste</button>
                    <button className="btn btn-ghost btn-sm" style={{ marginLeft: 6 }} onClick={() => abrirConsumo(p)}>Consumo</button>
                    {quem === 'cliente' && p.visivel && (
                      <button className={`btn btn-sm ${alerta ? 'btn-primary' : 'btn-secondary'}`} style={{ marginLeft: 6 }} onClick={() => setSolicitar(p)}>Solicitar</button>
                    )}
                  </td>
                </tr>
                {aberto === p.id && (
                  <tr><td colSpan={5} style={{ background: 'var(--gray-50)' }}>
                    {doProduto.length === 0 ? <span style={{ fontSize: 12, color: 'var(--text-3)' }}>Nenhum movimento.</span> : (
                      <table><tbody>{doProduto.slice(0, 60).map(m => (
                        <tr key={m.id}>
                          <td style={{ fontSize: 12 }}>{fmtDataBr(m.data)}</td>
                          <td style={{ fontSize: 12 }}>{ROTULO_MOV[m.tipo]}{m.pedido_id && ' (pedido entregue)'}</td>
                          <td style={{ fontSize: 12 }}>{m.tipo === 'baixa' ? '-' : ''}{fmtKg(m.quantidade_kg)}</td>
                          <td style={{ fontSize: 12, color: 'var(--text-3)' }}>{autor(m)}{m.observacoes ? ` · ${m.observacoes}` : ''}</td>
                          <td style={{ textAlign: 'right' }}><button className="btn btn-ghost btn-sm" onClick={() => excluirMov(m)}>Excluir</button></td>
                        </tr>
                      ))}</tbody></table>
                    )}
                  </td></tr>
                )}
              </Fragment>
            )
          })}</tbody>
        </table></div>
      )}
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 10 }}>
        Com consumo informado e sem baixas lançadas nos últimos {cliente.janela_consumo_dias} dias, o sistema dá baixa todo dia pelo consumo informado. Pedidos entregues entram no estoque sozinhos.
      </div>

      {registrar && (
        <Modal open onClose={() => setRegistrar(null)} title={ROTULO_MOV[registrar.tipo]} subtitle={registrar.produto.nome}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setRegistrar(null)}>Cancelar</button>
            <button className="btn btn-primary" disabled={salvando} onClick={salvarMov}>{salvando ? 'Salvando...' : 'Registrar'}</button>
          </>}>
          <div className="form-row-2">
            <div className="field"><label>Data</label><input type="date" max={hojeISO()} value={form.data} onChange={e => setForm({ ...form, data: e.target.value })} /></div>
            <div className="field"><label>{registrar.tipo === 'ajuste' ? 'Saldo contado (kg)' : 'Quantidade (kg)'}</label><input type="number" min={0} value={form.quantidade} onChange={e => setForm({ ...form, quantidade: e.target.value })} /></div>
          </div>
          {registrar.tipo === 'ajuste' && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: -8, marginBottom: 12 }}>O saldo passa a ser o valor contado a partir desta data.</div>}
          {registrar.tipo === 'baixa' && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: -8, marginBottom: 12 }}>Com baixas lançadas, a previsão passa a usar a média delas e a baixa automática fica pausada.</div>}
          <div className="field"><label>Observações</label><input value={form.obs} onChange={e => setForm({ ...form, obs: e.target.value })} /></div>
          {msg && <div style={{ fontSize: 13, color: msg.tipo === 'erro' ? 'var(--red)' : 'var(--green-dark)' }}>{msg.texto}</div>}
        </Modal>
      )}

      {consumo && (
        <Modal open onClose={() => setConsumo(null)} title="Consumo informado" subtitle={consumo.produto.nome}
          footer={<>
            {informadoPor[consumo.produto.id] && <button className="btn btn-ghost" style={{ marginRight: 'auto', color: 'var(--red)' }} onClick={() => removerConsumo(consumo.produto)}>Remover</button>}
            <button className="btn btn-ghost" onClick={() => setConsumo(null)}>Cancelar</button>
            <button className="btn btn-primary" disabled={salvando} onClick={salvarConsumo}>{salvando ? 'Salvando...' : 'Salvar'}</button>
          </>}>
          <div className="form-row-2">
            <div className="field"><label>Consumo (kg)</label><input type="number" min={0} value={consumo.valor} onChange={e => setConsumo({ ...consumo, valor: e.target.value })} /></div>
            <div className="field"><label>Por</label>
              <select value={consumo.unidade} onChange={e => setConsumo({ ...consumo, unidade: e.target.value as 'dia' | 'semana' })}>
                <option value="dia">Dia</option><option value="semana">Semana</option>
              </select>
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            Usado na previsão de fim do estoque e na baixa automática diária. Quando houver baixas lançadas na janela de {cliente.janela_consumo_dias} dias, vale a média delas.
          </div>
          {msg && <div style={{ fontSize: 13, marginTop: 8, color: msg.tipo === 'erro' ? 'var(--red)' : 'var(--green-dark)' }}>{msg.texto}</div>}
        </Modal>
      )}

      {solicitar && (
        <ModalSolicitar produto={solicitar} estoque={linhas[solicitar.id]} cliente={cliente} fornecedorNome={fornecedorNome}
          onClose={() => setSolicitar(null)}
          onCriado={(_p, aviso) => { setSolicitar(null); setMsg({ tipo: aviso ? 'erro' : 'ok', texto: aviso ?? `Solicitação enviada à ${fornecedorNome}. Acompanhe em Pedidos.` }) }} />
      )}
    </>
  )
}
