import { createFileRoute } from '@tanstack/react-router'
import { LLMS_PAGES, SITE, SITEMAP_PATHS } from '../lib/site'
import { siteUrl } from '../lib/site-url.server'

// llms.txt (llmstxt.org): a short Markdown guide to the site for AI
// assistants. The name and summary come from SITE; the pages from
// SITEMAP_PATHS, with the titles and notes in LLMS_PAGES. Keep it short.
export const Route = createFileRoute('/llms.txt')({
  server: {
    handlers: {
      GET: () => {
        const base = siteUrl()
        const pages = SITEMAP_PATHS.map((path) => {
          const page = LLMS_PAGES[path]
          const title = page?.title ?? (path === '/' ? 'Home' : path)
          return `- [${title}](${new URL(path, base).toString()})${page?.about ? `: ${page.about}` : ''}`
        })
        const body = [`# ${SITE.name}`, '', `> ${SITE.description}`, '', '## Pages', '', ...pages, ''].join('\n')
        return new Response(body, {
          headers: {
            'Content-Type': 'text/markdown; charset=utf-8',
            'Cache-Control': 'public, max-age=3600',
          },
        })
      },
    },
  },
})
