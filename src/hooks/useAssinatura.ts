import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export type Plano = 'free' | 'pro' | 'master'

export const LIMITE_LOTES_ATIVOS: Record<Plano, number> = {
  free: 5, pro: 20, master: Infinity,
}

export const PRICE_IDS = {
  pro_mensal: 'price_1U5WnjE1rxRawy7ufVnECliJ',
  pro_anual: 'price_1TagKmE1rxRawy7uNsKiuPup',
  master_mensal: 'price_1RGjXmE1rxRawy7umoXeiOEc',
  master_anual: 'price_1TagLuE1rxRawy7ufNqiTY36',
} as const

export function useAssinatura() {
  const { user } = useAuth()
  const [plano, setPlano] = useState<Plano>('free')
  const [planoStatus, setPlanoStatus] = useState<string>('ativo')
  const [temStripeCustomer, setTemStripeCustomer] = useState(false)
  const [loading, setLoading] = useState(true)
  const [processando, setProcessando] = useState(false)

  const fetch = useCallback(async () => {
    if (!user) { setLoading(false); return }
    setLoading(true)
    const { data } = await supabase
      .from('profiles').select('plano, plano_status, stripe_customer_id').eq('id', user.id).single()
    if (data) {
      setPlano((data.plano as Plano) ?? 'free')
      setPlanoStatus(data.plano_status ?? 'ativo')
      setTemStripeCustomer(!!data.stripe_customer_id)
    }
    setLoading(false)
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  // Plano efetivo: só vale o plano pago se a assinatura estiver ativa —
  // se cair pra 'inativo' (pagamento falhou, cancelou etc.), trata como free.
  const planoEfetivo: Plano = planoStatus === 'ativo' ? plano : 'free'
  const limiteLotesAtivos = LIMITE_LOTES_ATIVOS[planoEfetivo]

  const assinar = async (priceId: string): Promise<{ error: string | null }> => {
    setProcessando(true)
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !sessionData.session) {
      setProcessando(false)
      return { error: 'Sessão expirada. Saia e entre de novo antes de assinar.' }
    }
    const { data, error } = await supabase.functions.invoke('create-checkout', {
      body: { price_id: priceId },
      headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
    })
    setProcessando(false)
    if (error || !data?.url) return { error: error?.message ?? 'Falha ao iniciar o checkout' }
    window.location.href = data.url
    return { error: null }
  }

  const abrirPortal = async (): Promise<{ error: string | null }> => {
    setProcessando(true)
    const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !sessionData.session) {
      setProcessando(false)
      return { error: 'Sessão expirada. Saia e entre de novo antes de gerenciar a assinatura.' }
    }
    const { data, error } = await supabase.functions.invoke('create-portal-session', {
      headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
    })
    setProcessando(false)
    if (error || !data?.url) return { error: error?.message ?? 'Falha ao abrir o portal de assinatura' }
    window.location.href = data.url
    return { error: null }
  }

  return {
    plano, planoStatus, planoEfetivo, limiteLotesAtivos, temStripeCustomer,
    loading, processando, fetch, assinar, abrirPortal,
  }
}
