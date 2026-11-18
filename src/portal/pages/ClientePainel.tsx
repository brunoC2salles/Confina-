import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { EmptyState, Modal } from '@/components/common/UI'
import { useAuth } from '@/contexts/AuthContext'
import { useParceiroCliente } from '@/hooks/useParceiroCliente'
import { useEstoqueGerenciado } from '@/components/parceiros/EstoqueGerenciado'
import { ModalSolicitar } from '@/components/parceiros/ModalSolicitar'
import {
  ROTULO_STATUS, emAlerta, fmtKg, fmtDataBr, hojeISO, somarDias,
  type PedidoFornecedor, type ProdutoFornecedor,
} from '@/core/parceiros'
import '@/portal/painel.css'

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const ABERTOS = ['novo', 'em_cotacao', 'cotado']
const dataLonga = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })
const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

// Painel do cliente só de estoque: calendário (fim de estoque, entregas
// aprovadas e pedidos em aberto), meus produtos com alertas e pedidos.
export default function ClientePainel() {
  const { user } = useAuth()
  const { vinculo, pedidos, loading, recarregarPedidos } = useParceiroCliente({ calcularEstoque: false })
  const est = useEstoqueGerenciado(vinculo?.cliente ?? null, vinculo?.produtos ?? [])
  const hoje = hojeISO()
  const [mes, setMes] = useState(hoje.slice(0, 7))
  const [dia, setDia] = useState<string | null>(null)
  const [solicitar, setSolicitar] = useState<ProdutoFornecedor | null>(null)
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null)

  const produtoPorId = useMemo(() => new Map((vinculo?.produtos ?? []).map(p => [p.id, p])), [vinculo])
  const fins = useMemo(() => {
    const m = new Map<string, ProdutoFornecedor[]>()
    for (const p of est.meus) { const d = est.linhas[p.id]?.data_fim; if (d) m.set(d, [...(m.get(d) ?? []), p]) }
    return m
  }, [est.meus, est.linhas])
  const porDia = (status: (p: PedidoFornecedor) => boolean) => {
    const m = new Map<string, PedidoFornecedor[]>()
    for (const p of pedidos) if (p.data_entrega && status(p)) m.set(p.data_entrega, [...(m.get(p.data_entrega) ?? []), p])
    return m
  }
  const entregas = useMemo(() => porDia(p => p.status === 'aprovado'), [pedidos])
  const abertos = useMemo(() => porDia(p => ABERTOS.includes(p.status)), [pedidos])

  if (loading || (est.loading && est.meus.length === 0 && est.lista.length === 0)) {
    return <div className="page"><div className="spinner" style={{ width: 28, height: 28, margin: '48px auto' }} /></div>
  }
  if (!vinculo) return <div className="page"><EmptyState icon="◻" title="Conta sem fornecedor" desc="Aceite o convite do fornecedor para usar o portal." /></div>

  const forn = vinculo.fornecedor.nome
  const alertas = est.meus.filter(p => emAlerta(p, est.linhas[p.id]))
  const pedidosAbertos = pedidos.filter(p => [...ABERTOS, 'aprovado'].includes(p.status))
    .sort((a, b) => (a.data_entrega ?? '9').localeCompare(b.data_entrega ?? '9'))
  const pedidoAberto = (pid: string) => pedidos.find(p => p.produto_id === pid && [...ABERTOS, 'aprovado'].includes(p.status))

  // Calendário: semanas de domingo a sábado cobrindo o mês.
  const [ano, mesN] = mes.split('-').map(Number)
  const fimMes = new Date(Date.UTC(ano, mesN, 0)).toISOString().slice(0, 10)
  const diaSem1 = new Date(Date.UTC(ano, mesN - 1, 1)).getUTCDay()
  const inicio = somarDias(`${mes}-01`, -diaSem1)
  const celulas = Array.from({ length: Math.ceil((diaSem1 + Number(fimMes.slice(8))) / 7) * 7 }, (_, i) => somarDias(inicio, i))
  const nomeMes = maiuscula(new Date(Date.UTC(ano, mesN - 1, 1)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }))
  const mudarMes = (delta: number) => setMes(new Date(Date.UTC(ano, mesN - 1 + delta, 1)).toISOString().slice(0, 7))

  const hora = new Date().getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
  const primeiroNome = String(user?.user_metadata?.nome ?? vinculo.cliente.responsavel ?? '').split(' ')[0]
  const linhaPedido = (p: PedidoFornecedor) => (
    <li key={p.id}>
      <div className="pn-txt">
        <div className="pn-l1">{p.produto_nome ?? produtoPorId.get(p.produto_id ?? '')?.nome ?? 'Produto'}</div>
        <div className="pn-l2">#{p.numero} · {fmtKg(p.quantidade_kg)}{p.data_entrega ? ` · entrega ${fmtDataBr(p.data_entrega)}` : ''}</div>
      </div>
      <span className="pn-dias" style={{ color: p.status === 'aprovado' ? 'var(--green-dark)' : 'var(--text-2)', fontWeight: 500 }}>{ROTULO_STATUS[p.status]}</span>
    </li>
  )

  return (
    <div className="pn">
      <div className="pn-topo">
        <div>
          <h1>{saudacao}{primeiroNome ? `, ${primeiroNome}` : ''}</h1>
          <p>{maiuscula(dataLonga(hoje))} · {forn}</p>
        </div>
        <div className="pn-acoes">
          <Link className="btn btn-secondary" to="/produtos">Ver produtos</Link>
        </div>
      </div>
      {aviso && <div style={{ fontSize: 13, color: aviso.tipo === 'erro' ? 'var(--red)' : 'var(--green-dark)' }}>{aviso.texto}</div>}

      <div className="pn-grade">
        <section className="pn-bloco" aria-labelledby="cp-cal">
          <div className="pn-cab">
            <div className="pn-cal-cab">
              <button type="button" className="pn-seta" aria-label="Mês anterior" onClick={() => mudarMes(-1)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <strong id="cp-cal">{nomeMes}</strong>
              <button type="button" className="pn-seta" aria-label="Próximo mês" onClick={() => mudarMes(1)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6" /></svg>
              </button>
            </div>
            {mes !== hoje.slice(0, 7) && <button type="button" className="pn-link" onClick={() => setMes(hoje.slice(0, 7))}>Voltar para hoje</button>}
          </div>
          <div className="pn-legenda">
            <span><i className="pn-ponto ent" />Entregas aprovadas</span>
            <span><i className="pn-ponto ped" />Pedidos em aberto</span>
            <span><i className="pn-ponto fim" />Fim de estoque</span>
          </div>
          <div className="pn-semana" aria-hidden="true">{DIAS.map(d => <span key={d}>{d}</span>)}</div>
          <div className="pn-mes">
            {celulas.map(d => {
              if (d.slice(0, 7) !== mes) return <div key={d} className="pn-celula fora"><span className="pn-dnum">{Number(d.slice(8))}</span></div>
              const nEnt = entregas.get(d)?.length ?? 0
              const nPed = abertos.get(d)?.length ?? 0
              const nFim = fins.get(d)?.length ?? 0
              return (
                <button key={d} type="button" className={`pn-celula${d === hoje ? ' hoje' : ''}${d < hoje ? ' passado' : ''}`} onClick={() => setDia(d)}
                  aria-label={`${fmtDataBr(d)}: ${nEnt} entregas, ${nPed} pedidos em aberto, ${nFim} produtos acabando`}>
                  <span className="pn-dnum">{Number(d.slice(8))}</span>
                  {nEnt > 0 && <span className="pn-ev"><i className="pn-ponto ent" /><b>{nEnt}</b><span className="txt">{nEnt === 1 ? 'entrega' : 'entregas'}</span></span>}
                  {nPed > 0 && <span className="pn-ev"><i className="pn-ponto ped" /><b>{nPed}</b><span className="txt">{nPed === 1 ? 'pedido' : 'pedidos'}</span></span>}
                  {nFim > 0 && <span className="pn-ev"><i className="pn-ponto fim" /><b>{nFim}</b><span className="txt">{nFim === 1 ? 'acaba' : 'acabam'}</span></span>}
                </button>
              )
            })}
          </div>
        </section>

        <div className="pn-col lateral">
          <section className="pn-bloco" aria-labelledby="cp-al">
            <div className="pn-cab"><strong id="cp-al">Alertas de estoque</strong><span className="pn-nota">{alertas.length ? `${alertas.length} produto${alertas.length > 1 ? 's' : ''}` : ''}</span></div>
            {alertas.length === 0 ? <div className="pn-vazio">Nenhum produto acabando.</div> : (
              <ul className="pn-lista">
                {alertas.map(p => {
                  const e = est.linhas[p.id]
                  const ped = pedidoAberto(p.id)
                  return (
                    <li key={p.id}>
                      <div className="pn-txt">
                        <div className="pn-l1">{p.nome}</div>
                        <div className="pn-l2">{e?.saldo_kg != null ? fmtKg(e.saldo_kg) : '—'} · acaba {fmtDataBr(e?.data_fim)}{ped ? ` · ${ROTULO_STATUS[ped.status].toLowerCase()}` : ''}</div>
                      </div>
                      {ped ? <span className="pn-dias" style={{ color: 'var(--red)' }}>{Math.floor(e?.dias_cobertura ?? 0)} dias</span>
                        : p.visivel && <button className="btn btn-primary btn-sm" onClick={() => { setAviso(null); setSolicitar(p) }}>Solicitar</button>}
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
          <section className="pn-bloco" aria-labelledby="cp-ped">
            <div className="pn-cab"><strong id="cp-ped">Pedidos em andamento</strong><Link to="/meus-pedidos">Ver todos</Link></div>
            {pedidosAbertos.length === 0 ? <div className="pn-vazio">Nenhum pedido em andamento.</div>
              : <ul className="pn-lista">{pedidosAbertos.slice(0, 5).map(linhaPedido)}</ul>}
          </section>
        </div>
      </div>

      <section className="pn-bloco" aria-labelledby="cp-prod">
        <div className="pn-cab"><strong id="cp-prod">Meus produtos</strong><Link to="/produtos">Gerenciar</Link></div>
        {est.meus.length === 0 ? <div className="pn-vazio">Nenhum produto ainda. Adicione em Produtos.</div> : (
          <ul className="pn-lista">
            {est.meus.map(p => {
              const e = est.linhas[p.id]
              const alerta = emAlerta(p, e)
              return (
                <li key={p.id}>
                  <div className="pn-txt">
                    <div className="pn-l1">{p.nome}</div>
                    <div className="pn-l2">Saldo {e?.saldo_kg != null ? fmtKg(e.saldo_kg) : '—'} · consumo {e?.consumo_dia_kg ? `${fmtKg(e.consumo_dia_kg)}/dia` : '—'} · fim {fmtDataBr(e?.data_fim)}</div>
                  </div>
                  {e?.dias_cobertura != null ? <span className={`badge ${alerta ? 'badge-red' : 'badge-green'}`} style={{ whiteSpace: 'nowrap', flexShrink: 0 }}>{Math.floor(e.dias_cobertura)} dias</span> : <span className="pn-zero" style={{ fontSize: 12 }}>sem previsão</span>}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {dia && (
        <Modal open onClose={() => setDia(null)} title={maiuscula(dataLonga(dia))}>
          <div className="pn-pop">
            <h3><i className="pn-ponto ent" />Entregas aprovadas</h3>
            {(entregas.get(dia) ?? []).length === 0 ? <div className="pn-pop-vazio">Nenhuma entrega neste dia.</div>
              : <ul className="pn-lista">{(entregas.get(dia) ?? []).map(linhaPedido)}</ul>}
            <h3><i className="pn-ponto ped" />Pedidos em aberto</h3>
            {(abertos.get(dia) ?? []).length === 0 ? <div className="pn-pop-vazio">Nenhum pedido em aberto para este dia.</div>
              : <ul className="pn-lista">{(abertos.get(dia) ?? []).map(linhaPedido)}</ul>}
            <h3><i className="pn-ponto fim" />Fim de estoque</h3>
            {(fins.get(dia) ?? []).length === 0 ? <div className="pn-pop-vazio">Nenhum produto acaba neste dia.</div> : (
              <ul className="pn-lista">
                {(fins.get(dia) ?? []).map(p => (
                  <li key={p.id}>
                    <div className="pn-txt">
                      <div className="pn-l1">{p.nome}</div>
                      <div className="pn-l2">Saldo {fmtKg(est.linhas[p.id]?.saldo_kg ?? 0)}{pedidoAberto(p.id) ? ` · ${ROTULO_STATUS[pedidoAberto(p.id)!.status].toLowerCase()}` : ''}</div>
                    </div>
                    {!pedidoAberto(p.id) && p.visivel && <button className="btn btn-primary btn-sm" onClick={() => { setDia(null); setAviso(null); setSolicitar(p) }}>Solicitar</button>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Modal>
      )}

      {solicitar && (
        <ModalSolicitar produto={solicitar} estoque={est.linhas[solicitar.id]} cliente={vinculo.cliente} fornecedorNome={forn}
          onClose={() => setSolicitar(null)}
          onCriado={(_p, a) => {
            setSolicitar(null)
            setAviso({ tipo: a ? 'erro' : 'ok', texto: a ?? `Solicitação enviada à ${forn}. Acompanhe em Pedidos.` })
            recarregarPedidos(); est.carregar()
          }} />
      )}
    </div>
  )
}
