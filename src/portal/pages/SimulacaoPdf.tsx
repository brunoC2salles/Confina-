import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { usePortal } from '@/portal/PortalContext'
import { fmt, fmtNum } from '@/lib/calculations'
import {
  calcularCenario, custoKgMsDieta, custoLadoKgMs, lucroVisivel, num, pastoAtivo,
  type ResultadoCenario, type SimCiclo, type TipoCicloSim,
} from '@/lib/simulador'
import { linhasComparativo, notaConc } from '@/pages/Simulador'
import type { SimulacaoFornecedor } from '@/portal/simuladorPortal'
import type { MembroFornecedor } from '@/core/parceiros'

const CSS = `
.spdf { max-width: 1040px; margin: 0 auto; padding: 32px 28px 40px; font-family: Inter, sans-serif; color: #15201a; font-size: 14px; line-height: 1.45; }
.spdf-acoes { display: flex; gap: 8px; justify-content: flex-end; margin-bottom: 20px; }
.spdf-topo { display: flex; justify-content: space-between; align-items: flex-end; gap: 24px; border-bottom: 3px solid #1b5e20; padding-bottom: 16px; margin-bottom: 22px; }
.spdf-marca { font-family: Syne, sans-serif; font-weight: 800; font-size: 30px; color: #1b5e20; line-height: 1.05; }
.spdf-sub { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: #c99a2e; font-weight: 700; margin-top: 6px; }
.spdf-titulo { font-family: Syne, sans-serif; font-size: 22px; font-weight: 700; margin: 0; }
.spdf-meta { text-align: right; font-size: 13px; color: #44514a; }
.spdf-meta strong { color: #15201a; }
.spdf h2 { font-family: Syne, sans-serif; font-size: 18px; color: #1b5e20; margin: 26px 0 10px; }
.spdf h3 { font-size: 15px; margin: 16px 0 6px; }
.spdf-grade { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; }
.spdf-kpi { background: #f3f6f2; border-radius: 8px; padding: 10px 12px; }
.spdf-kpi span { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; color: #5b6b62; }
.spdf-kpi strong { font-size: 17px; }
.spdf table { width: 100%; border-collapse: collapse; font-size: 13px; }
.spdf th { text-align: left; background: #e8f5e9; color: #1b5e20; padding: 8px; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
.spdf td { padding: 7px 8px; border-bottom: 1px solid #e3e8e1; vertical-align: top; }
.spdf td.num, .spdf th.num { text-align: right; white-space: nowrap; }
.spdf tr.sub td:first-child { padding-left: 24px; color: #5b6b62; }
.spdf tr.destaque td { font-weight: 700; }
.spdf .melhor { display: inline-block; background: #1b5e20; color: #fff; border-radius: 10px; padding: 1px 8px; font-size: 10px; margin-left: 6px; vertical-align: middle; }
.spdf .pos { color: #1b5e20; } .spdf .neg { color: #b91c1c; }
.spdf-caminho { border: 1px solid #d7e2d4; border-radius: 10px; padding: 14px 16px; margin-top: 16px; }
.spdf-caminho-topo { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
.spdf-ciclo { margin-top: 12px; padding-top: 12px; border-top: 1px dashed #cfd8cc; }
.spdf-ciclo-info { display: flex; flex-wrap: wrap; gap: 4px 18px; font-size: 13px; color: #33413a; margin-bottom: 8px; }
.spdf-nota { font-size: 11px; color: #5b6b62; margin-top: 4px; }
.spdf-rodape { margin-top: 30px; padding-top: 12px; border-top: 1px solid #cfd8cc; font-size: 11px; color: #5b6b62; display: flex; justify-content: space-between; gap: 16px; }
@media print {
  .spdf-acoes { display: none; }
  .spdf { padding: 0; max-width: none; }
  tr, .spdf-kpi { break-inside: avoid; }
  .spdf-ciclo { break-inside: avoid; }
  h2, h3 { break-after: avoid; }
  @page { size: A4; margin: 12mm; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`

const ROTULO_TIPO: Record<TipoCicloSim, string> = { confinamento: 'Intensivo', pastagem: 'Pastagem', misto: 'Misto (pasto + ração)' }
const fmtDataBr = (d: string) => d.slice(0, 10).split('-').reverse().join('/')
const sinal = (v: number | null | undefined) => v == null ? '' : v >= 0 ? 'pos' : 'neg'

// Resultado da simulação para entregar ao produtor: tela e PDF pelo
// "Imprimir" do navegador (escolher "Salvar como PDF"). Versão completa,
// com preço de cada ingrediente.
export default function SimulacaoPdf() {
  const [params] = useSearchParams()
  const id = params.get('id')
  const { fornecedor } = usePortal()
  const [sim, setSim] = useState<SimulacaoFornecedor | null>(null)
  const [autor, setAutor] = useState<MembroFornecedor | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    if (!id) { setErro('Simulação não informada'); return }
    supabase.from('fornecedor_simulacoes').select('*').eq('id', id).maybeSingle().then(async ({ data, error }) => {
      if (error || !data) { setErro(error?.message ?? 'Simulação não encontrada'); return }
      const s = data as SimulacaoFornecedor
      setSim(s)
      const { data: m } = await supabase.from('fornecedor_membros').select('*').eq('id', s.membro_id).maybeSingle()
      setAutor((m ?? null) as MembroFornecedor | null)
    })
  }, [id])

  useEffect(() => { if (sim) document.title = `${sim.nome} · ${fornecedor?.nome ?? 'Simulação'}` }, [sim, fornecedor])

  const resultados = useMemo(() => {
    const m: Record<string, ResultadoCenario> = {}
    if (sim) for (const c of sim.dados.cenarios) m[c.id] = calcularCenario(sim.dados.partida, c)
    return m
  }, [sim])

  if (erro) return <div className="spdf"><style>{CSS}</style><p>{erro}</p></div>
  if (!sim) return <div className="loading-screen"><div className="spinner" style={{ width: 28, height: 28 }} /></div>

  const { partida, cenarios } = sim.dados
  const mostrarLucro = lucroVisivel(sim.dados)
  // No PDF, sem as sublinhas que repetem o total do lote da linha principal.
  const linhas = linhasComparativo().filter(l => (mostrarLucro || !l.lucro) && !(l.pai && /lote$|^Lote$/.test(l.rotulo)))
  const validos = cenarios.map(c => resultados[c.id]).filter(r => r && r.erros.length === 0 && r.lucroCabeca != null)
  const melhorId = mostrarLucro && validos.length >= 2 ? validos.reduce((a, b) => (b.lucroCabeca! > a.lucroCabeca! ? b : a)).cenarioId : null
  const notas = new Set<string>()
  for (const c of cenarios) {
    const r = resultados[c.id]
    if (!r || r.erros.length > 0) continue
    const n = notaConc(r, 'custo'); if (n) notas.add(n)
  }

  return (
    <div className="spdf">
      <style>{CSS}</style>
      <div className="spdf-acoes">
        <button className="btn btn-ghost" onClick={() => window.close()}>Fechar</button>
        <button className="btn btn-primary" onClick={() => window.print()}>Baixar PDF / imprimir</button>
      </div>

      <div className="spdf-topo">
        <div>
          <div className="spdf-marca">{fornecedor?.nome}</div>
          <div className="spdf-sub">Simulação de manejo bovino</div>
        </div>
        <div className="spdf-meta">
          <p className="spdf-titulo">{sim.nome}</p>
          <div>Atualizada em <strong>{fmtDataBr(sim.updated_at)}</strong></div>
          {autor && <div>{[autor.nome, autor.telefone, autor.email].filter(Boolean).join(' · ')}</div>}
        </div>
      </div>

      <h2>Ponto de partida</h2>
      <div className="spdf-grade">
        <div className="spdf-kpi"><span>Animais</span><strong>{fmtNum(num(partida.qtdAnimais), 0)}</strong></div>
        <div className="spdf-kpi"><span>Peso inicial médio</span><strong>{fmtNum(num(partida.pesoInicial), 1)} kg</strong></div>
        <div className="spdf-kpi"><span>{partida.compraModo === 'kg' ? 'Compra (R$/kg vivo)' : 'Compra (R$/cabeça)'}</span><strong>{fmt(num(partida.compraValor))}</strong></div>
        <div className="spdf-kpi"><span>Custo já incorrido</span><strong>{fmt(num(partida.custoAnteriorPorCabeca))}/cab.</strong></div>
      </div>

      <h2>Comparativo dos caminhos</h2>
      <table>
        <thead>
          <tr>
            <th>Indicador <span style={{ textTransform: 'none', fontWeight: 400 }}>(por cabeça, exceto os do lote{mostrarLucro ? ' e o lucro total' : ''})</span></th>
            {cenarios.map(c => <th key={c.id} className="num">{c.nome || 'Caminho'}{melhorId === c.id && <span className="melhor">Mais rentável</span>}</th>)}
          </tr>
        </thead>
        <tbody>
          {linhas.map(l => (
            <tr key={`${l.pai ?? ''}${l.rotulo}`} className={`${l.pai ? 'sub' : ''} ${l.destaque ? 'destaque' : ''}`}>
              <td>{l.rotulo}</td>
              {cenarios.map(c => {
                const r = resultados[c.id]
                if (!r || r.erros.length > 0) return <td key={c.id} className="num" style={{ color: '#5b6b62' }}>{l === linhas[0] ? 'Dados incompletos' : ''}</td>
                const cor = l.cor?.(r)
                return <td key={c.id} className={`num ${cor ? (cor.includes('red') ? 'neg' : 'pos') : ''}`}>{l.valor(r)}</td>
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {notas.size > 0 && <div className="spdf-nota">{Array.from(notas).join(' ')}</div>}

      <h2>Detalhe dos caminhos</h2>
      {cenarios.map(c => {
        const r = resultados[c.id]
        return (
          <div key={c.id} className="spdf-caminho">
            <div className="spdf-caminho-topo">
              <h3 style={{ margin: 0 }}>{c.nome || 'Caminho'}</h3>
              {mostrarLucro && num(c.venda.precoKg) > 0 && (
                <div style={{ fontSize: 13, color: '#33413a' }}>
                  Venda {fmt(num(c.venda.precoKg))}/kg vivo · comissão {fmtNum(num(c.venda.pctComissao), 1)}% · encargos {fmtNum(num(c.venda.pctEncargo), 1)}% · rendimento {fmtNum(num(c.venda.rendimentoPct), 1)}%
                </div>
              )}
            </div>
            {r && r.erros.length > 0 && <div className="spdf-nota" style={{ color: '#b91c1c' }}>{r.erros.join(' · ')}</div>}
            {c.ciclos.map((ci, idx) => <CicloPdf key={ci.id} ciclo={ci} indice={idx} r={r?.erros.length === 0 ? r : null} />)}
            {r && r.erros.length === 0 && (
              <div className="spdf-grade" style={{ marginTop: 14 }}>
                <div className="spdf-kpi"><span>Peso final</span><strong>{fmtNum(r.pesoFinal, 1)} kg</strong></div>
                <div className="spdf-kpi"><span>Dias totais</span><strong>{r.diasTotais}</strong></div>
                <div className="spdf-kpi"><span>Custo do kg produzido</span><strong>{r.custoMedioKgProduzido != null ? fmt(r.custoMedioKgProduzido) : '—'}</strong></div>
                {mostrarLucro
                  ? <div className="spdf-kpi"><span>Lucro por cabeça</span><strong className={sinal(r.lucroCabeca)}>{r.lucroCabeca != null ? fmt(r.lucroCabeca) : '—'}</strong></div>
                  : <div className="spdf-kpi"><span>Custo total</span><strong>{fmt(r.custoTotal)}/cab.</strong></div>}
              </div>
            )}
          </div>
        )
      })}

      <div className="spdf-rodape">
        <span>Preços de referência informados pela {fornecedor?.nome}. Os resultados são projeções a partir dos valores desta simulação.</span>
        <span>Portal de parceiros Confina+ · {new Date().toLocaleDateString('pt-BR')}</span>
      </div>
    </div>
  )
}

function CicloPdf({ ciclo, indice, r }: { ciclo: SimCiclo; indice: number; r: ResultadoCenario | null }) {
  const rc = r?.ciclos.find(x => x.cicloId === ciclo.id) ?? null
  const d = ciclo.dieta
  const porCabecaDia = ciclo.custoModo === 'cabeca_dia'
  const comPasto = pastoAtivo(d, ciclo.tipo)
  const custoMs = porCabecaDia ? null : custoKgMsDieta(d, comPasto)
  const lados = (['concentrado', 'volumoso'] as const).filter(t => (t === 'concentrado' ? num(d.pct_concentrado) : num(d.pct_volumoso)) > 0)

  return (
    <div className="spdf-ciclo">
      <strong>{indice + 1}. {ciclo.nome || `Ciclo ${indice + 1}`}</strong>
      <div className="spdf-ciclo-info">
        <span>{ROTULO_TIPO[ciclo.tipo]}</span>
        <span>{num(ciclo.dias)} dias</span>
        <span>GMD {fmtNum(num(ciclo.gmd), 3)} kg/dia</span>
        {rc && <span>{fmtNum(rc.pesoInicial, 1)} kg a {fmtNum(rc.pesoFinal, 1)} kg</span>}
        {porCabecaDia
          ? <span>Custo {fmt(num(ciclo.custoCabecaDia))}/cabeça/dia</span>
          : <span>{fmtNum(num(d.pct_consumo_pv_ms), 2)}% PV em MS · {fmtNum(num(d.pct_concentrado), 0)}% conc. / {fmtNum(num(d.pct_volumoso), 0)}% vol.{comPasto ? ' (pasto)' : ''}</span>}
        {d.origemNome && <span>Dieta {d.origemNome}</span>}
        {custoMs != null && <span>Custo da dieta <strong>{fmt(custoMs)}/kg MS</strong></span>}
        {rc?.conversao != null && <span>Conversão {fmtNum(rc.conversao, 2)}</span>}
        {rc && <span>Custo do ciclo <strong>{fmt(rc.custoTotal)}</strong>/cab.</span>}
        {rc?.custoKgProduzido != null && <span>Custo do kg produzido <strong>{fmt(rc.custoKgProduzido)}</strong></span>}
      </div>
      {!porCabecaDia && d.custo_manual_ativo && (
        <div className="spdf-nota">Custo da ração informado: {fmt(num(d.custo_manual_valor))} por {d.custo_manual_unidade === 'kg' ? 'kg' : 'tonelada'}{comPasto ? ' (concentrado)' : ''}.</div>
      )}
      {!porCabecaDia && comPasto && <div className="spdf-nota">Volumoso por pasto: {fmt(num(d.pasto_custo_kg_ms))}/kg MS.</div>}
      {!porCabecaDia && !d.custo_manual_ativo && d.componentes.length > 0 && (
        <table style={{ marginTop: 4 }}>
          <thead><tr><th>Ingrediente</th><th>Parte</th><th className="num">% part.</th><th className="num">% MS</th><th className="num">R$/kg MN</th><th className="num">R$/kg MS</th></tr></thead>
          <tbody>
            {lados.flatMap(tipo => {
              if (tipo === 'volumoso' && comPasto) return []
              const linhas = d.componentes.filter(x => x.tipo === tipo).map((x, i) => {
                const ms = num(x.pct_ms)
                return (
                  <tr key={`${tipo}-${i}`}>
                    <td>{x.nome}</td>
                    <td>{tipo === 'concentrado' ? 'Concentrado' : 'Volumoso'}</td>
                    <td className="num">{fmtNum(num(x.pct_participacao), 2)}</td>
                    <td className="num">{ms > 0 ? fmtNum(ms, 1) : '—'}</td>
                    <td className="num">{fmt(num(x.preco_kg))}</td>
                    <td className="num">{ms > 0 ? fmt(num(x.preco_kg) / (ms / 100)) : '—'}</td>
                  </tr>
                )
              })
              const lado = custoLadoKgMs(d, tipo)
              if (lado != null) linhas.push(
                <tr key={`${tipo}-total`} className="destaque">
                  <td colSpan={5}>Custo do {tipo}</td>
                  <td className="num">{fmt(lado)}/kg MS</td>
                </tr>,
              )
              return linhas
            })}
          </tbody>
        </table>
      )}
    </div>
  )
}
