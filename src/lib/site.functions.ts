import { createServerFn } from '@tanstack/react-start'
import { siteUrl } from './site-url.server'

// Gives routes the public URL for canonical links and share tags.
export const getSiteUrl = createServerFn({ method: 'GET' }).handler(() => siteUrl())
