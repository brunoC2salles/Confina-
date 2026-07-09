import { useState, useEffect, FormEvent } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

export default function RedefinirSenha() {
  const { updatePassword } = useAuth()
  const navigate = useNavigate()

  // O link do e-mail de recuperação cria uma sessão temporária só pra essa
  // ação (evento PASSWORD_RECOVERY). Sem ela, não faz sentido mostrar o
  // formulário — a pessoa provavelmente chegou aqui sem vir do link certo,
  // ou o link já expirou.
  const [sessaoValida, setSessaoValida] = useState<boolean | null>(null)

  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sucesso, setSucesso] = useState(false)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setSessaoValida(true)
    })
    // Se o evento já disparou antes deste componente montar (corrida rara),
    // confere se já existe uma sessão válida mesmo assim.
    supabase.auth.getSession().then(({ data }) => {
      setSessaoValida(prev => prev ?? !!data.session)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handle = async (e: FormEvent) => {
    e.preventDefault(); setError(null)
    if (senha.length < 6) { setError('A senha precisa ter pelo menos 6 caracteres.'); return }
    if (senha !== confirmar) { setError('As senhas não coincidem.'); return }
    setLoading(true)
    const { error } = await updatePassword(senha)
    setLoading(false)
    if (error) setError('Não foi possível atualizar a senha. O link pode ter expirado — solicite um novo.')
    else setSucesso(true)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 420 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src="/logo.png" alt="Confina+" style={{ height: 80, objectFit: 'contain' }} />
          <div style={{ fontSize: 13, color: '#9e9e9e', marginTop: 10 }}>Gestão de Confinamento Bovino</div>
        </div>
        <div className="card" style={{ padding: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Redefinir senha</h2>

          {sessaoValida === null && (
            <p style={{ fontSize: 13, color: '#9e9e9e' }}>Verificando link...</p>
          )}

          {sessaoValida === false && (
            <>
              <p style={{ fontSize: 13, color: '#9e9e9e', marginBottom: 20 }}>
                Esse link não é válido ou já expirou.
              </p>
              <Link to="/esqueci-senha" className="btn btn-primary" style={{ justifyContent: 'center', padding: 11, textDecoration: 'none', display: 'flex' }}>
                Solicitar novo link
              </Link>
            </>
          )}

          {sessaoValida === true && !sucesso && (
            <>
              <p style={{ fontSize: 13, color: '#9e9e9e', marginBottom: 24 }}>Escolha uma nova senha para sua conta.</p>
              <form onSubmit={handle} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div className="form-group">
                  <label className="form-label">Nova senha</label>
                  <input className="form-input" type="password" placeholder="••••••••" value={senha} onChange={e => setSenha(e.target.value)} required minLength={6} />
                </div>
                <div className="form-group">
                  <label className="form-label">Confirmar nova senha</label>
                  <input className="form-input" type="password" placeholder="••••••••" value={confirmar} onChange={e => setConfirmar(e.target.value)} required minLength={6} />
                </div>
                {error && (
                  <div style={{ padding: '10px 14px', background: '#ffebee', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>
                    {error}
                  </div>
                )}
                <button type="submit" className="btn btn-primary" disabled={loading} style={{ justifyContent: 'center', padding: 11 }}>
                  {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Salvar nova senha'}
                </button>
              </form>
            </>
          )}

          {sucesso && (
            <>
              <div style={{ padding: '12px 14px', background: '#e8f5e9', borderRadius: 8, color: '#1b5e20', fontSize: 13, marginBottom: 16 }}>
                Senha atualizada com sucesso!
              </div>
              <button className="btn btn-primary" style={{ justifyContent: 'center', padding: 11, width: '100%' }} onClick={() => navigate('/')}>
                Ir para o painel
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
