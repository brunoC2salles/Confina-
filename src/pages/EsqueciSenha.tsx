import { useState, FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'

export default function EsqueciSenha() {
  const { resetPassword } = useAuth()
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [enviado, setEnviado] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handle = async (e: FormEvent) => {
    e.preventDefault(); setError(null); setLoading(true)
    const { error } = await resetPassword(email)
    setLoading(false)
    // Não revelamos se o e-mail existe ou não na base — evita que alguém
    // use esse formulário pra descobrir quais e-mails têm conta cadastrada.
    if (error) setError('Não foi possível enviar o e-mail agora. Tente de novo em instantes.')
    else setEnviado(true)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src="/logo.png" alt="Confina+" style={{ height: 80, objectFit: 'contain' }} />
          <div style={{ fontSize: 13, color: '#9e9e9e', marginTop: 10 }}>Gestão de Confinamento Bovino</div>
        </div>
        <div className="card" style={{ padding: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Recuperar senha</h2>
          <p style={{ fontSize: 13, color: '#9e9e9e', marginBottom: 24 }}>
            Informe o e-mail da sua conta — se ele existir, você recebe um link pra redefinir a senha.
          </p>

          {enviado ? (
            <div style={{ padding: '12px 14px', background: '#e8f5e9', borderRadius: 8, color: '#1b5e20', fontSize: 13 }}>
              Se esse e-mail estiver cadastrado, você vai receber um link em instantes. Confere também a caixa de spam.
            </div>
          ) : (
            <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div className="form-group">
                <label className="form-label">E-mail</label>
                <input className="form-input" type="email" placeholder="seu@email.com" value={email} onChange={e => setEmail(e.target.value)} required />
              </div>
              {error && (
                <div style={{ padding: '10px 14px', background: '#ffebee', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>
                  {error}
                </div>
              )}
              <button type="submit" className="btn btn-primary" disabled={loading} style={{ justifyContent: 'center', padding: 11 }}>
                {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Enviar link de recuperação'}
              </button>
            </form>
          )}

          <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#9e9e9e' }}>
            <Link to="/login" style={{ color: '#2e7d32', fontWeight: 500, textDecoration: 'none' }}>Voltar para o login</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
