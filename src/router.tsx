import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import NotFound from './components/NotFound'
import { startBrowserErrorTracking } from './lib/error-tracking'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    defaultNotFoundComponent: NotFound,
    scrollRestoration: true,
    defaultPreload: 'intent',
    defaultPreloadStaleTime: 0,
  })

  if (!router.isServer) void startBrowserErrorTracking()

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
