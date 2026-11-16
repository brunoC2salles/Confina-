import { useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Modal, PageHeader, EmptyState } from '@/components/common/UI'
import { useDadosFornecedor, nomeCliente } from '@/portal/useDadosFornecedor'
import { usePortal } from '@/portal/PortalContext'
import {
  rotaDoCliente, fmtKg, fmtDataBr, hojeISO, somarDias, criarPedido, quantidadeSugerida, normalizarMunicipio,
  type RotaEntrega, type PedidoFornecedor, type ClienteFornecedor, type EstoqueCliente,
} from '@/core/parceiros'

const SEM_ROTA = 'sem-rota'
const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const diaSemana = (iso: string) => DIAS_SEMANA[new Date(iso + 'T12:00:00Z').getUTCDay()]
const toneladas = (kg: number) => `${(kg / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} t`

interface Carga { data: string; rota: RotaEntrega | null; pedidos: PedidoFornecedor[]; kg: number }

// Logística: rotas com os municípios atendidos, capacidade de carga, agenda
// de entregas (pedidos aprovados por data e rota), sugestão de reposição
// para clientes da mesma rota e romaneio.
export default function Entregas() {
  const { papel } = usePortal()
  const { fornecedor, clientes, produtos, pedidos, estoque, rotas, capacidadeKg, loading, recarregar } = useDadosFornecedor()
  const [dias, setDias] = useState<7 | 14 | 30>(14)
  const [filtroRota, setFiltroRota] = useState<string>('todas')
  const [editRota, setEditRota] = useState<RotaEntrega | 'nova' | null>(null)
  const [formRota, setFormRota] = useState({ nome: '', municipios: '' })
  const [editCap, setEditCap] = useState<string | null>(null)
  const [ofertados, setOfertados] = useState<Set<string>>(new Set())
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)
  const gestor = papel === 'gestor'

  const clientePorId = useMemo(() => new Map(clientes.map(c => [c.id, c])), [clientes])
  const produtoPorId = useMemo(() => new Map(produtos.map(p => [p.id, p])), [produtos])
  const rotaDe = (c: ClienteFornecedor | undefined) => c ? rotaDoCliente(c, rotas) : null

  const hoje = hojeISO()
  const ate = somarDias(hoje, dias)
  const cargas = useMemo(() => {
    const mapa = new Map<string, Carga>()
    for (const p of pedidos) {
      if (p.status !== 'aprovado' || !p.data_entrega || p.data_entrega > ate) continue
      const c = clientePorId.get(p.cliente_id)
      const r = rotaDe(c)
      if (filtroRota !== 'todas' && (r?.id ?? SEM_ROTA) !== filtroRota) continue
      const data = p.data_entrega < hoje ? hoje : p.data_entrega
      const chave = `${data}|${r?.id ?? SEM_ROTA}`
      const carga = mapa.get(chave) ?? { data, rota: r, pedidos: [], kg: 0 }
      carga.pedidos.push(p)
      carga.kg += Number(p.quantidade_kg ?? 0)
      mapa.set(chave, carga)
    }
    return Array.from(mapa.values()).sort((a, b) => a.data.localeCompare(b.data) || (a.rota?.nome ?? 'zz').localeCompare(b.rota?.nome ?? 'zz'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pedidos, clientePorId, rotas, filtroRota, ate, hoje])

  // Clientes da mesma rota, fora da carga, com produto acabando até 7 dias
  // depois da entrega e sem pedido em aberto desse produto.
  const sugestoes = (carga: Carga): Array<{ cliente: ClienteFornecedor; linha: EstoqueCliente }> => {
    if (!carga.rota) return []
    const naCarga = new Set(carga.pedidos.map(p => p.cliente_id))
    const limite = somarDias(carga.data, 7)
    const emAberto = new Set(pedidos.filter(p => ['novo', 'em_cotacao', 'cotado', 'aprovado'].includes(p.status)).map(p => `${p.cliente_id}|${p.produto_id}`))
    const lista: Array<{ cliente: ClienteFornecedor; linha: EstoqueCliente }> = []
    for (const e of estoque) {
      const c = clientePorId.get(e.cliente_id)
      if (!c || !c.ativo || naCarga.has(c.id) || rotaDe(c)?.id !== carga.rota.id) continue
      if (!e.data_fim || e.data_fim > limite || emAberto.has(`${c.id}|${e.produto_id}`)) continue
      if (!produtoPorId.get(e.produto_id)?.visivel) continue
      lista.push({ cliente: c, linha: e })
    }
    return lista.sort((a, b) => (a.linha.data_fim ?? '').localeCompare(b.linha.data_fim ?? ''))
  }

  const oferecer = async (carga: Carga, cliente: ClienteFornecedor, linha: EstoqueCliente) => {
    const produto = produtoPorId.get(linha.produto_id)
    if (!produto) return
    const qtd = quantidadeSugerida(produto, linha.consumo_dia_kg, 30) || produto.pedido_minimo_kg || 0
    const r = await criarPedido({
      cliente_id: cliente.id, produto_id: produto.id, quantidade_kg: qtd, data_entrega: carga.data, origem: 'vendedor',
      observacoes: `Reposição oferecida para a carga de ${fmtDataBr(carga.data)} (${carga.rota?.nome ?? ''})`,
      estoque_info: { saldo_kg: linha.saldo_kg, consumo_dia_kg: linha.consumo_dia_kg, data_fim: linha.data_fim, dias_cobertura: linha.dias_cobertura },
    })
    if (r.error) { setMsg({ tipo: 'erro', texto: r.error }); return }
    setOfertados(s => new Set(s).add(`${cliente.id}|${produto.id}`))
    setMsg({ tipo: 'ok', texto: `Pedido de ${produto.nome} lançado para ${nomeCliente(cliente)}. Cote e aprove em Pedidos para entrar na carga.` })
    recarregar()
  }

  const abrirRota = (r: RotaEntrega | 'nova') => {
    setMsg(null); setEditRota(r)
    setFormRota(r === 'nova' ? { nome: '', municipios: '' } : { nome: r.nome, municipios: r.municipios.join(', ') })
  }
  const salvarRota = async () => {
    if (!fornecedor || !editRota) return
    const nome = formRota.nome.trim()
    if (!nome) { setMsg({ tipo: 'erro', texto: 'Informe o nome da rota' }); return }
    const municipios = Array.from(new Set(formRota.municipios.split(/[,;\n]/).map(m => m.trim()).filter(Boolean)))
    const linha = { fornecedor_id: fornecedor.id, nome, municipios }
    const { error } = editRota === 'nova'
      ? await supabase.from('fornecedor_rotas').insert(linha)
      : await supabase.from('fornecedor_rotas').update(linha).eq('id', editRota.id)
    if (error) { setMsg({ tipo: 'erro', texto: error.message }); return }
    setEditRota(null); recarregar()
  }
  const excluirRota = async () => {
    if (!editRota || editRota === 'nova') return
    if (!window.confirm(`Excluir a rota ${editRota.nome}? Os clientes dela passam a ser agrupados pelo município.`)) return
    const { error } = await supabase.from('fornecedor_rotas').delete().eq('id', editRota.id)
    if (error) { setMsg({ tipo: 'erro', texto: error.message }); return }
    setEditRota(null); recarregar()
  }
  const salvarCapacidade = async () => {
    if (!fornecedor) return
    const t = Number((editCap ?? '').replace(',', '.'))
    if (!(t > 0)) { setMsg({ tipo: 'erro', texto: 'Informe a capacidade em toneladas' }); return }
    const { error } = await supabase.from('fornecedor_config').upsert({ fornecedor_id: fornecedor.id, capacidade_carga_kg: Math.round(t * 1000), updated_at: new Date().toISOString() })
    if (error) { setMsg({ tipo: 'erro', texto: error.message }); return }
    setEditCap(null); recarregar()
  }

  if (loading) return <div className="page"><div className="spinner" style={{ width: 28, height: 28, margin: '48px auto' }} /></div>

  // Municípios dos clientes que não estão em nenhuma rota (ajuda a montar as rotas).
  const semRota = Array.from(new Set(clientes.filter(c => c.ativo && !rotaDe(c) && c.municipio).map(c => c.municipio as string)))
  const totalPeriodo = cargas.reduce((s, c) => s + c.kg, 0)

  return (
    <div className="page">
      <PageHeader title="Entregas" subtitle="Pedidos aprovados por data e rota, capacidade de carga e romaneio" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 20 }}>
        <div className="card">
          <div className="flex-between" style={{ marginBottom: 10 }}>
            <strong>Rotas</strong>
            {gestor && <button className="btn btn-ghost btn-sm" onClick={() => abrirRota('nova')}>+ Nova rota</button>}
          </div>
          {rotas.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Nenhuma rota. {gestor ? 'Crie rotas com os municípios atendidos.' : 'O gestor ainda não criou rotas.'}</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rotas.map(r => {
                const n = clientes.filter(c => c.ativo && rotaDe(c)?.id === r.id).length
                return (
                  <div key={r.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                    <div className="flex-between" style={{ fontSize: 13 }}>
                      <strong>{r.nome}</strong>
                      <span style={{ color: 'var(--text-3)' }}>{n} cliente{n !== 1 ? 's' : ''}{gestor && <button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => abrirRota(r)}>Editar</button>}</span>
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{r.municipios.join(', ') || 'Sem municípios'}</div>
                  </div>
                )
              })}
            </div>
          )}
          {semRota.length > 0 && <div style={{ fontSize: 12, color: 'var(--amber)', marginTop: 10 }}>Municípios de clientes fora de rota: {semRota.join(', ')}</div>}
        </div>

        <div className="card">
          <strong style={{ display: 'block', marginBottom: 10 }}>Capacidade por carga</strong>
          {editCap == null ? (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontSize: 28, fontWeight: 700 }}>{toneladas(capacidadeKg)}</span>
              {gestor && <button className="btn btn-ghost btn-sm" onClick={() => setEditCap(String(capacidadeKg / 1000))}>Alterar</button>}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input className="form-input" type="number" style={{ width: 100 }} value={editCap} onChange={e => setEditCap(e.target.value)} />
              <span style={{ fontSize: 13 }}>toneladas</span>
              <button className="btn btn-primary btn-sm" onClick={salvarCapacidade}>Salvar</button>
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>Cargas acima do limite aparecem em destaque na agenda.</div>
          <div style={{ fontSize: 13, marginTop: 16 }}>Programado nos próximos {dias} dias: <strong>{toneladas(totalPeriodo)}</strong> em {cargas.length} carga{cargas.length !== 1 ? 's' : ''}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, alignItems: 'center' }}>
        <div className="pill-wrap" style={{ marginBottom: 0 }}>
          {([7, 14, 30] as const).map(n => <button key={n} className={`pill${dias === n ? ' active' : ''}`} onClick={() => setDias(n)}>{n} dias</button>)}
        </div>
        <select className="form-input" style={{ width: 220, height: 34 }} value={filtroRota} onChange={e => setFiltroRota(e.target.value)}>
          <option value="todas">Todas as rotas</option>
          {rotas.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
          <option value={SEM_ROTA}>Sem rota</option>
        </select>
      </div>
      {msg && !editRota && <div style={{ fontSize: 13, marginBottom: 12, color: msg.tipo === 'erro' ? 'var(--red)' : 'var(--green-dark)' }}>{msg.texto}</div>}

      {cargas.length === 0 ? <div className="card"><EmptyState icon="◻" title="Nenhuma entrega programada" desc="Pedidos aprovados com data de entrega aparecem aqui, agrupados por rota." /></div> : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {cargas.map(carga => {
            const acima = carga.kg > capacidadeKg
            const sug = sugestoes(carga)
            const chaveRota = carga.rota?.id ?? SEM_ROTA
            return (
              <div key={`${carga.data}|${chaveRota}`} className="card" style={{ borderColor: acima ? 'var(--red)' : undefined }}>
                <div className="flex-between" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                  <div>
                    <strong style={{ fontSize: 15 }}>{fmtDataBr(carga.data)} ({diaSemana(carga.data)}) · {carga.rota?.nome ?? 'Sem rota'}</strong>
                    <div style={{ fontSize: 12, color: acima ? 'var(--red)' : 'var(--text-2)', marginTop: 2 }}>
                      {toneladas(carga.kg)} de {toneladas(capacidadeKg)}{acima ? ` · acima da capacidade em ${toneladas(carga.kg - capacidadeKg)}` : ` · ${Math.round((carga.kg / capacidadeKg) * 100)}% da carga`}
                    </div>
                    <div style={{ height: 6, width: 260, maxWidth: '100%', background: 'var(--gray-100)', borderRadius: 4, marginTop: 6 }}>
                      <div style={{ width: `${Math.min(100, (carga.kg / capacidadeKg) * 100)}%`, height: '100%', borderRadius: 4, background: acima ? 'var(--red)' : 'var(--green)' }} />
                    </div>
                  </div>
                  <Link className="btn btn-secondary btn-sm" to={`/romaneio?data=${carga.data}&rota=${chaveRota}`}>Romaneio</Link>
                </div>
                <div className="table-wrap"><table>
                  <thead><tr><th>Nº</th><th>Cliente</th><th>Município</th><th>Produto</th><th>Quantidade</th></tr></thead>
                  <tbody>{carga.pedidos.map(p => {
                    const c = clientePorId.get(p.cliente_id)
                    return (
                      <tr key={p.id}>
                        <td>#{p.numero}</td>
                        <td><strong>{nomeCliente(c)}</strong>{p.data_entrega && p.data_entrega < hoje && <div style={{ fontSize: 11, color: 'var(--red)' }}>Atrasado (era {fmtDataBr(p.data_entrega)})</div>}</td>
                        <td>{c?.municipio ?? '—'}</td>
                        <td>{p.produto_nome ?? '—'}</td>
                        <td>{fmtKg(p.quantidade_kg)}</td>
                      </tr>
                    )
                  })}</tbody>
                </table></div>
                {sug.length > 0 && (
                  <div style={{ marginTop: 12, background: 'var(--gray-50)', borderRadius: 8, padding: 12 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Aproveite a carga: clientes desta rota com estoque acabando</div>
                    {sug.map(({ cliente, linha }) => {
                      const prod = produtoPorId.get(linha.produto_id)
                      const feito = ofertados.has(`${cliente.id}|${linha.produto_id}`)
                      return (
                        <div key={`${cliente.id}-${linha.produto_id}`} className="flex-between" style={{ fontSize: 13, padding: '6px 0', gap: 8, flexWrap: 'wrap' }}>
                          <span><strong>{nomeCliente(cliente)}</strong> · {prod?.nome} · acaba em {fmtDataBr(linha.data_fim)}</span>
                          <button className="btn btn-primary btn-sm" disabled={feito} onClick={() => oferecer(carga, cliente, linha)}>{feito ? 'Oferta lançada' : 'Oferecer reposição'}</button>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {editRota && (
        <Modal open onClose={() => setEditRota(null)} title={editRota === 'nova' ? 'Nova rota' : `Editar ${editRota.nome}`}
          footer={<>
            {editRota !== 'nova' && <button className="btn btn-ghost" style={{ marginRight: 'auto', color: 'var(--red)' }} onClick={excluirRota}>Excluir</button>}
            <button className="btn btn-ghost" onClick={() => setEditRota(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={salvarRota}>Salvar</button>
          </>}>
          <div className="field"><label>Nome da rota</label><input value={formRota.nome} onChange={e => setFormRota({ ...formRota, nome: e.target.value })} placeholder="Ex.: Fronteira Oeste" /></div>
          <div className="field"><label>Municípios (separados por vírgula)</label>
            <textarea value={formRota.municipios} onChange={e => setFormRota({ ...formRota, municipios: e.target.value })} placeholder="Alegrete, Uruguaiana, São Gabriel" />
          </div>
          {semRota.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
              {semRota.filter(m => !formRota.municipios.split(',').some(x => normalizarMunicipio(x) === normalizarMunicipio(m))).map(m => (
                <button key={m} type="button" className="pill" onClick={() => setFormRota(f => ({ ...f, municipios: f.municipios.trim() ? `${f.municipios.trim().replace(/,$/, '')}, ${m}` : m }))}>+ {m}</button>
              ))}
            </div>
          )}
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>O cliente entra na rota pelo município cadastrado. Em Clientes, o gestor pode escolher outra rota para um cliente.</div>
          {msg && <div style={{ fontSize: 13, marginTop: 8, color: msg.tipo === 'erro' ? 'var(--red)' : 'var(--green-dark)' }}>{msg.texto}</div>}
        </Modal>
      )}
    </div>
  )
}
