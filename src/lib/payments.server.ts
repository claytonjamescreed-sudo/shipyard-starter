// Server only. Payments and subscriptions with the owner's own Stripe
// account. Call these inside server functions and loaders (see
// payments.functions.ts), never from the browser.
//
// - startCheckout({ lookupKey }) sends the signed-in visitor to Stripe's
//   hosted Checkout, for a one-time payment or a subscription (from the
//   price). Only prices listed in SELLABLE_LOOKUP_KEYS (src/lib/payments.ts).
// - openBillingPortal() sends them to Stripe's portal to manage their billing.
// - hasActiveSubscription(), getSubscription(), getPurchases(), and
//   hasPurchased() read what the visitor paid for, from the app's database.
//
// The database learns about payments only from Stripe's signed events: the
// webhook route (src/routes/api/stripe/webhook.ts) hands each event to the
// stripe_record_event function from supabase/payments.sql, which checks
// Stripe's signature itself and writes the rows. So never unlock anything on
// the checkout success page alone: read it from the database.
//
// Everything counts only in the current mode: test payments never unlock
// anything once the app is live.
import { createClient } from '@supabase/supabase-js'
import { env } from 'cloudflare:workers'
import { SELLABLE_LOOKUP_KEYS } from './payments'
import { siteUrl } from './site-url.server'
import { canTakePayments, stripe, stripeMode, type StripeMode } from './stripe.server'
import { getSupabase, hasBackend } from './supabase.server'

export { canTakePayments, stripeMode }
export type { StripeMode }

interface StripePrice {
  id: string
  lookup_key: string | null
  recurring: { interval: string } | null
  unit_amount: number | null
  currency: string
  product: string
}

export interface Subscription {
  id: string
  status: string
  lookup_key: string | null
  price_id: string | null
  current_period_end: string | null
  cancel_at_period_end: boolean
}

export interface Purchase {
  checkout_session_id: string
  lookup_key: string | null
  amount_total: number | null
  currency: string | null
  status: string
  created_at: string
}

// Statuses that keep a subscriber's access. past_due: Stripe is still
// retrying their card.
export const ACTIVE_SUBSCRIPTION_STATUSES = ['active', 'trialing', 'past_due']

function currentMode(): StripeMode {
  const mode = stripeMode()
  if (!mode) throw new Error('Payments are not set up yet. The owner connects Stripe in the Shipyard dashboard (the Payments tab).')
  return mode
}

async function signedInUser(): Promise<{ id: string; email: string | null } | null> {
  if (!hasBackend()) return null
  const { data } = await getSupabase().auth.getUser()
  return data.user ? { id: data.user.id, email: data.user.email ?? null } : null
}

// A path in this app (never another site), for Stripe to send people back to.
function backTo(path: string, query: string): string {
  const safe = path.startsWith('/') && !path.startsWith('//') && !path.includes('\\') ? path : '/'
  return `${siteUrl()}${safe}${safe.includes('?') ? '&' : '?'}${query}`
}

export async function findPrice(lookupKey: string): Promise<StripePrice> {
  if (!SELLABLE_LOOKUP_KEYS.includes(lookupKey)) throw new Error(`"${lookupKey}" is not for sale in this app.`)
  const prices = await stripe<{ data: StripePrice[] }>('GET', '/v1/prices', { lookup_keys: [lookupKey], active: true, limit: 1 })
  const price = prices.data[0]
  if (!price) throw new Error(`No active Stripe price has the lookup key "${lookupKey}" in ${currentMode()} mode.`)
  return price
}

// The visitor's Stripe customer in this mode, from an earlier payment.
async function customerId(userId: string, mode: StripeMode): Promise<string | null> {
  const { data } = await getSupabase().from('stripe_customers').select('customer_id').eq('user_id', userId).eq('livemode', mode === 'live').maybeSingle()
  return (data?.customer_id as string | undefined) ?? null
}

export async function startCheckout(options: {
  lookupKey: string
  quantity?: number
  successPath?: string
  cancelPath?: string
  allowPromotionCodes?: boolean
}): Promise<{ url: string }> {
  const mode = currentMode()
  const price = await findPrice(options.lookupKey)
  const kind = price.recurring ? 'subscription' : 'payment'
  const user = await signedInUser()
  // Subscriptions belong to a signed-in visitor, so the app knows who has one.
  if (kind === 'subscription' && !user) throw new Error('Sign in first: a subscription belongs to an account.')
  const quantity = Math.min(Math.max(Math.floor(options.quantity ?? 1), 1), 99)
  const customer = user ? await customerId(user.id, mode) : null
  const metadata = { user_id: user?.id, lookup_key: options.lookupKey, price_id: price.id }
  const session = await stripe<{ url: string | null }>('POST', '/v1/checkout/sessions', {
    mode: kind,
    line_items: [{ price: price.id, quantity }],
    success_url: backTo(options.successPath ?? '/', 'checkout=success&session_id={CHECKOUT_SESSION_ID}'),
    cancel_url: backTo(options.cancelPath ?? '/', 'checkout=cancelled'),
    client_reference_id: user?.id,
    ...(customer ? { customer } : user?.email ? { customer_email: user.email } : {}),
    ...(kind === 'payment' && !customer ? { customer_creation: 'always' } : {}),
    metadata,
    ...(kind === 'subscription' ? { subscription_data: { metadata } } : { payment_intent_data: { metadata } }),
    ...(options.allowPromotionCodes ? { allow_promotion_codes: true } : {}),
  })
  if (!session.url) throw new Error('Stripe did not return a checkout address.')
  return { url: session.url }
}

export async function openBillingPortal(returnPath = '/'): Promise<{ url: string }> {
  const mode = currentMode()
  const user = await signedInUser()
  if (!user) throw new Error('Sign in first.')
  const customer = await customerId(user.id, mode)
  if (!customer) throw new Error('There is no billing to manage yet.')
  const safe = returnPath.startsWith('/') && !returnPath.startsWith('//') ? returnPath : '/'
  return stripe<{ url: string }>('POST', '/v1/billing_portal/sessions', { customer, return_url: `${siteUrl()}${safe}` })
}

// The signed-in visitor's newest subscription in this mode (to that lookup
// key, if given), or null.
export async function getSubscription(lookupKey?: string): Promise<Subscription | null> {
  const mode = stripeMode()
  const user = await signedInUser()
  if (!mode || !user) return null
  let query = getSupabase()
    .from('stripe_subscriptions')
    .select('id, status, lookup_key, price_id, current_period_end, cancel_at_period_end')
    .eq('user_id', user.id)
    .eq('livemode', mode === 'live')
    .order('stripe_updated_at', { ascending: false })
  if (lookupKey) query = query.eq('lookup_key', lookupKey)
  const { data } = await query
  const rows = (data ?? []) as Subscription[]
  return rows.find((s) => ACTIVE_SUBSCRIPTION_STATUSES.includes(s.status)) ?? rows[0] ?? null
}

export async function hasActiveSubscription(lookupKey?: string): Promise<boolean> {
  const sub = await getSubscription(lookupKey)
  return Boolean(sub && ACTIVE_SUBSCRIPTION_STATUSES.includes(sub.status))
}

// The signed-in visitor's paid one-time purchases in this mode.
export async function getPurchases(): Promise<Purchase[]> {
  const mode = stripeMode()
  const user = await signedInUser()
  if (!mode || !user) return []
  const { data } = await getSupabase()
    .from('stripe_payments')
    .select('checkout_session_id, lookup_key, amount_total, currency, status, created_at')
    .eq('user_id', user.id)
    .eq('livemode', mode === 'live')
    .eq('status', 'paid')
    .order('created_at', { ascending: false })
  return (data ?? []) as Purchase[]
}

export async function hasPurchased(lookupKey: string): Promise<boolean> {
  return (await getPurchases()).some((p) => p.lookup_key === lookupKey)
}

// Hands a verified Stripe event to the database (supabase/payments.sql). The
// database checks Stripe's signature again itself, so this needs no
// Supabase secret key: the publishable key is enough.
export async function recordStripeEvent(payload: string, signature: string): Promise<{ ok: true; result: string } | { ok: false; missingTables: boolean; message: string }> {
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await db.rpc('stripe_record_event', { payload, signature })
  if (error) return { ok: false, missingTables: error.code === 'PGRST202', message: `${error.code ?? ''} ${error.message}`.trim() }
  return { ok: true, result: String(data) }
}
