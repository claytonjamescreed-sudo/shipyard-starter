import { env } from 'cloudflare:workers'
import { SITE } from './site'

// The public URL of this app. Shipyard sets SITE_URL on deploy.
export function siteUrl(): string {
  return (env.SITE_URL || SITE.defaultUrl).replace(/\/+$/, '')
}
