import { useState, useMemo, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { PageHeader, EmptyState, Modal } from '@/components/common/UI'
import { EstoqueGerenciado } from '@/components/parceiros/EstoqueGerenciado'
import { EnderecoEntrega } from '@/components/parceiros/EnderecoEntrega'
import { useDadosFornecedor, nomeCliente } from '@/portal/useDadosFornecedor'
import { usePortal } from '@/portal/PortalContext'
import { fmtKg, fmtDataBr, emAlerta, linkWhatsApp, rotaDoCliente, type ClienteFornecedor, type EstoqueCliente } from '@/core/parceiros'

// Desvio de consumo: realizado (fornecimentos registrados ou baixas) contra
// o previsto pelas dietas, somando os produtos com os dois valores.
function desvio(linhas: EstoqueCliente[]): number | null {
  const comAmbos = linhas.filter(l => l.consumo_real_dia_kg != null && l.consumo_previsto_dia_kg != null && l.consumo_previsto_dia_kg > 0)
  if (comAmbos.length === 0) return null
  const real = comAmbos.reduce((s, l) => s + (l.consumo_real_dia_kg ?? 0), 0)
  const prev = comAmbos.reduce((s, l) => s + (l.consumo_previsto_dia_kg ?? 0), 0)
  return real / prev - 1
}

export default function Clientes() {
  const { papel, fornecedor, membro } = usePortal()
  const { clientes, produtos, membros, estoque, rotas, loading, recarregar } = useDadosFornecedor()
  const [gerenciar, setGerenciar] = useState<ClienteFornecedor | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [busca, setBusca] = useState('')
  const [erro, setErro] = useState<string | null>(null)
  const [contato, setContato] = useState<{ cliente: ClienteFornecedor; nome_fazenda: string; responsavel: string; telefone: string; email: string; municipio: string; uf: string } | null>(null)
  const [erroContato, setErroContato] = useState<string | null>(null)
  const [salvandoContato, setSalvandoContato] = useState(false)

  const estoquePorCliente = useMemo(() => {
    const m: Record<string, EstoqueCliente[]> = {}
    for (const e of estoque) (m[e.cliente_id] ??= []).push(e)
    return m
  }, [estoque])
  const produtoPorId = useMemo(() => new Map(produtos.map(p => [p.id, p])), [produtos])
  const dietasNome = useMemo(() => Object.fromEntries(produtos.filter(p => p.categoria === 'dieta').map(p => [p.id, p.nome])) as Record<string, string>, [produtos])

  const vendedores = membros.filter(m => m.ativo)
  const podeEditarContato = (c: ClienteFornecedor) => papel === 'gestor' || (!!membro && c.vendedor_id === membro.id)
  const abrirContato = (c: ClienteFornecedor) => {
    setErroContato(null)
    setContato({ cliente: c, nome_fazenda: c.nome_fazenda ?? '', responsavel: c.responsavel ?? '', telefone: c.telefone ?? '', email: c.email ?? '', municipio: c.municipio ?? '', uf: c.uf ?? '' })
  }
  const salvarContato = async () => {
    if (!contato) return
    setErroContato(null)
    const email = contato.email.trim()
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { setErroContato('E-mail inválido'); return }
    if (contato.uf.trim() && !/^[A-Za-z]{2}$/.test(contato.uf.trim())) { setErroContato('UF deve ter 2 letras'); return }
    setSalvandoContato(true)
    const { error } = await supabase.rpc('definir_contato_cliente', {
      cid: contato.cliente.id, nome_fazenda: contato.nome_fazenda, responsavel: contato.responsavel, telefone: contato.telefone,
      email, municipio: contato.municipio, uf: contato.uf,
    })
    setSalvandoContato(false)
    if (error) { setErroContato(error.message); return }
    setContato(null)
    recarregar()
  }
  const atualizar = async (c: ClienteFornecedor, patch: Partial<ClienteFornecedor>) => {
    setErro(null)
    const { error } = await supabase.from('fornecedor_clientes').update(patch).eq('id', c.id)
    if (error) { setErro(error.message); return }
    recarregar()
  }

  if (loading) return <div className="page"><div className="spinner" style={{ width: 28, height: 28, margin: '48px auto' }} /></div>
  const termo = busca.trim().toLowerCase()
  const lista = clientes.filter(c => !termo || [c.nome_fazenda, c.responsavel, c.email, c.municipio].some(v => (v ?? '').toLowerCase().includes(termo)))
  const atual = clientes.find(c => c.id === sel)
  const linhasAtual = atual ? (estoquePorCliente[atual.id] ?? []) : []

  return (
    <div className="page">
      <PageHeader title="Clientes" subtitle={`${clientes.filter(c => c.ativo).length} clientes conectados · consumo real comparado ao previsto`} />
      <input className="form-input" style={{ maxWidth: 320, marginBottom: 16 }} placeholder="Buscar fazenda, responsável ou município" value={busca} onChange={e => setBusca(e.target.value)} />
      {erro && <div className="field-error" style={{ marginBottom: 12 }}>{erro}</div>}

      {lista.length === 0 ? <div className="card"><EmptyState icon="◻" title="Nenhum cliente" desc={papel === 'gestor' ? 'Convide clientes em Equipe e convites.' : 'O gestor ainda não atribuiu clientes a você.'} /></div> : (
        <div>
          <div className="table-wrap">
            <table>
              <thead><tr><th>Fazenda</th><th>Conta</th><th>Cabeças</th><th>Dieta em uso</th><th>Consumo x previsto</th><th>Próxima reposição</th><th>Rota</th>{papel === 'gestor' && <th>Vendedor</th>}</tr></thead>
              <tbody>
                {lista.map(c => {
                  const linhas = estoquePorCliente[c.id] ?? []
                  const d = desvio(linhas)
                  const proxima = linhas.filter(l => l.data_fim).sort((a, b) => (a.data_fim ?? '').localeCompare(b.data_fim ?? ''))[0]
                  const alerta = linhas.some(l => { const p = produtoPorId.get(l.produto_id); return p ? emAlerta(p, l) : false })
                  return (
                    <tr key={c.id} onClick={() => setSel(c.id)} style={{ cursor: 'pointer', opacity: c.ativo ? 1 : 0.5 }}>
                      <td><strong>{nomeCliente(c)}</strong><div style={{ fontSize: 11, color: 'var(--text-3)' }}>{[c.municipio, c.uf].filter(Boolean).join('/') || c.email}</div></td>
                      <td style={{ fontSize: 12 }}>{c.modo === 'confina' ? 'Confina+' : 'Só estoque'}{!c.ativo && ' (inativo)'}</td>
                      <td>{c.cabecas ?? '—'}</td>
                      <td style={{ fontSize: 12 }}>{(c.dietas_em_uso ?? []).map(id => dietasNome[id]).filter(Boolean).join(', ') || '—'}</td>
                      <td>{d == null ? <span style={{ color: 'var(--text-3)' }}>—</span>
                        : <span className={`badge ${Math.abs(d) <= 0.05 ? 'badge-green' : Math.abs(d) <= 0.15 ? 'badge-amber' : 'badge-red'}`}>{d > 0 ? '+' : ''}{Math.round(d * 100)}%</span>}</td>
                      <td style={{ color: alerta ? 'var(--red)' : undefined }}>{proxima ? fmtDataBr(proxima.data_fim) : '—'}</td>
                      <td onClick={e => e.stopPropagation()} style={{ fontSize: 12 }}>
                        {papel === 'gestor'
                          ? <select className="form-input" style={{ height: 32, fontSize: 12 }} value={c.rota_id ?? ''} onChange={e => atualizar(c, { rota_id: e.target.value || null })}>
                              <option value="">{(() => { const r = rotaDoCliente({ ...c, rota_id: null }, rotas); return r ? `Pelo município (${r.nome})` : 'Pelo município' })()}</option>
                              {rotas.map(r => <option key={r.id} value={r.id}>{r.nome}</option>)}
                            </select>
                          : rotaDoCliente(c, rotas)?.nome ?? 'Sem rota'}
                      </td>
                      {papel === 'gestor' && (
                        <td onClick={e => e.stopPropagation()}>
                          <select className="form-input" style={{ height: 32, fontSize: 12 }} value={c.vendedor_id ?? ''} onChange={e => atualizar(c, { vendedor_id: e.target.value || null })}>
                            <option value="">Sem vendedor</option>
                            {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome || v.email}</option>)}
                          </select>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {atual && !contato && !gerenciar && (
            <Modal open onClose={() => setSel(null)} title={nomeCliente(atual)}
              subtitle={`${atual.modo === 'confina' ? 'Confina+' : 'Só estoque'}${[atual.municipio, atual.uf].filter(Boolean).length ? ` · ${[atual.municipio, atual.uf].filter(Boolean).join('/')}` : ''}${!atual.ativo ? ' · inativo' : ''}`}>
              <div style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 12 }}>
                {[atual.responsavel, atual.telefone, atual.email].filter(Boolean).join(' · ') || 'Sem contato cadastrado'}
                {podeEditarContato(atual) && <button type="button" className="btn btn-ghost btn-sm" style={{ marginLeft: 6, height: 24 }} onClick={() => abrirContato(atual)}>Editar contato</button>}
                {atual.resumo_atualizado_em && <div style={{ color: 'var(--text-3)' }}>Estoque atualizado em {fmtDataBr(atual.resumo_atualizado_em.slice(0, 10))}</div>}
              </div>
              <div style={{ marginBottom: 14, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                <EnderecoEntrega key={`${atual.id}-${atual.endereco_entrega ?? ''}-${atual.link_maps ?? ''}`} cliente={atual} onSalvo={() => recarregar()} />
              </div>
              {linhasAtual.length === 0 ? <div style={{ fontSize: 13, color: 'var(--text-3)' }}>Sem estoque registrado ainda.</div> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {linhasAtual.map(l => {
                    const p = produtoPorId.get(l.produto_id)
                    const alerta = p ? emAlerta(p, l) : false
                    const dl = desvio([l])
                    return (
                      <div key={l.produto_id} style={{ borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                        <div className="flex-between" style={{ fontSize: 13 }}>
                          <strong>{p?.nome ?? 'Produto'}</strong>
                          {l.dias_cobertura != null && <span className={`badge ${alerta ? 'badge-red' : 'badge-green'}`}>{Math.floor(l.dias_cobertura)} dias</span>}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 4, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                          <span>Saldo: {fmtKg(l.saldo_kg)}</span>
                          <span>Fim: {fmtDataBr(l.data_fim)}</span>
                          <span>Consumo: {l.consumo_dia_kg ? `${fmtKg(l.consumo_dia_kg)}/dia` : '—'}</span>
                          <span>Previsto: {l.consumo_previsto_dia_kg != null ? `${fmtKg(l.consumo_previsto_dia_kg)}/dia` : '—'}</span>
                        </div>
                        {dl != null && <div style={{ fontSize: 12, marginTop: 4, color: Math.abs(dl) > 0.15 ? 'var(--red)' : 'var(--text-2)' }}>
                          Consumo real {dl > 0 ? 'acima' : 'abaixo'} do previsto em {Math.abs(Math.round(dl * 100))}%
                        </div>}
                      </div>
                    )
                  })}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                {atual.modo === 'estoque' && <button className="btn btn-primary btn-sm" onClick={() => setGerenciar(atual)}>Gerenciar estoque e consumo</button>}
                {(() => {
                  const zap = linkWhatsApp(atual.telefone, `Olá ${atual.responsavel ?? ''}, aqui é ${membro?.nome ?? ''} da ${fornecedor?.nome ?? ''}. Gostaria de agendar uma visita técnica para acompanhar o consumo das dietas.`)
                  return zap ? <a className="btn btn-primary btn-sm" href={zap} target="_blank" rel="noreferrer">Agendar visita pelo WhatsApp</a> : null
                })()}
                {papel === 'gestor' && (
                  <button className="btn btn-ghost btn-sm" onClick={() => {
                    if (atual.ativo && !window.confirm(`Desativar ${nomeCliente(atual)}? Ele deixa de ver as dietas e produtos e não é mais cobrado.`)) return
                    atualizar(atual, { ativo: !atual.ativo })
                  }}>{atual.ativo ? 'Desativar cliente' : 'Reativar cliente'}</button>
                )}
              </div>
            </Modal>
          )}
        </div>
      )}

      {contato && (
        <Modal open onClose={() => setContato(null)} title="Dados de contato" subtitle={nomeCliente(contato.cliente)}
          footer={<>
            <button className="btn btn-ghost" onClick={() => setContato(null)}>Cancelar</button>
            <button className="btn btn-primary" disabled={salvandoContato} onClick={salvarContato}>{salvandoContato ? 'Salvando...' : 'Salvar'}</button>
          </>}>
          <div className="form-row-2">
            <div className="field"><label>Nome da fazenda</label><input value={contato.nome_fazenda} onChange={e => setContato({ ...contato, nome_fazenda: e.target.value })} /></div>
            <div className="field"><label>Responsável</label><input value={contato.responsavel} onChange={e => setContato({ ...contato, responsavel: e.target.value })} /></div>
          </div>
          <div className="form-row-2">
            <div className="field"><label>Telefone (WhatsApp)</label><input value={contato.telefone} onChange={e => setContato({ ...contato, telefone: e.target.value })} placeholder="(55) 99999-0000" /></div>
            <div className="field"><label>E-mail de contato</label><input type="email" value={contato.email} onChange={e => setContato({ ...contato, email: e.target.value })} /></div>
          </div>
          <div className="form-row-2">
            <div className="field"><label>Município</label><input value={contato.municipio} onChange={e => setContato({ ...contato, municipio: e.target.value })} /></div>
            <div className="field"><label>UF</label><input value={contato.uf} maxLength={2} onChange={e => setContato({ ...contato, uf: e.target.value.toUpperCase() })} /></div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
            O e-mail de contato recebe os avisos de pedidos e entregas; o e-mail de acesso do produtor não muda.
            {contato.municipio.trim() !== (contato.cliente.municipio ?? '') && !contato.cliente.rota_id && ' Mudar o município pode mudar a rota de entrega do cliente.'}
          </div>
          {erroContato && <div className="field-error" style={{ marginTop: 8 }}>{erroContato}</div>}
        </Modal>
      )}

      {gerenciar && fornecedor && (
        <Modal open size="xl" onClose={() => { setGerenciar(null); recarregar() }} title={`Estoque de ${nomeCliente(gerenciar)}`}
          subtitle="Lance entradas, baixas e ajustes e informe o consumo. O cliente vê e altera o mesmo estoque.">
          <EstoqueGerenciado cliente={gerenciar} produtos={produtos} fornecedorNome={fornecedor.nome} quem="equipe" />
        </Modal>
      )}
    </div>
  )
}
