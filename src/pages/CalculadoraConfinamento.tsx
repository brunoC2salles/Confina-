// src/pages/CalculadoraConfinamento.tsx
import { useState, FormEvent } from 'react'
import { supabase } from '@/lib/supabase'
import { calcularConfinamento, CalculadoraResultado } from '@/lib/calculadoraConfinamento'
import './calculadora.css'

interface FormState {
  nomeCompleto: string
  nomePropriedade: string
  cidade: string
  areaTotal: string
  areaProdutivaReal: string
  numeroAnimais: string
}

const FORM_INICIAL: FormState = {
  nomeCompleto: '',
  nomePropriedade: '',
  cidade: '',
  areaTotal: '',
  areaProdutivaReal: '',
  numeroAnimais: '',
}

function formatarMoeda(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function formatarNumero(valor: number, casas = 0): string {
  return valor.toLocaleString('pt-BR', { maximumFractionDigits: casas })
}

export default function CalculadoraConfinamento() {
  const [form, setForm] = useState<FormState>(FORM_INICIAL)
  const [resultado, setResultado] = useState<CalculadoraResultado | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [detalheCochoAberto, setDetalheCochoAberto] = useState(false)

  function handleChange(campo: keyof FormState, valor: string) {
    setForm((prev) => ({ ...prev, [campo]: valor }))
  }

  function validar(): string | null {
    if (!form.nomeCompleto.trim()) return 'Informe o nome completo.'
    if (!form.nomePropriedade.trim()) return 'Informe o nome da propriedade.'
    if (!form.cidade.trim()) return 'Informe a cidade.'
    const areaTotal = Number(form.areaTotal)
    const areaProdutiva = Number(form.areaProdutivaReal)
    const numeroAnimais = Number(form.numeroAnimais)
    if (!areaTotal || areaTotal <= 0) return 'Informe a área total.'
    if (!areaProdutiva || areaProdutiva <= 0) return 'Informe a área produtiva real.'
    if (!numeroAnimais || numeroAnimais <= 0) return 'Informe o número de animais desejado.'
    return null
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setErro(null)

    const erroValidacao = validar()
    if (erroValidacao) {
      setErro(erroValidacao)
      return
    }

    // O formulário coleta a área em hectares (ha), mas o motor de cálculo
    // (calcularConfinamento) trabalha internamente em m² — conversão: 1 ha = 10.000 m².
    const HA_PARA_M2 = 10000
    const input = {
      nomeCompleto: form.nomeCompleto.trim(),
      nomePropriedade: form.nomePropriedade.trim(),
      cidade: form.cidade.trim(),
      areaTotal: Number(form.areaTotal) * HA_PARA_M2,
      areaProdutivaReal: Number(form.areaProdutivaReal) * HA_PARA_M2,
      numeroAnimais: Number(form.numeroAnimais),
    }

    const calculo = calcularConfinamento(input)
    setResultado(calculo)
    setDetalheCochoAberto(false)

    setEnviando(true)
    const { error } = await supabase.from('leads_calculadora').insert({
      nome_completo: input.nomeCompleto,
      nome_propriedade: input.nomePropriedade,
      cidade: input.cidade,
      area_total: input.areaTotal,
      area_produtiva_real: input.areaProdutivaReal,
      numero_animais: input.numeroAnimais,
      numero_cochos: calculo.numeroCochos,
      preco_por_animal: calculo.precoPorAnimal,
      preco_total: calculo.precoTotal,
      area_recomendada: calculo.areaRecomendada,
      area_suficiente: calculo.areaSuficiente,
    })
    setEnviando(false)

    if (error) {
      // O resultado já foi exibido ao produtor; falha de gravação não bloqueia a experiência,
      // apenas fica registrada no console para acompanhamento.
      console.error('Erro ao salvar lead da calculadora:', error.message)
    }
  }

  function handleNovoCalculo() {
    setResultado(null)
    setForm(FORM_INICIAL)
    setErro(null)
    setDetalheCochoAberto(false)
  }

  return (
    <div className="calc-page">
      <header className="calc-header">
        <img src="/logo.png" alt="Confina+" className="calc-logo" />
      </header>

      <main className="calc-main">
        {!resultado ? (
          <>
            <div className="calc-intro">
              <h1>Calculadora de Suplementação de Alto Volume</h1>
              <p>Descubra o investimento necessário para implantar uma suplementação de alto volume do zero, sob medida para a sua propriedade.</p>
            </div>

            <form className="calc-form" onSubmit={handleSubmit}>
              <div className="calc-field">
                <label htmlFor="nomeCompleto">Nome completo</label>
                <input
                  id="nomeCompleto"
                  type="text"
                  value={form.nomeCompleto}
                  onChange={(e) => handleChange('nomeCompleto', e.target.value)}
                  placeholder="Seu nome completo"
                />
              </div>

              <div className="calc-field">
                <label htmlFor="nomePropriedade">Nome da propriedade</label>
                <input
                  id="nomePropriedade"
                  type="text"
                  value={form.nomePropriedade}
                  onChange={(e) => handleChange('nomePropriedade', e.target.value)}
                  placeholder="Nome da fazenda ou propriedade"
                />
              </div>

              <div className="calc-field">
                <label htmlFor="cidade">Cidade</label>
                <input
                  id="cidade"
                  type="text"
                  value={form.cidade}
                  onChange={(e) => handleChange('cidade', e.target.value)}
                  placeholder="Cidade / UF"
                />
              </div>

              <div className="calc-row">
                <div className="calc-field">
                  <label htmlFor="areaTotal">Área total (ha)</label>
                  <input
                    id="areaTotal"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.areaTotal}
                    onChange={(e) => handleChange('areaTotal', e.target.value)}
                    placeholder="0"
                  />
                </div>

                <div className="calc-field">
                  <label htmlFor="areaProdutivaReal">Área produtiva real (ha)</label>
                  <input
                    id="areaProdutivaReal"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.areaProdutivaReal}
                    onChange={(e) => handleChange('areaProdutivaReal', e.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="calc-field">
                <label htmlFor="numeroAnimais">Número de animais desejado</label>
                <input
                  id="numeroAnimais"
                  type="number"
                  min="0"
                  value={form.numeroAnimais}
                  onChange={(e) => handleChange('numeroAnimais', e.target.value)}
                  placeholder="0"
                />
              </div>

              {erro && <div className="calc-erro">{erro}</div>}

              <button type="submit" className="calc-btn" disabled={enviando}>
                {enviando ? 'Calculando...' : 'Calcular investimento'}
              </button>
            </form>
          </>
        ) : (
          <div className="calc-resultado">
            <h1>Resultado da simulação</h1>
            <p className="calc-resultado-sub">
              {form.nomePropriedade} — {form.cidade}
            </p>

            <div className="calc-destaque">
              <div className="calc-destaque-item">
                <span className="calc-destaque-label">Preço por animal</span>
                <span className="calc-destaque-valor">{formatarMoeda(resultado.precoPorAnimal)}</span>
              </div>
              <div className="calc-destaque-item calc-destaque-total">
                <span className="calc-destaque-label">Investimento total</span>
                <span className="calc-destaque-valor">{formatarMoeda(resultado.precoTotal)}</span>
              </div>
            </div>

            <div className="calc-info-grid">
              <div className="calc-info-card">
                <span className="calc-info-label">Cochos / baias necessárias</span>
                <span className="calc-info-valor">{resultado.numeroCochos}</span>
                <span className="calc-info-nota">Capacidade instalada: {formatarNumero(resultado.capacidadeInstalada)} animais</span>
              </div>
              <div className="calc-info-card">
                <span className="calc-info-label">Área recomendada</span>
                <span className="calc-info-valor">{formatarNumero(resultado.areaRecomendada / 10000, 2)} ha</span>
                <span className={resultado.areaSuficiente ? 'calc-nota-ok' : 'calc-nota-alerta'}>
                  {resultado.areaSuficiente
                    ? 'Área produtiva informada é suficiente'
                    : 'Área produtiva informada é menor que a recomendada'}
                </span>
              </div>
            </div>

            <div className="calc-referencias">
              <div><span>Metragem linear de cocho</span><strong>{formatarNumero(resultado.metragemLinearCocho, 1)} m</strong></div>
              <div><span>Metragem linear de bebedouro</span><strong>{formatarNumero(resultado.metragemLinearBebedouro, 1)} m</strong></div>
              <div><span>Estoque de água necessário</span><strong>{formatarNumero(resultado.estoqueAguaNecessario)} L</strong></div>
              <div><span>Sobra artificial necessária</span><strong>{formatarNumero(resultado.sobraArtificialNecessaria)} m²</strong></div>
            </div>

            <h2>O que deve ser feito</h2>
            <div className="calc-tabela-wrap">
              <table className="calc-tabela">
                <thead>
                  <tr>
                    <th>Item</th>
                    <th>Quantidade</th>
                    <th>Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.materiais.map((item) => (
                    <tr key={item.nome}>
                      <td>{item.nome}</td>
                      <td>{item.quantidade} {item.unidade}</td>
                      <td>{formatarMoeda(item.valorTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {resultado.materiaisCocho.length > 0 && (
              <div className="calc-detalhe-cocho">
                <button
                  type="button"
                  className="calc-detalhe-toggle"
                  onClick={() => setDetalheCochoAberto((aberto) => !aberto)}
                >
                  {detalheCochoAberto ? 'Ocultar detalhamento do cocho' : 'Ver detalhamento do cocho (material item a item)'}
                </button>

                {detalheCochoAberto && (
                  <div className="calc-tabela-wrap calc-detalhe-cocho-tabela">
                    <table className="calc-tabela">
                      <thead>
                        <tr>
                          <th>Material</th>
                          <th>Quantidade</th>
                          <th>Valor de referência</th>
                        </tr>
                      </thead>
                      <tbody>
                        {resultado.materiaisCocho.map((item) => (
                          <tr key={item.nome}>
                            <td>{item.nome}</td>
                            <td>{formatarNumero(item.quantidade, 2)} {item.unidade}</td>
                            <td>{item.valorTotal > 0 ? formatarMoeda(item.valorTotal) : 'A definir'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <p className="calc-detalhe-cocho-nota">
                      Detalhamento de referência para orçamento de material. O valor cobrado no cocho
                      usa o custo fechado por metro; a soma destes itens pode não bater exatamente com ele.
                    </p>
                  </div>
                )}
              </div>
            )}

            <button type="button" className="calc-btn calc-btn-secundario" onClick={handleNovoCalculo}>
              Fazer novo cálculo
            </button>
          </div>
        )}
      </main>
    </div>
  )
}
