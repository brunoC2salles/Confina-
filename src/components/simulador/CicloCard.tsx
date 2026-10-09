import { useMemo, useState } from 'react'
import { getPctMsEfetivo, type Dieta, type IngredienteDisponivel } from '@/hooks/useDietas'
import { fmt } from '@/lib/calculations'
import {
  num, custoKgMsDieta, custoLadoKgMs, validarDieta, dietaVazia,
  type SimCiclo, type SimDieta, type SimComponente, type TipoCicloSim,
} from '@/lib/simulador'

const categoriaLabel: Record<string, string> = {
  volumoso: 'Volumoso',
  concentrado_energetico: 'Conc. Energético',
  concentrado_proteico: 'Conc. Proteico',
  mineral_aditivo: 'Mineral / Aditivo',
  subproduto: 'Subproduto',
}

const tipoLabel: Record<TipoCicloSim, string> = {
  confinamento: 'Confinamento',
  pastagem: 'Pastagem',
  misto: 'Misto (pasto + ração)',
}

const keyDisp = (i: IngredienteDisponivel) => `${i.origem}:${i.id}`

// Copia uma dieta cadastrada para dentro do ciclo. A cópia é independente:
// alterar aqui não mexe no cadastro da dieta.
function copiarDieta(d: Dieta): SimDieta {
  return {
    origemNome: d.nome,
    pct_consumo_pv_ms: String(d.pct_consumo_pv_ms ?? ''),
    pct_concentrado: String(d.pct_concentrado ?? 100),
    pct_volumoso: String(d.pct_volumoso ?? 0),
    gmd_concentrado: d.gmd_esperado_concentrado != null ? String(d.gmd_esperado_concentrado) : '',
    custo_manual_ativo: !!d.custo_manual_ativo,
    custo_manual_valor: d.custo_manual_valor != null ? String(d.custo_manual_valor) : '',
    custo_manual_unidade: d.custo_manual_unidade ?? 'ton',
    componentes: (d.componentes ?? []).map(c => {
      const id = (c.origem_ingrediente === 'insumo_padrao' ? c.insumo_id : c.ingrediente_produtor_id) ?? ''
      const pctMs = getPctMsEfetivo(c)
      return {
        key: `${c.origem_ingrediente}:${id}`,
        nome: c.insumo?.nome ?? c.ingrediente_produtor?.nome ?? '—',
        categoria: c.insumo?.categoria ?? c.ingrediente_produtor?.categoria ?? '',
        tipo: c.tipo,
        origem: c.origem_ingrediente,
        ingredienteId: id,
        pct_participacao: String(c.pct_participacao ?? ''),
        pct_ms: pctMs != null ? String(pctMs) : '',
        preco_kg: String(c.preco_kg ?? ''),
      }
    }),
  }
}

export function CicloCard({
  ciclo, indice, total, dietas, ingredientes, onChange, onRemove, onMover,
}: {
  ciclo: SimCiclo
  indice: number
  total: number
  dietas: Dieta[]
  ingredientes: IngredienteDisponivel[]
  onChange: (c: SimCiclo) => void
  onRemove: () => void
  onMover: (direcao: -1 | 1) => void
}) {
  const [dietaAberta, setDietaAberta] = useState(ciclo.dieta.componentes.length === 0 && !ciclo.dieta.custo_manual_ativo)
  const set = (patch: Partial<SimCiclo>) => onChange({ ...ciclo, ...patch })
  const setDieta = (patch: Partial<SimDieta>) => onChange({ ...ciclo, dieta: { ...ciclo.dieta, ...patch } })

  const usaCabecaDia = ciclo.tipo === 'pastagem' && ciclo.custoModo === 'cabeca_dia'
  const custoMs = custoKgMsDieta(ciclo.dieta)
  const erroDieta = usaCabecaDia ? null : validarDieta(ciclo.dieta)

  const usarDietaCadastrada = (id: string) => {
    const d = dietas.find(x => x.id === id)
    if (!d) return
    if ((ciclo.dieta.componentes.length > 0 || ciclo.dieta.custo_manual_ativo)
      && !window.confirm(`Substituir a dieta deste ciclo pela cópia de "${d.nome}"?`)) return
    onChange({ ...ciclo, dieta: copiarDieta(d), gmd: d.gmd_esperado ? String(d.gmd_esperado) : ciclo.gmd })
    setDietaAberta(false)
  }

  const montarManual = () => {
    if (!window.confirm('Descartar a dieta copiada e montar uma dieta à mão neste ciclo?')) return
    setDieta(dietaVazia())
    setDietaAberta(true)
  }

  const fieldLabel: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4, display: 'block' }

  return (
    <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="flex-between" style={{ gap: 8, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: '1 1 220px', minWidth: 0 }}>
          <span className="badge badge-green" style={{ flexShrink: 0 }}>Ciclo {indice + 1}</span>
          <input className="form-input" value={ciclo.nome} placeholder="Nome do ciclo"
            onChange={e => set({ nome: e.target.value })} style={{ fontWeight: 600 }} />
        </div>
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          <button type="button" className="btn btn-ghost btn-sm" disabled={indice === 0} onClick={() => onMover(-1)} title="Mover para cima">Subir</button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={indice === total - 1} onClick={() => onMover(1)} title="Mover para baixo">Descer</button>
          <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} disabled={total <= 1} onClick={onRemove}>Remover</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <div>
          <label style={fieldLabel}>Tipo</label>
          <select className="form-input" value={ciclo.tipo}
            onChange={e => {
              const tipo = e.target.value as TipoCicloSim
              set({ tipo, custoModo: tipo === 'pastagem' ? ciclo.custoModo : 'dieta' })
            }}>
            {(Object.keys(tipoLabel) as TipoCicloSim[]).map(t => <option key={t} value={t}>{tipoLabel[t]}</option>)}
          </select>
        </div>
        <div>
          <label style={fieldLabel}>Dias</label>
          <input className="form-input" type="number" min="1" step="1" value={ciclo.dias} onChange={e => set({ dias: e.target.value })} />
        </div>
        <div>
          <label style={fieldLabel}>GMD esperado (kg/dia)</label>
          <input className="form-input" type="number" step="0.01" value={ciclo.gmd} onChange={e => set({ gmd: e.target.value })} />
        </div>
        <div>
          <label style={fieldLabel}>Mão de obra + estrutura (R$/kg produzido)</label>
          <input className="form-input" type="number" step="0.01" value={ciclo.estruturaPorKg} onChange={e => set({ estruturaPorKg: e.target.value })} />
        </div>
      </div>

      {ciclo.tipo === 'pastagem' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="pill-wrap" style={{ marginBottom: 0 }}>
            <button type="button" className={`pill${!usaCabecaDia ? ' active' : ''}`} onClick={() => set({ custoModo: 'dieta' })}>Custo pela dieta</button>
            <button type="button" className={`pill${usaCabecaDia ? ' active' : ''}`} onClick={() => set({ custoModo: 'cabeca_dia' })}>Custo fixo R$/cabeça/dia</button>
          </div>
          {usaCabecaDia && (
            <div style={{ flex: '0 1 200px' }}>
              <label style={fieldLabel}>Custo (R$/cabeça/dia)</label>
              <input className="form-input" type="number" step="0.01" value={ciclo.custoCabecaDia} onChange={e => set({ custoCabecaDia: e.target.value })} />
            </div>
          )}
        </div>
      )}

      {!usaCabecaDia && (
        <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
          <div className="flex-between" style={{ gap: 8, flexWrap: 'wrap' }}>
            <div style={{ fontSize: 13 }}>
              <strong>Dieta</strong>
              {ciclo.dieta.origemNome && <span style={{ color: 'var(--text-3)' }}> · cópia de {ciclo.dieta.origemNome}</span>}
              <span style={{ color: 'var(--text-2)' }}>
                {' '}· {num(ciclo.dieta.pct_consumo_pv_ms)}% PV · {num(ciclo.dieta.pct_concentrado)}% conc / {num(ciclo.dieta.pct_volumoso)}% vol
                {custoMs != null && <> · <strong style={{ color: 'var(--green)' }}>{fmt(custoMs)}/kg MS</strong></>}
              </span>
              {erroDieta && <div style={{ fontSize: 12, color: 'var(--red)', marginTop: 2 }}>{erroDieta}</div>}
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {dietas.length > 0 && (
                <select className="form-input" style={{ width: 'auto', maxWidth: 240, height: 32, fontSize: 13 }} value=""
                  onChange={e => { if (e.target.value) usarDietaCadastrada(e.target.value) }}>
                  <option value="">Copiar dieta cadastrada...</option>
                  {dietas.map(d => <option key={d.id} value={d.id}>{d.nome}</option>)}
                </select>
              )}
              {ciclo.dieta.origemNome && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={montarManual}>Montar à mão</button>
              )}
              {!ciclo.dieta.origemNome && (
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => setDietaAberta(v => !v)}>
                  {dietaAberta ? 'Fechar dieta' : 'Editar dieta'}
                </button>
              )}
            </div>
          </div>
          {dietaAberta && !ciclo.dieta.origemNome && <EditorDieta dieta={ciclo.dieta} ingredientes={ingredientes} onChange={setDieta} gmdCiclo={num(ciclo.gmd)} />}
        </div>
      )}
    </div>
  )
}

// ─── Editor da dieta do ciclo (mesmos campos da criação de dietas) ─────────

function EditorDieta({ dieta, ingredientes, onChange, gmdCiclo }: {
  dieta: SimDieta
  ingredientes: IngredienteDisponivel[]
  onChange: (patch: Partial<SimDieta>) => void
  gmdCiclo: number
}) {
  const pc = num(dieta.pct_concentrado)
  const pv = num(dieta.pct_volumoso)
  const fieldLabel: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: 'var(--text-2)', marginBottom: 4, display: 'block' }

  const porCategoria = useMemo(() => {
    const g: Record<string, IngredienteDisponivel[]> = {}
    ingredientes.forEach(i => { (g[i.categoria] ??= []).push(i) })
    return g
  }, [ingredientes])

  const addComp = (tipo: 'concentrado' | 'volumoso', ing: IngredienteDisponivel) => {
    const novo: SimComponente = {
      key: keyDisp(ing), nome: ing.nome, categoria: ing.categoria, tipo,
      origem: ing.origem, ingredienteId: ing.id,
      pct_participacao: '', pct_ms: ing.pct_ms != null ? String(ing.pct_ms) : '',
      preco_kg: String(ing.preco_kg_padrao ?? 0),
    }
    onChange({ componentes: [...dieta.componentes, novo] })
  }
  const updComp = (idx: number, patch: Partial<SimComponente>) =>
    onChange({ componentes: dieta.componentes.map((c, i) => i === idx ? { ...c, ...patch } : c) })
  const remComp = (idx: number) => onChange({ componentes: dieta.componentes.filter((_, i) => i !== idx) })

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
        <div>
          <label style={fieldLabel}>Consumo (% PV em MS)</label>
          <input className="form-input" type="number" step="0.01" value={dieta.pct_consumo_pv_ms}
            onChange={e => onChange({ pct_consumo_pv_ms: e.target.value })} />
        </div>
        <div>
          <label style={fieldLabel}>% Concentrado</label>
          <input className="form-input" type="number" step="0.1" value={dieta.pct_concentrado}
            onChange={e => onChange({ pct_concentrado: e.target.value, pct_volumoso: String(Math.max(0, 100 - num(e.target.value))) })} />
        </div>
        <div>
          <label style={fieldLabel}>% Volumoso</label>
          <input className="form-input" type="number" step="0.1" value={dieta.pct_volumoso}
            onChange={e => onChange({ pct_volumoso: e.target.value, pct_concentrado: String(Math.max(0, 100 - num(e.target.value))) })} />
        </div>
        {pc > 0 && pv > 0 && (
          <div>
            <label style={fieldLabel}>GMD do concentrado (kg/dia)</label>
            <input className="form-input" type="number" step="0.01" placeholder={`= GMD do ciclo (${gmdCiclo})`} value={dieta.gmd_concentrado}
              onChange={e => onChange({ gmd_concentrado: e.target.value })} />
          </div>
        )}
      </div>
      {pc > 0 && pv > 0 && (
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: -6 }}>
          GMD do concentrado é usado só na Conversão. Em branco, usa o GMD do ciclo.
        </div>
      )}

      <div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
          <input type="checkbox" checked={dieta.custo_manual_ativo} onChange={e => onChange({ custo_manual_ativo: e.target.checked })} />
          Usar custo manual (preço geral da ração)
        </label>
        {dieta.custo_manual_ativo && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginTop: 8 }}>
            <div>
              <label style={fieldLabel}>Custo da ração</label>
              <input className="form-input" type="number" step="0.01" value={dieta.custo_manual_valor}
                onChange={e => onChange({ custo_manual_valor: e.target.value })} />
            </div>
            <div>
              <label style={fieldLabel}>Unidade</label>
              <select className="form-input" value={dieta.custo_manual_unidade}
                onChange={e => onChange({ custo_manual_unidade: e.target.value as 'kg' | 'ton' })}>
                <option value="kg">R$ por kg</option>
                <option value="ton">R$ por tonelada</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {!dieta.custo_manual_ativo && (['concentrado', 'volumoso'] as const).map(tipo => {
        const pct = tipo === 'concentrado' ? pc : pv
        if (pct <= 0) return null
        const doTipo = dieta.componentes.map((c, idx) => ({ c, idx })).filter(x => x.c.tipo === tipo)
        const soma = doTipo.reduce((s, x) => s + num(x.c.pct_participacao), 0)
        const jaAdicionados = new Set(doTipo.map(x => x.c.key))
        const custoLado = custoLadoKgMs(dieta, tipo)
        const labelMini: React.CSSProperties = { fontSize: 10, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2, display: 'block' }
        return (
          <div key={tipo} style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div className="flex-between" style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{tipo === 'concentrado' ? 'Concentrado' : 'Volumoso'} ({pct}%)</div>
              <div style={{ fontSize: 12, color: Math.abs(soma - 100) < 0.01 ? 'var(--green)' : 'var(--red)' }}>
                Soma: {soma.toFixed(2)}% {Math.abs(soma - 100) < 0.01 ? 'OK' : '(precisa somar 100)'}
              </div>
            </div>
            {doTipo.length === 0 ? (
              <div style={{ padding: '10px 14px', background: 'var(--gray-50)', borderRadius: 8, fontSize: 12, color: 'var(--gray-500)', textAlign: 'center' }}>
                Nenhum ingrediente. Adicione abaixo.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {doTipo.map(({ c, idx }) => (
                  <div key={idx} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-end', padding: '8px 8px 10px', background: 'var(--gray-50)', borderRadius: 8 }}>
                    <div style={{ flex: '1 1 130px', minWidth: 110 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, overflowWrap: 'break-word' }}>{c.nome}</div>
                      <div style={{ fontSize: 10, color: 'var(--gray-400)' }}>
                        {categoriaLabel[c.categoria] ?? c.categoria}{c.origem === 'ingrediente_produtor' ? ' · próprio' : ''}
                      </div>
                    </div>
                    <div style={{ flex: '0 1 76px', minWidth: 68 }}>
                      <label style={labelMini}>% Part.</label>
                      <input className="form-input" type="number" step="0.1" value={c.pct_participacao} placeholder="0"
                        onChange={e => updComp(idx, { pct_participacao: e.target.value })} style={{ fontSize: 13 }} />
                    </div>
                    <div style={{ flex: '0 1 76px', minWidth: 68 }}>
                      <label style={labelMini}>% MS</label>
                      <input className="form-input" type="number" step="0.1" value={c.pct_ms} placeholder="preencha"
                        onChange={e => updComp(idx, { pct_ms: e.target.value })}
                        style={{ fontSize: 13, background: num(c.pct_ms) <= 0 ? '#fff8e1' : undefined }} />
                    </div>
                    <div style={{ flex: '0 1 90px', minWidth: 78 }}>
                      <label style={labelMini}>R$/kg MN</label>
                      <input className="form-input" type="number" step="0.0001" value={c.preco_kg} placeholder="0"
                        onChange={e => updComp(idx, { preco_kg: e.target.value })} style={{ fontSize: 13 }} />
                    </div>
                    <button type="button" onClick={() => remComp(idx)} aria-label="Remover ingrediente"
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9e9e9e', fontSize: 18, padding: '0 2px 6px', flexShrink: 0 }}>×</button>
                  </div>
                ))}
              </div>
            )}
            {custoLado != null && doTipo.length > 0 && (
              <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 6, textAlign: 'right' }}>
                Custo do {tipo}: <strong style={{ color: 'var(--green)' }}>{fmt(custoLado)}/kg MS</strong>
              </div>
            )}
            <div style={{ marginTop: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--gray-500)', marginBottom: 4 }}>Adicionar ingrediente:</div>
              {Object.entries(porCategoria).map(([cat, lista]) => {
                const disponiveis = lista.filter(i => !jaAdicionados.has(keyDisp(i)))
                if (disponiveis.length === 0) return null
                return (
                  <div key={cat} style={{ marginBottom: 6 }}>
                    <div style={{ fontSize: 10, color: 'var(--gray-400)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 }}>
                      {categoriaLabel[cat] ?? cat}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {disponiveis.map(ing => (
                        <button key={keyDisp(ing)} type="button"
                          style={{ fontSize: 11, padding: '3px 8px', background: 'var(--gray-50)', border: '1px solid var(--border)', borderRadius: 6, cursor: 'pointer', color: 'var(--gray-600)' }}
                          onClick={() => addComp(tipo, ing)}>
                          + {ing.nome}{ing.origem === 'ingrediente_produtor' ? ' *' : ''}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
