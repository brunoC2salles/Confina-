import { useState, FormEvent, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { useAssinatura, PRICE_IDS } from '@/hooks/useAssinatura'

type PlanoChave = 'free' | 'pro_mensal' | 'pro_anual' | 'master_mensal' | 'master_anual'

const PLANO_LABEL: Record<string, string> = {
  pro_mensal: 'Pro (mensal)', pro_anual: 'Pro (anual)',
  master_mensal: 'Master (mensal)', master_anual: 'Master (anual)',
}

const PLANO_VALIDO = (v: string | null): v is PlanoChave =>
  v === 'free' || v === 'pro_mensal' || v === 'pro_anual' || v === 'master_mensal' || v === 'master_anual'

export default function Login() {
  const { signIn, signUp } = useAuth()
  const { assinar } = useAssinatura()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  const planoDaUrl = searchParams.get('plano')
  const modoInicial = searchParams.get('mode') === 'register' ? 'register' : 'login'

  const [mode, setMode] = useState<'login'|'register'>(modoInicial)
  // Seletor de plano visível no próprio formulário de cadastro — não depende
  // só do link de origem. Usa o da URL como ponto de partida quando existe.
  const [planoBase, setPlanoBase] = useState<'free' | 'pro' | 'master'>(
    planoDaUrl?.startsWith('master') ? 'master' : planoDaUrl?.startsWith('pro') ? 'pro' : 'free'
  )
  const [anual, setAnual] = useState(planoDaUrl?.endsWith('anual') ?? false)
  const planoEscolhido: PlanoChave = planoBase === 'free' ? 'free' : `${planoBase}_${anual ? 'anual' : 'mensal'}` as PlanoChave

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [nome, setNome] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string|null>(null)
  const [success, setSuccess] = useState<string|null>(null)

  useEffect(() => {
    if (searchParams.get('mode') === 'register') setMode('register')
    if (PLANO_VALIDO(planoDaUrl)) {
      setPlanoBase(planoDaUrl.startsWith('master') ? 'master' : planoDaUrl.startsWith('pro') ? 'pro' : 'free')
      setAnual(planoDaUrl.endsWith('anual'))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

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
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      // Sem confirmação de e-mail obrigatória, o signUp já devolve sessão ativa.
      // Se um plano pago foi escolhido (na URL ou no seletor do formulário),
      // manda direto pro checkout; senão (free), cai no Dashboard normalmente.
      if (planoEscolhido !== 'free') {
        setSuccess(`Conta criada! Levando você pro checkout do plano ${PLANO_LABEL[planoEscolhido]}...`)
        const res = await assinar(PRICE_IDS[planoEscolhido])
        if (res.error) {
          setError(`Conta criada, mas não consegui abrir o checkout: ${res.error}. Você pode assinar depois em Configurações → Conta.`)
          setLoading(false)
          navigate('/')
        }
        // em caso de sucesso, assinar() já redireciona a página pro Stripe
        return
      }
      navigate('/')
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src="/logo.png" alt="Confina+" style={{ height: 80, objectFit: 'contain' }} />
          <div style={{ fontSize: 13, color: '#9e9e9e', marginTop: 10 }}>Gestão de Confinamento Bovino</div>
        </div>
        <div className="card" style={{ padding: 32 }}>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>
            {mode === 'login' ? 'Entrar na conta' : 'Criar conta'}
          </h2>
          <p style={{ fontSize: 13, color: '#9e9e9e', marginBottom: 24 }}>
            {mode === 'login' ? 'Informe suas credenciais para continuar' : 'Preencha os dados para se cadastrar'}
          </p>

          {mode === 'register' && (
            <div style={{ marginBottom: 20, border: '1px solid var(--border, #eee)', borderRadius: 10, padding: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--gray-500, #888)', marginBottom: 10 }}>Escolha seu plano</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: anual !== undefined && planoBase !== 'free' ? 10 : 0, flexWrap: 'wrap' }}>
                {(['free', 'pro', 'master'] as const).map(p => (
                  <button key={p} type="button" onClick={() => setPlanoBase(p)}
                    style={{
                      flex: 1, minWidth: 90, padding: '8px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500,
                      border: planoBase === p ? '2px solid #2e7d32' : '1px solid var(--border, #ddd)',
                      background: planoBase === p ? '#e8f5e9' : '#fff',
                      color: planoBase === p ? '#1b5e20' : '#555',
                    }}>
                    {p === 'free' ? 'Free' : p === 'pro' ? 'Pro' : 'Master'}
                  </button>
                ))}
              </div>
              {planoBase !== 'free' && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, marginTop: 10 }}>
                  <button type="button" onClick={() => setAnual(false)}
                    style={{ padding: '5px 10px', borderRadius: 6, cursor: 'pointer', border: !anual ? '1px solid #2e7d32' : '1px solid var(--border, #ddd)', background: !anual ? '#e8f5e9' : '#fff', color: !anual ? '#1b5e20' : '#777' }}>
                    Mensal
                  </button>
                  <button type="button" onClick={() => setAnual(true)}
                    style={{ padding: '5px 10px', borderRadius: 6, cursor: 'pointer', border: anual ? '1px solid #2e7d32' : '1px solid var(--border, #ddd)', background: anual ? '#e8f5e9' : '#fff', color: anual ? '#1b5e20' : '#777' }}>
                    Anual
                  </button>
                  <span style={{ color: '#9e9e9e' }}>— você vai pro checkout do Stripe logo após criar a conta</span>
                </div>
              )}
            </div>
          )}

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
            {error && (
              <div style={{ padding: '10px 14px', background: '#ffebee', borderRadius: 8, color: '#b91c1c', fontSize: 13 }}>
                {error}
              </div>
            )}
            {success && (
              <div style={{ padding: '10px 14px', background: '#e8f5e9', borderRadius: 8, color: '#1b5e20', fontSize: 13 }}>
                {success}
              </div>
            )}
            <button type="submit" className="btn btn-primary" disabled={loading} style={{ justifyContent: 'center', padding: 11 }}>
              {loading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : mode === 'login' ? 'Entrar' : 'Criar conta'}
            </button>
          </form>
          <div style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#9e9e9e' }}>
            {mode === 'login' ? 'Não tem conta? ' : 'Já tem conta? '}
            <button
              onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); setSuccess(null) }}
              style={{ background: 'none', border: 'none', color: '#2e7d32', fontWeight: 500, cursor: 'pointer', fontSize: 13, fontFamily: 'inherit' }}>
              {mode === 'login' ? 'Cadastre-se' : 'Faça login'}
            </button>
          </div>
        </div>
        <p style={{ textAlign: 'center', fontSize: 11, color: '#bdbdbd', marginTop: 16 }}>
          Confina+ — Todos os direitos reservados
        </p>
      </div>
    </div>
  )
}
