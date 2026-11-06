import { Link } from '@tanstack/react-router'

export default function NotFound() {
  return (
    <main className="page-wrap px-4 pb-8 pt-14">
      <h1 className="mb-3 text-2xl font-bold text-[var(--sea-ink)]">Page not found</h1>
      <Link to="/" className="font-semibold text-[var(--lagoon-deep)]">
        Go home
      </Link>
    </main>
  )
}
