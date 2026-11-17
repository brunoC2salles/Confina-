import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useEstadoCache } from '@/lib/cacheTela'
import { Modal } from '@/components/common/UI'
import { useDadosFornecedor, nomeCliente } from '@/portal/useDadosFornecedor'
import { usePortal } from '@/portal/PortalContext'
import {
  ROTULO_STATUS, fmtKg, fmtDataBr, hojeISO, somarDias, linkWhatsApp, rotaDoPedido,
  type PedidoFornecedor, type EstoqueCliente,
} from '@/core/parceiros'
import '@/portal/painel.css'

const DIAS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const diaSemana = (iso: string) => DIAS[new Date(iso + 'T12:00:00Z').getUTCDay()]
const toneladas = (kg: number) => `${(kg / 1000).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} t`
const dataCurta = (d: string | null) => d ? fmtDataBr(d).slice(0, 5) : '—'
const ABERTOS = ['novo', 'em_cotacao', 'cotado']
const dataLonga = (iso: string) => new Date(iso + 'T12:00:00Z').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' })

interface LinhaCarga { data_entrega: string; quantidade_kg: number; rota_id: string | null }

// Painel da equipe: calendário do mês (entregas, pedidos em aberto e fim de
// estoque por dia, com o detalhe do dia em pop-up), números, entregas da
// semana e as listas de pedidos e reposição.
export default function Painel() {
  const { papel, membro } = usePortal()
  const { fornecedor, clientes, produtos, pedidos, estoque, rotas, capacidadeKg, loading } = useDadosFornecedor()
  const hoje = hojeISO()
  const [mes, setMes] = useState(hoje.slice(0, 7))
  const [diaAberto, setDiaAberto] = useState<string | null>(null)
  const [abaPed, setAbaPed] = useState<'novo' | 'em_cotacao' | 'cotado'>('novo')
  const [abaRep, setAbaRep] = useState<7 | 14>(7)

  // Peso de todos os pedidos aprovados do fornecedor até o fim do mês visto.
  const fimMes = (() => { const [a, m] = mes.split('-').map(Number); return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10) })()
  const ate = fimMes > somarDias(hoje, 7) ? fimMes : somarDias(hoje, 7)
  const [linhasCarga, setLinhasCarga] = useEstadoCache<LinhaCarga[] | null>(fornecedor ? `Painel:cargas:${fornecedor.id}:${ate}` : null, null)
  useEffect(() => {
    if (!fornecedor) return
    supabase.rpc('cargas_fornecedor', { fid: fornecedor.id, ate })
      .then(({ data, error }) => { if (!error) setLinhasCarga(((data ?? []) as LinhaCarga[]).map(l => ({ ...l, quantidade_kg: Number(l.quantidade_kg ?? 0) }))) })
  }, [fornecedor, pedidos, ate, setLinhasCarga])

  const clientePorId = useMemo(() => new Map(clientes.map(c => [c.id, c])), [clientes])
  const produtoPorId = useMemo(() => new Map(produtos.map(p => [p.id, p])), [produtos])

  // Índices por dia.
  const cargasPorDia = useMemo(() => {
    const m = new Map<string, Map<string | null, number>>()
    for (const l of linhasCarga ?? []) {
      const d = l.data_entrega < hoje ? hoje : l.data_entrega
      const rotasDia = m.get(d) ?? new Map<string | null, number>()
      rotasDia.set(l.rota_id, (rotasDia.get(l.rota_id) ?? 0) + l.quantidade_kg)
      m.set(d, rotasDia)
    }
    return m
  }, [linhasCarga, hoje])
  const abertos = useMemo(() => pedidos.filter(p => ABERTOS.includes(p.status)), [pedidos])
  const abertosPorDia = useMemo(() => {
    const m = new Map<string, PedidoFornecedor[]>()
    for (const p of abertos) if (p.data_entrega) m.set(p.data_entrega, [...(m.get(p.data_entrega) ?? []), p])
    return m
  }, [abertos])
  const estoqueAtivo = useMemo(() => estoque.filter(e => !!clientePorId.get(e.cliente_id)?.ativo), [estoque, clientePorId])
  const finsPorDia = useMemo(() => {
    const m = new Map<string, EstoqueCliente[]>()
    for (const e of estoqueAtivo) if (e.data_fim) m.set(e.data_fim, [...(m.get(e.data_fim) ?? []), e])
    return m
  }, [estoqueAtivo])

  if (loading) return <div className="page"><div className="spinner" style={{ width: 28, height: 28, margin: '48px auto' }} /></div>

  const consumoDia = estoqueAtivo.reduce((s, e) => s + (e.consumo_dia_kg ?? 0), 0)
  const nomeRota = (id: string | null) => id ? rotas.find(r => r.id === id)?.nome ?? 'Rota' : 'Sem rota'

  // Pedido em aberto ou aprovado do cliente para o produto (situação na reposição).
  const situacao = (e: EstoqueCliente) => {
    const p = pedidos.find(x => x.cliente_id === e.cliente_id && x.produto_id === e.produto_id && [...ABERTOS, 'aprovado'].includes(x.status))
    if (!p) return 'sem pedido'
    if (p.status === 'aprovado') return `entrega ${dataCurta(p.data_entrega)}`
    if (p.status === 'cotado') return 'cotação enviada'
    return p.status === 'novo' ? 'pedido novo' : 'em cotação'
  }

  // Números.
  const novos = pedidos.filter(p => p.status === 'novo').length
  const acabando7 = estoqueAtivo.filter(e => e.data_fim && e.data_fim <= somarDias(hoje, 7)).length
  const demanda15 = consumoDia * 15
  const ativos = clientes.filter(c => c.ativo).length

  // Entregas da semana (a partir de amanhã).
  const semana = Array.from({ length: 7 }, (_, i) => somarDias(hoje, i + 1)).map(d => {
    const valores = Array.from(cargasPorDia.get(d)?.values() ?? [])
    return { d, kg: valores.reduce((s, v) => s + v, 0), acima: valores.some(v => v > capacidadeKg), maior: valores.length ? Math.max(...valores) : 0 }
  })

  // Calendário: semanas de domingo a sábado cobrindo o mês.
  const [ano, mesN] = mes.split('-').map(Number)
  const diaSem1 = new Date(Date.UTC(ano, mesN - 1, 1)).getUTCDay()
  const inicio = somarDias(`${mes}-01`, -diaSem1)
  const celulas = Array.from({ length: Math.ceil((diaSem1 + Number(fimMes.slice(8))) / 7) * 7 }, (_, i) => somarDias(inicio, i))
  const nomeMesBruto = new Date(Date.UTC(ano, mesN - 1, 1)).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const mudarMes = (delta: number) => setMes(new Date(Date.UTC(ano, mesN - 1 + delta, 1)).toISOString().slice(0, 7))

  // Listas.
  const listaPed = abertos.filter(p => p.status === abaPed)
    .sort((a, b) => (a.origem === 'alerta' ? 0 : 1) - (b.origem === 'alerta' ? 0 : 1) || (a.data_entrega ?? '9').localeCompare(b.data_entrega ?? '9'))
  const contPed = (s: string) => abertos.filter(p => p.status === s).length
  const listaRep = (dias: number) => estoqueAtivo.filter(e => e.data_fim && e.data_fim <= somarDias(hoje, dias)).sort((a, b) => (a.data_fim ?? '').localeCompare(b.data_fim ?? ''))
  const rep = listaRep(abaRep)

  const hora = new Date().getHours()
  const saudacao = hora < 12 ? 'Bom dia' : hora < 18 ? 'Boa tarde' : 'Boa noite'
  const primeiroNome = (membro?.nome ?? '').split(' ')[0]
  const dataHoje = dataLonga(hoje)
  const maiuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1)

  return (
    <div className="pn">
      <div className="pn-topo">
        <div>
          <h1>{saudacao}{primeiroNome ? `, ${primeiroNome}` : ''}</h1>
          <p>{maiuscula(dataHoje)} · {papel === 'vendedor' ? 'sua carteira de clientes' : 'toda a carteira do fornecedor'}</p>
        </div>
        <div className="pn-acoes">
          <Link className="btn btn-ghost" to="/entregas">Ver entregas</Link>
          <Link className="btn btn-primary" to="/pedidos?novo=1">+ Lançar pedido</Link>
        </div>
      </div>

      <div className="pn-grade">
        <section className="pn-bloco" aria-labelledby="pn-cal">
          <div className="pn-cab">
            <div className="pn-cal-cab">
              <button type="button" className="pn-seta" aria-label="Mês anterior" onClick={() => mudarMes(-1)}>
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M7.5 2.5 4 6l3.5 3.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
              <strong id="pn-cal">{maiuscula(nomeMesBruto)}</strong>
              <button type="button" className="pn-seta" aria-label="Próximo mês" onClick={() => mudarMes(1)}>
                <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M4.5 2.5 8 6 4.5 9.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              </button>
            </div>
            {mes !== hoje.slice(0, 7)
              ? <button type="button" className="pn-link" onClick={() => setMes(hoje.slice(0, 7))}>Voltar para hoje</button>
              : <span className="pn-nota">Consumo previsto da carteira: {toneladas(consumoDia)} por dia</span>}
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
              const valores = Array.from(cargasPorDia.get(d)?.values() ?? [])
              const kg = valores.reduce((s, v) => s + v, 0)
              const acima = valores.some(v => v > capacidadeKg)
              const nPed = abertosPorDia.get(d)?.length ?? 0
              const nFim = finsPorDia.get(d)?.length ?? 0
              return (
                <button key={d} type="button" className={`pn-celula${d === hoje ? ' hoje' : ''}${d < hoje ? ' passado' : ''}`}
                  onClick={() => setDiaAberto(d)}
                  aria-label={`${dataLonga(d)}: ${kg ? `${toneladas(kg)} de entregas, ` : ''}${nPed} pedidos em aberto, ${nFim} fins de estoque`}>
                  <span className="pn-dnum">{Number(d.slice(8))}</span>
                  {kg > 0 && <span className={`pn-ev${acima ? ' acima' : ''}`}><i className="pn-ponto ent" /><b>{toneladas(kg)}</b></span>}
                  {nPed > 0 && <span className="pn-ev"><i className="pn-ponto ped" /><b>{nPed}</b><span className="txt">{nPed === 1 ? 'pedido' : 'pedidos'}</span></span>}
                  {nFim > 0 && <span className="pn-ev"><i className="pn-ponto fim" /><b>{nFim}</b><span className="txt">{nFim === 1 ? 'acaba' : 'acabam'}</span></span>}
                </button>
              )
            })}
          </div>
        </section>

        <div className="pn-col lateral">
          <section className="pn-bloco pn-num" aria-label="Números da carteira">
            <Link to="/pedidos"><span>Pedidos novos</span><b>{novos}</b></Link>
            <Link to="/clientes"><span>Produtos acabando em 7 dias</span><b>{acabando7}</b></Link>
            <Link to="/demanda"><span>Demanda em 15 dias</span><b>{toneladas(demanda15)}</b></Link>
            <Link to="/clientes"><span>Clientes ativos</span><b>{ativos}</b></Link>
          </section>

          <section className="pn-bloco" aria-labelledby="pn-sem">
            <div className="pn-cab"><strong id="pn-sem">Entregas da semana</strong><span className="pn-nota">capacidade {toneladas(capacidadeKg)}</span></div>
            <div className="pn-sem">
              {semana.map(s => (
                <button key={s.d} type="button" className="pn-dia pn-dia-btn" onClick={() => setDiaAberto(s.d)}>
                  <span>{diaSemana(s.d)} {Number(s.d.slice(8))}</span>
                  <div className="pn-barra"><i style={{ width: `${Math.min(100, (s.maior / capacidadeKg) * 100)}%` }} /></div>
                  <span className={s.acima ? 'pn-acima' : s.kg ? '' : 'pn-zero'}>{s.kg ? toneladas(s.kg) : '—'}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      </div>

      <div className="pn-dupla">
        <section className="pn-bloco" aria-labelledby="pn-ped">
          <div className="pn-cab"><strong id="pn-ped">Pedidos</strong><Link to="/pedidos">Ver todos</Link></div>
          <div className="pn-tabs" role="tablist">
            {([['novo', 'Novos'], ['em_cotacao', 'Em cotação'], ['cotado', 'Aguardando cliente']] as const).map(([k, r]) => (
              <button key={k} type="button" role="tab" aria-selected={abaPed === k} className={`pn-tab${abaPed === k ? ' on' : ''}`} onClick={() => setAbaPed(k)}>{r}<em>{contPed(k)}</em></button>
            ))}
          </div>
          {listaPed.length === 0 ? <div className="pn-vazio">Nenhum pedido nesta etapa.</div> : (
            <ul className="pn-lista">
              {listaPed.slice(0, 6).map(p => {
                const c = clientePorId.get(p.cliente_id)
                const zap = p.status === 'cotado'
                  ? linkWhatsApp(c?.telefone, `Olá ${c?.responsavel ?? ''}, aqui é ${membro?.nome ?? ''} da ${fornecedor?.nome ?? ''}. Conseguiu ver a cotação do pedido #${p.numero} (${p.produto_nome ?? ''})?`)
                  : null
                return (
                  <li key={p.id}>
                    <div className="pn-txt">
                      <div className="pn-l1">{nomeCliente(c)}</div>
                      <div className="pn-l2">#{p.numero} · {p.produto_nome ?? '—'} · {fmtKg(p.quantidade_kg)}{p.origem === 'alerta' ? ' · alerta de estoque' : ''}{p.data_entrega ? ` · entrega ${dataCurta(p.data_entrega)}` : ''}</div>
                    </div>
                    {p.status === 'cotado'
                      ? (zap ? <a className="btn btn-ghost btn-sm" href={zap} target="_blank" rel="noreferrer">WhatsApp</a> : <Link className="btn btn-ghost btn-sm" to="/pedidos">Abrir</Link>)
                      : <Link className="btn btn-primary btn-sm" to="/pedidos">Cotar</Link>}
                  </li>
                )
              })}
            </ul>
          )}
          {listaPed.length > 6 && <Link className="pn-mais" to="/pedidos">Mais {listaPed.length - 6} pedidos</Link>}
        </section>

        <section className="pn-bloco" aria-labelledby="pn-rep">
          <div className="pn-cab"><strong id="pn-rep">Reposição</strong><Link to="/clientes">Ver clientes</Link></div>
          <div className="pn-tabs" role="tablist">
            {([7, 14] as const).map(n => (
              <button key={n} type="button" role="tab" aria-selected={abaRep === n} className={`pn-tab${abaRep === n ? ' on' : ''}`} onClick={() => setAbaRep(n)}>
                {n === 7 ? 'Acaba em 7 dias' : 'Em 14 dias'}<em>{listaRep(n).length}</em>
              </button>
            ))}
          </div>
          {rep.length === 0 ? <div className="pn-vazio">Nenhum produto acabando neste período.</div> : (
            <ul className="pn-lista">
              {rep.slice(0, 6).map(e => {
                const dias = Math.max(0, Math.floor(e.dias_cobertura ?? 0))
                return (
                  <li key={`${e.cliente_id}-${e.produto_id}`}>
                    <div className="pn-txt">
                      <div className="pn-l1">{nomeCliente(clientePorId.get(e.cliente_id))}</div>
                      <div className="pn-l2">{produtoPorId.get(e.produto_id)?.nome ?? 'Produto'} · {situacao(e)}</div>
                    </div>
                    <span className="pn-dias">{dias} {dias === 1 ? 'dia' : 'dias'}</span>
                  </li>
                )
              })}
            </ul>
          )}
          {rep.length > 6 && <Link className="pn-mais" to="/clientes">Mais {rep.length - 6} produtos</Link>}
        </section>
      </div>

      {diaAberto && (() => {
        const d = diaAberto
        const rotasDia = Array.from(cargasPorDia.get(d)?.entries() ?? []).sort((a, b) => b[1] - a[1])
        const kgDia = rotasDia.reduce((s, [, v]) => s + v, 0)
        const meusAprovados = pedidos.filter(p => p.status === 'aprovado' && p.data_entrega && (p.data_entrega < hoje ? hoje : p.data_entrega) === d)
        const ped = abertosPorDia.get(d) ?? []
        const fins = finsPorDia.get(d) ?? []
        return (
          <Modal open size="lg" onClose={() => setDiaAberto(null)} title={maiuscula(dataLonga(d))}
            subtitle={d === hoje ? 'Hoje' : d < hoje ? 'Dia passado' : undefined}
            footer={<button className="btn btn-primary" onClick={() => setDiaAberto(null)}>Fechar</button>}>
            <div className="pn-pop">
              <div className="pn-resumo" style={{ marginBottom: 16 }}>
                <span>Entregas <b>{kgDia ? toneladas(kgDia) : '—'}</b></span>
                <span>Pedidos em aberto <b>{ped.length}</b></span>
                <span>Fins de estoque <b>{fins.length}</b></span>
                <span>Consumo previsto da carteira <b>{toneladas(consumoDia)}</b></span>
              </div>

              <h3><i className="pn-ponto ent" />Entregas aprovadas</h3>
              {rotasDia.length === 0 ? <div className="pn-pop-vazio">Nenhuma entrega aprovada para este dia.</div> : rotasDia.map(([rid, kg]) => {
                const acima = kg > capacidadeKg
                const meus = meusAprovados.filter(p => (rotaDoPedido(p, clientePorId.get(p.cliente_id), rotas)?.id ?? null) === rid)
                const meusKg = meus.reduce((s, p) => s + Number(p.quantidade_kg ?? 0), 0)
                return (
                  <div key={rid ?? 'sem'} className="pn-carga">
                    <div className="pn-carga-l">
                      <strong>{nomeRota(rid)}</strong>
                      <span className={acima ? 'pn-acima' : ''} style={{ fontVariantNumeric: 'tabular-nums' }}>{toneladas(kg)} de {toneladas(capacidadeKg)}{acima ? ' · acima da capacidade' : ''}</span>
                    </div>
                    <div className="pn-barra"><i style={{ width: `${Math.min(100, (kg / capacidadeKg) * 100)}%`, background: acima ? 'var(--red)' : undefined }} /></div>
                    {meus.map(p => (
                      <div key={p.id} className="pn-carga-l" style={{ color: 'var(--text-2)' }}>
                        <span>#{p.numero} · {nomeCliente(clientePorId.get(p.cliente_id))} · {p.produto_nome}</span>
                        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{fmtKg(p.quantidade_kg)}</span>
                      </div>
                    ))}
                    {kg - meusKg > 1 && <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{meus.length ? 'Mais ' : ''}{toneladas(kg - meusKg)} de pedidos de outros vendedores</div>}
                    <div style={{ display: 'flex', gap: 8 }}>
                      {meus.length > 0 && <Link className="btn btn-ghost btn-sm" to={`/romaneio?data=${d}&rota=${rid ?? 'sem-rota'}`}>Romaneio</Link>}
                      <Link className="btn btn-ghost btn-sm" to="/entregas">{acima ? 'Ajustar carga' : 'Abrir entregas'}</Link>
                    </div>
                  </div>
                )
              })}

              <h3><i className="pn-ponto ped" />Pedidos em aberto com entrega neste dia</h3>
              {ped.length === 0 ? <div className="pn-pop-vazio">Nenhum pedido em aberto.</div> : (
                <ul className="pn-lista">
                  {ped.map(p => (
                    <li key={p.id}>
                      <div className="pn-txt">
                        <div className="pn-l1">{nomeCliente(clientePorId.get(p.cliente_id))}</div>
                        <div className="pn-l2">#{p.numero} · {p.produto_nome} · {fmtKg(p.quantidade_kg)} · {ROTULO_STATUS[p.status].toLowerCase()}</div>
                      </div>
                      <Link className={`btn btn-sm ${p.status === 'cotado' ? 'btn-ghost' : 'btn-primary'}`} to="/pedidos">{p.status === 'cotado' ? 'Abrir' : 'Cotar'}</Link>
                    </li>
                  ))}
                </ul>
              )}

              <h3><i className="pn-ponto fim" />Estoque que acaba neste dia</h3>
              {fins.length === 0 ? <div className="pn-pop-vazio">Nenhum produto acaba neste dia.</div> : (
                <ul className="pn-lista">
                  {fins.map(e => {
                    const c = clientePorId.get(e.cliente_id)
                    const prod = produtoPorId.get(e.produto_id)
                    const sit = situacao(e)
                    const zap = sit === 'sem pedido'
                      ? linkWhatsApp(c?.telefone, `Olá ${c?.responsavel ?? ''}, aqui é ${membro?.nome ?? ''} da ${fornecedor?.nome ?? ''}. O ${prod?.nome ?? 'produto'} da fazenda deve acabar em ${fmtDataBr(e.data_fim)}. Quer que eu programe a reposição?`)
                      : null
                    return (
                      <li key={`${e.cliente_id}-${e.produto_id}`}>
                        <div className="pn-txt">
                          <div className="pn-l1">{nomeCliente(c)}</div>
                          <div className="pn-l2">{prod?.nome ?? 'Produto'} · consumo {fmtKg(e.consumo_dia_kg)}/dia · {sit}</div>
                        </div>
                        {zap ? <a className="btn btn-ghost btn-sm" href={zap} target="_blank" rel="noreferrer">Oferecer reposição</a> : <Link className="btn btn-ghost btn-sm" to="/clientes">Abrir</Link>}
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </Modal>
        )
      })()}
    </div>
  )
}
