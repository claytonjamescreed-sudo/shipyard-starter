// This version of the app, and the owner's What's new and Update now
// switches. Shipyard sets SHIPYARD_RELEASE and SHIPYARD_WHATS_NEW on every
// deploy (see CLAUDE.md, "Versions"); locally both are unset, so both are off.

import { isVersion } from './changelog'

export interface Release {
  // package.json's version at the commit, when it has one.
  version: string | null
  // Which build this is. The Update now notice compares it with the build
  // in /_shipyard/version.json, which Shipyard adds to every deploy.
  build: string
  // The owner turned the Update now notice on.
  notice: boolean
}

// The file open pages check for a newer version. A static file: Cloudflare
// serves it without running the app's Worker, so checking costs nothing.
export const VERSION_FILE = '/_shipyard/version.json'

export function parseRelease(value: unknown): Release | null {
  let data: unknown = value
  if (typeof value === 'string') {
    try {
      data = JSON.parse(value)
    } catch {
      return null
    }
  }
  if (typeof data !== 'object' || data === null) return null
  const { version, build, notice } = data as Record<string, unknown>
  if (typeof build !== 'string' || !/^[0-9a-f]{12}$/.test(build)) return null
  return { version: isVersion(version) ? version : null, build, notice: notice === true }
}

// The What's new page's settings while it is on, else null.
export function parseWhatsNew(value: unknown): { hidden: string[] } | null {
  if (typeof value !== 'string' || !value) return null
  try {
    const data = JSON.parse(value) as { hidden?: unknown }
    return { hidden: Array.isArray(data.hidden) ? data.hidden.filter(isVersion) : [] }
  } catch {
    return null
  }
}
