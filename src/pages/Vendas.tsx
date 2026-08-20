import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSaidasGrupo, type SaidaGrupoDetalhe } from '@/hooks/useLotes'
import { PageHeader, EmptyState, Modal } from '@/components/common/UI'
import { fmt, fmtNum, fmtData } from '@/lib/calculations'
import type { SaidaGrupo, SaidaTipo, SaidaModo } from '@/types'

const tipoLabel: Record<SaidaTipo, string> = { venda: 'Venda', abate: 'Abate', transferencia: 'Transferência', morte: 'Morte' }
const modoLabel: Record<SaidaModo, string> = { peso_proprio: 'Peso próprio', peso_carga: 'Peso da carga', rendimento_carcaca: 'Rendimento de carcaça' }
const destinoTipoLabel: Record<string, string> = { frigorifico: 'Frigorífico', corretor: 'Corretor', produtor: 'Outro produtor' }

const custoTotalDe = (s: SaidaGrupo) =>
  (s.custo_compra_total ?? 0) + (s.custo_alimentacao_total ?? 0) + (s.custos_variaveis_total ?? 0) + (s.custos_fixos_rateados ?? 0)

export default function Vendas() {
  const [searchParams] = useSearchParams()
  const loteFiltro = searchParams.get('lote')
  const { saidas, loading, buscarDetalhe, buscarPorLote } = useSaidasGrupo()

  const [saidasDoLote, setSaidasDoLote] = useState<SaidaGrupo[] | null>(null)
  const [loadingFiltro, setLoadingFiltro] = useState(false)
  const [showDetalhe, setShowDetalhe] = useState<string | null>(null)
  const [detalhe, setDetalhe] = useState<SaidaGrupoDetalhe | null>(null)
  const [loadingDetalhe, setLoadingDetalhe] = useState(false)

  useEffect(() => {
    if (!loteFiltro) { setSaidasDoLote(null); return }
    setLoadingFiltro(true)
    buscarPorLote(loteFiltro).then(res => { setSaidasDoLote(res); setLoadingFiltro(false) })
  }, [loteFiltro])

  const lista = loteFiltro ? (saidasDoLote ?? []) : saidas
  const carregandoLista = loteFiltro ? loadingFiltro : loading

  const abrirDetalhe = async (id: string) => {
    setShowDetalhe(id)
    setLoadingDetalhe(true)
    const d = await buscarDetalhe(id)
    setDetalhe(d)
    setLoadingDetalhe(false)
  }

  const fecharDetalhe = () => { setShowDetalhe(null); setDetalhe(null) }

  return (
    <div className="page">
      <PageHeader title="Vendas" subtitle={loteFiltro ? 'Vendas envolvendo animais deste lote' : 'Histórico de vendas, abates e outras saídas'} />

      {carregandoLista ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div className="spinner" style={{ width: 28, height: 28 }} />
        </div>
      ) : lista.length === 0 ? (
        <div className="card">
          <EmptyState icon="◧" title="Nenhuma venda registrada"
            desc="Vendas, abates e outras saídas de animais aparecem aqui assim que forem registrados na tela de Lotes." />
        </div>
      ) : (
        <div className="card" style={{ padding: 0 }}>
          <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
            <table>
              <thead>
                <tr>
                  <th>Data</th><th>Tipo</th><th>Modo</th><th>Destino</th>
                  <th>Receita bruta</th><th>Custo total</th><th>Lucro</th><th>Margem</th><th></th>
                </tr>
              </thead>
              <tbody>
                {lista.map(s => {
                  const custo = custoTotalDe(s)
                  const lucro = s.lucro_total ?? 0
                  return (
                    <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => abrirDetalhe(s.id)}>
                      <td>{fmtData(s.data)}</td>
                      <td>{tipoLabel[s.tipo]}</td>
                      <td>{modoLabel[s.modo]}</td>
                      <td>{s.destino_tipo ? destinoTipoLabel[s.destino_tipo] ?? s.destino_tipo : '—'}</td>
                      <td>{fmt(s.receita_bruta ?? 0)}</td>
                      <td>{fmt(custo)}</td>
                      <td style={{ color: lucro >= 0 ? '#2e7d32' : '#b91c1c' }}>{fmt(lucro)}</td>
                      <td>{s.margem_pct != null ? `${fmtNum(s.margem_pct, 1)}%` : '—'}</td>
                      <td><button className="btn btn-ghost btn-sm" onClick={e => { e.stopPropagation(); abrirDetalhe(s.id) }}>Ver</button></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showDetalhe && (
        <Modal open onClose={fecharDetalhe} title="Detalhes da venda" size="lg">
          {loadingDetalhe || !detalhe ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}><div className="spinner" style={{ width: 24, height: 24 }} /></div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="flex-between">
                <div style={{ fontSize: 13, color: 'var(--gray-500)' }}>
                  {fmtData(detalhe.data)} · {tipoLabel[detalhe.tipo]} · {modoLabel[detalhe.modo]}
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => window.print()}>Exportar PDF</button>
              </div>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <ResumoVenda label="Receita bruta" valor={fmt(detalhe.receita_bruta ?? 0)} />
                <ResumoVenda label="Custo total" valor={fmt(custoTotalDe(detalhe))} />
                <ResumoVenda label="Lucro" valor={fmt(detalhe.lucro_total ?? 0)} destaque={(detalhe.lucro_total ?? 0) >= 0} />
                <ResumoVenda label="Margem" valor={detalhe.margem_pct != null ? `${fmtNum(detalhe.margem_pct, 1)}%` : '—'} />
              </div>

              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Animal</th><th>Peso</th>
                      {detalhe.modo === 'rendimento_carcaca' && <><th>Preço/kg carcaça</th><th>Rendimento abate</th></>}
                      <th>Valor</th><th>Custo</th><th>Lucro</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalhe.animais.map(a => (
                      <tr key={a.animal_id}>
                        <td><strong>{a.codigo}</strong></td>
                        <td>{a.peso != null ? `${fmtNum(a.peso, 1)} kg` : '—'}</td>
                        {detalhe.modo === 'rendimento_carcaca' && (
                          <>
                            <td>{a.preco_kg_carcaca != null ? fmt(a.preco_kg_carcaca) : '—'}</td>
                            <td>{a.rendimento_abate_pct != null ? `${fmtNum(a.rendimento_abate_pct, 1)}%` : '—'}</td>
                          </>
                        )}
                        <td>{a.valor != null ? fmt(a.valor) : '—'}</td>
                        <td>{a.custo_atribuido != null ? fmt(a.custo_atribuido) : '—'}</td>
                        <td style={{ color: (a.lucro ?? 0) >= 0 ? '#2e7d32' : '#b91c1c' }}>{a.lucro != null ? fmt(a.lucro) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="modal-actions">
                <button className="btn btn-primary" onClick={fecharDetalhe}>Fechar</button>
              </div>
            </div>
          )}
        </Modal>
      )}

      {/* ─── Área de impressão: nota de controle da venda ───────────────────────
          Fica fora do Modal de propósito: o Modal tem overflow:hidden, o que
          cortaria o conteúdo na hora de imprimir. */}
      {detalhe && (
        <div className="print-area">
          <NotaVendaImprimivel detalhe={detalhe} />
        </div>
      )}
    </div>
  )
}

function ResumoVenda({ label, valor, destaque }: { label: string; valor: string; destaque?: boolean }) {
  return (
    <div style={{ background: destaque ? 'var(--green-bg)' : 'var(--gray-50)', borderRadius: 8, padding: '10px 14px', flex: 1, minWidth: 130 }}>
      <div style={{ fontSize: 11, color: destaque ? 'var(--green)' : 'var(--gray-500)' }}>{label}</div>
      <div style={{ fontSize: 17, fontWeight: 600, color: destaque ? 'var(--green-dark)' : undefined }}>{valor}</div>
    </div>
  )
}

// ═══════════════════════════════════════════════════════════════════════════
// NOTA DE CONTROLE DE VENDA — layout formal, só aparece na impressão
// ═══════════════════════════════════════════════════════════════════════════

function NotaVendaImprimivel({ detalhe }: { detalhe: SaidaGrupoDetalhe }) {
  const custoCompra = detalhe.custo_compra_total ?? 0
  const custoAlimentacao = detalhe.custo_alimentacao_total ?? 0
  const custosVariaveis = detalhe.custos_variaveis_total ?? 0
  const custosOperacionais = detalhe.custos_fixos_rateados ?? 0
  const custoTotal = custoCompra + custoAlimentacao + custosVariaveis + custosOperacionais

  return (
    <div style={{ fontFamily: 'Inter, sans-serif', color: '#111', maxWidth: 700, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <img src="/logo.png" alt="Confina+" style={{ height: 56, objectFit: 'contain' }} />
      </div>

      <h1 style={{ fontSize: 18, fontWeight: 700, textAlign: 'center', marginBottom: 4 }}>Nota de Controle de Venda</h1>
      <p style={{ fontSize: 12, textAlign: 'center', color: '#555', marginBottom: 28 }}>
        Emitida em {fmtData(new Date().toISOString().split('T')[0])}
      </p>

      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24, fontSize: 13 }}>
        <tbody>
          <LinhaNota label="Data da operação" valor={fmtData(detalhe.data)} />
          <LinhaNota label="Tipo" valor={tipoLabel[detalhe.tipo]} />
          <LinhaNota label="Modo de precificação" valor={modoLabel[detalhe.modo]} />
          <LinhaNota label="Destino" valor={detalhe.destino_nome ?? (detalhe.destino_tipo ? destinoTipoLabel[detalhe.destino_tipo] ?? detalhe.destino_tipo : '—')} />
          <LinhaNota label="Peso total vivo" valor={detalhe.peso_total_vivo != null ? `${fmtNum(detalhe.peso_total_vivo, 0)} kg` : '—'} />
          <LinhaNota label="Quantidade de animais" valor={String(detalhe.animais.length)} />
        </tbody>
      </table>

      <h2 style={{ fontSize: 14, fontWeight: 700, borderBottom: '1px solid #000', paddingBottom: 4, marginBottom: 10 }}>Resumo financeiro</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 24, fontSize: 13 }}>
        <tbody>
          <LinhaNota label="Receita bruta" valor={fmt(detalhe.receita_bruta ?? 0)} />
          <LinhaNota label="Comissões" valor={`- ${fmt(detalhe.total_comissoes ?? 0)}`} />
          <LinhaNota label="Encargos" valor={`- ${fmt(detalhe.total_encargos ?? 0)}`} />
          <LinhaNota label="Receita líquida" valor={fmt(detalhe.receita_liquida ?? 0)} negrito />
          <LinhaNota label="Custo de compra" valor={`- ${fmt(custoCompra)}`} />
          <LinhaNota label="Custo de alimentação" valor={`- ${fmt(custoAlimentacao)}`} />
          <LinhaNota label="Custos variáveis" valor={`- ${fmt(custosVariaveis)}`} />
          <LinhaNota label="Custos operacionais" valor={`- ${fmt(custosOperacionais)}`} />
          <LinhaNota label="Custo total" valor={`- ${fmt(custoTotal)}`} negrito />
          <LinhaNota label="Lucro líquido" valor={fmt(detalhe.lucro_total ?? 0)} negrito />
          <LinhaNota label="Margem líquida" valor={detalhe.margem_pct != null ? `${fmtNum(detalhe.margem_pct, 1)}%` : '—'} />
        </tbody>
      </table>

      <h2 style={{ fontSize: 14, fontWeight: 700, borderBottom: '1px solid #000', paddingBottom: 4, marginBottom: 10 }}>Animais</h2>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #000' }}>
            <th style={{ textAlign: 'left', padding: '4px 6px' }}>Código</th>
            <th style={{ textAlign: 'right', padding: '4px 6px' }}>Peso</th>
            {detalhe.modo === 'rendimento_carcaca' && (
              <>
                <th style={{ textAlign: 'right', padding: '4px 6px' }}>Preço/kg carcaça</th>
                <th style={{ textAlign: 'right', padding: '4px 6px' }}>Rendimento abate</th>
              </>
            )}
            <th style={{ textAlign: 'right', padding: '4px 6px' }}>Valor</th>
            <th style={{ textAlign: 'right', padding: '4px 6px' }}>Custo</th>
            <th style={{ textAlign: 'right', padding: '4px 6px' }}>Lucro</th>
          </tr>
        </thead>
        <tbody>
          {detalhe.animais.map(a => (
            <tr key={a.animal_id} style={{ borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '4px 6px' }}>{a.codigo}</td>
              <td style={{ textAlign: 'right', padding: '4px 6px' }}>{a.peso != null ? `${fmtNum(a.peso, 1)} kg` : '—'}</td>
              {detalhe.modo === 'rendimento_carcaca' && (
                <>
                  <td style={{ textAlign: 'right', padding: '4px 6px' }}>{a.preco_kg_carcaca != null ? fmt(a.preco_kg_carcaca) : '—'}</td>
                  <td style={{ textAlign: 'right', padding: '4px 6px' }}>{a.rendimento_abate_pct != null ? `${fmtNum(a.rendimento_abate_pct, 1)}%` : '—'}</td>
                </>
              )}
              <td style={{ textAlign: 'right', padding: '4px 6px' }}>{a.valor != null ? fmt(a.valor) : '—'}</td>
              <td style={{ textAlign: 'right', padding: '4px 6px' }}>{a.custo_atribuido != null ? fmt(a.custo_atribuido) : '—'}</td>
              <td style={{ textAlign: 'right', padding: '4px 6px' }}>{a.lucro != null ? fmt(a.lucro) : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {detalhe.observacoes && (
        <p style={{ fontSize: 12, color: '#555', marginTop: 20 }}>Observações: {detalhe.observacoes}</p>
      )}
    </div>
  )
}

function LinhaNota({ label, valor, negrito }: { label: string; valor: string; negrito?: boolean }) {
  return (
    <tr style={{ borderBottom: '1px solid #eee' }}>
      <td style={{ padding: '5px 6px', color: '#555' }}>{label}</td>
      <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: negrito ? 700 : 400 }}>{valor}</td>
    </tr>
  )
}
