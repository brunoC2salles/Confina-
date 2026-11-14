// Estrutura comum das páginas institucionais públicas (/assistentes e /privacidade).
import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import './institucional.css'

export const EMAIL_CONTATO = 'contato@confinamais.com'
export const URL_MCP = 'https://mcp.confinamais.com/mcp'

export function PaginaInstitucional({ ativo, selo, titulo, subtitulo, children }: {
  ativo: 'assistentes' | 'privacidade'
  selo: string
  titulo: string
  subtitulo: string
  children: ReactNode
}) {
  return (
    <div className="inst-page">
      <header className="inst-topo">
        <div className="inst-topo-in">
          <a href="https://www.confinamais.com"><img src="/logo.png" alt="Confina+" /></a>
          <nav>
            <Link to="/assistentes" className={ativo === 'assistentes' ? 'ativo' : undefined}>Assistentes de IA</Link>
            <Link to="/privacidade" className={ativo === 'privacidade' ? 'ativo' : undefined}>Privacidade</Link>
            <Link to="/login">Entrar</Link>
          </nav>
        </div>
      </header>
      <div className="inst-hero">
        <div className="inst-hero-in">
          <span className="inst-selo">{selo}</span>
          <h1>{titulo}</h1>
          <p>{subtitulo}</p>
        </div>
      </div>
      <main className="inst-corpo">{children}</main>
      <footer className="inst-rodape">
        <div className="inst-rodape-in">
          <span>CONFINAMAIS LTDA · CNPJ 68.246.114/0001-50</span>
          <span>Suporte: <a href={`mailto:${EMAIL_CONTATO}`}>{EMAIL_CONTATO}</a></span>
        </div>
      </footer>
    </div>
  )
}
