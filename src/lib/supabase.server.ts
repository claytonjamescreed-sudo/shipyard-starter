// Server only. Supabase client that acts as the signed-in visitor, with the
// session kept in cookies. Call it inside server functions and loaders.
//
// The database is a Supabase project in the owner's own organization, added
// in Shipyard (create_database or link_database). Shipyard sets SUPABASE_URL
// and SUPABASE_ANON_KEY (the publishable key) on every deploy.
// Locally, copy .dev.vars.example to .dev.vars.
import { createServerClient } from '@supabase/ssr'
import { getCookies, setCookie } from '@tanstack/react-start/server'
import { env } from 'cloudflare:workers'

export function hasBackend(): boolean {
  return Boolean(env.SUPABASE_URL && env.SUPABASE_ANON_KEY)
}

export function getSupabase() {
  if (!hasBackend()) {
    throw new Error(
      'This app has no database yet. Add one in Shipyard (create_database), then deploy, or set SUPABASE_URL and SUPABASE_ANON_KEY in .dev.vars locally.',
    )
  }
  return createServerClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return Object.entries(getCookies()).map(([name, value]) => ({ name, value }))
      },
      setAll(cookiesToSet) {
        for (const { name, value, options } of cookiesToSet) setCookie(name, value, options)
      },
    },
  })
}
