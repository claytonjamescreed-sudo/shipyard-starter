import { createFileRoute, notFound } from '@tanstack/react-router'
import { seo } from '../lib/seo'
import { SITE } from '../lib/site'
import { getWhatsNew } from '../lib/whats-new.functions'

// The app's versions and what changed in each, from CHANGELOG.md. On only
// while the owner turns it on in Shipyard (the project's Versions page);
// otherwise this address is a 404.
export const Route = createFileRoute('/whats-new')({
  loader: async () => {
    const data = await getWhatsNew()
    if (!data) throw notFound()
    return data
  },
  head: ({ match }) =>
    seo(
      { title: "What's new", description: `What changed in each version of ${SITE.name}.`, path: '/whats-new' },
      match.context.siteUrl,
    ),
  component: WhatsNew,
})

function formatDate(date: string): string {
  const parsed = new Date(`${date}T00:00:00Z`)
  if (Number.isNaN(parsed.getTime())) return date
  return parsed.toLocaleDateString(SITE.locale.replace('_', '-'), { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

function WhatsNew() {
  const { current, entries } = Route.useLoaderData()
  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      <section className="island-shell rounded-[2rem] px-6 py-10 sm:px-10">
        <p className="island-kicker mb-3">{SITE.name}</p>
        <h1 className="display-title mb-3 text-4xl font-bold tracking-tight text-[var(--sea-ink)]">What&rsquo;s new</h1>
        <p className="m-0 text-[var(--sea-ink-soft)]" data-testid="whats-new-current">
          {current ? `You're using version ${current}.` : 'What changed in each version of the app.'}
        </p>
      </section>

      {entries.length ? (
        <ol className="m-0 mt-8 list-none space-y-6 p-0" data-testid="whats-new-list">
          {entries.map((entry) => (
            <li key={entry.version} className="island-shell rounded-2xl px-6 py-6" data-testid={`whats-new-${entry.version.replace(/[^0-9A-Za-z-]/g, '-')}`}>
              <h2 className="m-0 text-xl font-semibold text-[var(--sea-ink)]">
                Version {entry.version}
                {entry.version === current ? (
                  <span className="ml-2 rounded-full border border-[var(--line)] px-2 py-0.5 align-middle text-xs font-semibold text-[var(--sea-ink)]">
                    Current
                  </span>
                ) : null}
              </h2>
              {entry.date ? (
                <p className="mb-0 mt-1 text-sm text-[var(--sea-ink-soft)]">
                  <time dateTime={entry.date}>{formatDate(entry.date)}</time>
                </p>
              ) : null}
              <ul className="mb-0 mt-3 space-y-1 pl-5 text-[var(--sea-ink)]">
                {entry.notes.map((note, i) => (
                  <li key={i} className="list-disc">
                    {note}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-8 text-[var(--sea-ink-soft)]" data-testid="whats-new-empty">
          Nothing to show yet.
        </p>
      )}
    </main>
  )
}
