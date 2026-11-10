import { createServerFn } from '@tanstack/react-start'
import { canTakePayments, getSubscription, openBillingPortal, startCheckout, stripeMode } from './payments.server'

// Server functions for the browser: start a checkout, open the billing
// portal, and read whether payments are on and what the visitor has. Send
// the visitor to the returned url (window.location.assign(url)).

const path = (value: unknown) => (typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && value.length <= 200 ? value : undefined)

export const checkout = createServerFn({ method: 'POST' })
  .validator((input: unknown) => {
    const i = (input ?? {}) as Record<string, unknown>
    if (typeof i.lookupKey !== 'string' || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(i.lookupKey)) throw new Error('Pick something to buy.')
    return { lookupKey: i.lookupKey, successPath: path(i.successPath), cancelPath: path(i.cancelPath) }
  })
  .handler(({ data }) => startCheckout(data))

export const billingPortal = createServerFn({ method: 'POST' })
  .validator((input: unknown) => ({ returnPath: path((input as Record<string, unknown> | undefined)?.returnPath) }))
  .handler(({ data }) => openBillingPortal(data.returnPath))

export const getPaymentsState = createServerFn({ method: 'GET' }).handler(async () => ({
  // 'test' shows a "Test mode" note on pricing pages; null: not set up yet.
  mode: stripeMode(),
  canTakePayments: canTakePayments(),
  subscription: canTakePayments() ? await getSubscription() : null,
}))
