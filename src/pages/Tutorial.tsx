// src/pages/Tutorial.tsx
// Página de tutorial de uso para novos usuários: passo a passo com mockups
// animados de cada tela, na ordem recomendada para começar na plataforma.

import { ReactNode, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './tutorial.css'
import {
  MockIngredientes, MockDietas, MockLotes, MockAnimais, MockCsv,
  MockImportarLote, MockPesagens, MockCompras, MockFornecimento, MockDietaPronta, MockAjusteInventario, MockComparativo, MockRanking, MockParceiros,
  MockSimulador,
} from '@/components/tutorial/Mockups'
import { SECOES_AJUDA } from '@/core/ajuda'

interface Secao {
  id: string
  titulo: string
  curto: string
  rota: string
  rotaLabel: string
  resumo: string
  dicas: string[]
  mockups: { titulo?: string; el: ReactNode }[]
}

const MOCKUPS: Record<string, Secao['mockups']> = {
  ingredientes: [{ el: <MockIngredientes /> }],
  dietas: [{ el: <MockDietas /> }],
  lotes: [{ el: <MockLotes /> }],
  animais: [{ el: <MockAnimais /> }],
  importacao: [
    { titulo: 'CSV dentro do lote', el: <MockCsv /> },
    { titulo: 'Importar lote completo (.xlsx)', el: <MockImportarLote /> },
  ],
  pesagens: [{ el: <MockPesagens /> }],
  comparativo: [{ el: <MockComparativo /> }],
  ranking: [{ el: <MockRanking /> }],
  fornecedores: [{ el: <MockParceiros /> }],
  compras: [
    { titulo: 'Registrar a compra de um ingrediente', el: <MockCompras /> },
    { titulo: 'Registrar o fornecimento de ração', el: <MockFornecimento /> },
    { titulo: 'Comprar dieta pronta para um grupo de lotes', el: <MockDietaPronta /> },
    { titulo: 'Ajustar o inventário de um ingrediente', el: <MockAjusteInventario /> },
  ],
  simulador: [{ el: <MockSimulador /> }],
}

const SECOES: Secao[] = SECOES_AJUDA.map(s => ({ ...s, mockups: MOCKUPS[s.id] ?? [] }))

function IconeDica() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 7v4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8" cy="4.8" r="0.95" fill="currentColor" />
    </svg>
  )
}

export default function Tutorial() {
  const navigate = useNavigate()
  const [ativa, setAtiva] = useState(SECOES[0].id)

  // Destaca no índice a seção que está na tela.
  useEffect(() => {
    const els = SECOES.map(s => document.getElementById(`tut-${s.id}`)).filter((e): e is HTMLElement => !!e)
    const io = new IntersectionObserver(entries => {
      const visiveis = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (visiveis[0]) setAtiva(visiveis[0].target.id.replace('tut-', ''))
    }, { rootMargin: '-15% 0px -70% 0px' })
    els.forEach(e => io.observe(e))
    return () => io.disconnect()
  }, [])

  const irPara = (id: string) => {
    document.getElementById(`tut-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="page tut-page">
      <header className="tut-cab">
        <h1>Tutorial de uso</h1>
        <p>Onze passos, na ordem em que a plataforma funciona melhor.</p>
      </header>

      <div className="tut-hero">
        <div className="tut-aviso">
          <span className="tut-aviso-play" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 12 12"><path d="M3.5 1.8v8.4l6.6-4.2z" fill="currentColor" /></svg>
          </span>
          <span>Cada etapa tem uma animação da tela. <strong>Clique no play</strong> para assistir e clique nos passos ao lado para ver cada um com calma.</span>
        </div>
        <ol className="tut-trilha">
          {SECOES.map((s, i) => (
            <li key={s.id}>
              <button type="button" onClick={() => irPara(s.id)}>
                <span className="tut-trilha-n">{i + 1}</span>
                <span className="tut-trilha-t">{s.curto}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      <nav className="tut-chips" aria-label="Etapas do tutorial">
        {SECOES.map((s, i) => (
          <button key={s.id} type="button" className={ativa === s.id ? 'ativa' : ''} onClick={() => irPara(s.id)}>
            {i + 1}. {s.curto}
          </button>
        ))}
      </nav>

      <div className="tut-corpo">
        <aside className="tut-indice" aria-label="Índice do tutorial">
          <div className="tut-indice-titulo">Etapas</div>
          <ol>
            {SECOES.map((s, i) => (
              <li key={s.id}>
                <button type="button" className={ativa === s.id ? 'ativa' : ''} onClick={() => irPara(s.id)}>
                  <span className="tut-indice-n">{i + 1}</span>{s.titulo}
                </button>
              </li>
            ))}
          </ol>
        </aside>

        <div className="tut-secoes">
          {SECOES.map((s, i) => (
            <section key={s.id} id={`tut-${s.id}`} className="tut-secao">
              <div className="tut-secao-cab">
                <span className="tut-secao-n">{i + 1}</span>
                <div className="tut-secao-info">
                  <h2>{s.titulo}</h2>
                  <p>{s.resumo}</p>
                </div>
                <button type="button" className="btn btn-ghost btn-sm tut-ir" onClick={() => navigate(s.rota)}>{s.rotaLabel}</button>
              </div>

              {s.mockups.map((m, j) => (
                <div key={j} className="tut-mock">
                  {m.titulo && <div className="tut-mock-titulo">{m.titulo}</div>}
                  {m.el}
                </div>
              ))}

              <ul className="tut-dicas">
                {s.dicas.map(d => (
                  <li key={d}><IconeDica /><span>{d}</span></li>
                ))}
              </ul>
            </section>
          ))}

          <div className="tut-fim">
            <div>
              <h2>Pronto para começar</h2>
              <p>Comece pelos ingredientes. Você pode voltar a este tutorial quando quiser, pelo menu lateral.</p>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => navigate('/ingredientes')}>Cadastrar ingredientes</button>
          </div>
        </div>
      </div>
    </div>
  )
}
