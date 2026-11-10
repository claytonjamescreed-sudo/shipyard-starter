import { Link } from '@tanstack/react-router'
import { useCallback, useEffect, useRef, useState } from 'react'
import { VERSION_FILE, parseRelease, type Release } from '../lib/release'

// "There's an update", bottom right, while the owner has the Update now
// notice on (Shipyard's Versions page). The page compares its own build with
// /_shipyard/version.json, a static file Shipyard adds to every deploy.
// Cloudflare serves static files without running the app's Worker and does
// not bill them, so the checks cost nothing. To keep them few, it checks
// only while the tab is visible: when the visitor comes back to it (at most
// once a minute) and every 5 minutes. It stops once it finds an update or
// the owner turns the notice off.

const CHECK_EVERY_MS = 5 * 60 * 1000
const MIN_GAP_MS = 60 * 1000
const MAX_ERRORS = 3
// A page from an old build that cannot load a code file the new build
// replaced reloads once, not in a loop.
const RELOAD_KEY = 'shipyard-update-reload'
const RELOAD_GAP_MS = 30 * 1000

async function updateNow() {
  // The starter has no service worker. If the app adds one, ask it to fetch
  // the new version first (it must not cache pages or /_shipyard/).
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations()
      await Promise.all(registrations.map((r) => r.update().catch(() => undefined)))
    }
  } catch {
    // Reload anyway.
  }
  // Pages are made fresh by the Worker on every request, and every script
  // and style file has a new name in each build, so a reload loads the new
  // version.
  window.location.reload()
}

export default function UpdateNotice({ release, whatsNewOn }: { release: Release; whatsNewOn: boolean }) {
  // The newest build found that differs from this page's, and the one the
  // visitor closed the notice for.
  const [found, setFound] = useState<string | null>(null)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const state = useRef({ last: 0, errors: 0, stopped: false, busy: false })

  const check = useCallback(async () => {
    const s = state.current
    if (s.stopped || s.busy || document.visibilityState !== 'visible' || navigator.onLine === false) return
    if (Date.now() - s.last < MIN_GAP_MS) return
    s.busy = true
    s.last = Date.now()
    try {
      const response = await fetch(VERSION_FILE, { cache: 'no-store', credentials: 'omit' })
      const live = response.ok && (response.headers.get('Content-Type') ?? '').includes('json') ? parseRelease(await response.json()) : null
      if (!live) {
        if (++s.errors >= MAX_ERRORS) s.stopped = true
        return
      }
      s.errors = 0
      // The owner turned the notice off in the version that is live now.
      if (!live.notice) s.stopped = true
      else if (live.build !== release.build) setFound(live.build)
    } catch {
      if (++s.errors >= MAX_ERRORS) s.stopped = true
    } finally {
      s.busy = false
    }
  }, [release.build])

  useEffect(() => {
    if (!release.notice) return
    const s = state.current
    // Not right away: the page was just loaded with the newest version.
    s.last = Date.now()
    const timer = window.setInterval(() => void check(), CHECK_EVERY_MS)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check()
    }
    const onFocus = () => void check()
    // An old page whose code file is gone: reload instead of breaking.
    const onPreloadError = (event: Event) => {
      try {
        const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0)
        if (Date.now() - last < RELOAD_GAP_MS) return
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
      } catch {
        return
      }
      event.preventDefault()
      window.location.reload()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onFocus)
    window.addEventListener('vite:preloadError', onPreloadError)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onFocus)
      window.removeEventListener('vite:preloadError', onPreloadError)
    }
  }, [release.notice, check])

  // Once found, stop checking until the visitor closes the notice.
  useEffect(() => {
    state.current.stopped = Boolean(found && found !== dismissed)
  }, [found, dismissed])

  const show = Boolean(found && found !== dismissed)
  return (
    <div role="status" aria-live="polite" className="update-notice-region">
      {show ? (
        <div className="update-notice" data-testid="update-notice">
          <p className="m-0 font-semibold text-[var(--sea-ink)]">There&rsquo;s an update.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" className="update-notice-button" onClick={() => void updateNow()} data-testid="update-notice-update-button">
              Update now
            </button>
            {whatsNewOn ? (
              <Link to="/whats-new" reloadDocument className="text-sm font-semibold" data-testid="update-notice-whats-new-link">
                What&rsquo;s new
              </Link>
            ) : null}
          </div>
          <button
            type="button"
            className="update-notice-close"
            aria-label="Close"
            onClick={() => setDismissed(found)}
            data-testid="update-notice-close-button"
          >
            &times;
          </button>
        </div>
      ) : null}
    </div>
  )
}
