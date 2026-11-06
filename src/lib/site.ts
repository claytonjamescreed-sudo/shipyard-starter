// Site-wide settings. Edit these first: they feed every page's SEO tags,
// the sitemap, and robots.txt.
export const SITE = {
  name: 'My Shipyard App',
  description: 'A full-stack app built with Claude Code and hosted on Shipyard.',
  // Public URL. Shipyard sets SITE_URL on deploy; this is the local fallback.
  defaultUrl: 'http://localhost:5181',
  // Default preview image for link shares (put the file in /public).
  ogImage: '/og.png',
  locale: 'en_US',
}

// Pages listed in sitemap.xml. Add every public, indexable page here.
export const SITEMAP_PATHS: string[] = ['/']
