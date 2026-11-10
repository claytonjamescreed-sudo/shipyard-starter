// Errors thrown while handling a request or a server function are logged with
// console.error, so Cloudflare's own logs of the Worker record them (the
// project's Errors section in Shipyard lists them), and go to the owner's
// Sentry when it is set up (see src/server.ts). Then they carry on as before.
// The import is inside the server code, so the browser bundle never loads it.
import { createMiddleware, createStart } from '@tanstack/react-start'

async function report(error: unknown, where: string) {
  console.error(`Server error in ${where}:`, error)
  const Sentry = await import('@sentry/cloudflare')
  Sentry.captureException(error)
}

const reportRequestErrors = createMiddleware({ type: 'request' }).server(async ({ next, request }) => {
  try {
    return await next()
  } catch (error) {
    await report(error, `${request.method} ${new URL(request.url).pathname}`)
    throw error
  }
})

const reportFunctionErrors = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  try {
    return await next()
  } catch (error) {
    await report(error, 'a server function')
    throw error
  }
})

export const startInstance = createStart(() => ({
  requestMiddleware: [reportRequestErrors],
  functionMiddleware: [reportFunctionErrors],
}))
