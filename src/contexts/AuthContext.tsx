import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { definirDonoCache } from '@/lib/cacheTela'

interface AuthCtx {
  session: Session | null; user: User | null; loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string, nome: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
  resetPassword: (email: string) => Promise<{ error: Error | null }>
  updatePassword: (novaSenha: string) => Promise<{ error: Error | null }>
}

const Ctx = createContext<AuthCtx | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // A renovação do token (por exemplo, ao voltar para a aba) recria o
    // objeto do usuário. Mantém o mesmo objeto enquanto for o mesmo usuário,
    // para as telas não recarregarem os dados.
    const aplicar = (s: Session | null) => {
      setSession(s)
      const novo = s?.user ?? null
      definirDonoCache(novo?.id ?? null)
      setUser(atual => (atual && novo && atual.id === novo.id && atual.email === novo.email
        && JSON.stringify(atual.user_metadata) === JSON.stringify(novo.user_metadata) ? atual : novo))
    }
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      aplicar(s)
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => aplicar(s))

    return () => subscription.unsubscribe()
  }, [])

  return (
    <Ctx.Provider value={{
      session, user, loading,
      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        return { error }
      },
      signUp: async (email, password, nome) => {
        const { error } = await supabase.auth.signUp({ email, password, options: { data: { nome } } })
        return { error }
      },
      signOut: async () => { await supabase.auth.signOut() },
      resetPassword: async (email) => {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: 'https://www.confinamais.com/redefinir-senha',
        })
        return { error }
      },
      updatePassword: async (novaSenha) => {
        const { error } = await supabase.auth.updateUser({ password: novaSenha })
        return { error }
      },
    }}>
      {children}
    </Ctx.Provider>
  )
}

export const useAuth = () => {
  const c = useContext(Ctx)
  if (!c) throw new Error('useAuth fora do AuthProvider')
  return c
}
