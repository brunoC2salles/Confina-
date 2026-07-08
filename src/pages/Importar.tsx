import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDietas } from '@/hooks/useDietas'
import { useImportarLote, type ErroImportacao, type ResultadoImportacao } from '@/hooks/useImportarLote'
import { PageHeader } from '@/components/common/UI'

export default function Importar() {
  const navigate = useNavigate()
  const { dietas, loading: loadingDietas } = useDietas()
  const { importar, importando, progresso } = useImportarLote()

  const [arquivo, setArquivo] = useState<File | null>(null)
  const [errosValidacao, setErrosValidacao] = useState<ErroImportacao[] | null>(null)
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const escolherArquivo = (f: File | null) => {
    setArquivo(f)
    setErrosValidacao(null)
    setErroGeral(null)
    setResultado(null)
  }

  const executar = async () => {
    if (!arquivo) return
    setErrosValidacao(null)
    setErroGeral(null)
    setResultado(null)
    const res = await importar(arquivo, dietas)
    if (res.errors) setErrosValidacao(res.errors)
    else if (res.error) setErroGeral(res.error)
    else if (res.resultado) setResultado(res.resultado)
  }

  return (
    <div className="page">
      <PageHeader title="Importar lote" subtitle="Traga o histórico de um lote a partir de uma planilha — cada arquivo vira um lote novo" />

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Como funciona</div>
        <ol style={{ paddingLeft: 20, fontSize: 13, color: 'var(--gray-500)', lineHeight: 1.8 }}>
          <li>Baixe o modelo abaixo e preencha as 6 abas (Lote, Compras, Animais, Pesagens, Vendas, Custos).</li>
          <li>Os nomes de dieta usados na aba "Lote" precisam bater exatamente com uma dieta já cadastrada em <em>Dietas</em>.</li>
          <li>Envie o arquivo preenchido aqui. A planilha inteira é validada antes de qualquer gravação — se houver erro, nada é importado.</li>
        </ol>
        <a href="/templates/modelo-importacao.xlsx" download className="btn btn-ghost btn-sm" style={{ marginTop: 12, display: 'inline-block', textDecoration: 'none' }}>
          Baixar modelo (.xlsx)
        </a>
      </div>

      {!loadingDietas && dietas.length === 0 && (
        <div className="card" style={{ marginBottom: 20, borderColor: '#f59e0b' }}>
          Você ainda não tem nenhuma dieta cadastrada. Cadastre ao menos uma em <em>Dietas</em> antes de importar, para poder referenciá-la na aba "Lote" da planilha.
        </div>
      )}

      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="form-group">
          <label className="form-label">Planilha preenchida (.xlsx)</label>
          <input
            ref={inputRef} type="file" accept=".xlsx" className="form-input"
            onChange={e => escolherArquivo(e.target.files?.[0] ?? null)}
          />
        </div>

        {importando && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, color: 'var(--gray-500)' }}>
            <div className="spinner" style={{ width: 18, height: 18 }} />
            {progresso || 'Importando...'}
          </div>
        )}

        {errosValidacao && errosValidacao.length > 0 && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 14 }}>
            <div style={{ fontWeight: 600, color: '#b91c1c', marginBottom: 8 }}>
              {errosValidacao.length} problema(s) encontrado(s) — nada foi importado
            </div>
            <div className="table-wrap" style={{ maxHeight: 320, overflowY: 'auto' }}>
              <table>
                <thead><tr><th>Aba</th><th>Linha</th><th>Problema</th></tr></thead>
                <tbody>
                  {errosValidacao.map((e, i) => (
                    <tr key={i}><td>{e.aba}</td><td>{e.linha}</td><td>{e.mensagem}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {erroGeral && (
          <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 8, padding: 14, color: '#b91c1c', fontSize: 13 }}>
            {erroGeral}
          </div>
        )}

        {resultado && (
          <div style={{ background: '#e8f5e9', border: '1px solid #a5d6a7', borderRadius: 8, padding: 14 }}>
            <div style={{ fontWeight: 600, color: '#1b5e20', marginBottom: 6 }}>
              Lote "{resultado.loteNome}" importado com sucesso
            </div>
            <div style={{ fontSize: 13, color: '#2e7d32' }}>
              {resultado.qtdAnimais} animal(is) · {resultado.qtdPesagens} pesagem(ns) · {resultado.qtdVendas} venda(s) · {resultado.qtdCustos} custo(s)
            </div>
            <button className="btn btn-primary btn-sm" style={{ marginTop: 10 }} onClick={() => navigate('/lotes')}>
              Ver lote
            </button>
          </div>
        )}

        <div>
          <button className="btn btn-primary" disabled={!arquivo || importando || loadingDietas} onClick={executar}>
            {importando ? 'Importando...' : 'Validar e importar'}
          </button>
        </div>
      </div>
    </div>
  )
}
