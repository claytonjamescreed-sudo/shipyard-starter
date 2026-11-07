import { SITE } from '../lib/site'

// supportUrl: the app's support page, when the owner has turned it on in
// Shipyard (bug reports and feature or change requests).
export default function Footer({ supportUrl }: { supportUrl: string | null }) {
  return (
    <footer className="mt-20 border-t border-[var(--line)] px-4 pb-14 pt-10 text-sm text-[var(--sea-ink-soft)]">
      <div className="page-wrap flex flex-wrap items-center justify-between gap-3">
        <span>
          &copy; {new Date().getFullYear()} {SITE.name}
        </span>
        {supportUrl ? (
          <a href={supportUrl} className="font-semibold" data-testid="footer-support-link">
            Support
          </a>
        ) : null}
      </div>
    </footer>
  )
}
