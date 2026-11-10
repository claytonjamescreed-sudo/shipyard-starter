import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import Footer from '../components/Footer'
import Header from '../components/Header'
import UpdateNotice from '../components/UpdateNotice'
import { seo } from '../lib/seo'
import { SITE } from '../lib/site'
import { getSiteSettings } from '../lib/site.functions'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  // Every route can read context.siteUrl for canonical links,
  // context.supportUrl (null unless the support page is on), and
  // context.analyticsToken (null unless visitor analytics is on for the
  // hostname this request came to), context.release (this version, for the
  // Update now notice), and context.whatsNewOn (the What's new page is on).
  beforeLoad: async () => await getSiteSettings(),
  head: ({ match }) => {
    const defaults = seo({}, match.context.siteUrl)
    return {
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        ...defaults.meta,
      ],
      links: [{ rel: 'stylesheet', href: appCss }],
    }
  },
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: React.ReactNode }) {
  const { siteUrl, supportUrl, analyticsToken, release, whatsNewOn } = Route.useRouteContext()
  return (
    <html lang={SITE.locale.split('_')[0]}>
      <head>
        <HeadContent />
        <SiteStructuredData siteUrl={siteUrl} />
      </head>
      <body className="font-sans antialiased">
        <Header />
        {children}
        <Footer supportUrl={supportUrl} whatsNewOn={whatsNewOn} />
        {release?.notice ? <UpdateNotice release={release} whatsNewOn={whatsNewOn} /> : null}
        {analyticsToken ? <AnalyticsBeacon token={analyticsToken} /> : null}
        <Scripts />
      </body>
    </html>
  )
}

// Structured data on every page: the site and who runs it (SITE in
// src/lib/site.ts). Search engines and AI assistants use it to know whose
// site this is. Add page-level JSON-LD (Product, FAQPage, Article) in the
// page itself, the same way.
function SiteStructuredData({ siteUrl }: { siteUrl: string }) {
  const url = `${siteUrl}/`
  const data = {
    '@context': 'https://schema.org',
    '@graph': [
      { '@type': 'WebSite', '@id': `${url}#website`, name: SITE.name, url, description: SITE.description, publisher: { '@id': `${url}#publisher` } },
      {
        '@type': SITE.publisher,
        '@id': `${url}#publisher`,
        name: SITE.name,
        url,
        ...(SITE.sameAs.length ? { sameAs: SITE.sameAs } : {}),
      },
    ],
  }
  // JSON.stringify, with "<" escaped so no text can close the script tag.
  const json = JSON.stringify(data).replace(/</g, '\\u003c')
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />
}

// Cloudflare Web Analytics: no cookies, nothing stored in the browser. It
// counts page views (also route changes in the browser) in the owner's own
// Cloudflare account. Shipyard decides when it renders (see CLAUDE.md,
// "Visitor analytics"); keep exactly one on a page.
function AnalyticsBeacon({ token }: { token: string }) {
  return (
    <script
      type="module"
      src="https://static.cloudflareinsights.com/beacon.min.js"
      data-cf-beacon={JSON.stringify({ token })}
      data-testid="analytics-beacon"
    />
  )
}
