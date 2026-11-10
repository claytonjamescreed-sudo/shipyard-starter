// Server only. A small client for Stripe's REST API, and Stripe's webhook
// signature check. Payments go to the owner's own Stripe account.
//
// The owner sets payments up in the Shipyard dashboard (the project's
// Payments tab). Shipyard then puts these on the app's Worker (secrets, kept
// across deploys):
//   STRIPE_MODE                  test or live
//   STRIPE_TEST_SECRET_KEY       the owner's restricted key for test mode
//   STRIPE_LIVE_SECRET_KEY       the owner's restricted key for live mode
//   STRIPE_TEST_WEBHOOK_SECRET   signing secrets of the webhook endpoints
//   STRIPE_LIVE_WEBHOOK_SECRET   Shipyard made for this app
// The keys are restricted: Checkout Sessions and Customers (write),
// Subscriptions (read), Customer portal (write), Products and Prices (read).
// Never log them, and never send them to the browser.
import { env } from 'cloudflare:workers'

export type StripeMode = 'test' | 'live'

interface StripeEnv {
  STRIPE_MODE?: string
  STRIPE_TEST_SECRET_KEY?: string
  STRIPE_LIVE_SECRET_KEY?: string
  STRIPE_TEST_WEBHOOK_SECRET?: string
  STRIPE_LIVE_WEBHOOK_SECRET?: string
  // Set only by Shipyard's local stand-ins (npm run dev:cloud).
  STRIPE_API_BASE?: string
}
const stripeEnv = () => env as unknown as StripeEnv

// The API version of every call and of the events Shipyard's webhook sends,
// so the shapes below never change under the app.
export const STRIPE_API_VERSION = '2025-03-31.basil'

export function stripeMode(): StripeMode | null {
  const mode = stripeEnv().STRIPE_MODE
  return mode === 'test' || mode === 'live' ? mode : null
}

function secretKey(): string | null {
  const mode = stripeMode()
  if (!mode) return null
  return (mode === 'test' ? stripeEnv().STRIPE_TEST_SECRET_KEY : stripeEnv().STRIPE_LIVE_SECRET_KEY) || null
}

// Whether the app can take payments now (set up in Shipyard).
export function canTakePayments(): boolean {
  return Boolean(secretKey())
}

export class StripeError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    message: string,
  ) {
    super(message)
    this.name = 'StripeError'
  }
}

// Stripe's form encoding: nested objects as a[b]=c, arrays as a[0]=c.
function stripeForm(params: Record<string, unknown>): string {
  const form = new URLSearchParams()
  const add = (key: string, value: unknown) => {
    if (value === undefined || value === null) return
    if (Array.isArray(value)) value.forEach((item, i) => add(`${key}[${i}]`, item))
    else if (typeof value === 'object') for (const [k, v] of Object.entries(value as Record<string, unknown>)) add(`${key}[${k}]`, v)
    else form.append(key, String(value))
  }
  for (const [k, v] of Object.entries(params)) add(k, v)
  return form.toString()
}

export async function stripe<T>(
  method: 'GET' | 'POST',
  path: string,
  params: Record<string, unknown> = {},
  options: { idempotencyKey?: string } = {},
): Promise<T> {
  const key = secretKey()
  if (!key) throw new Error('Payments are not set up yet. The owner connects Stripe in the Shipyard dashboard (the Payments tab).')
  const base = (stripeEnv().STRIPE_API_BASE || 'https://api.stripe.com').replace(/\/+$/, '')
  const form = stripeForm(params)
  const headers: Record<string, string> = { Authorization: `Bearer ${key}`, 'Stripe-Version': STRIPE_API_VERSION }
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey
  if (method === 'POST') headers['Content-Type'] = 'application/x-www-form-urlencoded'
  const response = await fetch(`${base}${path}${method === 'GET' && form ? `?${form}` : ''}`, {
    method,
    headers,
    body: method === 'POST' ? form : undefined,
  })
  const json = (await response.json().catch(() => ({}))) as { error?: { code?: string; message?: string } }
  if (!response.ok) {
    throw new StripeError(response.status, json.error?.code ?? null, `Stripe refused the request: ${json.error?.message ?? response.status}`)
  }
  return json as T
}

// ------------------------------------------------------- webhook signatures

async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Checks a Stripe-Signature header (t=<seconds>,v1=<hex HMAC-SHA256 of
// "<t>.<raw body>">) against the app's signing secrets. Returns the mode
// whose secret signed it, or null. Events older than 5 minutes are refused.
export async function verifyStripeSignature(payload: string, header: string | null, toleranceSeconds = 300): Promise<StripeMode | null> {
  if (!header) return null
  const parts = header.split(',').map((p) => p.trim())
  const t = Number(parts.find((p) => p.startsWith('t='))?.slice(2))
  const signatures = parts.filter((p) => p.startsWith('v1=')).map((p) => p.slice(3))
  if (!Number.isInteger(t) || !signatures.length) return null
  if (Math.abs(Math.floor(Date.now() / 1000) - t) > toleranceSeconds) return null
  const secrets: [StripeMode, string | undefined][] = [
    ['test', stripeEnv().STRIPE_TEST_WEBHOOK_SECRET],
    ['live', stripeEnv().STRIPE_LIVE_WEBHOOK_SECRET],
  ]
  for (const [mode, secret] of secrets) {
    if (!secret) continue
    const expected = await hmacHex(secret, `${t}.${payload}`)
    if (signatures.some((s) => sameHex(s, expected))) return mode
  }
  return null
}
