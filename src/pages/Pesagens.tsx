import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBuscaAnimalPorBrinco } from '@/hooks/useLotes'
import { PageHeader, EmptyState } from '@/components/common/UI'
import { fmtNum, fmtData } from '@/lib/calculations'
import type { Animal, Pesagem } from '@/types'

const hojeStr = () => new Date().toISOString().split('T')[0]

// ─── Página Pesagens ────────────────────────────────────────────────────────
// Achar um animal pelo brinco e lançar/editar/excluir pesagem sem precisar
// abrir o lote primeiro. O CRUD usado aqui é o mesmo de Lotes.tsx (funções
// de módulo em useLotes.ts) — mesma fonte, sem lógica duplicada.

type AnimalComLote = Animal & { lote_nome: string | null; lote_codigo: string | null }

export default function Pesagens() {
  const navigate = useNavigate()
  const {
    resultados, buscando, buscar,
    registrarPesagem, editarPesagem, excluirPesagem, buscarPesagens,
  } = useBuscaAnimalPorBrinco()

  const [termo, setTermo] = useState('')
  const [incluirInativos, setIncluirInativos] = useState(false)
  const [selecionado, setSelecionado] = useState<AnimalComLote | null>(null)

  useEffect(() => {
    const t = setTimeout(() => buscar(termo, incluirInativos), 250)
    return () => clearTimeout(t)
  }, [termo, incluirInativos, buscar])

  return (
    <div className="page">
      <PageHeader title="Pesagens" subtitle="Busque um animal pelo brinco e lance a pesagem direto, sem precisar abrir o lote" />

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="form-input"
            style={{ flex: 1, minWidth: 220 }}
            placeholder="Buscar por brinco..."
            value={termo}
            onChange={e => { setTermo(e.target.value); setSelecionado(null) }}
            autoFocus
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={incluirInativos} onChange={e => setIncluirInativos(e.target.checked)} />
            Incluir inativos
          </label>
        </div>

        {termo.trim() && !selecionado && (
          buscando ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 16 }}>
              <div className="spinner" style={{ width: 20, height: 20 }} />
            </div>
          ) : resultados.length === 0 ? (
            <div style={{ fontSize: 13, color: 'var(--gray-500)', padding: '4px 2px' }}>Nenhum animal encontrado com esse brinco.</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 280, overflowY: 'auto' }}>
              {resultados.map(a => (
                <button key={a.id}
                  onClick={() => setSelecionado(a)}
                  style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '8px 12px', borderRadius: 8, border: '1px solid #f0f0f0', background: '#fff',
                    cursor: 'pointer', textAlign: 'left', fontFamily: 'inherit',
                  }}>
                  <span>
                    <strong>{a.codigo}</strong>
                    <span style={{ color: 'var(--gray-500)', marginLeft: 8, fontSize: 12 }}>brinco {a.brinco}</span>
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--gray-500)', display: 'flex', gap: 8, alignItems: 'center' }}>
                    {a.status !== 'ativo' && (
                      <span style={{ background: '#f5f5f5', border: '1px solid #e0e0e0', borderRadius: 20, padding: '1px 8px' }}>
                        {a.status}
                      </span>
                    )}
                    {a.lote_nome ?? 'sem lote'}
                  </span>
                </button>
              ))}
            </div>
          )
        )}
      </div>

      {selecionado ? (
        <PainelAnimal
          key={selecionado.id}
          animal={selecionado}
          onVoltarBusca={() => setSelecionado(null)}
          onAbrirLote={() => selecionado.lote_atual_id && navigate(`/lotes?detalhe=${selecionado.lote_atual_id}&animal=${selecionado.id}`)}
          registrarPesagem={registrarPesagem}
          editarPesagem={editarPesagem}
          excluirPesagem={excluirPesagem}
          buscarPesagens={buscarPesagens}
        />
      ) : !termo.trim() ? (
        <div className="card">
          <EmptyState icon="⚖" title="Busque um animal pelo brinco"
            desc="Digite o brinco no campo acima para achar o animal e lançar a pesagem, sem precisar navegar até o lote." />
        </div>
      ) : null}
    </div>
  )
}

// ─── Painel do animal selecionado: dados básicos + histórico + nova pesagem ───

function PainelAnimal({
  animal, onVoltarBusca, onAbrirLote,
  registrarPesagem, editarPesagem, excluirPesagem, buscarPesagens,
}: {
  animal: AnimalComLote
  onVoltarBusca: () => void
  onAbrirLote: () => void
  registrarPesagem: (input: { animal_id: string; peso: number; data: string; observacoes?: string }) => Promise<{ error: string | null }>
  editarPesagem: (input: { id: string; animal_id: string; peso: number; data: string }) => Promise<{ error: string | null }>
  excluirPesagem: (id: string) => Promise<{ error: string | null }>
  buscarPesagens: (animalId: string) => Promise<Pesagem[]>
}) {
  const [historico, setHistorico] = useState<Pesagem[]>([])
  const [loading, setLoading] = useState(true)
  const [erro, setErro] = useState<string | null>(null)

  const [peso, setPeso] = useState('')
  const [data, setData] = useState(hojeStr())
  const [observacoes, setObservacoes] = useState('')
  const [saving, setSaving] = useState(false)

  const [editando, setEditando] = useState<string | null>(null)
  const [pesoEdit, setPesoEdit] = useState('')
  const [dataEdit, setDataEdit] = useState('')

  const carregar = useCallback(async () => {
    setLoading(true)
    const lista = await buscarPesagens(animal.id)
    setHistorico(lista)
    setLoading(false)
  }, [animal.id, buscarPesagens])

  useEffect(() => { carregar() }, [carregar])

  const handleRegistrar = async () => {
    const p = Number(peso)
    if (!p || p <= 0) { setErro('Informe um peso válido'); return }
    if (data < animal.data_entrada) { setErro('A data da pesagem não pode ser anterior à entrada do animal'); return }
    setErro(null)
    setSaving(true)
    const res = await registrarPesagem({ animal_id: animal.id, peso: p, data, observacoes: observacoes || undefined })
    setSaving(false)
    if (res.error) { setErro(res.error); return }
    setPeso(''); setObservacoes(''); setData(hojeStr())
    await carregar()
  }

  const iniciarEdicao = (p: Pesagem) => {
    setEditando(p.id); setPesoEdit(String(p.peso)); setDataEdit(p.data)
  }

  const salvarEdicao = async (id: string) => {
    const p = Number(pesoEdit)
    if (!p || p <= 0) { setErro('Peso inválido'); return }
    const res = await editarPesagem({ id, animal_id: animal.id, peso: p, data: dataEdit })
    if (res.error) { setErro(res.error); return }
    setEditando(null)
    await carregar()
  }

  const excluir = async (id: string) => {
    const res = await excluirPesagem(id)
    if (res.error) { setErro(res.error); return }
    await carregar()
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 600 }}>{animal.codigo} <span style={{ color: 'var(--gray-500)', fontWeight: 400, fontSize: 13 }}>brinco {animal.brinco}</span></div>
          <div style={{ fontSize: 12, color: 'var(--gray-500)', marginTop: 3, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <span>Entrada: {fmtData(animal.data_entrada)} · {fmtNum(animal.peso_entrada, 1)} kg</span>
            <span>Lote: {animal.lote_nome ?? 'sem lote'}</span>
            {animal.status !== 'ativo' && <span style={{ color: '#b91c1c' }}>Status: {animal.status}</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {animal.lote_atual_id && (
            <button className="btn btn-ghost btn-sm" onClick={onAbrirLote}>Abrir no lote</button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={onVoltarBusca}>Nova busca</button>
        </div>
      </div>

      <div className="card">
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>Lançar pesagem</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="form-group" style={{ maxWidth: 140 }}>
            <label className="form-label">Peso (kg)</label>
            <input className="form-input" type="number" step="0.1" value={peso} onChange={e => setPeso(e.target.value)} />
          </div>
          <div className="form-group" style={{ maxWidth: 160 }}>
            <label className="form-label">Data</label>
            <input className="form-input" type="date" value={data} onChange={e => setData(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: 180 }}>
            <label className="form-label">Observações (opcional)</label>
            <input className="form-input" value={observacoes} onChange={e => setObservacoes(e.target.value)} />
          </div>
          <button className="btn btn-primary" onClick={handleRegistrar} disabled={saving}>
            {saving ? <span className="spinner" style={{ width: 14, height: 14 }} /> : 'Registrar'}
          </button>
        </div>
        {erro && <div style={{ marginTop: 10, padding: 10, background: '#ffebee', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>{erro}</div>}
      </div>

      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #f0f0f0', fontWeight: 600, fontSize: 14 }}>
          Histórico de pesagens
        </div>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
            <div className="spinner" style={{ width: 22, height: 22 }} />
          </div>
        ) : historico.length === 0 ? (
          <div style={{ padding: 20 }}>
            <EmptyState icon="⚖" title="Nenhuma pesagem registrada ainda" />
          </div>
        ) : (
          <div className="table-wrap" style={{ borderRadius: 0, border: 'none' }}>
            <table>
              <thead>
                <tr><th>Data</th><th>Peso</th><th>Observações</th><th></th></tr>
              </thead>
              <tbody>
                {historico.map(p => (
                  <tr key={p.id}>
                    {editando === p.id ? (
                      <>
                        <td><input className="form-input" type="date" value={dataEdit} onChange={e => setDataEdit(e.target.value)} style={{ maxWidth: 150 }} /></td>
                        <td><input className="form-input" type="number" step="0.1" value={pesoEdit} onChange={e => setPesoEdit(e.target.value)} style={{ maxWidth: 100 }} /></td>
                        <td>{p.observacoes ?? '—'}</td>
                        <td style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-primary btn-sm" onClick={() => salvarEdicao(p.id)}>Salvar</button>
                          <button className="btn btn-ghost btn-sm" onClick={() => setEditando(null)}>Cancelar</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td>{fmtData(p.data)}</td>
                        <td>{fmtNum(p.peso, 1)} kg</td>
                        <td>{p.observacoes ?? '—'}</td>
                        <td style={{ display: 'flex', gap: 6 }}>
                          <button className="btn btn-ghost btn-sm" onClick={() => iniciarEdicao(p)}>Editar</button>
                          <button className="btn btn-ghost btn-sm" style={{ color: '#b91c1c' }} onClick={() => excluir(p.id)}>Excluir</button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
