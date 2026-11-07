import { env } from 'cloudflare:workers'
import { SITE } from './site'

// The public URL of this app. Shipyard sets SITE_URL on deploy.
export function siteUrl(): string {
  return (env.SITE_URL || SITE.defaultUrl).replace(/\/+$/, '')
}

// The app's support page (bug reports and requests), hosted by Shipyard.
// Shipyard sets SHIPYARD_SUPPORT_URL on deploy while the owner has it on.
export function supportUrl(): string | null {
  const value = env.SHIPYARD_SUPPORT_URL
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null
  } catch {
    return null
  }
}
