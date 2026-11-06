import { createFileRoute } from '@tanstack/react-router'
import { siteUrl } from '../lib/site-url.server'

// Search engines and AI crawlers are welcome by default. Block private
// paths here, and mark private pages with seo({ noIndex: true }).
export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: () => {
        const body = ['User-agent: *', 'Allow: /', '', `Sitemap: ${siteUrl()}/sitemap.xml`, ''].join('\n')
        return new Response(body, {
          headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
          },
        })
      },
    },
  },
})
