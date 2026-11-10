import { createServerFn } from '@tanstack/react-start'
import { getRequestUrl } from '@tanstack/react-start/server'
import { analyticsToken, release, siteUrl, supportUrl, whatsNew } from './site-url.server'

// Gives routes the public URL for canonical links and share tags, the
// support page's address when the owner has turned it on, the visitor
// analytics token for the hostname this request came to, this version (for
// the Update now notice), and whether the What's new page is on.
export const getSiteSettings = createServerFn({ method: 'GET' }).handler(() => ({
  siteUrl: siteUrl(),
  supportUrl: supportUrl(),
  analyticsToken: analyticsToken(getRequestUrl().hostname),
  release: release(),
  whatsNewOn: whatsNew() !== null,
}))
