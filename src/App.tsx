import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from '@/contexts/AuthContext'
import ProtectedRoute from '@/components/common/ProtectedRoute'
import { Layout } from '@/components/common/Layout'
import Login from '@/pages/Login'
import EsqueciSenha from '@/pages/EsqueciSenha'
import RedefinirSenha from '@/pages/RedefinirSenha'
import Dashboard from '@/pages/Dashboard'
import Lotes from '@/pages/Lotes'
import Vendas from '@/pages/Vendas'
import Ranking from '@/pages/Ranking'
import Comparativo from '@/pages/Comparativo'
import Importar from '@/pages/Importar'
import Dietas from '@/pages/Dietas'
import Ingredientes from '@/pages/Ingredientes'
import Parceiros from '@/pages/Parceiros'
import Relatorios from '@/pages/Relatorios'
import Configuracoes from '@/pages/Configuracoes'
import CalculadoraConfinamento from '@/pages/public/CalculadoraConfinamento'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Páginas públicas, sem autenticação */}
          <Route path="/calculadoradeconfinamento" element={<CalculadoraConfinamento />} />

          <Route path="/login" element={<Login />} />
          <Route path="/esqueci-senha" element={<EsqueciSenha />} />
          <Route path="/redefinir-senha" element={<RedefinirSenha />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="lotes"        element={<Lotes />} />
            <Route path="vendas"       element={<Vendas />} />
            <Route path="ranking"      element={<Ranking />} />
            <Route path="comparativo"  element={<Comparativo />} />
            <Route path="importar"     element={<Importar />} />
            <Route path="dietas"       element={<Dietas />} />
            <Route path="ingredientes" element={<Ingredientes />} />
            <Route path="parceiros"    element={<Parceiros />} />
            <Route path="relatorios"   element={<Relatorios />} />
            <Route path="config"       element={<Configuracoes />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
