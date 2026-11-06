import { Link } from '@tanstack/react-router'
import { SITE } from '../lib/site'

export default function Header() {
  return (
    <header className="border-b border-[var(--line)] bg-[var(--header-bg)] px-4">
      <nav className="page-wrap flex items-center gap-4 py-4">
        <Link to="/" className="text-base font-semibold text-[var(--sea-ink)] no-underline">
          {SITE.name}
        </Link>
      </nav>
    </header>
  )
}
