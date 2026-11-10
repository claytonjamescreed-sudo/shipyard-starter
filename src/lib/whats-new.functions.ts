import { createServerFn } from '@tanstack/react-start'
// CHANGELOG.md is built into the app's server code: the page always matches
// the code that is live.
import changelog from '../../CHANGELOG.md?raw'
import { parseChangelog, releasedEntries } from './changelog'
import { release, whatsNew } from './site-url.server'

// The What's new page's entries, or null while the owner has it off.
export const getWhatsNew = createServerFn({ method: 'GET' }).handler(() => {
  const settings = whatsNew()
  if (!settings) return null
  const current = release()?.version ?? null
  return { current, entries: releasedEntries(parseChangelog(changelog), current, settings.hidden) }
})
