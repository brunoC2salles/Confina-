// ─── Motor das animações do tutorial ─────────────────────────────────────────
// Cada mockup é uma sequência de "passos". O passo atual controla o que aparece
// na tela simulada; o cursor se move até o elemento marcado com data-alvo do
// passo e, se o passo tiver clique, mostra o efeito de clique ao chegar.
// A animação só roda quando o mockup está visível na tela. Com
// prefers-reduced-motion, o mockup fica parado no último passo, sem cursor.

import { createContext, ReactNode, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'

export interface Passo {
  legenda: string
  alvo?: string
  clique?: boolean
  dur: number
}

const LARGURA = 680
const LARGURA_COMPACTA = 560 // sem a barra lateral simulada, para telas estreitas
const ALTURA = 470

const CtxMovimento = createContext<{ reduzido: boolean }>({ reduzido: false })

function usePrefereMenosMovimento() {
  const [reduzido, setReduzido] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const atualizar = () => setReduzido(mq.matches)
    atualizar()
    mq.addEventListener('change', atualizar)
    return () => mq.removeEventListener('change', atualizar)
  }, [])
  return reduzido
}

// Texto sendo digitado dentro de um campo simulado.
export function Digita({ texto, ativo, velocidade = 55 }: { texto: string; ativo: boolean; velocidade?: number }) {
  const { reduzido } = useContext(CtxMovimento)
  const [n, setN] = useState(0)
  useEffect(() => {
    if (!ativo) { setN(0); return }
    if (reduzido) { setN(texto.length); return }
    setN(0)
    let i = 0
    const id = window.setInterval(() => {
      i += 1
      setN(i)
      if (i >= texto.length) window.clearInterval(id)
    }, velocidade)
    return () => window.clearInterval(id)
  }, [ativo, texto, velocidade, reduzido])
  const digitando = ativo && n < texto.length
  return <>{texto.slice(0, n)}{digitando && <span className="tt-caret" />}</>
}

const NAV_MINI = ['Dashboard', 'Lotes', 'Pesagens', 'Ranking', 'Comparativo', 'Importar', 'Dietas', 'Ingredientes', 'Parceiros']

export function Mockup({ pagina, rota, passos, children }: {
  pagina: string
  rota: string
  passos: Passo[]
  children: (p: number) => ReactNode
}) {
  const reduzido = usePrefereMenosMovimento()
  const [passo, setPasso] = useState(0)
  const [pausado, setPausado] = useState(false)
  const [visivel, setVisivel] = useState(false)
  const [escala, setEscala] = useState(1)
  const [compacto, setCompacto] = useState(false)
  const largura = compacto ? LARGURA_COMPACTA : LARGURA
  const [cursor, setCursor] = useState({ x: LARGURA_COMPACTA - 60, y: ALTURA - 40 })
  const [clicando, setClicando] = useState(false)

  const externoRef = useRef<HTMLDivElement>(null)
  const internoRef = useRef<HTMLDivElement>(null)

  // Escala o mockup (desenhado em 680x440) para caber na largura disponível.
  useLayoutEffect(() => {
    const el = externoRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const c = el.clientWidth < 520
      setCompacto(c)
      setEscala(Math.min(1.15, el.clientWidth / (c ? LARGURA_COMPACTA : LARGURA)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Só anima quando está na tela.
  useEffect(() => {
    const el = externoRef.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => setVisivel(e.isIntersecting), { threshold: 0.35 })
    io.observe(el)
    return () => io.disconnect()
  }, [])

  useEffect(() => { if (reduzido) setPasso(passos.length - 1) }, [reduzido, passos.length])

  const rodando = visivel && !pausado && !reduzido

  useEffect(() => {
    if (!rodando) return
    const id = window.setTimeout(() => setPasso(p => (p + 1) % passos.length), passos[passo].dur)
    return () => window.clearTimeout(id)
  }, [rodando, passo, passos])

  // Move o cursor até o alvo do passo atual.
  const posicionarCursor = useCallback(() => {
    const interno = internoRef.current
    const alvo = passos[passo].alvo
    if (!interno || !alvo) return
    const el = interno.querySelector<HTMLElement>(`[data-alvo="${alvo}"]`)
    if (!el) return
    const ri = interno.getBoundingClientRect()
    const re = el.getBoundingClientRect()
    setCursor({
      x: (re.left - ri.left + re.width / 2) / escala,
      y: (re.top - ri.top + re.height / 2) / escala,
    })
  }, [passo, passos, escala, compacto])

  useLayoutEffect(() => { posicionarCursor() }, [posicionarCursor])

  useEffect(() => {
    setClicando(false)
    if (!passos[passo].clique || !rodando) return
    const a = window.setTimeout(() => setClicando(true), 650)
    const b = window.setTimeout(() => setClicando(false), 1050)
    return () => { window.clearTimeout(a); window.clearTimeout(b) }
  }, [passo, passos, rodando])

  const irPara = (i: number) => { setPasso(i); setPausado(true) }
  const reiniciar = () => { setPasso(0); setPausado(false) }

  return (
    <CtxMovimento.Provider value={{ reduzido }}>
      <div className="tt-player">
        <div className="tt-palco" ref={externoRef} style={{ height: ALTURA * escala }}>
          <div className="tt-janela" ref={internoRef}
            style={{ width: largura, height: ALTURA, transform: `scale(${escala})` }}
            aria-hidden="true">
            <div className="tt-barra">
              <span className="tt-barra-url">confinamais.com{rota}</span>
              <span className="tt-barra-tag">Dados ilustrativos</span>
            </div>
            <div className="tt-app">
              {!compacto && <div className="tt-nav">
                {NAV_MINI.map(n => <div key={n} className={`tt-nav-item${n === pagina ? ' ativo' : ''}`}>{n}</div>)}
              </div>}
              <div className="tt-conteudo">{children(passo)}</div>
            </div>
            {!reduzido && (
              <div className={`tt-cursor${clicando ? ' clicando' : ''}`}
                style={{ transform: `translate(${cursor.x}px, ${cursor.y}px)` }}>
                <svg width="18" height="22" viewBox="0 0 18 22"><path d="M1 1 L1 17 L5.5 13 L8.5 20 L11.5 18.7 L8.6 12 L14.5 12 Z" fill="#1c1917" stroke="#fff" strokeWidth="1.4" strokeLinejoin="round" /></svg>
                <span className="tt-ripple" />
              </div>
            )}
          </div>
        </div>

        <div className="tt-roteiro">
          <div className="tt-controles">
            {!reduzido && (
              <button type="button" className="tt-ctrl" onClick={() => setPausado(v => !v)}>
                {pausado ? (
                  <><svg width="12" height="12" viewBox="0 0 12 12"><path d="M3 1.5v9l7-4.5z" fill="currentColor" /></svg>Reproduzir</>
                ) : (
                  <><svg width="12" height="12" viewBox="0 0 12 12"><rect x="2.5" y="1.5" width="2.5" height="9" fill="currentColor" /><rect x="7" y="1.5" width="2.5" height="9" fill="currentColor" /></svg>Pausar</>
                )}
              </button>
            )}
            <button type="button" className="tt-ctrl" onClick={reiniciar}>
              <svg width="12" height="12" viewBox="0 0 12 12"><path d="M6 2a4 4 0 1 1-3.6 2.3" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M1.5 1.5v3.2h3.2" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
              Reiniciar
            </button>
          </div>
          <ol className="tt-passos">
            {passos.map((p, i) => i === 0 ? null : (
              <li key={i} className={i === passo ? 'atual' : i < passo ? 'feito' : ''}>
                <button type="button" onClick={() => irPara(i)}>
                  <span className="tt-passo-n">{i}</span>
                  <span>{p.legenda}</span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </CtxMovimento.Provider>
  )
}
