import { createFileRoute } from '@tanstack/react-router'
import { SITEMAP_PATHS } from '../lib/site'
import { siteUrl } from '../lib/site-url.server'

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: () => {
        const base = siteUrl()
        const urls = SITEMAP_PATHS.map(
          (path) => `  <url><loc>${escapeXml(new URL(path, base).toString())}</loc></url>`,
        ).join('\n')
        const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`
        return new Response(body, {
          headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
          },
        })
      },
    },
  },
})
