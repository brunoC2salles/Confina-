import { useState, useEffect, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

interface DadosConvite {
  email: string
  nome: string | null
  papel: 'gestor' | 'vendedor' | 'cliente'
  modo: 'confina' | 'estoque' | null
  fornecedor: string
  aceito: boolean
  expirado: boolean
}

// Aceite de convite do portal de parceiros (gestor, vendedor ou cliente).
// Serve em parceiros.confinamais.com e em confinamais.com (clientes do
// Confina+). Sem login: cria a conta com o e-mail do convite ou entra.
export default function Convite({ destino = '/' }: { destino?: string }) {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const navigate = useNavigate()
  const { user, signIn, signOut, loading: carregandoAuth } = useAuth()
  const [convite, setConvite] = useState<DadosConvite | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [modo, setModo] = useState<'criar' | 'entrar'>('criar')
  const [nome, setNome] = useState('')
  const [senha, setSenha] = useState('')
  const [telefone, setTelefone] = useState('')
  const [fazenda, setFazenda] = useState('')
  const [municipio, setMunicipio] = useState('')
  const [uf, setUf] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  useEffect(() => {
    if (!token) { setCarregando(false); return }
    supabase.rpc('ver_convite', { p_token: token }).then(({ data }) => {
      const c = data as DadosConvite | null
      setConvite(c)
      if (c?.nome) setNome(c.nome)
      setCarregando(false)
    })
  }, [token])

  const emailConfere = !!user && !!convite && (user.email ?? '').toLowerCase() === convite.email.toLowerCase()

  const autenticar = async (e: FormEvent) => {
    e.preventDefault()
    if (!convite) return
    setErro(null); setAviso(null); setSalvando(true)
    if (modo === 'entrar') {
      const { error } = await signIn(convite.email, senha)
      setSalvando(false)
      if (error) setErro('Senha inválida para este e-mail.')
      return
    }
    if (senha.length < 6) { setSalvando(false); setErro('A senha deve ter pelo menos 6 caracteres'); return }
    const { data, error } = await supabase.auth.signUp({
      email: convite.email, password: senha,
      options: { data: { nome }, emailRedirectTo: window.location.href },
    })
    setSalvando(false)
    if (error) {
      setErro(/registered|already/i.test(error.message) ? 'Este e-mail já tem conta. Use "Já tenho conta".' : error.message)
      return
    }
    if (!data.session) setAviso('Conta criada. Confirme o e-mail pelo link que enviamos e volte por este convite para concluir.')
  }

  const aceitar = async (e: FormEvent) => {
    e.preventDefault()
    if (!convite) return
    if (convite.papel === 'cliente' && !fazenda.trim()) { setErro('Informe o nome da fazenda'); return }
    setErro(null); setSalvando(true)
    const { error } = await supabase.rpc('aceitar_convite', {
      p_token: token, p_nome: nome.trim() || null, p_telefone: telefone.trim() || null,
      p_nome_fazenda: fazenda.trim() || null, p_municipio: municipio.trim() || null, p_uf: uf.trim().toUpperCase() || null,
    })
    setSalvando(false)
    if (error) { setErro(error.message); return }
    window.location.assign(destino)
  }

  const papelTexto = convite?.papel === 'gestor' ? 'gestor do portal' : convite?.papel === 'vendedor' ? 'vendedor'
    : convite?.modo === 'confina' ? 'cliente no Confina+' : 'cliente (estoque e pedidos)'

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f5f7f5', padding: 16 }}>
      <div className="card" style={{ width: '100%', maxWidth: 460, padding: 32 }}>
        <img src="/logo.png" alt="Confina+" style={{ height: 44, objectFit: 'contain', display: 'block', margin: '0 auto 16px' }} />
        {carregando || carregandoAuth ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><div className="spinner" style={{ width: 28, height: 28 }} /></div>
        ) : !convite ? (
          <p style={{ textAlign: 'center', fontSize: 14 }}>Convite não encontrado. Confira o link recebido por e-mail.</p>
        ) : convite.aceito ? (
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: 14 }}>Este convite já foi aceito.</p>
            <button className="btn btn-primary" onClick={() => navigate(user ? destino : '/login')}>Entrar</button>
          </div>
        ) : convite.expirado ? (
          <p style={{ textAlign: 'center', fontSize: 14 }}>Este convite expirou. Peça um novo à {convite.fornecedor}.</p>
        ) : (
          <>
            <h1 style={{ fontSize: 18, textAlign: 'center', margin: '0 0 6px' }}>Convite da {convite.fornecedor}</h1>
            <p style={{ fontSize: 13, color: 'var(--text-2)', textAlign: 'center', margin: '0 0 24px' }}>
              Acesso como {papelTexto} para <strong>{convite.email}</strong>.
            </p>

            {user && !emailConfere ? (
              <div style={{ textAlign: 'center' }}>
                <p style={{ fontSize: 13 }}>Você está conectado como {user.email}. Este convite é para {convite.email}.</p>
                <button className="btn btn-secondary" onClick={() => signOut()}>Sair e usar {convite.email}</button>
              </div>
            ) : !user ? (
              <form onSubmit={autenticar}>
                <div className="tabs" style={{ marginBottom: 16 }}>
                  <button type="button" className={`tab-btn${modo === 'criar' ? ' active' : ''}`} onClick={() => setModo('criar')}>Criar conta</button>
                  <button type="button" className={`tab-btn${modo === 'entrar' ? ' active' : ''}`} onClick={() => setModo('entrar')}>Já tenho conta</button>
                </div>
                {modo === 'criar' && (
                  <div className="field"><label>Seu nome</label><input value={nome} onChange={e => setNome(e.target.value)} required /></div>
                )}
                <div className="field"><label>E-mail</label><input value={convite.email} disabled /></div>
                <div className="field"><label>{modo === 'criar' ? 'Crie uma senha' : 'Senha'}</label>
                  <input type="password" value={senha} onChange={e => setSenha(e.target.value)} required autoComplete={modo === 'criar' ? 'new-password' : 'current-password'} />
                </div>
                {erro && <div className="field-error" style={{ marginBottom: 12 }}>{erro}</div>}
                {aviso && <div style={{ color: 'var(--green-dark)', fontSize: 13, marginBottom: 12 }}>{aviso}</div>}
                <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={salvando}>
                  {salvando ? 'Aguarde...' : modo === 'criar' ? 'Criar conta' : 'Entrar'}
                </button>
              </form>
            ) : (
              <form onSubmit={aceitar}>
                <div className="field"><label>Seu nome</label><input value={nome} onChange={e => setNome(e.target.value)} required /></div>
                <div className="field"><label>Telefone (WhatsApp)</label><input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="(55) 99999-9999" /></div>
                {convite.papel === 'cliente' && (
                  <>
                    <div className="field"><label>Nome da fazenda</label><input value={fazenda} onChange={e => setFazenda(e.target.value)} required /></div>
                    <div className="form-row-2" style={{ gridTemplateColumns: '1fr 90px' }}>
                      <div className="field"><label>Município</label><input value={municipio} onChange={e => setMunicipio(e.target.value)} /></div>
                      <div className="field"><label>UF</label><input value={uf} maxLength={2} onChange={e => setUf(e.target.value)} /></div>
                    </div>
                  </>
                )}
                {erro && <div className="field-error" style={{ marginBottom: 12 }}>{erro}</div>}
                <button className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={salvando}>
                  {salvando ? 'Aguarde...' : 'Aceitar convite'}
                </button>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  )
}
