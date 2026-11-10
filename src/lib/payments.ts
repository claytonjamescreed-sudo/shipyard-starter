// What this app sells: the lookup keys of the Stripe prices that checkout
// may start (for example 'pro_monthly'). A price is found by its lookup key,
// which stays the same in test mode and live, so no price id goes in the
// code. The owner adds products in the Shipyard dashboard (Payments), or
// Claude Code adds them in test mode with create_product.
//
// startCheckout() refuses any lookup key not listed here, so a visitor
// cannot buy a price the app does not offer.
export const SELLABLE_LOOKUP_KEYS: readonly string[] = []
