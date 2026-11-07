import { createServerFn } from '@tanstack/react-start'
import { siteUrl, supportUrl } from './site-url.server'

// Gives routes the public URL for canonical links and share tags, and the
// support page's address when the owner has turned it on.
export const getSiteSettings = createServerFn({ method: 'GET' }).handler(() => ({
  siteUrl: siteUrl(),
  supportUrl: supportUrl(),
}))
