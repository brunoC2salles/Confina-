import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import ProtectedRoute from '@/components/common/ProtectedRoute'
import { Layout } from '@/components/common/Layout'
import Login from '@/pages/Login'
import EsqueciSenha from '@/pages/EsqueciSenha'
import RedefinirSenha from '@/pages/RedefinirSenha'
import Dashboard from '@/pages/Dashboard'
import FazendaHoje from '@/pages/FazendaHoje'
import Lotes from '@/pages/Lotes'
import Pesagens from '@/pages/Pesagens'
import Vendas from '@/pages/Vendas'
import Ranking from '@/pages/Ranking'
import Comparativo from '@/pages/Comparativo'
import Simulador from '@/pages/Simulador'
import Importar from '@/pages/Importar'
import Dietas from '@/pages/Dietas'
import Ingredientes from '@/pages/Ingredientes'
import Compras from '@/pages/Compras'
import Parceiros from '@/pages/Parceiros'
import Relatorios from '@/pages/Relatorios'
import Configuracoes from '@/pages/Configuracoes'
import CalculadoraConfinamento from '@/pages/CalculadoraConfinamento'
import Consultoria from '@/pages/Consultoria'
import Tutorial from '@/pages/Tutorial'
import OAuthConsentimento from '@/pages/OAuthConsentimento'
import Assistentes from '@/pages/Assistentes'
import Privacidade from '@/pages/Privacidade'
import Convite from '@/pages/Convite'
import PortalApp from '@/portal/PortalApp'

// parceiros.confinamais.com serve o portal de parceiros (fornecedores de
// ração, vendedores e clientes), com a mesma base e o mesmo login.
const EH_PORTAL = typeof window !== 'undefined' && window.location.hostname.startsWith('parceiros.')

export default function App() {
  if (EH_PORTAL) return <PortalApp />
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Páginas públicas, sem autenticação */}
          <Route path="/calculadoradeconfinamento" element={<CalculadoraConfinamento />} />
          <Route path="/consultoria" element={<Consultoria />} />

          <Route path="/login" element={<Login />} />
          <Route path="/esqueci-senha" element={<EsqueciSenha />} />
          <Route path="/redefinir-senha" element={<RedefinirSenha />} />
          {/* Autorização OAuth do servidor MCP (Claude / ChatGPT) */}
          <Route path="/oauth/consentimento" element={<OAuthConsentimento />} />
          {/* Páginas públicas: documentação do conector e política de privacidade */}
          <Route path="/assistentes" element={<Assistentes />} />
          <Route path="/privacidade" element={<Privacidade />} />
          {/* Convite de fornecedor para produtores do Confina+ (portal de parceiros) */}
          <Route path="/convite" element={<Convite destino="/dietas" />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="fazenda-hoje" element={<FazendaHoje />} />
            <Route path="lotes"        element={<Lotes />} />
            <Route path="pesagens"     element={<Pesagens />} />
            <Route path="vendas"       element={<Vendas />} />
            <Route path="ranking"      element={<Ranking />} />
            <Route path="comparativo"  element={<Comparativo />} />
            <Route path="simulador"    element={<Simulador />} />
            <Route path="importar"     element={<Importar />} />
            <Route path="dietas"       element={<Dietas />} />
            <Route path="ingredientes" element={<Ingredientes />} />
            <Route path="compras"      element={<Compras />} />
            <Route path="parceiros"    element={<Parceiros />} />
            <Route path="relatorios"   element={<Relatorios />} />
            <Route path="config"       element={<Configuracoes />} />
            <Route path="tutorial"     element={<Tutorial />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
