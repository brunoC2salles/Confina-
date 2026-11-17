import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { usePortal } from '@/portal/PortalContext'
import { IconeSair } from '@/components/common/NavIcons'

interface ItemNav { to: string; label: string; end?: boolean }

export function navDoPortal(p: ReturnType<typeof usePortal>): ItemNav[] {
  if (p.fornecedor && p.papel) {
    const itens: ItemNav[] = [
      { to: '/', label: 'Painel', end: true },
      { to: '/pedidos', label: 'Pedidos' },
      { to: '/entregas', label: 'Entregas' },
      { to: '/demanda', label: 'Previsão de demanda' },
      { to: '/clientes', label: 'Clientes' },
      { to: '/catalogo', label: 'Produtos' },
      { to: '/simulador', label: 'Simulador' },
    ]
    if (p.papel === 'gestor') itens.push({ to: '/equipe', label: 'Equipe e convites' })
    if (p.admin) itens.push({ to: '/admin', label: 'Fornecedores' })
    itens.push({ to: '/tutorial', label: 'Tutorial' })
    return itens
  }
  if (p.admin) return [{ to: '/admin', label: 'Fornecedores', end: true }]
  if (p.vinculo?.cliente.modo === 'estoque') return [
    { to: '/', label: 'Estoque', end: true },
    { to: '/meus-pedidos', label: 'Pedidos' },
  ]
  if (p.vinculo) return [{ to: '/', label: 'Pedidos', end: true }]
  return []
}

export function PortalLayout() {
  const portal = usePortal()
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [aberto, setAberto] = useState(false)
  const itens = navDoPortal(portal)
  const nome = user?.user_metadata?.nome || portal.membro?.nome || user?.email || 'Usuário'
  const rotulo = portal.papel === 'gestor' ? (portal.membro ? 'Gestor' : 'Administrador')
    : portal.papel === 'vendedor' ? 'Vendedor'
      : portal.admin ? 'Administrador' : portal.vinculo ? 'Cliente' : ''
  const titulo = portal.fornecedor?.nome ?? portal.vinculo?.fornecedor.nome ?? 'Portal de parceiros'

  const linkStyle = (ativo: boolean) => ({
    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 8, fontSize: 13,
    textDecoration: 'none', fontWeight: ativo ? 500 : 400, marginBottom: 2,
    color: ativo ? '#1b5e20' : '#616161', background: ativo ? '#e8f5e9' : 'transparent',
  } as React.CSSProperties)

  return (
    <div className="app">
      <div className="mobile-topbar">
        <button className="hamburger-btn" aria-label="Abrir menu" onClick={() => setAberto(true)}><span /><span /><span /></button>
        <img src="/logo.png" alt="Confina+" style={{ height: 32, objectFit: 'contain' }} />
        <div style={{ width: 40 }} />
      </div>
      <div className={`sidebar-backdrop${aberto ? ' open' : ''}`} onClick={() => setAberto(false)} />
      <aside className={`sidebar${aberto ? ' sidebar-open' : ''}`} style={{ background: '#fff', borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', height: '100vh', flexShrink: 0 }}>
        <div className="sidebar-topo" style={{ borderBottom: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
          <img className="sidebar-logo" src="/logo.png" alt="Confina+" style={{ objectFit: 'contain' }} />
        </div>
        <div style={{ padding: '14px 16px 6px' }}>
          <div style={{ fontSize: 10, color: '#bdbdbd', letterSpacing: '0.6px', textTransform: 'uppercase' }}>Portal de parceiros</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#1b5e20', marginTop: 2 }}>{titulo}</div>
          {portal.admin && portal.fornecedores.length > 0 && (
            <select className="form-input" style={{ marginTop: 8, height: 32, fontSize: 12 }} value={portal.fornecedor?.id ?? ''}
              onChange={e => { portal.escolherFornecedor(e.target.value); navigate('/') }}>
              <option value="">Nenhum fornecedor</option>
              {portal.fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
            </select>
          )}
        </div>
        <nav className="sidebar-nav" style={{ flex: 1, overflowY: 'auto' }}>
          {itens.map(n => (
            <NavLink key={n.to} to={n.to} end={n.end} onClick={() => setAberto(false)} className="sidebar-link" style={({ isActive }) => linkStyle(isActive)}>
              <span className="sidebar-rotulo">{n.label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-rodape" style={{ borderTop: '1px solid #f0f0f0' }}>
          <div className="sidebar-usuario" style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#e8f5e9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: '#2e7d32', flexShrink: 0 }}>
              {String(nome).split(' ').slice(0, 2).map((n: string) => n[0]).join('').toUpperCase()}
            </div>
            <div className="sidebar-rotulo" style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nome}</div>
              <div style={{ fontSize: 11, color: '#9e9e9e' }}>{rotulo}</div>
            </div>
          </div>
          <button className="sidebar-sair" onClick={async () => { await signOut(); navigate('/login') }}
            style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: 'transparent', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#9e9e9e', textAlign: 'left', fontFamily: 'inherit' }}>
            <IconeSair /><span className="sidebar-rotulo">Sair da conta</span>
          </button>
        </div>
      </aside>
      <main className="main"><Outlet /></main>
    </div>
  )
}
