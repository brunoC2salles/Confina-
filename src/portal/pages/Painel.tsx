import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useEstadoCache } from '@/lib/cacheTela'
import { useDadosFornecedor, nomeCliente } from '@/portal/useDadosFornecedor'
import { usePortal } from '@/portal/PortalContext'
import { ROTULO_STATUS, CLASSE_STATUS, fmtKg, fmtDataBr, hojeISO, somarDias, emAlerta, type PedidoFornecedor } from '@/core/parceiros'
import '@/portal/painel.css'

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const diaSemana = (iso: string) => DIAS[new Date(iso + 'T12:00:00Z').getUTCDay()]
const toneladas = (kg: number) => `${(kg / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} t`
const ORDEM_STATUS: Record<string, number> = { novo: 0, em_cotacao: 1, cotado: 2 }

interface LinhaCarga { data_entrega: string; quantidade_kg: number; rota_id: string | null }

// Painel da equipe em uma tela: indicadores, pedidos para atender, rupturas
// próximas e as cargas dos próximos 7 dias.
export default function Painel() {
  const { papel } = usePortal()
  const { fornecedor, clientes, produtos, pedidos, estoque, rotas, capacidadeKg, loading } = useDadosFornecedor()
  const [linhasCarga, setLinhasCarga] = useEstadoCache<LinhaCarga[] | null>(fornecedor ? `Painel:cargas:${fornecedor.id}` : null, null)

  const hoje = hojeISO()
  useEffect(() => {
    if (!fornecedor) return
    supabase.rpc('cargas_fornecedor', { fid: fornecedor.id, ate: somarDias(hojeISO(), 7) })
      .then(({ data, error }) => { if (!error) setLinhasCarga((data ?? []) as LinhaCarga[]) })
  }, [fornecedor, pedidos, setLinhasCarga])

  if (loading) return <div className="page"><div className="spinner" style={{ width: 28, height: 28, margin: '48px auto' }} /></div>

  const limite7 = somarDias(hoje, 7)
  const limite14 = somarDias(hoje, 14)
  const clientePorId = new Map(clientes.map(c => [c.id, c]))
  const produtoPorId = new Map(produtos.map(p => [p.id, p]))
  const ativos = clientes.filter(c => c.ativo)
  const novos = pedidos.filter(p => p.status === 'novo')
  const alertasNovos = novos.filter(p => p.origem === 'alerta').length
  const rupturas7 = estoque.filter(e => e.data_fim != null && e.data_fim <= limite7 && clientePorId.get(e.cliente_id)?.ativo)
  const demanda15 = estoque.reduce((s, e) => s + (e.consumo_dia_kg ?? 0) * 15, 0)

  const paraAtender = pedidos
    .filter(p => p.status in ORDEM_STATUS)
    .sort((a, b) => (a.origem === 'alerta' ? 0 : 1) - (b.origem === 'alerta' ? 0 : 1)
      || ORDEM_STATUS[a.status] - ORDEM_STATUS[b.status]
      || (a.data_entrega ?? '9999').localeCompare(b.data_entrega ?? '9999'))

  const rupturas = estoque
    .filter(e => e.data_fim != null && e.data_fim <= limite14 && clientePorId.get(e.cliente_id)?.ativo)
    .sort((a, b) => (a.data_fim ?? '').localeCompare(b.data_fim ?? ''))

  // Cargas dos próximos 7 dias: peso de todos os pedidos aprovados do
  // fornecedor por data e rota (atrasados contam para hoje).
  const cargas = (() => {
    const m = new Map<string, { data: string; rotaId: string | null; kg: number }>()
    for (const l of linhasCarga ?? []) {
      const data = l.data_entrega < hoje ? hoje : l.data_entrega
      if (data > limite7) continue
      const k = `${data}|${l.rota_id ?? ''}`
      const c = m.get(k) ?? { data, rotaId: l.rota_id, kg: 0 }
      c.kg += Number(l.quantidade_kg ?? 0)
      m.set(k, c)
    }
    return Array.from(m.values()).sort((a, b) => a.data.localeCompare(b.data) || b.kg - a.kg)
  })()
  const cargasAcima = cargas.filter(c => c.kg > capacidadeKg).length
  const nomeRota = (id: string | null) => id ? rotas.find(r => r.id === id)?.nome ?? 'Rota' : 'Sem rota'

  const dataCurta = (d: string | null) => d ? fmtDataBr(d).slice(0, 5) : null
  const subPedido = (p: PedidoFornecedor) =>
    [`#${p.numero}`, p.produto_nome, p.quantidade_kg != null ? fmtKg(p.quantidade_kg) : null].filter(Boolean).join(' · ')

  const dataHoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })

  return (
    <div className="pn">
      <div className="pn-topo">
        <h1>Painel<span>{papel === 'vendedor' ? 'Sua carteira de clientes' : 'Toda a carteira do fornecedor'}</span></h1>
        <div className="pn-data">{dataHoje.charAt(0).toUpperCase() + dataHoje.slice(1)}</div>
      </div>

      <div className="pn-faixa">
        <Link className="pn-kpi" to="/pedidos">
          <span className="pn-kpi-rot">Pedidos novos</span>
          <span className="pn-kpi-val">{novos.length}</span>
          <span className="pn-kpi-sub">{alertasNovos > 0 ? `${alertasNovos} de alerta de estoque` : 'aguardando atendimento'}</span>
        </Link>
        <Link className="pn-kpi" to="/clientes">
          <span className="pn-kpi-rot">Rupturas em 7 dias</span>
          <span className={`pn-kpi-val${rupturas7.length > 0 ? ' alerta' : ''}`}>{rupturas7.length}</span>
          <span className="pn-kpi-sub">produtos acabando nos clientes</span>
        </Link>
        <Link className="pn-kpi" to="/demanda">
          <span className="pn-kpi-rot">Demanda em 15 dias</span>
          <span className="pn-kpi-val">{toneladas(demanda15)}</span>
          <span className="pn-kpi-sub">consumo previsto da carteira</span>
        </Link>
        <Link className="pn-kpi" to="/clientes">
          <span className="pn-kpi-rot">Clientes conectados</span>
          <span className="pn-kpi-val">{ativos.length}</span>
          <span className="pn-kpi-sub">{ativos.filter(c => c.modo === 'confina').length} no Confina+ · {ativos.filter(c => c.modo === 'estoque').length} só estoque</span>
        </Link>
      </div>

      <div className="pn-grade">
        <section className="pn-bloco" aria-labelledby="pn-pedidos">
          <div className="pn-bloco-cab">
            <strong id="pn-pedidos">Pedidos para atender<span className="pn-n">{paraAtender.length}</span></strong>
            <Link to="/pedidos">Ver pedidos</Link>
          </div>
          {paraAtender.length === 0 ? <div className="pn-vazio">Nenhum pedido aguardando atendimento.</div> : (
            <ul className="pn-lista">
              {paraAtender.map(p => (
                <li key={p.id}>
                  <Link className="pn-item" to="/pedidos">
                    <div className="pn-item-txt">
                      <div className="pn-item-tit">{nomeCliente(clientePorId.get(p.cliente_id))}</div>
                      <div className="pn-item-sub">{subPedido(p)}</div>
                    </div>
                    <div className="pn-item-dir">
                      <span className={`badge ${CLASSE_STATUS[p.status]}`}>{ROTULO_STATUS[p.status]}</span>
                      <span className="pn-item-meta">{p.origem === 'alerta' && <span className="pn-tag">Alerta</span>}{p.data_entrega && <>entrega {dataCurta(p.data_entrega)}</>}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="pn-bloco" aria-labelledby="pn-rupturas">
          <div className="pn-bloco-cab">
            <strong id="pn-rupturas">Rupturas próximas<span className="pn-n">{rupturas.length}</span></strong>
            <Link to="/clientes">Ver clientes</Link>
          </div>
          {rupturas.length === 0 ? <div className="pn-vazio">Nenhum produto acabando nos próximos 14 dias.</div> : (
            <ul className="pn-lista">
              {rupturas.map(e => {
                const prod = produtoPorId.get(e.produto_id)
                const dias = Math.max(0, Math.floor(e.dias_cobertura ?? 0))
                const cor = prod && emAlerta(prod, e) ? 'vermelho' : dias < 10 ? 'ambar' : 'verde'
                return (
                  <li key={`${e.cliente_id}-${e.produto_id}`}>
                    <Link className="pn-item" to="/clientes">
                      <div className="pn-item-txt">
                        <div className="pn-item-tit">{nomeCliente(clientePorId.get(e.cliente_id))}</div>
                        <div className="pn-item-sub">{prod?.nome ?? 'Produto'} · acaba {dataCurta(e.data_fim)}</div>
                      </div>
                      <span className={`pn-dias ${cor}`}>{dias} {dias === 1 ? 'dia' : 'dias'}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        <section className="pn-bloco" aria-labelledby="pn-entregas">
          <div className="pn-bloco-cab">
            <strong id="pn-entregas">Próximas entregas{cargasAcima > 0 && <span className="pn-n pn-n-alerta">{cargasAcima} acima</span>}</strong>
            <Link to="/entregas">Ver entregas</Link>
          </div>
          {linhasCarga == null ? <div className="pn-vazio">Carregando cargas...</div>
            : cargas.length === 0 ? <div className="pn-vazio">Nenhuma entrega aprovada para os próximos 7 dias.</div> : (
              <ul className="pn-lista">
                {cargas.map(c => {
                  const acima = c.kg > capacidadeKg
                  return (
                    <li key={`${c.data}|${c.rotaId ?? ''}`}>
                      <Link className="pn-carga" to="/entregas">
                        <div className="pn-carga-lin">
                          <strong>{c.data === hoje ? 'Hoje' : `${diaSemana(c.data)} ${dataCurta(c.data)}`}<em>{nomeRota(c.rotaId)}</em></strong>
                          <span className={acima ? 'acima' : ''}>{toneladas(c.kg).replace(' t', '')} / {toneladas(capacidadeKg)}</span>
                        </div>
                        <div className="pn-barra"><div className={acima ? 'acima' : ''} style={{ width: `${Math.min(100, (c.kg / capacidadeKg) * 100)}%` }} /></div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
        </section>
      </div>
    </div>
  )
}
