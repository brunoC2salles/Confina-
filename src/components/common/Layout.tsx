import { NavLink, useNavigate, Outlet } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const NAV_PRINCIPAL = [
  { to: '/',              label: 'Dashboard',    end: true  },
  { to: '/fazenda-hoje',  label: 'Fazenda Hoje', end: false },
  { to: '/lotes',         label: 'Lotes',        end: false },
  { to: '/pesagens',      label: 'Pesagens',     end: false },
  { to: '/vendas',        label: 'Vendas',       end: false },
  { to: '/ranking',       label: 'Ranking',      end: false },
  { to: '/comparativo',   label: 'Comparativo',  end: false },
  { to: '/importar',      label: 'Importar',     end: false },
  { to: '/dietas',        label: 'Dietas',       end: false },
  { to: '/ingredientes',  label: 'Ingredientes', end: false },
]

const NAV_GESTAO = [
  { to: '/parceiros',  label: 'Parceiros',    end: false },
  { to: '/relatorios', label: 'Relatórios',   end: false },
  { to: '/config',     label: 'Configurações', end: false },
]

interface SidebarProps {
  isOpen: boolean
  onNavigate: () => void
}

export function Sidebar({ isOpen, onNavigate }: SidebarProps) {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()
  const [role, setRole] = useState<string>('produtor')

  useEffect(() => {
    if (!user) return
    supabase.from('profiles').select('role').eq('id', user.id).single()
      .then(({ data }) => { if (data?.role) setRole(data.role) })
  }, [user])

  const nome = user?.user_metadata?.nome || user?.email || 'Usuário'
  const initials = nome.split(' ').slice(0,2).map((n: string) => n[0]).join('').toUpperCase()

  const roleLabel = role === 'admin' ? 'Administrador' : role === 'operador' ? 'Operador' : 'Produtor'

  const linkStyle = (active: boolean) => ({
    display: 'flex', alignItems: 'center', padding: '9px 12px',
    borderRadius: '8px', fontSize: '13px', textDecoration: 'none',
    fontWeight: active ? 500 : 400, marginBottom: '2px',
    color: active ? '#1b5e20' : '#616161',
    background: active ? '#e8f5e9' : 'transparent',
    transition: 'all 0.15s',
  } as React.CSSProperties)

  return (
    <aside className={`sidebar${isOpen ? ' sidebar-open' : ''}`} style={{ width: 224, background: '#fff', borderRight: '1px solid #f0f0f0', display: 'flex', flexDirection: 'column', height: '100vh', flexShrink: 0 }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <img src="/logo.png" alt="Confina+" style={{ height: 52, objectFit: 'contain' }} />
      </div>
      <nav style={{ padding: '12px 8px', flex: 1, overflowY: 'auto' }}>
        <div style={{ fontSize: '10px', color: '#bdbdbd', padding: '8px 12px 4px', letterSpacing: '0.6px', textTransform: 'uppercase' }}>Principal</div>
        {NAV_PRINCIPAL.map(n => (
          <NavLink key={n.to} to={n.to} end={n.end} onClick={onNavigate} style={({ isActive }) => linkStyle(isActive)}>{n.label}</NavLink>
        ))}
        <div style={{ fontSize: '10px', color: '#bdbdbd', padding: '16px 12px 4px', letterSpacing: '0.6px', textTransform: 'uppercase' }}>Gestão</div>
        {NAV_GESTAO.map(n => (
          <NavLink key={n.to} to={n.to} end={n.end} onClick={onNavigate} style={({ isActive }) => linkStyle(isActive)}>{n.label}</NavLink>
        ))}
      </nav>
      <div style={{ padding: '12px 8px', borderTop: '1px solid #f0f0f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', marginBottom: 4 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', background: '#e8f5e9', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: '#2e7d32', flexShrink: 0 }}>{initials}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.user_metadata?.nome || user?.email}</div>
            <div style={{ fontSize: 11, color: '#9e9e9e' }}>{roleLabel}</div>
          </div>
        </div>
        <button onClick={async () => { await signOut(); navigate('/login') }}
          style={{ width: '100%', padding: '7px 12px', background: 'transparent', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, color: '#9e9e9e', textAlign: 'left', fontFamily: 'inherit' }}
          onMouseOver={e => (e.currentTarget.style.background = '#f5f5f5')}
          onMouseOut={e => (e.currentTarget.style.background = 'transparent')}>
          Sair da conta
        </button>
      </div>
    </aside>
  )
}

export function Layout() {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)

  const closeSidebar = () => setIsSidebarOpen(false)

  return (
    <div className="app">
      {/* Barra superior mobile: só aparece abaixo de 768px via CSS */}
      <div className="mobile-topbar">
        <button
          className="hamburger-btn"
          aria-label="Abrir menu"
          onClick={() => setIsSidebarOpen(true)}
        >
          <span />
          <span />
          <span />
        </button>
        <img src="/logo.png" alt="Confina+" style={{ height: 32, objectFit: 'contain' }} />
        <div style={{ width: 40 }} />
      </div>

      {/* Fundo escurecido ao abrir o menu no mobile */}
      <div
        className={`sidebar-backdrop${isSidebarOpen ? ' open' : ''}`}
        onClick={closeSidebar}
      />

      <Sidebar isOpen={isSidebarOpen} onNavigate={closeSidebar} />

      <main className="main"><Outlet /></main>
    </div>
  )
}
