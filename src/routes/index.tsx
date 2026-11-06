import { createFileRoute } from '@tanstack/react-router'
import { seo } from '../lib/seo'
import { SITE } from '../lib/site'

export const Route = createFileRoute('/')({
  head: ({ match }) =>
    seo({ description: SITE.description, path: '/' }, match.context.siteUrl),
  component: Home,
})

function Home() {
  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      <section className="island-shell rounded-[2rem] px-6 py-10 sm:px-10 sm:py-14">
        <p className="island-kicker mb-3">Built with Claude Code on Shipyard</p>
        <h1 className="display-title mb-5 max-w-3xl text-4xl leading-[1.05] font-bold tracking-tight text-[var(--sea-ink)] sm:text-6xl">
          {SITE.name}
        </h1>
        <p className="mb-6 max-w-2xl text-base text-[var(--sea-ink-soft)] sm:text-lg">
          Your app is running. Open this folder in Claude Code and describe what you want to
          build. Claude Code reads CLAUDE.md for the Shipyard rules.
        </p>
        <ol className="m-0 space-y-2 pl-5 text-sm text-[var(--sea-ink-soft)]">
          <li>Edit the site name and description in src/lib/site.ts.</li>
          <li>Need a database, sign-in, or file storage? Ask Claude Code to turn on a backend.</li>
          <li>Ask Claude Code to ship it. Shipyard puts it live.</li>
        </ol>
      </section>
    </main>
  )
}
