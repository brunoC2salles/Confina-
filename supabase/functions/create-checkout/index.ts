// supabase/functions/create-checkout/index.ts
//
// Cria uma sessão de Stripe Checkout (assinatura) pro usuário logado e
// devolve a URL pra redirecionar. Espera POST { price_id: string }.
//
// Secrets necessários (supabase secrets set):
//   STRIPE_SECRET_KEY
// Env vars automáticas do runtime (já disponíveis, não precisa setar):
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import Stripe from 'https://esm.sh/stripe@14?target=deno'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://confinamais.com',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const PRICE_IDS_VALIDOS = new Set([
  'price_1RGjWxE1rxRawy7ulzV0Wg5Z', // Pro mensal
  'price_1TagKmE1rxRawy7uNsKiuPup', // Pro anual
  'price_1RGjXmE1rxRawy7umoXeiOEc', // Master mensal
  'price_1TagLuE1rxRawy7ufNqiTY36', // Master anual
])

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2023-10-16' })
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Não autenticado' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const jwt = authHeader.replace('Bearer ', '')
    const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(jwt)
    if (userError || !userData.user) {
      return new Response(JSON.stringify({ error: 'Sessão inválida' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }
    const user = userData.user

    const { price_id } = await req.json()
    if (!price_id || !PRICE_IDS_VALIDOS.has(price_id)) {
      return new Response(JSON.stringify({ error: 'price_id inválido' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    const { data: profile } = await supabaseAdmin
      .from('profiles').select('stripe_customer_id').eq('id', user.id).single()

    let customerId = profile?.stripe_customer_id as string | null
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      })
      customerId = customer.id
      await supabaseAdmin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id)
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: price_id, quantity: 1 }],
      success_url: 'https://confinamais.com/?upgrade=sucesso',
      cancel_url: 'https://confinamais.com/?upgrade=cancelado',
      subscription_data: { metadata: { supabase_user_id: user.id } },
      client_reference_id: user.id,
      allow_promotion_codes: true,
    })

    return new Response(JSON.stringify({ url: session.url }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  } catch (e) {
    console.error('create-checkout error:', e)
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Erro inesperado' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }
})
