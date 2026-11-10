// Which crawlers robots.txt lets in. The owner chooses on the project's
// SEO & AI search page in the Shipyard dashboard, and Shipyard sets
// SHIPYARD_AI_CRAWLERS on every deploy:
//   allow_all    every crawler (the default)
//   search_only  AI search and answers, but not AI training
//   block_all    no AI crawler (search engines still allowed)
// Shipyard's SEO check reads robots.txt and compares it with the choice, so
// keep these lists as they are; change the choice in the dashboard.

export type AiCrawlerChoice = 'allow_all' | 'search_only' | 'block_all'

// They read pages to answer people's questions and cite the sources.
export const AI_SEARCH_CRAWLERS = [
  'OAI-SearchBot',
  'ChatGPT-User',
  'PerplexityBot',
  'Perplexity-User',
  'Claude-SearchBot',
  'Claude-User',
  'DuckAssistBot',
  'MistralAI-User',
]

// They collect pages to train AI models.
export const AI_TRAINING_CRAWLERS = [
  'GPTBot',
  'ClaudeBot',
  'Google-Extended',
  'Applebot-Extended',
  'CCBot',
  'Meta-ExternalAgent',
  'Amazonbot',
  'Bytespider',
]

export function parseAiCrawlerChoice(value: string | undefined): AiCrawlerChoice {
  return value === 'search_only' || value === 'block_all' ? value : 'allow_all'
}

// The whole robots.txt. Add private paths (Disallow: /account/) to the
// "User-agent: *" group if you need to, and mark private pages with
// seo({ noIndex: true }) too.
export function robotsTxt(choice: AiCrawlerChoice, sitemapUrl: string): string {
  const blocked = [
    ...(choice === 'block_all' ? AI_SEARCH_CRAWLERS : []),
    ...(choice === 'allow_all' ? [] : AI_TRAINING_CRAWLERS),
  ]
  const lines: string[] = []
  if (blocked.length) {
    lines.push(`# ${choice === 'block_all' ? 'Block all AI crawlers' : 'Allow AI search, block AI training'} (the owner's choice in Shipyard).`)
    for (const name of blocked) lines.push(`User-agent: ${name}`)
    lines.push('Disallow: /', '')
  }
  lines.push('User-agent: *', 'Allow: /', '', `Sitemap: ${sitemapUrl}`, '')
  return lines.join('\n')
}
