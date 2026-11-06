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
// code goes live. It never sends dotfiles (dist/server/.dev.vars holds local
// secrets) or source maps. Shipyard checks everything again; the checks here
// only fail early.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join, resolve, sep } from 'node:path'

// Shipyard's limit (packages/core BUNDLE_LIMITS.maxTotalBytes).
const MAX_TOTAL_BYTES = 20 * 1024 * 1024
const MODULE_EXTENSIONS = new Set(['js', 'mjs', 'wasm'])
const BUILD_CONFIGS = ['dist/server/wrangler.json', '.output/server/wrangler.json']
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
  console.log(`Deploying ${body.project}, version ${body.deploy.version}.`)
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
  console.log(`\nLive: ${body.url} (version ${body.deploy.version})`)
}

const args = process.argv.slice(2)
const bundle = readBuild()
const { form, total } = buildForm(bundle)
console.log(
  `Build (${bundle.buildDir.split(sep).pop()}): ${bundle.manifest.modules.length} server files, ${bundle.manifest.assets.length} static files` +
    (bundle.migrations.length ? `, ${bundle.manifest.migrations.files.length} migration files (${bundle.manifest.migrations.kind})` : '') +
    (bundle.manifest.commit?.dirty ? ' (with uncommitted changes)' : ''),
)

if (args[0] === '--github') {
  await upload(await githubUploadLink(bundle.manifest.commit?.message ?? null), form, total)
} else if (args[0]) {
  await upload(args[0], form, total)
} else {
  fail("Pass the upload link from Shipyard's deploy tool: npm run ship -- '<link>'")
}
