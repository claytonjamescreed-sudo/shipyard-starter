# Shipyard starter

The app every [Shipyard](https://shipyard-dashboard.claytonjamescreed.workers.dev) project starts from: TanStack Start (React, rendered on the server) on Cloudflare Workers, with an optional Supabase backend and Sentry error tracking. You build it in Claude Code; Shipyard deploys it into your own Cloudflare and Supabase accounts.

## Start

The easiest way: create a project in the Shipyard dashboard and paste the commands from its **Build** section. They download this starter, connect Claude Code to your project, and start building.

By hand:

```bash
# Once per computer: connect Claude Code to Shipyard (your browser opens; click Allow)
claude mcp add --transport http --scope user shipyard https://shipyard-mcp.claytonjamescreed.workers.dev/mcp
claude mcp login shipyard

git clone --depth 1 https://github.com/claytonjamescreed-sudo/shipyard-starter.git my-app
cd my-app && rm -rf .git && git init -q && npm install
echo '{ "project": "my-app" }' > shipyard.json   # your Shipyard project's slug
claude
```

There is no token to copy: Claude Code signs in to Shipyard in the browser, and the Tokens page in the dashboard lists each sign-in so you can disconnect it.

## Commands

```bash
npm run dev        # local server on http://localhost:5181
npm run typecheck  # TypeScript check
npm run build      # production build
npm run ship -- '<upload link>'   # upload the build to Shipyard (Claude Code gets the link from the deploy tool)
```

Local settings live in `.dev.vars` (copy `.dev.vars.example`). Never commit `.dev.vars`.

## What is in it

- Server-rendered pages with SEO defaults, a sitemap, and `robots.txt` (`src/lib/seo.ts`, `src/lib/site.ts`).
- Supabase on the server only (`src/lib/supabase.server.ts`), when the project has a database.
- Error tracking with your own Sentry (`src/server.ts`, `src/start.ts`, `src/lib/error-tracking.ts`), on when Shipyard sets a DSN and off otherwise.
- `scripts/ship.mjs` and `.github/workflows/shipyard-deploy.yml` for deploys from Claude Code and pushes to GitHub.
- `.github/workflows/shipyard-autofix.yml`: Auto-fix, when the owner turns it on in Shipyard (Claude opens a fix pull request for a new server error, on the owner's own Claude plan).

`CLAUDE.md` has the rules Claude Code follows in this app.
