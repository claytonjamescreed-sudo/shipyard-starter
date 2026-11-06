import { SITE } from '../lib/site'

export default function Footer() {
  return (
    <footer className="mt-20 border-t border-[var(--line)] px-4 pb-14 pt-10 text-sm text-[var(--sea-ink-soft)]">
      <div className="page-wrap">
        &copy; {new Date().getFullYear()} {SITE.name}
      </div>
    </footer>
  )
}
