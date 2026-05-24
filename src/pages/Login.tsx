import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export default function Login() {
  const { signIn, signUp } = useAuth()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'login'|'register'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nome, setNome] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string|null>(null)
  const [success, setSuccess] = useState<string|null>(null)

  const handle = async (e: FormEvent) => {
    e.preventDefault(); setError(null); setSuccess(null); setLoading(true)
    if (mode === 'login') {
      const { error } = await signIn(email, password)
      if (error) {
        setError('E-mail ou senha inválidos.')
      } else {
        navigate('/')
      }
    } else {
      if (!nome.trim()) { setError('Informe seu nome.'); setLoading(false); return }
      const { error } = await signUp(email, password, nome)
      if (error) setError(error.message)
      else setSuccess('Conta criada com sucesso! Você já pode entrar.')
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src="/logo.png" alt="Confina+" style={{ height: 80, objectFit: 'contain' }} />
          <div style={{ fontSize: 13, color: '#9e9e9e', marginTop: 10 }}>Gestão de Confinamento Bovino</div>
        </div>
        <div className="card" style={{ padding: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>{mode === 'login' ? 'Entrar na conta' : 'Criar conta'}</h2>
          <p style={{ fontSize: 13, color: '#9e9e9e', marginBottom: 24 }}>{mode === 'login' ? 'Informe suas credenciais para continuar' : 'Preencha os dados para se cadastrar'}</p>
          <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {mode === 'register' && (
              <div className="form-group">
                <label className="form-label">Nome completo</label>
                <input className="form-input" type="text" placeholder="João da Silva" value={nome} onChange={e => setNome(e.target.value)} required />
              </div>
            )}
            <div className="form-group">
              <label className="form-label">E-mail</label>
              <input className="form-input" type="email" placeholder="seu@email.com" value={email} onChange={e => setEmail(e.target.value)} required />
            </div>
            <div className="form-group">
              <label className="form-label">Senha</label>
              <input className="form-input" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} />
            </div>
            {error && <div style={{ padding: '10px 14px', background: '#ffebee', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>{error}</div>}
            {success && <div style={{ padding: '10px 14px', background: '#e8f5e9', borderRadius: 8, color: '#1b5e20', fontSize: 13 }}>{success}</div>}
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ justifyContent: 'center', padding: 11 }}>
              {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : mode === 'login' ? 'Entrar' : 'Criar conta'}
            </button>
          </form>
          <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#9e9e9e' }}>
            {mode === 'login' ? 'Não tem conta? ' : 'Já tem conta? '}
            <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); setSuccess(null) }}
              style={{ background: 'none', border: 'none', color: '#2e7d32', fontWeight: 500, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
              {mode === 'login' ? 'Cadastre-se' : 'Faça login'}
            </button>
          </div>
        </div>
        <p style={{ textAlign: 'center', fontSize: 11, color: '#bdbdbd', marginTop: 16 }}>Confina+ — Todos os direitos reservados</p>
      </div>
    </div>
  )
}
