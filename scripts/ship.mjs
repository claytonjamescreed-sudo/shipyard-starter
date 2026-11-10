// Uploads this app's build to Shipyard, which puts it live.
//
//   npm run build
//   npm run ship -- '<upload link from the Shipyard deploy tool>'
//
// In GitHub Actions (.github/workflows/shipyard-deploy.yml):
//
//   npm run ship -- --github
//
// There, the run proves which repo and commit it is with GitHub's sign-in
// token, so no Shipyard secret is stored in the repo.
//
// It sends the Worker and its static files from either build layout:
//   dist/server + dist/client   (the Cloudflare Vite plugin: the Shipyard starter)
//   .output/server + .output/public   (Nitro: Lovable apps)
// plus the app's database migrations (supabase/migrations, or
// drizzle/migrations with its journal), which Shipyard runs before the new
// code goes live, and the list of packages in the lockfile (names and
// versions only), which Shipyard checks for known problems, and the app's
// version: package.json's "version" and its CHANGELOG.md entry, read from
// the commit (in GitHub Actions, the checkout), never from the build. It
// never sends dotfiles (dist/server/.dev.vars holds local secrets) or source
// maps. Shipyard checks everything again; the checks here only fail early.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'

// Shipyard's limit (packages/core BUNDLE_LIMITS.maxTotalBytes).
const MAX_TOTAL_BYTES = 20 * 1024 * 1024
const MODULE_EXTENSIONS = new Set(['js', 'mjs', 'wasm'])
// Shipyard's limit (packages/core DEPENDENCY_LIMITS.maxPackages).
const MAX_PACKAGES = 5000
const BUILD_CONFIGS = ['dist/server/wrangler.json', '.output/server/wrangler.json']
// Shipyard's limit (packages/core RELEASE_NOTES_LIMITS.sourceBytes).
const MAX_NOTES_BYTES = 16 * 1024
// A semantic version (packages/core APP_VERSION_PATTERN).
const SEMVER =
  /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?(\+[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/
// Where the build is. In GitHub Actions it arrives as an artifact, while this
// script and the migrations come from the commit itself.
const BUILD_DIR = resolve(process.env.SHIPYARD_BUILD_DIR || '.')

function fail(message) {
  console.error(`\nship: ${message}`)
  process.exit(1)
}

function extension(path) {
  const name = path.split('/').pop() ?? ''
  return name.includes('.') ? name.split('.').pop().toLowerCase() : ''
}

// Every file under dir, as forward-slash paths relative to dir. Skips
// dotfiles and dot folders (.dev.vars, .vite, .assetsignore) and source maps.
function walk(dir) {
  const files = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...walk(full).map((p) => `${entry.name}/${p}`))
    } else if (entry.isFile() && !entry.name.endsWith('.map')) {
      files.push(entry.name)
    }
  }
  return files
}

function git(args) {
  try {
    return execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
  } catch {
    return null
  }
}

function commitInfo() {
  // In GitHub Actions the deploy job has no checkout, so use the run's details.
  if (process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_SHA) {
    return {
      sha: process.env.GITHUB_SHA,
      branch: process.env.GITHUB_REF_NAME ?? null,
      message: (process.env.SHIPYARD_COMMIT_MESSAGE ?? '').split('\n')[0] || null,
      dirty: false,
    }
  }
  const sha = git(['rev-parse', 'HEAD'])
  if (!sha) return null
  return {
    sha,
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    message: git(['log', '-1', '--format=%s']),
    dirty: Boolean(git(['status', '--porcelain'])),
  }
}

// The newest build, if there are both.
function findBuildConfig() {
  const found = BUILD_CONFIGS.map((p) => resolve(BUILD_DIR, p)).filter((p) => existsSync(p))
  if (!found.length) fail('No build found. Run the build first (npm run build, or bun run build).')
  return found.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0]
}

// supabase/migrations/<version>_<name>.sql, or drizzle/migrations with meta/_journal.json.
function readMigrations() {
  const supabaseDir = resolve('supabase/migrations')
  const drizzleDir = resolve('drizzle/migrations')
  const supabaseFiles = existsSync(supabaseDir) ? readdirSync(supabaseDir).filter((f) => /^\d+_[\w.-]+\.sql$/.test(f)) : []
  const hasDrizzle = existsSync(join(drizzleDir, 'meta', '_journal.json'))
  if (supabaseFiles.length && hasDrizzle) {
    fail('Found both supabase/migrations and drizzle/migrations. Shipyard runs one of them; remove the one you do not use.')
  }
  if (supabaseFiles.length) {
    return { kind: 'supabase', files: supabaseFiles.map((f) => ({ path: f, file: join(supabaseDir, f) })) }
  }
  if (hasDrizzle) {
    const sql = readdirSync(drizzleDir).filter((f) => f.endsWith('.sql'))
    return {
      kind: 'drizzle',
      files: [
        ...sql.map((f) => ({ path: f, file: join(drizzleDir, f) })),
        { path: 'meta/_journal.json', file: join(drizzleDir, 'meta', '_journal.json') },
      ],
    }
  }
  return null
}

// The packages in the app's lockfile, for Shipyard's security checks. Read
// from the working folder (in GitHub Actions, the commit itself), never from
// the build. package-lock.json and bun.lock are read; for other lockfiles
// only the name is sent, and Shipyard says it cannot check them.
function readDependencies() {
  const found = ['package-lock.json', 'bun.lock', 'bun.lockb', 'pnpm-lock.yaml', 'yarn.lock'].find((f) => existsSync(resolve(f)))
  if (!found) return { lockfile: null, packages: [], truncated: false }
  let packages = []
  try {
    if (found === 'package-lock.json') packages = npmLockPackages(JSON.parse(readFileSync(resolve(found), 'utf8')))
    if (found === 'bun.lock') packages = bunLockPackages(readFileSync(resolve(found), 'utf8'))
  } catch {
    console.warn(`ship: could not read ${found}; Shipyard will not check its packages this time.`)
    return null
  }
  const seen = new Map()
  for (const p of packages) {
    const key = `${p.name}@${p.version}`
    const existing = seen.get(key)
    if (existing) existing.dev = existing.dev && p.dev
    else seen.set(key, { ...p })
  }
  const list = [...seen.values()]
  return { lockfile: found, packages: list.slice(0, MAX_PACKAGES), truncated: list.length > MAX_PACKAGES }
}

const NPM_NAME = /^(?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*$/i
const NPM_VERSION = /^[0-9][0-9A-Za-z.+_-]{0,63}$/
const isPackage = (name, version) => typeof name === 'string' && name.length <= 214 && NPM_NAME.test(name) && typeof version === 'string' && NPM_VERSION.test(version)

// package-lock.json, lockfile versions 1 to 3.
function npmLockPackages(lock) {
  const out = []
  for (const [path, info] of Object.entries(lock.packages ?? {})) {
    const at = path.lastIndexOf('node_modules/')
    if (at === -1 || info.link) continue
    const name = info.name ?? path.slice(at + 'node_modules/'.length)
    if (isPackage(name, info.version)) out.push({ name, version: info.version, dev: Boolean(info.dev || info.devOptional) })
  }
  if (!Object.keys(lock.packages ?? {}).length) {
    const walk = (deps) => {
      for (const [name, info] of Object.entries(deps ?? {})) {
        if (isPackage(name, info.version)) out.push({ name, version: info.version, dev: Boolean(info.dev) })
        walk(info.dependencies)
      }
    }
    walk(lock.dependencies)
  }
  return out
}

// bun.lock (Bun's text lockfile: JSON with trailing commas). A package is
// a build tool (dev) when nothing the app runs depends on it.
function bunLockPackages(text) {
  const lock = JSON.parse(text.replace(/,(\s*[}\]])/g, '$1'))
  const entries = lock.packages ?? {}
  const root = lock.workspaces?.[''] ?? {}
  const depsOf = (info) => ({ ...(info?.dependencies ?? {}), ...(info?.optionalDependencies ?? {}), ...(info?.peerDependencies ?? {}) })
  // Bun keys a nested copy as "parent/child"; look it up from the inside out.
  const resolveKey = (from, name) => {
    const parts = from ? from.split('/') : []
    for (let i = parts.length; i >= 0; i--) {
      const key = [...parts.slice(0, i), name].join('/')
      if (entries[key]) return key
    }
    return null
  }
  const runtime = new Set()
  const queue = Object.keys(depsOf(root)).map((name) => resolveKey('', name)).filter(Boolean)
  while (queue.length) {
    const key = queue.pop()
    if (runtime.has(key)) continue
    runtime.add(key)
    const info = Array.isArray(entries[key]) ? entries[key][2] : null
    for (const name of Object.keys(depsOf(info))) {
      const child = resolveKey(key, name)
      if (child && !runtime.has(child)) queue.push(child)
    }
  }
  const out = []
  for (const [key, entry] of Object.entries(entries)) {
    const spec = Array.isArray(entry) ? entry[0] : null
    if (typeof spec !== 'string') continue
    const at = spec.lastIndexOf('@')
    if (at <= 0) continue
    const name = spec.slice(0, at)
    const version = spec.slice(at + 1)
    if (isPackage(name, version)) out.push({ name, version, dev: !runtime.has(key) })
  }
  return out
}

// The app's version: package.json's "version" (semver), and the CHANGELOG.md
// section for it (its "## [1.2.0]" or "## 1.2.0" heading, up to the next
// "## " heading). Read from the working folder, which in GitHub Actions is
// the commit itself. "0.0.0" is the placeholder many templates start with,
// so it counts as no version.
function readRelease() {
  let version = null
  try {
    const pkg = JSON.parse(readFileSync(resolve('package.json'), 'utf8'))
    version = typeof pkg.version === 'string' ? pkg.version.trim() : null
  } catch {
    return null
  }
  if (!version || version === '0.0.0') return null
  if (version.length > 64 || !SEMVER.test(version)) {
    console.warn(`ship: package.json's version "${version.slice(0, 64)}" is not a semantic version (like 1.2.0), so this deploy is shown by its commit.`)
    return null
  }
  const file = ['CHANGELOG.md', 'changelog.md'].find((f) => existsSync(resolve(f)))
  const notes = file ? changelogSection(readFileSync(resolve(file), 'utf8'), version) : null
  return { version, notes: notes ? Buffer.from(notes).subarray(0, MAX_NOTES_BYTES - 4).toString('utf8') : null }
}

function headingVersion(line) {
  const heading = /^##\s+(.*)$/.exec(line.trim())
  if (!heading) return null
  const match = /^\[?v?([0-9A-Za-z.+-]+)\]?(?:\s|$)/.exec(heading[1].trim())
  return match ? match[1] : null
}

function changelogSection(markdown, version) {
  const lines = markdown.replace(/\r\n?/g, '\n').split('\n')
  const start = lines.findIndex((line) => headingVersion(line) === version)
  if (start === -1) return null
  const out = []
  for (const line of lines.slice(start + 1)) {
    if (/^#{1,2}\s/.test(line.trim())) break
    out.push(line)
  }
  return out.join('\n').trim() || null
}

function readBuild() {
  const configPath = findBuildConfig()
  const serverDir = dirname(configPath)
  const buildRoot = dirname(serverDir)
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  const assetsDir = config.assets?.directory ? resolve(serverDir, config.assets.directory) : null
  if (assetsDir && !assetsDir.startsWith(buildRoot + sep)) fail('The static files folder must be inside the build folder.')

  const modules = walk(serverDir)
    .filter((p) => MODULE_EXTENSIONS.has(extension(p)))
    .map((p) => ({ path: p, file: join(serverDir, ...p.split('/')) }))
  if (!modules.some((m) => m.path === config.main)) fail(`The build's main module (${config.main}) is missing.`)

  const assets =
    assetsDir && existsSync(assetsDir)
      ? walk(assetsDir)
          .filter((p) => p !== '_headers' && p !== '_redirects')
          .map((p) => ({ path: `/${p}`, file: join(assetsDir, ...p.split('/')) }))
      : []
  // Caching and redirect rules for the static files, sent as Cloudflare rules.
  const rules = (name) => (assetsDir && existsSync(join(assetsDir, name)) ? readFileSync(join(assetsDir, name), 'utf8') : null)
  const migrations = readMigrations()

  return {
    manifest: {
      format: 1,
      main_module: config.main,
      compatibility_date: config.compatibility_date,
      compatibility_flags: config.compatibility_flags ?? [],
      modules: modules.map((m) => ({ path: m.path, size: statSync(m.file).size })),
      assets: assets.map((a) => ({ path: a.path, size: statSync(a.file).size })),
      migrations: migrations
        ? { kind: migrations.kind, files: migrations.files.map((m) => ({ path: m.path, size: statSync(m.file).size })) }
        : null,
      assets_headers: rules('_headers'),
      assets_redirects: rules('_redirects'),
      commit: commitInfo(),
      dependencies: readDependencies(),
      release: readRelease(),
    },
    modules,
    assets,
    migrations: migrations?.files ?? [],
    buildDir: buildRoot,
  }
}

function buildForm(bundle) {
  const total = [...bundle.manifest.modules, ...bundle.manifest.assets, ...(bundle.manifest.migrations?.files ?? [])].reduce(
    (sum, f) => sum + f.size,
    0,
  )
  if (total > MAX_TOTAL_BYTES) fail(`The build is ${(total / 1048576).toFixed(1)} MB. The limit is 20 MB.`)
  const form = new FormData()
  form.append('manifest', new Blob([JSON.stringify(bundle.manifest)], { type: 'application/json' }), 'manifest.json')
  for (const m of bundle.modules) form.append(`module:${m.path}`, new Blob([readFileSync(m.file)]), m.path)
  for (const a of bundle.assets) form.append(`asset:${a.path}`, new Blob([readFileSync(a.file)]), a.path)
  for (const m of bundle.migrations) form.append(`migration:${m.path}`, new Blob([readFileSync(m.file)]), m.path)
  return { form, total }
}

async function readJson(response) {
  try {
    return await response.json()
  } catch {
    return {}
  }
}

// Asks Shipyard for an upload link, proving the run with GitHub's token.
async function githubUploadLink(commitMessage) {
  const api = process.env.SHIPYARD_API_URL
  const requestUrl = process.env.ACTIONS_ID_TOKEN_REQUEST_URL
  const requestToken = process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN
  if (!api) fail('SHIPYARD_API_URL is not set. Shipyard sets it as a repo variable when you link the repo.')
  if (!requestUrl || !requestToken) fail('No GitHub sign-in token. The workflow needs "permissions: id-token: write".')

  // The audience is Shipyard's own address, so the token is useless elsewhere.
  const tokenUrl = new URL(requestUrl)
  tokenUrl.searchParams.set('audience', new URL(api).origin)
  const tokenResponse = await fetch(tokenUrl, { headers: { Authorization: `bearer ${requestToken}` } })
  const { value } = await readJson(tokenResponse)
  if (!tokenResponse.ok || !value) fail(`Could not get a GitHub sign-in token (${tokenResponse.status}).`)

  const response = await fetch(`${api.replace(/\/+$/, '')}/github/deploys`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${value}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ commit_message: commitMessage }),
  })
  const body = await readJson(response)
  if (!response.ok) fail(body.error ?? `Shipyard refused the deploy (${response.status}).`)
  console.log(`Deploying ${body.project} (deploy ${body.deploy.version}).`)
  return body.upload_url
}

async function upload(link, form, total) {
  const hashAt = link.indexOf('#')
  if (hashAt === -1) fail('That is not a Shipyard upload link. Ask Shipyard to deploy again for a new one.')
  const target = link.slice(0, hashAt)
  const ticket = link.slice(hashAt + 1)
  if (!/^https?:\/\//.test(target) || !/^shpu_[0-9a-f]{48}$/.test(ticket)) {
    fail('That is not a Shipyard upload link. Ask Shipyard to deploy again for a new one.')
  }

  console.log(`Uploading ${(total / 1048576).toFixed(2)} MB...`)
  const response = await fetch(target, { method: 'POST', headers: { Authorization: `Bearer ${ticket}` }, body: form })
  const body = await readJson(response)
  if (!response.ok) fail(body.error ?? `Upload failed (${response.status}).`)
  if (body.migrations) {
    const applied = body.migrations.applied ?? []
    console.log(
      applied.length
        ? `Database migrations applied: ${applied.join(', ')}`
        : `Database migrations: none new (${body.migrations.already_applied} already applied).`,
    )
  }
  if (body.preview_url) {
    const waiting = body.pending_migrations ?? []
    if (waiting.length) {
      console.log(`Database migrations waiting for the promote: ${waiting.join(', ')}`)
      console.log('  They run on the live database when the preview is promoted, so pages that need them will not work in the preview.')
    }
    console.log(`\nPreview: ${body.preview_url} (${versionText(body)})`)
    console.log('Not live yet. Share the link; promote it in the Shipyard dashboard (Live app) or ask Claude Code to promote it.')
    if (body.release?.hint) console.log(`\n${body.release.hint}`)
    return
  }
  console.log(`\nLive: ${body.url} (${versionText(body)})`)
  if (body.security?.summary) console.log(body.security.summary)
  if (body.seo?.summary) console.log(body.seo.summary)
  if (body.release?.hint) console.log(`\n${body.release.hint}`)
}

// "version 1.2.0, deploy 14"; older Shipyard servers send only the deploy number.
function versionText(body) {
  return body.release?.version ? `version ${body.release.version}, deploy ${body.deploy.version}` : `deploy ${body.deploy.version}`
}

const args = process.argv.slice(2)
const bundle = readBuild()
const { form, total } = buildForm(bundle)
console.log(
  `Build (${bundle.buildDir.split(sep).pop()}): ${bundle.manifest.modules.length} server files, ${bundle.manifest.assets.length} static files` +
    (bundle.migrations.length ? `, ${bundle.manifest.migrations.files.length} migration files (${bundle.manifest.migrations.kind})` : '') +
    (bundle.manifest.commit?.dirty ? ' (with uncommitted changes)' : ''),
)
const release = bundle.manifest.release
if (release) {
  console.log(`Version ${release.version}` + (release.notes ? ' (with its CHANGELOG.md entry)' : ''))
  if (!release.notes) console.log(`  CHANGELOG.md has no entry for ${release.version}, so the What's new page will leave it out.`)
} else {
  console.log('No version in package.json: Shipyard shows this deploy by its commit.')
}

if (args[0] === '--github') {
  await upload(await githubUploadLink(bundle.manifest.commit?.message ?? null), form, total)
} else if (args[0]) {
  await upload(args[0], form, total)
} else {
  fail("Pass the upload link from Shipyard's deploy tool: npm run ship -- '<link>'")
}
