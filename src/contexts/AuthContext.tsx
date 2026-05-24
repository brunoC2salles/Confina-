import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthCtx {
  session: Session | null; user: User | null; loading: boolean
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>
  signUp: (email: string, password: string, nome: string) => Promise<{ error: Error | null }>
  signOut: () => Promise<void>
}

const Ctx = createContext<AuthCtx | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session); setUser(session?.user ?? null); setLoading(false)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s); setUser(s?.user ?? null); setLoading(false)
    })
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
