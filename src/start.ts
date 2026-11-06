// Errors thrown while handling a request or a server function go to the
// owner's Sentry (see src/server.ts), then carry on as before. The import is
// inside the server code, so the browser bundle never loads it.
import { createMiddleware, createStart } from '@tanstack/react-start'

async function report(error: unknown) {
  const Sentry = await import('@sentry/cloudflare')
  Sentry.captureException(error)
}

const reportRequestErrors = createMiddleware({ type: 'request' }).server(async ({ next }) => {
  try {
    return await next()
  } catch (error) {
    await report(error)
    throw error
  }
})

const reportFunctionErrors = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  try {
    return await next()
  } catch (error) {
    await report(error)
    throw error
  }
})

export const startInstance = createStart(() => ({
  requestMiddleware: [reportRequestErrors],
  functionMiddleware: [reportFunctionErrors],
}))
