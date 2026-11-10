import { env } from 'cloudflare:workers'
import { parseAiCrawlerChoice, type AiCrawlerChoice } from './ai-crawlers'
import { parseRelease, parseWhatsNew, type Release } from './release'
import { SITE } from './site'

// This version: its app version, its build, and whether the owner turned
// the Update now notice on. Shipyard sets SHIPYARD_RELEASE on every deploy.
export function release(): Release | null {
  return parseRelease(env.SHIPYARD_RELEASE)
}

// The What's new page, while the owner has it on (SHIPYARD_WHATS_NEW): the
// versions they chose to leave off it.
export function whatsNew(): { hidden: string[] } | null {
  return parseWhatsNew(env.SHIPYARD_WHATS_NEW)
}

// The public URL of this app. Shipyard sets SITE_URL on deploy.
export function siteUrl(): string {
  return (env.SITE_URL || SITE.defaultUrl).replace(/\/+$/, '')
}

// The owner's choice of AI crawlers for robots.txt (src/lib/ai-crawlers.ts).
// Shipyard sets SHIPYARD_AI_CRAWLERS on deploy; unset means allow all.
export function aiCrawlerChoice(): AiCrawlerChoice {
  return parseAiCrawlerChoice(env.SHIPYARD_AI_CRAWLERS)
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

// Visitor analytics (Cloudflare Web Analytics, no cookies). Shipyard sets
// SHIPYARD_ANALYTICS on deploy while the owner has it on: JSON, from each
// hostname the app is served at to the beacon token for it. Other hostnames
// (preview links, localhost) get no beacon, so they are never counted.
export function analyticsToken(hostname: string): string | null {
  const value = env.SHIPYARD_ANALYTICS
  if (!value) return null
  try {
    const tokens = JSON.parse(value) as Record<string, unknown>
    const token = tokens[hostname.toLowerCase()]
    return typeof token === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(token) ? token : null
  } catch {
    return null
  }
}
