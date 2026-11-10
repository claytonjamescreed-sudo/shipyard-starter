import { Link } from '@tanstack/react-router'
import { SITE } from '../lib/site'

// supportUrl: the app's support page, when the owner has turned it on in
// Shipyard (bug reports and feature or change requests). whatsNewOn: the
// What's new page (src/routes/whats-new.tsx) is on.
export default function Footer({ supportUrl, whatsNewOn }: { supportUrl: string | null; whatsNewOn: boolean }) {
  return (
    <footer className="mt-20 border-t border-[var(--line)] px-4 pb-14 pt-10 text-sm text-[var(--sea-ink-soft)]">
      <div className="page-wrap flex flex-wrap items-center justify-between gap-3">
        <span>
          &copy; {new Date().getFullYear()} {SITE.name}
        </span>
        <span className="flex flex-wrap items-center gap-4">
          {whatsNewOn ? (
            <Link to="/whats-new" className="font-semibold" data-testid="footer-whats-new-link">
              What&rsquo;s new
            </Link>
          ) : null}
          {supportUrl ? (
            <a href={supportUrl} className="font-semibold" data-testid="footer-support-link">
              Support
            </a>
          ) : null}
        </span>
      </div>
    </footer>
  )
}
