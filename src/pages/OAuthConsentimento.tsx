// ─── Autorização de acesso por assistentes (OAuth) ────────────────────────────
// Tela usada pelo OAuth 2.1 Server do Supabase Auth: quando o produtor conecta
// o Confina+ no Claude ou no ChatGPT, o Supabase manda para cá com um
// authorization_id. O produtor entra (se ainda não estiver logado) e aprova ou
// recusa o acesso. Os métodos auth.oauth.* do supabase-js cuidam do resto do
// fluxo e redirecionam o navegador de volta para o assistente.
import { useEffect, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

// Os tipos de resposta variam entre versões do supabase-js; lidos de forma solta.
type Detalhes = { authorization_id?: string; client?: { name?: string; client_name?: string } | null; scope?: string | null } & Record<string, unknown>

function urlDeRetorno(d: Record<string, unknown> | null | undefined): string | null {
  if (!d) return null
  const v = d.redirect_url ?? d.redirect_to
  return typeof v === 'string' && v ? v : null
}

export default function OAuthConsentimento() {
  const { session, user, loading, signOut } = useAuth()
  const [searchParams] = useSearchParams()
  const authorizationId = searchParams.get('authorization_id')

  const [detalhes, setDetalhes] = useState<Detalhes | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [processando, setProcessando] = useState(false)
  const [carregando, setCarregando] = useState(true)

  useEffect(() => {
    if (loading || !session || !authorizationId) return
    let ativo = true
    ;(async () => {
      setCarregando(true)
      const { data, error } = await (supabase.auth as any).oauth.getAuthorizationDetails(authorizationId)
      if (!ativo) return
      if (error || !data) {
        setErro(error?.message ?? 'Pedido de autorização inválido ou expirado.')
      } else if (data.authorization_id) {
        setDetalhes(data as Detalhes)
      } else {
        // Já autorizado antes: segue direto para o assistente.
        const destino = urlDeRetorno(data)
        if (destino) window.location.href = destino
        else setErro('Não foi possível continuar a autorização.')
      }
      setCarregando(false)
    })()
    return () => { ativo = false }
  }, [loading, session, authorizationId])

  const decidir = async (aprovar: boolean) => {
    if (!authorizationId) return
    setProcessando(true)
    setErro(null)
    const oauth = (supabase.auth as any).oauth
    const { data, error } = aprovar
      ? await oauth.approveAuthorization(authorizationId)
      : await oauth.denyAuthorization(authorizationId)
    if (error) {
      setErro(error.message ?? 'Não foi possível registrar a sua decisão.')
      setProcessando(false)
      return
    }
    // O supabase-js normalmente já redireciona o navegador; se não, usa a URL devolvida.
    const destino = urlDeRetorno(data)
    if (destino) window.location.href = destino
  }

  if (!authorizationId) {
    return <Moldura><p style={estiloTexto}>Link de autorização incompleto. Volte ao assistente e tente conectar de novo.</p></Moldura>
  }

  if (loading) {
    return <div className="loading-screen"><div className="spinner" style={{ width: 32, height: 32 }} /></div>
  }

  if (!session) {
    const voltar = `/oauth/consentimento?authorization_id=${encodeURIComponent(authorizationId)}`
    return <Navigate to={`/login?redirect=${encodeURIComponent(voltar)}`} replace />
  }

  const nomeCliente = detalhes?.client?.name || detalhes?.client?.client_name || 'Um assistente'

  return (
    <Moldura>
      {carregando ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}><span className="spinner" style={{ width: 24, height: 24 }} /></div>
      ) : erro && !detalhes ? (
        <p style={estiloTexto}>{erro}</p>
      ) : (
        <>
          <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Autorizar acesso à sua conta</h2>
          <p style={estiloTexto}>
            <strong>{nomeCliente}</strong> está pedindo acesso à conta <strong>{user?.email}</strong> no Confina+.
          </p>
          <p style={estiloTexto}>
            Com o acesso, o assistente poderá consultar e lançar dados de lotes, animais, pesagens, dietas, compras,
            vendas e simulações em seu nome, sempre pedindo sua confirmação antes de gravar ou excluir.
            Você pode remover o acesso a qualquer momento nas configurações do assistente.
          </p>
          {erro && <p style={{ ...estiloTexto, color: '#b91c1c' }}>{erro}</p>}
          <div style={{ display: 'flex', gap: 12, marginTop: 20 }}>
            <button className="btn btn-ghost" disabled={processando} onClick={() => decidir(false)} style={{ flex: 1, justifyContent: 'center' }}>
              Recusar
            </button>
            <button className="btn btn-primary" disabled={processando} onClick={() => decidir(true)} style={{ flex: 1, justifyContent: 'center' }}>
              {processando ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Autorizar'}
            </button>
          </div>
          <button className="btn btn-ghost" onClick={() => signOut()} style={{ marginTop: 16, width: '100%', justifyContent: 'center', fontSize: 13 }}>
            Não é você? Entrar com outra conta
          </button>
        </>
      )}
    </Moldura>
  )
}

const estiloTexto: React.CSSProperties = { fontSize: 14, color: '#555', lineHeight: 1.6, marginBottom: 12 }

function Moldura({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 480 }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <img src="/logo.png" alt="Confina+" style={{ height: 80, objectFit: 'contain' }} />
          <div style={{ fontSize: 13, color: '#9e9e9e', marginTop: 10 }}>Manejo bovino</div>
        </div>
        <div className="card" style={{ padding: 32 }}>{children}</div>
      </div>
    </div>
  )
}
