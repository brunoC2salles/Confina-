import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import { PortalProvider, usePortal } from '@/portal/PortalContext'
import { PortalLayout } from '@/portal/PortalLayout'
import PortalLogin from '@/portal/pages/PortalLogin'
import LandingParceiros from '@/portal/pages/LandingParceiros'
import Painel from '@/portal/pages/Painel'
import Pedidos from '@/portal/pages/Pedidos'
import Demanda from '@/portal/pages/Demanda'
import Clientes from '@/portal/pages/Clientes'
import Catalogo from '@/portal/pages/Catalogo'
import Equipe from '@/portal/pages/Equipe'
import Admin from '@/portal/pages/Admin'
import Entregas from '@/portal/pages/Entregas'
import Romaneio from '@/portal/pages/Romaneio'
import SimuladorPortal from '@/portal/pages/SimuladorPortal'
import SimulacaoPdf from '@/portal/pages/SimulacaoPdf'
import ClienteEstoque from '@/portal/pages/ClienteEstoque'
import ClientePedidos from '@/portal/pages/ClientePedidos'
import Convite from '@/pages/Convite'
import RedefinirSenha from '@/pages/RedefinirSenha'

function Carregando() {
  return <div className="loading-screen"><div className="spinner" style={{ width: 32, height: 32 }} /></div>
}

function SemAcesso() {
  const { signOut } = useAuth()
  return (
    <div className="loading-screen" style={{ flexDirection: 'column', gap: 12, textAlign: 'center', padding: 24 }}>
      <img src="/logo.png" alt="Confina+" style={{ height: 40, objectFit: 'contain' }} />
      <p style={{ fontSize: 14, maxWidth: 380 }}>Esta conta não tem acesso ao portal de parceiros. O acesso é liberado por convite do fornecedor.</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <a className="btn btn-secondary" href="https://www.confinamais.com">Ir para o Confina+</a>
        <button className="btn btn-ghost" onClick={() => signOut()}>Sair</button>
      </div>
    </div>
  )
}

// Rotas conforme o perfil no portal (ver PortalContext).
function RotasProtegidas() {
  const { session, loading } = useAuth()
  const portal = usePortal()
  const { pathname } = useLocation()
  if (loading || (session && portal.carregando)) return <Carregando />
  // Sem login: a raiz mostra a página de apresentação; o resto vai ao login.
  if (!session) return pathname === '/' ? <LandingParceiros /> : <Navigate to="/login" replace />

  if (portal.fornecedor && portal.papel) {
    return (
      <Routes>
        <Route path="romaneio" element={<Romaneio />} />
        <Route path="simulacao-pdf" element={<SimulacaoPdf />} />
        <Route element={<PortalLayout />}>
          <Route index element={<Painel />} />
          <Route path="pedidos" element={<Pedidos />} />
          <Route path="entregas" element={<Entregas />} />
          <Route path="demanda" element={<Demanda />} />
          <Route path="clientes" element={<Clientes />} />
          <Route path="catalogo" element={<Catalogo />} />
          <Route path="simulador" element={<SimuladorPortal />} />
          <Route path="dietas" element={<Navigate to="/catalogo" replace />} />
          {portal.papel === 'gestor' && <Route path="equipe" element={<Equipe />} />}
          {portal.admin && <Route path="admin" element={<Admin />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    )
  }
  if (portal.admin) {
    return (
      <Routes>
        <Route element={<PortalLayout />}>
          <Route index element={<Admin />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    )
  }
  if (portal.vinculo) {
    return (
      <Routes>
        <Route element={<PortalLayout />}>
          {portal.vinculo.cliente.modo === 'estoque'
            ? <><Route index element={<ClienteEstoque />} /><Route path="meus-pedidos" element={<ClientePedidos />} /></>
            : <Route index element={<ClientePedidos />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    )
  }
  return <SemAcesso />
}

// Aplicação servida em parceiros.confinamais.com (ver App.tsx).
export default function PortalApp() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <PortalProvider>
          <Routes>
            <Route path="/login" element={<PortalLogin />} />
            <Route path="/convite" element={<Convite destino="/" />} />
            <Route path="/redefinir-senha" element={<RedefinirSenha />} />
            <Route path="/*" element={<RotasProtegidas />} />
          </Routes>
        </PortalProvider>
      </BrowserRouter>
    </AuthProvider>
  )
}
