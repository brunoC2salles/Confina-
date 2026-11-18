import { useState, useEffect, useCallback, Fragment } from 'react'
import { useEstadoCache, useCarregando } from '@/lib/cacheTela'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Modal, EmptyState } from '@/components/common/UI'
import { ModalSolicitar } from '@/components/parceiros/ModalSolicitar'
import {
  carregarMovimentos, carregarConsumoInformado, calcularEstoqueClienteSimples, resumoEstoqueSimples, gravarResumoCliente,
  emAlerta, fmtKg, fmtDataBr, hojeISO, ROTULO_CATEGORIA, vendavel, DIAS_UNIDADE, ROTULO_UNIDADE,
  type ClienteFornecedor, type ProdutoFornecedor, type MovimentoEstoque, type ConsumoInformado, type EstoqueCliente,
  type UnidadeConsumo,
} from '@/core/parceiros'
import './estoque-gerenciado.css'

const ROTULO_MOV: Record<MovimentoEstoque['tipo'], string> = { entrada: 'Entrada', baixa: 'Baixa (consumo)', ajuste: 'Ajuste de inventário' }

interface Escolha { produto_id: string; escolha: 'incluir' | 'excluir' }

// Dados do estoque da conta só de estoque (movimentos, consumo informado,
// previsão e "meus produtos"). Compartilhado pela tela de produtos e pelo
// painel do cliente (mesmo cache).
export function useEstoqueGerenciado(cliente: ClienteFornecedor | null, produtos: ProdutoFornecedor[]) {
  const _k = `EstoqueGerenciado:${cliente?.id ?? '-'}`
  const [movs, setMovs] = useEstadoCache<MovimentoEstoque[]>(cliente ? `${_k}:movs` : null, [])
  const [informados, setInformados] = useEstadoCache<ConsumoInformado[]>(cliente ? `${_k}:informados` : null, [])
  const [linhas, setLinhas] = useEstadoCache<Record<string, EstoqueCliente>>(cliente ? `${_k}:linhas` : null, {})
  const [escolhas, setEscolhas] = useEstadoCache<Escolha[]>(cliente ? `${_k}:escolhas` : null, [])
  const [pedidosProd, setPedidosProd] = useEstadoCache<string[]>(cliente ? `${_k}:pedidosProd` : null, [])
  const [loading, setLoading] = useCarregando(cliente ? `${_k}:linhas` : null)

  const carregar = useCallback(async () => {
    if (!cliente) return
    const [m, inf, esc, ped] = await Promise.all([
      carregarMovimentos(cliente.user_id), carregarConsumoInformado(cliente.id),
      supabase.from('fornecedor_cliente_produtos').select('produto_id, escolha').eq('cliente_id', cliente.id),
      supabase.from('fornecedor_pedidos').select('produto_id').eq('cliente_id', cliente.id),
    ])
    const calc = calcularEstoqueClienteSimples(cliente, m, hojeISO(), inf)
    setMovs(m)
    setInformados(inf)
    setEscolhas((esc.data ?? []) as Escolha[])
    setPedidosProd(((ped.data ?? []) as Array<{ produto_id: string | null }>).map(p => p.produto_id).filter((x): x is string => !!x))
    setLinhas(Object.fromEntries(calc.map(l => [l.produto_id, l])))
    setLoading(false)
    await gravarResumoCliente(cliente, calc, null)
  }, [cliente])
  useEffect(() => { carregar() }, [carregar])

  const informadoPor = Object.fromEntries(informados.map(i => [i.produto_id, i]))
  const comMov = new Set(movs.map(m => m.produto_id))
  const comPedido = new Set(pedidosProd)
  const escolhaPor = Object.fromEntries(escolhas.map(e => [e.produto_id, e.escolha]))
  const lista = produtos.filter(p => vendavel(p) && (p.visivel || comMov.has(p.id) || informadoPor[p.id]))
  // Meus produtos: os que têm movimento, consumo informado ou pedido, mais os
  // que o cliente incluiu, menos os que ele tirou.
  const ehMeu = (p: ProdutoFornecedor) => escolhaPor[p.id] === 'incluir'
    || (escolhaPor[p.id] !== 'excluir' && (comMov.has(p.id) || !!informadoPor[p.id] || comPedido.has(p.id)))
  const meus = lista.filter(ehMeu)
  const outros = lista.filter(p => !ehMeu(p))

  const escolher = async (p: ProdutoFornecedor, escolha: 'incluir' | 'excluir') => {
    if (!cliente) return 'Sem cliente'
    const { error } = await supabase.from('fornecedor_cliente_produtos')
      .upsert({ cliente_id: cliente.id, produto_id: p.id, escolha, atualizado_em: new Date().toISOString() }, { onConflict: 'cliente_id,produto_id' })
    if (error) return error.message
    await carregar()
    return null
  }

  return { movs, informados, informadoPor, linhas, loading, carregar, lista, meus, outros, escolher }
}

// Estoque da conta só de estoque, operado pelo cliente, pelo vendedor
// responsável ou pelo gestor: entradas, baixas, ajustes e consumo informado
// (kg por dia, semana ou mês). A previsão usa a média das baixas lançadas à
// mão na janela; sem elas, o consumo informado, que também gera a baixa
// automática diária (rotina do servidor). Abas: meus produtos e os demais.
export function EstoqueGerenciado({ cliente, produtos, fornecedorNome, quem, onAlterado }: {
  cliente: ClienteFornecedor
  produtos: ProdutoFornecedor[]
  fornecedorNome: string
  quem: 'cliente' | 'equipe'
  onAlterado?: () => void
}) {
  const { user } = useAuth()
  const { movs, informados, informadoPor, linhas, loading, carregar, meus, outros, escolher } = useEstoqueGerenciado(cliente, produtos)
  const [aba, setAba] = useState<'meus' | 'outros'>('meus')
  const [registrar, setRegistrar] = useState<{ produto: ProdutoFornecedor; tipo: MovimentoEstoque['tipo'] } | null>(null)
  const [form, setForm] = useState({ data: hojeISO(), quantidade: '', obs: '' })
  const [consumo, setConsumo] = useState<{ produto: ProdutoFornecedor; valor: string; unidade: UnidadeConsumo } | null>(null)
  const [solicitar, setSolicitar] = useState<ProdutoFornecedor | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  const depoisDeAlterar = async () => { await carregar(); onAlterado?.() }

  const origem = resumoEstoqueSimples(movs, cliente.janela_consumo_dias || 7, hojeISO(),
    Object.fromEntries(informados.map(i => [i.produto_id, Number(i.kg_dia)])))

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
    const kgDia = v / DIAS_UNIDADE[consumo.unidade]
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

  const mover = async (p: ProdutoFornecedor, escolha: 'incluir' | 'excluir') => {
    setMsg(null)
    const erro = await escolher(p, escolha)
    if (erro) { setMsg({ tipo: 'erro', texto: erro }); return }
    setMsg({ tipo: 'ok', texto: escolha === 'incluir' ? `${p.nome} entrou em meus produtos.` : `${p.nome} saiu de meus produtos.` })
  }

  const abrirMov = (produto: ProdutoFornecedor, tipo: MovimentoEstoque['tipo']) => {
    setMsg(null); setForm({ data: hojeISO(), quantidade: '', obs: '' }); setRegistrar({ produto, tipo })
  }
  const abrirConsumo = (produto: ProdutoFornecedor) => {
    const atual = informadoPor[produto.id]
    const unidade: UnidadeConsumo = atual?.unidade ?? 'dia'
    setMsg(null)
    setConsumo({ produto, unidade, valor: atual ? String(Math.round(Number(atual.kg_dia) * DIAS_UNIDADE[unidade] * 10) / 10) : '' })
  }
  const autor = (m: MovimentoEstoque) => m.automatico ? 'Automática' : m.criado_por && m.criado_por !== cliente.user_id ? `Equipe ${fornecedorNome}` : 'Cliente'
  const textoOrigem = (p: ProdutoFornecedor) => {
    const org = origem[p.id]?.origem
    if (!org) return null
    if (org !== 'informado') return 'pelas baixas lançadas'
    const inf = informadoPor[p.id]
    return inf && inf.unidade !== 'dia' ? `informado (${fmtKg(Number(inf.kg_dia) * DIAS_UNIDADE[inf.unidade])}/${ROTULO_UNIDADE[inf.unidade]})` : 'informado'
  }

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}><div className="spinner" style={{ width: 24, height: 24 }} /></div>

  const lista = aba === 'meus' ? meus : outros
  const botoesMeus = (p: ProdutoFornecedor, alerta: boolean) => (
    <>
      <button className="btn btn-ghost btn-sm" onClick={() => abrirMov(p, 'entrada')}>Entrada</button>
      <button className="btn btn-ghost btn-sm" onClick={() => abrirMov(p, 'baixa')}>Baixa</button>
      <button className="btn btn-ghost btn-sm" onClick={() => abrirMov(p, 'ajuste')}>Ajuste</button>
      <button className="btn btn-ghost btn-sm" onClick={() => abrirConsumo(p)}>Consumo</button>
      {quem === 'cliente' && p.visivel && (
        <button className={`btn btn-sm ${alerta ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setSolicitar(p)}>Solicitar</button>
      )}
    </>
  )
  const botoesOutros = (p: ProdutoFornecedor) => (
    <>
      <button className="btn btn-secondary btn-sm" onClick={() => mover(p, 'incluir')}>Adicionar aos meus</button>
      {quem === 'cliente' && p.visivel && <button className="btn btn-ghost btn-sm" onClick={() => setSolicitar(p)}>Solicitar</button>}
    </>
  )
  const historico = (p: ProdutoFornecedor) => {
    const doProduto = movs.filter(m => m.produto_id === p.id)
    return (
      <div className="eg-hist">
        {doProduto.length === 0 ? <span className="eg-mut">Nenhum movimento.</span> : doProduto.slice(0, 60).map(m => (
          <div key={m.id} className="eg-mov">
            <span>{fmtDataBr(m.data)}</span>
            <span>{ROTULO_MOV[m.tipo]}{m.pedido_id && ' (pedido entregue)'}</span>
            <span>{m.tipo === 'baixa' ? '-' : ''}{fmtKg(m.quantidade_kg)}</span>
            <span className="eg-mut">{autor(m)}{m.observacoes ? ` · ${m.observacoes}` : ''}</span>
            <button className="btn btn-ghost btn-sm" onClick={() => excluirMov(m)}>Excluir</button>
          </div>
        ))}
        <button type="button" className="eg-link" onClick={() => mover(p, 'excluir')}>Tirar de meus produtos</button>
      </div>
    )
  }

  return (
    <>
      <div className="eg-abas" role="tablist">
        <button type="button" role="tab" aria-selected={aba === 'meus'} className={`eg-aba${aba === 'meus' ? ' on' : ''}`} onClick={() => setAba('meus')}>
          {quem === 'cliente' ? 'Meus produtos' : 'Produtos do cliente'}<em>{meus.length}</em>
        </button>
        <button type="button" role="tab" aria-selected={aba === 'outros'} className={`eg-aba${aba === 'outros' ? ' on' : ''}`} onClick={() => setAba('outros')}>
          Outros produtos<em>{outros.length}</em>
        </button>
      </div>
      {msg && !registrar && !consumo && <div style={{ fontSize: 13, margin: '10px 0', color: msg.tipo === 'erro' ? 'var(--red)' : 'var(--green-dark)' }}>{msg.texto}</div>}

      {lista.length === 0 ? (
        <div className="card" style={{ marginTop: 12 }}>
          {aba === 'meus'
            ? <EmptyState icon="◻" title="Nenhum produto ainda" desc={`Adicione produtos na aba Outros produtos. Produtos com estoque, consumo informado ou pedido entram aqui sozinhos.`} />
            : <EmptyState icon="◻" title="Nenhum outro produto" desc={`Todos os produtos da ${fornecedorNome} já estão em meus produtos.`} />}
        </div>
      ) : aba === 'outros' ? (
        <div className="eg-cards eg-sempre">
          {lista.map(p => (
            <div key={p.id} className="eg-card">
              <div className="eg-topo">
                <div><strong>{p.nome}</strong><div className="eg-mut">{ROTULO_CATEGORIA[p.categoria]}{p.embalagem ? ` · ${p.embalagem}` : ''}</div></div>
              </div>
              <div className="eg-botoes">{botoesOutros(p)}</div>
            </div>
          ))}
        </div>
      ) : (
        <>
          {/* Computador: tabela */}
          <div className="table-wrap eg-tabela"><table>
            <thead><tr><th>Produto</th><th>Saldo</th><th>Consumo</th><th>Fim previsto</th><th></th></tr></thead>
            <tbody>{lista.map(p => {
              const e = linhas[p.id]
              const alerta = emAlerta(p, e)
              const nMov = movs.filter(m => m.produto_id === p.id).length
              const org = textoOrigem(p)
              return (
                <Fragment key={p.id}>
                  <tr style={alerta ? { background: '#fff5f5' } : undefined}>
                    <td>
                      <button type="button" className="eg-nome" onClick={() => setAberto(aberto === p.id ? null : p.id)}>
                        <strong>{p.nome}</strong>
                        <div className="eg-mut">{ROTULO_CATEGORIA[p.categoria]} · {nMov} movimento{nMov !== 1 ? 's' : ''}</div>
                      </button>
                    </td>
                    <td>{e?.saldo_kg != null ? fmtKg(e.saldo_kg) : <span className="eg-mut">Sem movimentos</span>}</td>
                    <td>{e?.consumo_dia_kg ? `${fmtKg(e.consumo_dia_kg)}/dia` : '—'}{org && <div className="eg-mut">{org}</div>}</td>
                    <td>{fmtDataBr(e?.data_fim)}{e?.dias_cobertura != null && <span className={`badge ${alerta ? 'badge-red' : 'badge-green'}`} style={{ marginLeft: 8 }}>{Math.floor(e.dias_cobertura)} dias</span>}</td>
                    <td className="eg-acoes">{botoesMeus(p, alerta)}</td>
                  </tr>
                  {aberto === p.id && <tr><td colSpan={5} style={{ background: 'var(--gray-50)' }}>{historico(p)}</td></tr>}
                </Fragment>
              )
            })}</tbody>
          </table></div>

          {/* Celular: cartões */}
          <div className="eg-cards">
            {lista.map(p => {
              const e = linhas[p.id]
              const alerta = emAlerta(p, e)
              const org = textoOrigem(p)
              return (
                <div key={p.id} className={`eg-card${alerta ? ' alerta' : ''}`}>
                  <div className="eg-topo">
                    <button type="button" className="eg-nome" onClick={() => setAberto(aberto === p.id ? null : p.id)}>
                      <strong>{p.nome}</strong>
                      <div className="eg-mut">{ROTULO_CATEGORIA[p.categoria]} · ver movimentos</div>
                    </button>
                    {e?.dias_cobertura != null && <span className={`badge ${alerta ? 'badge-red' : 'badge-green'}`}>{Math.floor(e.dias_cobertura)} dias</span>}
                  </div>
                  <div className="eg-dados">
                    <div><span>Saldo</span><b>{e?.saldo_kg != null ? fmtKg(e.saldo_kg) : '—'}</b></div>
                    <div><span>Consumo</span><b>{e?.consumo_dia_kg ? `${fmtKg(e.consumo_dia_kg)}/dia` : '—'}</b>{org && <em>{org}</em>}</div>
                    <div><span>Fim previsto</span><b>{fmtDataBr(e?.data_fim)}</b></div>
                  </div>
                  <div className="eg-botoes">{botoesMeus(p, alerta)}</div>
                  {aberto === p.id && historico(p)}
                </div>
              )
            })}
          </div>
        </>
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
              <select value={consumo.unidade} onChange={e => setConsumo({ ...consumo, unidade: e.target.value as UnidadeConsumo })}>
                <option value="dia">Dia</option><option value="semana">Semana</option><option value="mes">Mês (30 dias)</option>
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
          onCriado={(_p, aviso) => { setSolicitar(null); setMsg({ tipo: aviso ? 'erro' : 'ok', texto: aviso ?? `Solicitação enviada à ${fornecedorNome}. Acompanhe em Pedidos.` }); carregar() }} />
      )}
    </>
  )
}
