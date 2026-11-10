import { createFileRoute } from '@tanstack/react-router'
import { robotsTxt } from '../lib/ai-crawlers'
import { aiCrawlerChoice, siteUrl } from '../lib/site-url.server'

// Search engines are welcome. Which AI crawlers are follows the owner's
// choice in the Shipyard dashboard (src/lib/ai-crawlers.ts). Block private
// paths there, and mark private pages with seo({ noIndex: true }).
export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: () =>
        new Response(robotsTxt(aiCrawlerChoice(), `${siteUrl()}/sitemap.xml`), {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
          },
        }),
    },
  },
})
