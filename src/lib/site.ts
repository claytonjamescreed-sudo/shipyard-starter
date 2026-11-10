// Site-wide settings. Edit these first: they feed every page's SEO tags,
// the sitemap, and robots.txt.
export const SITE = {
  name: 'My Shipyard App',
  description: 'A full-stack app built with Claude Code and hosted on Shipyard.',
  // Public URL. Shipyard sets SITE_URL on deploy; this is the local fallback.
  defaultUrl: 'http://localhost:5181',
  // Default preview image for link shares: public/og.png, 1200×630. Replace
  // it with the app's own.
  ogImage: '/og.png',
  locale: 'en_US',
  // Who runs the site, for structured data (JSON-LD in src/routes/__root.tsx):
  // 'Organization', 'LocalBusiness' (or a kind of it, such as 'Restaurant'),
  // or 'Person'.
  publisher: 'Organization',
  // The business's or person's profiles elsewhere (social, Wikipedia, app
  // stores), as full URLs. AI assistants use them to know who it is.
  sameAs: [] as string[],
}

// Pages listed in sitemap.xml and llms.txt. Add every public, indexable page here.
export const SITEMAP_PATHS: string[] = ['/']

// For llms.txt: a title and a one-line note for the main pages, keyed by path.
export const LLMS_PAGES: Record<string, { title: string; about?: string }> = {
  '/': { title: 'Home', about: SITE.description },
}
