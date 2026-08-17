// supabase/functions/stripe-webhook/index.ts
//
// Recebe eventos do Stripe e atualiza profiles.plano / plano_status /
// stripe_customer_id / stripe_subscription_id. Usa a service_role key —
// é o único caminho que passa pelo trigger de proteção de billing
// (proteger_campos_billing_profiles), que bloqueia updates dessas colunas
// vindos de qualquer outra origem.
//
// Secrets necessários (supabase secrets set):
//   STRIPE_SECRET_KEY
//   STRIPE_WEBHOOK_SECRET   (gerado ao criar o endpoint no painel do Stripe)
//
// Configurar no painel do Stripe (Developers, Webhooks) um endpoint
// apontando pra URL desta function, escutando os eventos:
//   checkout.session.completed
//   customer.subscription.updated
//   customer.subscription.deleted

import Stripe from 'https://esm.sh/stripe@17.7.0?target=denonext'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const PRICE_PARA_PLANO: Record<string, 'pro' | 'master'> = {
  'price_1U5WnjE1rxRawy7ufVnECliJ': 'pro',    // Pro mensal
  'price_1TagKmE1rxRawy7uNsKiuPup': 'pro',    // Pro anual
  'price_1RGjXmE1rxRawy7umoXeiOEc': 'master', // Master mensal
  'price_1TagLuE1rxRawy7ufNqiTY36': 'master', // Master anual
}

Deno.serve(async (req) => {
  const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
    apiVersion: '2023-10-16', httpClient: Stripe.createFetchHttpClient(),
  })
  const supabaseAdmin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  const signature = req.headers.get('stripe-signature')
  const body = await req.text()

  let event: Stripe.Event
  try {
    event = await stripe.webhooks.constructEventAsync(
      body, signature!, Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
    )
  } catch (e) {
    console.error('Assinatura do webhook inválida:', e)
    return new Response('Assinatura inválida', { status: 400 })
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        const userId = session.client_reference_id
        if (!userId || !session.subscription) break

        const subscription = await stripe.subscriptions.retrieve(session.subscription as string)
        const priceId = subscription.items.data[0]?.price.id
        const plano = priceId ? PRICE_PARA_PLANO[priceId] : undefined
        if (!plano) {
          console.error('price_id não mapeado para nenhum plano:', priceId)
          break
        }

        await supabaseAdmin.from('profiles').update({
          plano, plano_status: 'ativo',
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: subscription.id,
        }).eq('id', userId)
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        const { data: profile } = await supabaseAdmin
          .from('profiles').select('id').eq('stripe_customer_id', subscription.customer as string).maybeSingle()
        if (!profile) { console.error('Nenhum profile com stripe_customer_id', subscription.customer); break }

        const priceId = subscription.items.data[0]?.price.id
        const plano = priceId ? PRICE_PARA_PLANO[priceId] : undefined
        const statusAtivo = subscription.status === 'active' || subscription.status === 'trialing'

        const patch: Record<string, unknown> = {
          plano_status: statusAtivo ? 'ativo' : 'inativo',
          stripe_subscription_id: subscription.id,
        }
        if (plano) patch.plano = plano // troca de plano (upgrade/downgrade) só se veio um price mapeado
        await supabaseAdmin.from('profiles').update(patch).eq('id', profile.id)
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        const { data: profile } = await supabaseAdmin
          .from('profiles').select('id').eq('stripe_customer_id', subscription.customer as string).maybeSingle()
        if (!profile) { console.error('Nenhum profile com stripe_customer_id', subscription.customer); break }

        await supabaseAdmin.from('profiles').update({
          plano: 'free', plano_status: 'ativo',
        }).eq('id', profile.id)
        break
      }

      default:
        // outros eventos são ignorados de propósito
        break
    }
  } catch (e) {
    console.error('Erro processando evento', event.type, e)
    return new Response('Erro processando evento', { status: 500 })
  }

  return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } })
})
