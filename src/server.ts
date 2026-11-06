// The Worker's entry: TanStack Start's request handler, with errors reported
// to the owner's Sentry when Shipyard has set SENTRY_DSN. Without it, Sentry
// stays off and sends nothing.
import * as Sentry from '@sentry/cloudflare'
import handler from '@tanstack/react-start/server-entry'

interface Env {
  SENTRY_DSN?: string
}

export default Sentry.withSentry<Env>(
  (env) => ({
    dsn: env.SENTRY_DSN,
    enabled: Boolean(env.SENTRY_DSN),
    // Errors only. Raise this to also record performance traces.
    tracesSampleRate: 0,
    sendDefaultPii: false,
  }),
  handler as unknown as ExportedHandler<Env>,
)
