import { SITE } from './site'

interface SeoInput {
  title?: string
  description?: string
  // Path of this page, for example "/pricing". Used for the canonical URL.
  path?: string
  image?: string
  // Set true for pages search engines must not index (dashboards, sign-in).
  noIndex?: boolean
}

// Build the head tags for a page. Use it in every route's head():
//   head: () => seo({ title: 'Pricing', description: '...', path: '/pricing' })
export function seo(input: SeoInput = {}, siteUrl: string = SITE.defaultUrl) {
  const title = input.title ? `${input.title} | ${SITE.name}` : SITE.name
  const description = input.description ?? SITE.description
  const url = new URL(input.path ?? '/', siteUrl).toString()
  const image = new URL(input.image ?? SITE.ogImage, siteUrl).toString()

  return {
    meta: [
      { title },
      { name: 'description', content: description },
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: SITE.name },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:url', content: url },
      { property: 'og:image', content: image },
      { property: 'og:locale', content: SITE.locale },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: image },
      ...(input.noIndex ? [{ name: 'robots', content: 'noindex, nofollow' }] : []),
    ],
    links: [{ rel: 'canonical', href: url }],
  }
}
