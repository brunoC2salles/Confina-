import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

// Entrada do portal de parceiros. Contas novas chegam por convite.
export default function PortalLogin() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [modo, setModo] = useState<'entrar' | 'esqueci'>('entrar')
  const [loading, setLoading] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const enviar = async (e: FormEvent) => {
    e.preventDefault(); setErro(null); setOk(null); setLoading(true)
    if (modo === 'entrar') {
      const { error } = await signIn(email.trim(), senha)
      setLoading(false)
      if (error) { setErro('E-mail ou senha inválidos.'); return }
      navigate('/')
      return
    }
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/redefinir-senha` })
    setLoading(false)
    if (error) { setErro(error.message); return }
    setOk('Enviamos um link para redefinir a senha. Confira o seu e-mail.')
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f7f5', padding: 16 }}>
      <form onSubmit={enviar} className="card" style={{ width: '100%', maxWidth: 400, padding: 32 }}>
        <img src="/logo.png" alt="Confina+" style={{ height: 44, objectFit: 'contain', display: 'block', margin: '0 auto 12px' }} />
        <div style={{ textAlign: 'center', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#2e7d32', fontWeight: 700 }}>Portal de parceiros</div>
        <h1 style={{ textAlign: 'center', fontSize: 18, margin: '6px 0 24px' }}>{modo === 'entrar' ? 'Entrar' : 'Redefinir senha'}</h1>
        <div className="field">
          <label>E-mail</label>
          <input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" />
        </div>
        {modo === 'entrar' && (
          <div className="field">
            <label>Senha</label>
            <input type="password" required value={senha} onChange={e => setSenha(e.target.value)} autoComplete="current-password" />
          </div>
        )}
        {erro && <div className="field-error" style={{ marginBottom: 12 }}>{erro}</div>}
        {ok && <div style={{ color: 'var(--green-dark)', fontSize: 13, marginBottom: 12 }}>{ok}</div>}
        <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={loading}>
          {loading ? 'Aguarde...' : modo === 'entrar' ? 'Entrar' : 'Enviar link'}
        </button>
        <button type="button" className="btn btn-ghost" style={{ width: '100%', marginTop: 8, border: 'none' }}
          onClick={() => { setModo(modo === 'entrar' ? 'esqueci' : 'entrar'); setErro(null); setOk(null) }}>
          {modo === 'entrar' ? 'Esqueci minha senha' : 'Voltar para entrar'}
        </button>
        <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center', marginTop: 16 }}>
          O acesso é liberado por convite do fornecedor.
        </p>
      </form>
    </div>
  )
}
