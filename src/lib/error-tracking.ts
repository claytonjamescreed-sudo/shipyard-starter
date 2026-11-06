// Browser errors go to the owner's Sentry when the build has VITE_SENTRY_DSN
// (Shipyard sets it in the build settings). Sentry's code loads only then.
export async function startBrowserErrorTracking(): Promise<void> {
  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
  if (!dsn || typeof window === 'undefined') return
  const Sentry = await import('@sentry/react')
  if (Sentry.isInitialized()) return
  Sentry.init({ dsn })
}
