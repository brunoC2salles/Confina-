import { useState, useMemo, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { Modal, PageHeader, EmptyState } from '@/components/common/UI'
import { useDadosFornecedor, nomeCliente } from '@/portal/useDadosFornecedor'
import { usePortal } from '@/portal/PortalContext'
import { chamarApiParceiros } from '@/lib/parceirosApi'
import {
  rotaDoCliente, rotaDoPedido, fmtKg, fmtDataBr, hojeISO, somarDias, criarPedido, quantidadeSugerida, normalizarMunicipio, linkWhatsApp,
  type RotaEntrega, type PedidoFornecedor, type ClienteFornecedor, type EstoqueCliente,
} from '@/core/parceiros'

const SEM_ROTA = 'sem-rota'
const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const diaSemana = (iso: string) => DIAS_SEMANA[new Date(iso + 'T12:00:00Z').getUTCDay()]
const toneladas = (kg: number) => `${(kg / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} t`

// kg: pedidos que o usuário vê; kgTotal: todos os pedidos aprovados do
// fornecedor na mesma data e rota (de outros vendedores, só o peso).
interface Carga { data: string; rota: RotaEntrega | null; pedidos: PedidoFornecedor[]; kg: number; kgTotal: number }
interface LinhaCarga { pedido_id: string; data_entrega: string; quantidade_kg: number; rota_id: string | null }
interface Movimento { pedido: PedidoFornecedor; data: string; rotaId: string | null; aviso: string | null; marcado: boolean }
const chave = (data: string, rotaId: string | null | undefined) => `${data}|${rotaId ?? SEM_ROTA}`

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
  const { membro } = usePortal()
  const [linhasCarga, setLinhasCarga] = useState<LinhaCarga[] | null>(null)
  const [ajustar, setAjustar] = useState<PedidoFornecedor | null>(null)
  const [sugestao, setSugestao] = useState<{ carga: Carga; movimentos: Movimento[]; sobra: number } | null>(null)
  const [avisos, setAvisos] = useState<Array<{ cliente: ClienteFornecedor; pedidos: PedidoFornecedor[] }> | null>(null)

  const clientePorId = useMemo(() => new Map(clientes.map(c => [c.id, c])), [clientes])
  const produtoPorId = useMemo(() => new Map(produtos.map(p => [p.id, p])), [produtos])
  const rotaDe = (c: ClienteFornecedor | undefined) => c ? rotaDoCliente(c, rotas) : null

  const hoje = hojeISO()
  const ate = somarDias(hoje, dias)
  const rotaPorId = useMemo(() => new Map(rotas.map(r => [r.id, r])), [rotas])

  // Peso de todos os pedidos aprovados do fornecedor (até 30 dias além do
  // período, para as sugestões de nova data).
  const carregarCargas = useCallback(async () => {
    if (!fornecedor) return
    const { data, error } = await supabase.rpc('cargas_fornecedor', { fid: fornecedor.id, ate: somarDias(hojeISO(), 60) })
    setLinhasCarga(error ? null : ((data ?? []) as LinhaCarga[]).map(l => ({ ...l, quantidade_kg: Number(l.quantidade_kg ?? 0) })))
  }, [fornecedor])
  useEffect(() => { carregarCargas() }, [carregarCargas, pedidos])

  // Total por data e rota. Sem a função do banco, usa os pedidos visíveis.
  const totais = useMemo(() => {
    const m = new Map<string, number>()
    const base: LinhaCarga[] = linhasCarga ?? pedidos.filter(p => p.status === 'aprovado' && p.data_entrega)
      .map(p => ({ pedido_id: p.id, data_entrega: p.data_entrega as string, quantidade_kg: Number(p.quantidade_kg ?? 0), rota_id: rotaDoPedido(p, clientePorId.get(p.cliente_id), rotas)?.id ?? null }))
    for (const l of base) {
      const d = l.data_entrega < hoje ? hoje : l.data_entrega
      const k = chave(d, l.rota_id)
      m.set(k, (m.get(k) ?? 0) + l.quantidade_kg)
    }
    return m
  }, [linhasCarga, pedidos, clientePorId, rotas, hoje])

  const cargas = useMemo(() => {
    const mapa = new Map<string, Carga>()
    for (const p of pedidos) {
      if (p.status !== 'aprovado' || !p.data_entrega || p.data_entrega > ate) continue
      const r = rotaDoPedido(p, clientePorId.get(p.cliente_id), rotas)
      if (filtroRota !== 'todas' && (r?.id ?? SEM_ROTA) !== filtroRota) continue
      const data = p.data_entrega < hoje ? hoje : p.data_entrega
      const k = chave(data, r?.id)
      const carga = mapa.get(k) ?? { data, rota: r, pedidos: [], kg: 0, kgTotal: 0 }
      carga.pedidos.push(p)
      carga.kg += Number(p.quantidade_kg ?? 0)
      mapa.set(k, carga)
    }
    // Cargas só com pedidos de outros vendedores também ocupam a data.
    for (const [k, kg] of totais) {
      const [data, rid] = k.split('|')
      if (data > ate || mapa.has(k)) continue
      if (filtroRota !== 'todas' && rid !== filtroRota) continue
      mapa.set(k, { data, rota: rid === SEM_ROTA ? null : rotaPorId.get(rid) ?? null, pedidos: [], kg: 0, kgTotal: kg })
    }
    for (const [k, c] of mapa) c.kgTotal = Math.max(c.kg, totais.get(k) ?? c.kg)
    return Array.from(mapa.values()).sort((a, b) => a.data.localeCompare(b.data) || (a.rota?.nome ?? 'zz').localeCompare(b.rota?.nome ?? 'zz'))
  }, [pedidos, clientePorId, rotas, rotaPorId, filtroRota, ate, hoje, totais])

  const estoqueDe = (p: PedidoFornecedor) => estoque.find(e => e.cliente_id === p.cliente_id && e.produto_id === p.produto_id) ?? null
  const rotaAtualId = (p: PedidoFornecedor) => rotaDoPedido(p, clientePorId.get(p.cliente_id), rotas)?.id ?? null

  // Peso projetado de uma carga com mudanças planejadas (pedidos que saem e entram).
  const projetar = (mudancas: Array<{ pedido: PedidoFornecedor; kg: number; data: string; rotaId: string | null }>) => {
    const m = new Map(totais)
    for (const x of mudancas) {
      const de = chave((x.pedido.data_entrega as string) < hoje ? hoje : x.pedido.data_entrega as string, rotaAtualId(x.pedido))
      m.set(de, (m.get(de) ?? 0) - x.kg)
      const para = chave(x.data < hoje ? hoje : x.data, x.rotaId)
      m.set(para, (m.get(para) ?? 0) + x.kg)
    }
    return m
  }

  // Sugestão para carga acima do limite: tira os pedidos do usuário com mais
  // folga de estoque e leva cada um ao primeiro dia (até 14 dias depois) em
  // que a mesma rota tem espaço e o estoque do cliente ainda não acabou.
  const sugerir = (carga: Carga) => {
    const rotaId = carga.rota?.id ?? null
    const folga = (p: PedidoFornecedor) => estoqueDe(p)?.data_fim ?? '9999-12-31'
    const candidatos = [...carga.pedidos].sort((a, b) => folga(b).localeCompare(folga(a)) || Number(b.quantidade_kg ?? 0) - Number(a.quantidade_kg ?? 0))
    const planejado = new Map(totais)
    let excesso = carga.kgTotal - capacidadeKg
    const movimentos: Movimento[] = []
    for (const p of candidatos) {
      if (excesso <= 0) break
      const kg = Number(p.quantidade_kg ?? 0)
      const fim = estoqueDe(p)?.data_fim ?? null
      for (let d = 1; d <= 14; d++) {
        const data = somarDias(carga.data, d)
        if (fim && data > fim) break
        const k = chave(data, rotaId)
        if ((planejado.get(k) ?? 0) + kg > capacidadeKg) continue
        planejado.set(k, (planejado.get(k) ?? 0) + kg)
        planejado.set(chave(carga.data, rotaId), (planejado.get(chave(carga.data, rotaId)) ?? 0) - kg)
        movimentos.push({ pedido: p, data, rotaId: p.rota_entrega_id, aviso: null, marcado: true })
        excesso -= kg
        break
      }
    }
    setMsg(null)
    setSugestao({ carga, movimentos, sobra: Math.max(0, excesso) })
  }

  // Avisa os clientes por e-mail e prepara as mensagens de WhatsApp.
  const avisarClientes = async (ids: string[]) => {
    if (ids.length === 0) return
    const { data } = await supabase.from('fornecedor_pedidos').select('*').in('id', ids)
    const atualizados = (data ?? []) as PedidoFornecedor[]
    const r = await chamarApiParceiros('entrega_reprogramada', { pedido_ids: ids })
    const porCliente = new Map<string, PedidoFornecedor[]>()
    for (const p of atualizados) porCliente.set(p.cliente_id, [...(porCliente.get(p.cliente_id) ?? []), p])
    setAvisos(Array.from(porCliente.entries()).map(([cid, ps]) => ({ cliente: clientePorId.get(cid)!, pedidos: ps })).filter(x => x.cliente))
    if (r.error) setMsg({ tipo: 'erro', texto: `Entrega ajustada, mas o e-mail ao cliente falhou: ${r.error}` })
    else if (r.demo) setMsg({ tipo: 'ok', texto: 'Entrega ajustada. Conta de demonstração: o e-mail ao cliente não é enviado.' })
    else setMsg({ tipo: 'ok', texto: 'Entrega ajustada e cliente avisado por e-mail.' })
  }

  const aplicarSugestao = async () => {
    if (!sugestao) return
    const marcados = sugestao.movimentos.filter(m => m.marcado)
    for (const m of marcados) {
      const { error } = await supabase.from('fornecedor_pedidos').update({ data_entrega: m.data }).eq('id', m.pedido.id)
      if (error) { setMsg({ tipo: 'erro', texto: error.message }); recarregar(); return }
    }
    setSugestao(null)
    recarregar()
    await avisarClientes(marcados.map(m => m.pedido.id))
  }

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
  const totalPeriodo = cargas.reduce((s, c) => s + c.kgTotal, 0)

  return (
    <div className="page">
      <PageHeader title="Entregas" subtitle="Pedidos aprovados por data e rota, capacidade de carga e romaneio" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 20 }}>
        <div className="card">
          <div className="flex-between" style={{ marginBottom: 10 }}>
            <strong>Rotas</strong>
            <button className="btn btn-ghost btn-sm" onClick={() => abrirRota('nova')}>+ Nova rota</button>
          </div>
          {rotas.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Nenhuma rota. Crie rotas com os municípios atendidos.</div> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {rotas.map(r => {
                const n = clientes.filter(c => c.ativo && rotaDe(c)?.id === r.id).length
                return (
                  <div key={r.id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                    <div className="flex-between" style={{ fontSize: 13 }}>
                      <strong>{r.nome}</strong>
                      <span style={{ color: 'var(--text-3)' }}>{n} cliente{n !== 1 ? 's' : ''}<button className="btn btn-ghost btn-sm" style={{ marginLeft: 8 }} onClick={() => abrirRota(r)}>Editar</button></span>
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
            const acima = carga.kgTotal > capacidadeKg
            const sug = sugestoes(carga)
            const chaveRota = carga.rota?.id ?? SEM_ROTA
            const outros = Math.max(0, carga.kgTotal - carga.kg)
            return (
              <div key={`${carga.data}|${chaveRota}`} className="card" style={{ borderColor: acima ? 'var(--red)' : undefined }}>
                <div className="flex-between" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 10 }}>
                  <div>
                    <strong style={{ fontSize: 15 }}>{fmtDataBr(carga.data)} ({diaSemana(carga.data)}) · {carga.rota?.nome ?? 'Sem rota'}</strong>
                    <div style={{ fontSize: 12, color: acima ? 'var(--red)' : 'var(--text-2)', marginTop: 2 }}>
                      {toneladas(carga.kgTotal)} de {toneladas(capacidadeKg)}{acima ? ` · acima da capacidade em ${toneladas(carga.kgTotal - capacidadeKg)}` : ` · ${Math.round((carga.kgTotal / capacidadeKg) * 100)}% da carga`}
                    </div>
                    <div style={{ height: 6, width: 260, maxWidth: '100%', background: 'var(--gray-100)', borderRadius: 4, marginTop: 6 }}>
                      <div style={{ width: `${Math.min(100, (carga.kgTotal / capacidadeKg) * 100)}%`, height: '100%', borderRadius: 4, background: acima ? 'var(--red)' : 'var(--green)' }} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {acima && carga.pedidos.length > 0 && <button className="btn btn-primary btn-sm" onClick={() => sugerir(carga)}>Sugerir redistribuição</button>}
                    {carga.pedidos.length > 0 && <Link className="btn btn-secondary btn-sm" to={`/romaneio?data=${carga.data}&rota=${chaveRota}`}>Romaneio</Link>}
                  </div>
                </div>
                {carga.pedidos.length > 0 && (
                <div className="table-wrap"><table>
                  <thead><tr><th>Nº</th><th>Cliente</th><th>Município</th><th>Produto</th><th>Quantidade</th><th></th></tr></thead>
                  <tbody>{carga.pedidos.map(p => {
                    const c = clientePorId.get(p.cliente_id)
                    return (
                      <tr key={p.id}>
                        <td>#{p.numero}</td>
                        <td><strong>{nomeCliente(c)}</strong>
                          {p.data_entrega && p.data_entrega < hoje && <div style={{ fontSize: 11, color: 'var(--red)' }}>Atrasado (era {fmtDataBr(p.data_entrega)})</div>}
                          {p.rota_entrega_id && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Rota só desta entrega</div>}
                        </td>
                        <td>{c?.municipio ?? '—'}</td>
                        <td>{p.produto_nome ?? '—'}</td>
                        <td>{fmtKg(p.quantidade_kg)}</td>
                        <td style={{ textAlign: 'right' }}><button className="btn btn-ghost btn-sm" onClick={() => { setMsg(null); setAjustar(p) }}>Ajustar</button></td>
                      </tr>
                    )
                  })}</tbody>
                </table></div>
                )}
                {outros > 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 8 }}>
                    {carga.pedidos.length > 0 ? 'Mais ' : ''}{toneladas(outros)} de pedidos de outros vendedores nesta carga.
                  </div>
                )}
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

      {ajustar && (
        <ModalAjustar pedido={ajustar} cliente={clientePorId.get(ajustar.cliente_id)} rotas={rotas} capacidadeKg={capacidadeKg}
          rotaAtual={rotaAtualId(ajustar)} estoqueFim={estoqueDe(ajustar)?.data_fim ?? null} projetar={projetar} hoje={hoje}
          onClose={() => setAjustar(null)}
          onSalvo={async ids => { setAjustar(null); recarregar(); await avisarClientes(ids) }} />
      )}

      {sugestao && (
        <Modal open size="lg" onClose={() => setSugestao(null)} title={`Redistribuir a carga de ${fmtDataBr(sugestao.carga.data)} · ${sugestao.carga.rota?.nome ?? 'Sem rota'}`}
          subtitle={`${toneladas(sugestao.carga.kgTotal)} programadas para ${toneladas(capacidadeKg)} de capacidade`}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setSugestao(null)}>Cancelar</button>
            <button className="btn btn-primary" disabled={!sugestao.movimentos.some(m => m.marcado)} onClick={aplicarSugestao}>Aplicar e avisar clientes</button>
          </>}>
          {sugestao.movimentos.length === 0
            ? <div style={{ fontSize: 13 }}>Nenhum pedido seu cabe nos próximos 14 dias desta rota sem passar do limite ou do fim do estoque do cliente. Use Ajustar para dividir um pedido ou mudar a rota.</div>
            : (
              <div className="table-wrap"><table>
                <thead><tr><th></th><th>Pedido</th><th>Cliente</th><th>Quantidade</th><th>Nova data</th></tr></thead>
                <tbody>{sugestao.movimentos.map((m, i) => (
                  <tr key={m.pedido.id}>
                    <td><input type="checkbox" checked={m.marcado} aria-label={`Mover pedido ${m.pedido.numero}`}
                      onChange={e => setSugestao(s => s && ({ ...s, movimentos: s.movimentos.map((x, j) => j === i ? { ...x, marcado: e.target.checked } : x) }))} /></td>
                    <td>#{m.pedido.numero} · {m.pedido.produto_nome ?? '—'}</td>
                    <td>{nomeCliente(clientePorId.get(m.pedido.cliente_id))}</td>
                    <td>{fmtKg(m.pedido.quantidade_kg)}</td>
                    <td>{fmtDataBr(m.data)} ({diaSemana(m.data)}){estoqueDe(m.pedido)?.data_fim && <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Estoque até {fmtDataBr(estoqueDe(m.pedido)?.data_fim ?? null)}</div>}</td>
                  </tr>
                ))}</tbody>
              </table></div>
            )}
          {(() => {
            const marcados = sugestao.movimentos.filter(m => m.marcado).reduce((s, m) => s + Number(m.pedido.quantidade_kg ?? 0), 0)
            const fica = sugestao.carga.kgTotal - marcados
            return (
              <div style={{ fontSize: 13, marginTop: 12, color: fica > capacidadeKg ? 'var(--red)' : 'var(--green-dark)' }}>
                A carga fica com {toneladas(fica)}{fica > capacidadeKg ? `, ainda ${toneladas(fica - capacidadeKg)} acima. Ajuste outro pedido: divida ou mude a rota.` : ', dentro da capacidade.'}
              </div>
            )
          })()}
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>Só pedidos dos seus clientes são movidos. Os clientes recebem e-mail com a nova data.</div>
        </Modal>
      )}

      {avisos && avisos.length > 0 && (
        <Modal open onClose={() => setAvisos(null)} title="Avisar pelo WhatsApp" subtitle="Mensagens prontas com a nova data de entrega"
          footer={<button className="btn btn-primary" onClick={() => setAvisos(null)}>Concluir</button>}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {avisos.map(({ cliente, pedidos: ps }) => {
              const itens = ps.map(p => `pedido #${p.numero} (${p.produto_nome ?? 'produto'}, ${fmtKg(p.quantidade_kg)}) para ${fmtDataBr(p.data_entrega)}`).join('; ')
              const zap = linkWhatsApp(cliente.telefone, `Olá ${cliente.responsavel ?? ''}, aqui é ${membro?.nome ?? ''} da ${fornecedor?.nome ?? ''}. Reprogramamos a entrega: ${itens}.`)
              return (
                <div key={cliente.id} className="flex-between" style={{ fontSize: 13, gap: 8, flexWrap: 'wrap', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                  <span><strong>{nomeCliente(cliente)}</strong> · {ps.map(p => `#${p.numero} em ${fmtDataBr(p.data_entrega)}`).join(', ')}</span>
                  {zap ? <a className="btn btn-primary btn-sm" href={zap} target="_blank" rel="noreferrer">Enviar no WhatsApp</a> : <span style={{ color: 'var(--text-3)' }}>Sem telefone</span>}
                </div>
              )
            })}
          </div>
        </Modal>
      )}

      {editRota && (
        <Modal open onClose={() => setEditRota(null)} title={editRota === 'nova' ? 'Nova rota' : `Editar ${editRota.nome}`}
          footer={<>
            {editRota !== 'nova' && gestor && <button className="btn btn-ghost" style={{ marginRight: 'auto', color: 'var(--red)' }} onClick={excluirRota}>Excluir</button>}
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
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>O cliente entra na rota pelo município cadastrado. Em Clientes, o gestor pode escolher outra rota para um cliente; em cada entrega, a equipe pode mudar a rota só daquele pedido.</div>
          {msg && <div style={{ fontSize: 13, marginTop: 8, color: msg.tipo === 'erro' ? 'var(--red)' : 'var(--green-dark)' }}>{msg.texto}</div>}
        </Modal>
      )}
    </div>
  )
}

// Ajuste de um pedido da agenda: nova data, rota só desta entrega e divisão
// (parte da quantidade em outra data e rota). Mostra o peso das cargas
// afetadas antes de salvar.
function ModalAjustar({ pedido, cliente, rotas, capacidadeKg, rotaAtual, estoqueFim, projetar, hoje, onClose, onSalvo }: {
  pedido: PedidoFornecedor
  cliente: ClienteFornecedor | undefined
  rotas: RotaEntrega[]
  capacidadeKg: number
  rotaAtual: string | null
  estoqueFim: string | null
  projetar: (m: Array<{ pedido: PedidoFornecedor; kg: number; data: string; rotaId: string | null }>) => Map<string, number>
  hoje: string
  onClose: () => void
  onSalvo: (idsAvisar: string[]) => void
}) {
  const dataOriginal = pedido.data_entrega && pedido.data_entrega >= hoje ? pedido.data_entrega : hoje
  const [data, setData] = useState(dataOriginal)
  const [rota, setRota] = useState(pedido.rota_entrega_id ?? '')
  const [dividir, setDividir] = useState(false)
  const [kgMover, setKgMover] = useState('')
  const [dataParte, setDataParte] = useState(somarDias(dataOriginal, 1))
  const [rotaParte, setRotaParte] = useState(pedido.rota_entrega_id ?? '')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const total = Number(pedido.quantidade_kg ?? 0)
  const mover = dividir ? Number(kgMover.replace(',', '.')) || 0 : 0
  const rotaCliente = cliente ? rotaDoCliente(cliente, rotas) : null
  const efetiva = (r: string) => r || rotaCliente?.id || null
  const nomeRota = (id: string | null) => id ? rotas.find(r => r.id === id)?.nome ?? 'Rota' : 'Sem rota'

  const mudancas = [
    { pedido, kg: total - mover, data, rotaId: efetiva(rota) },
    ...(mover > 0 ? [{ pedido, kg: mover, data: dataParte, rotaId: efetiva(rotaParte) }] : []),
  ]
  const proj = projetar(mudancas)
  const afetadas = Array.from(new Set([chave(dataOriginal, rotaAtual), ...mudancas.map(m => chave(m.data < hoje ? hoje : m.data, m.rotaId))]))

  const salvar = async () => {
    setErro(null)
    if (!data) { setErro('Informe a data de entrega'); return }
    if (dividir && !(mover > 0 && mover < total)) { setErro('A quantidade a mover deve ser maior que zero e menor que a do pedido'); return }
    if (dividir && !dataParte) { setErro('Informe a data da outra parte'); return }
    setSalvando(true)
    const avisar: string[] = []
    const { error } = await supabase.from('fornecedor_pedidos').update({ data_entrega: data, rota_entrega_id: rota || null }).eq('id', pedido.id)
    if (error) { setSalvando(false); setErro(error.message); return }
    if (data !== pedido.data_entrega) avisar.push(pedido.id)
    if (dividir) {
      const { data: novo, error: e2 } = await supabase.rpc('dividir_pedido', { pid: pedido.id, kg_mover: mover, nova_data: dataParte, nova_rota: rotaParte || null })
      if (e2) { setSalvando(false); setErro(e2.message); return }
      if (!avisar.includes(pedido.id)) avisar.push(pedido.id)
      if (novo) avisar.push(novo as string)
    }
    setSalvando(false)
    onSalvo(avisar)
  }

  const seletorRota = (valor: string, set: (v: string) => void) => (
    <select value={valor} onChange={e => set(e.target.value)}>
      <option value="">Rota do cliente ({rotaCliente?.nome ?? 'sem rota'})</option>
      {rotas.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
    </select>
  )

  return (
    <Modal open onClose={onClose} title={`Ajustar pedido #${pedido.numero}`} subtitle={`${nomeCliente(cliente)} · ${pedido.produto_nome ?? '—'} · ${fmtKg(total)}`}
      footer={<>
        <button className="btn btn-ghost" onClick={onClose}>Cancelar</button>
        <button className="btn btn-primary" disabled={salvando} onClick={salvar}>{salvando ? 'Salvando...' : 'Salvar e avisar cliente'}</button>
      </>}>
      <div className="form-row-2">
        <div className="field"><label>Data de entrega</label><input type="date" value={data} min={hoje} onChange={e => setData(e.target.value)} /></div>
        <div className="field"><label>Rota desta entrega</label>{seletorRota(rota, setRota)}</div>
      </div>
      {estoqueFim && <div style={{ fontSize: 12, color: data > estoqueFim ? 'var(--red)' : 'var(--text-3)', marginBottom: 10 }}>Estoque do cliente previsto até {fmtDataBr(estoqueFim)}{data > estoqueFim ? ': a entrega fica depois do fim do estoque.' : '.'}</div>}

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, margin: '4px 0 10px' }}>
        <input type="checkbox" checked={dividir} onChange={e => setDividir(e.target.checked)} /> Dividir o pedido em duas entregas
      </label>
      {dividir && (
        <div className="form-row-3">
          <div className="field"><label>Quantidade para a outra entrega (kg)</label><input type="number" value={kgMover} onChange={e => setKgMover(e.target.value)} placeholder={`Até ${fmtKg(total)}`} /></div>
          <div className="field"><label>Data da outra entrega</label><input type="date" value={dataParte} min={hoje} onChange={e => setDataParte(e.target.value)} /></div>
          <div className="field"><label>Rota da outra entrega</label>{seletorRota(rotaParte, setRotaParte)}</div>
        </div>
      )}

      <div style={{ background: 'var(--gray-50)', borderRadius: 8, padding: '10px 12px', fontSize: 13 }}>
        <div style={{ fontWeight: 600, marginBottom: 6 }}>Cargas depois do ajuste</div>
        {afetadas.map(k => {
          const [d, r] = k.split('|')
          const kg = Math.max(0, proj.get(k) ?? 0)
          const acima = kg > capacidadeKg
          return (
            <div key={k} className="flex-between" style={{ padding: '2px 0', color: acima ? 'var(--red)' : undefined }}>
              <span>{fmtDataBr(d)} ({diaSemana(d)}) · {nomeRota(r === SEM_ROTA ? null : r)}</span>
              <span>{toneladas(kg)} de {toneladas(capacidadeKg)}{acima ? ' · acima' : ''}</span>
            </div>
          )
        })}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 8 }}>A rota desta entrega não muda o cadastro do cliente. O cliente recebe e-mail com a nova data.</div>
      {erro && <div className="field-error" style={{ marginTop: 8 }}>{erro}</div>}
    </Modal>
  )
}
