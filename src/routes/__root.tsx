import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import Footer from '../components/Footer'
import Header from '../components/Header'
import { seo } from '../lib/seo'
import { getSiteUrl } from '../lib/site.functions'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  // Every route can read context.siteUrl for canonical links.
  beforeLoad: async () => ({ siteUrl: await getSiteUrl() }),
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
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body className="font-sans antialiased">
        <Header />
        {children}
        <Footer />
        <Scripts />
      </body>
    </html>
  )
}
