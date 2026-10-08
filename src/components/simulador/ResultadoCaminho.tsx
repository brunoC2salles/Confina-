import { useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts'
import { fmt, fmtNum } from '@/lib/calculations'
import type { ResultadoCenario } from '@/lib/simulador'

const corValor = (v: number | null) => v == null ? undefined : v >= 0 ? 'var(--green)' : 'var(--red)'

export function ResultadoCaminho({ r }: { r: ResultadoCenario }) {
  // Ciclo com a maior e a menor margem por kg produzido (só faz sentido com
  // preço de venda informado e 2 ou mais ciclos).
  const destaques = useMemo(() => {
    const comMargem = r.ciclos.filter(c => c.margemKg != null)
    if (comMargem.length < 2) return { melhor: null as string | null, pior: null as string | null }
    const ord = [...comMargem].sort((a, b) => (b.margemKg ?? 0) - (a.margemKg ?? 0))
    return { melhor: ord[0].cicloId, pior: ord[ord.length - 1].cicloId }
  }, [r])

  const negativos = r.ciclos.filter(c => c.margemKg != null && c.margemKg < 0)

  const curva = useMemo(() => {
    // Reduz a curva a no máximo ~200 pontos para o gráfico ficar leve.
    const passo = Math.max(1, Math.ceil(r.curva.length / 200))
    return r.curva.filter((_, i) => i % passo === 0 || i === r.curva.length - 1)
  }, [r.curva])

  if (r.erros.length > 0) {
    return (
      <div className="card" style={{ padding: 16, background: '#fff8e1', borderColor: '#fde68a' }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Complete os dados para ver o resultado</div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: 'var(--text-2)' }}>
          {r.erros.map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize: 14, fontWeight: 600 }}>
          Resultado por ciclo <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-3)' }}>· valores por cabeça</span>
        </div>
        <div className="table-wrap" style={{ border: 'none', borderRadius: 0 }}>
          <table>
            <thead>
              <tr>
                <th>Ciclo</th>
                <th>Dias</th>
                <th>Peso inicial / final</th>
                <th>Ganho</th>
                <th>Consumo MS</th>
                <th>Conversão</th>
                <th>Custo alimentação</th>
                <th>Custo estrutura</th>
                <th>Custo do kg produzido</th>
                <th>Margem por kg</th>
                <th>Resultado do ciclo</th>
              </tr>
            </thead>
            <tbody>
              {r.ciclos.map(c => (
                <tr key={c.cicloId}>
                  <td>
                    <strong>{c.nome}</strong>
                    {destaques.melhor === c.cicloId && <div><span className="badge badge-green" style={{ marginTop: 4, whiteSpace: 'nowrap' }}>Maior margem</span></div>}
                    {destaques.pior === c.cicloId && <div><span className="badge badge-red" style={{ marginTop: 4, whiteSpace: 'nowrap' }}>Menor margem</span></div>}
                  </td>
                  <td>{c.dias}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtNum(c.pesoInicial, 1)} / {fmtNum(c.pesoFinal, 1)} kg</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{fmtNum(c.ganho, 1)} kg</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{c.consumoMsKg != null ? `${fmtNum(c.consumoMsKg, 0)} kg` : '—'}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{c.conversao != null ? `${fmtNum(c.conversao, 2)} kg/kg` : '—'}</td>
                  <td>{fmt(c.custoAlimentacao)}</td>
                  <td>{fmt(c.custoEstrutura)}</td>
                  <td style={{ whiteSpace: 'nowrap' }}>{c.custoKgProduzido != null ? `${fmt(c.custoKgProduzido)}/kg` : '—'}</td>
                  <td style={{ whiteSpace: 'nowrap', color: corValor(c.margemKg), fontWeight: 600 }}>{c.margemKg != null ? `${fmt(c.margemKg)}/kg` : '—'}</td>
                  <td style={{ color: corValor(c.resultado), fontWeight: 600 }}>{c.resultado != null ? fmt(c.resultado) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ padding: '10px 16px', borderTop: '1px solid var(--border)', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>
          {r.precoLiquidoKg != null ? (
            <>
              Margem por kg = preço de venda líquido ({fmt(r.precoLiquidoKg)}/kg, já sem comissão e encargos) menos o custo do kg produzido no ciclo. Não inclui a compra do animal.
              {negativos.length > 0 && (
                <div style={{ color: 'var(--red)', marginTop: 4 }}>
                  {negativos.map(c => c.nome).join(', ')}: o kg produzido custa mais do que o valor de venda líquido.
                </div>
              )}
            </>
          ) : 'Informe o preço de venda do caminho para ver a margem de cada ciclo.'}
        </div>
      </div>

      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>Custo acumulado e valor do animal</div>
        <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12 }}>
          Por cabeça, em milhares de reais. Custo inclui compra e custo já incorrido. Valor do animal = peso x preço de venda líquido.
        </div>
        <div style={{ width: '100%', height: 280 }}>
          <ResponsiveContainer>
            <LineChart data={curva} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="dia" type="number" domain={[0, 'dataMax']} tick={{ fontSize: 11 }} minTickGap={16}
                ticks={[0, ...r.ciclos.slice(1).map(c => c.diaInicio), r.diasTotais]} tickFormatter={v => `${v}d`} />
              <YAxis tick={{ fontSize: 11 }} width={48} tickFormatter={v => `${fmtNum(v / 1000, 1)}k`} />
              <Tooltip formatter={(v: number) => fmt(v)} labelFormatter={l => `Dia ${l}`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {r.ciclos.slice(1).map(c => (
                <ReferenceLine key={c.cicloId} x={c.diaInicio} stroke="#bdbdbd" strokeDasharray="2 4"
                  label={{ value: c.nome, fontSize: 10, fill: '#9e9e9e', position: 'insideTopLeft', offset: 6 }} />
              ))}
              <Line type="monotone" dataKey="custoAcumulado" name="Custo acumulado" stroke="#b91c1c" dot={false} strokeWidth={2} />
              {r.precoLiquidoKg != null && (
                <Line type="monotone" dataKey="valorAnimal" name="Valor do animal" stroke="#2e7d32" dot={false} strokeWidth={2} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  )
}
