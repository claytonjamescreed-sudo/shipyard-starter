// Reads CHANGELOG.md for the What's new page (src/routes/whats-new.tsx).
//
// Each version is a "## " heading ("## [1.12.0] - 2026-11-08", "## 1.12.0"),
// followed by its notes as bullet points. Notes become plain text: links
// keep their words, emphasis and code marks go, and HTML is dropped. React
// escapes what is left, so nothing in the file can add markup or scripts.
// Keep these rules equal to packages/core/src/releases.ts in Shipyard.

export interface ChangelogEntry {
  version: string
  // The date written in the heading, if any (YYYY-MM-DD).
  date: string | null
  notes: string[]
}

const VERSION =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/
const MAX_LINES = 20
const MAX_LINE_CHARS = 300
const MAX_ENTRIES = 100

export const isVersion = (value: unknown): value is string => typeof value === 'string' && value.length <= 64 && VERSION.test(value)

function plainText(line: string): string {
  return line
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^\w*])[*_]([^*_]+)[*_](?=$|[^\w*])/g, '$1$2')
    .replace(/`([^`]*)`/g, '$1')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f​-‏‪-‮⁦-⁩]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function notesFrom(lines: string[]): string[] {
  const items: string[] = []
  let current: string[] | null = null
  const flush = () => {
    if (current) {
      const text = plainText(current.join(' '))
      if (text) items.push(text.length <= MAX_LINE_CHARS ? text : `${text.slice(0, MAX_LINE_CHARS - 1).trimEnd()}…`)
    }
    current = null
  }
  for (const raw of lines) {
    const line = raw.trim()
    if (!line || /^#{1,6}\s/.test(line) || /^(-{3,}|\*{3,})$/.test(line)) {
      flush()
      continue
    }
    const bullet = /^(?:[-*+]|\d+[.)])\s+(.*)$/.exec(line)
    if (bullet) {
      flush()
      current = [bullet[1]]
    } else if (current) {
      current.push(line)
    } else {
      current = [line]
    }
  }
  flush()
  return items.slice(0, MAX_LINES)
}

// Every version in the file, in file order. "## [Unreleased]" is left out.
export function parseChangelog(markdown: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = []
  let current: { version: string; date: string | null; lines: string[] } | null = null
  const finish = () => {
    if (current) entries.push({ version: current.version, date: current.date, notes: notesFrom(current.lines) })
    current = null
  }
  for (const line of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const heading = /^##\s+(.*)$/.exec(line.trim())
    if (heading) {
      finish()
      const match = /^\[?v?([0-9A-Za-z.+-]+)\]?(?:\s|$)/.exec(heading[1].trim())
      if (match && isVersion(match[1])) {
        const date = /(\d{4}-\d{2}-\d{2})/.exec(heading[1])
        current = { version: match[1], date: date ? date[1] : null, lines: [] }
      }
      continue
    }
    if (/^#\s/.test(line.trim())) {
      finish()
      continue
    }
    current?.lines.push(line)
  }
  finish()
  return entries.slice(0, MAX_ENTRIES)
}

// Semver precedence: -1, 0, or 1. Build metadata is ignored.
export function compareVersions(a: string, b: string): number {
  const parse = (v: string) => {
    const [core, pre] = v.split('+')[0].split(/-(.*)/s)
    return { nums: core.split('.').map(Number), pre: pre ? pre.split('.') : [] }
  }
  const x = parse(a)
  const y = parse(b)
  for (let i = 0; i < 3; i++) if (x.nums[i] !== y.nums[i]) return x.nums[i] < y.nums[i] ? -1 : 1
  if (!x.pre.length || !y.pre.length) return x.pre.length === y.pre.length ? 0 : x.pre.length ? -1 : 1
  for (let i = 0; i < Math.max(x.pre.length, y.pre.length); i++) {
    const p = x.pre[i]
    const q = y.pre[i]
    if (p === undefined) return -1
    if (q === undefined) return 1
    if (p === q) continue
    const pn = /^\d+$/.test(p)
    const qn = /^\d+$/.test(q)
    if (pn && qn) return Number(p) < Number(q) ? -1 : 1
    if (pn !== qn) return pn ? -1 : 1
    return p < q ? -1 : 1
  }
  return 0
}

// What the What's new page lists: versions up to the one running (a newer
// entry is not out yet), minus the ones the owner hid, newest first, and
// only versions with notes.
export function releasedEntries(entries: ChangelogEntry[], current: string | null, hidden: string[]): ChangelogEntry[] {
  return entries
    .filter((e) => e.notes.length && !hidden.includes(e.version) && (!current || compareVersions(e.version, current) <= 0))
    .sort((a, b) => compareVersions(b.version, a.version))
}
