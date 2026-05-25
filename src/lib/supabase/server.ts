// ============================================================
// lib/supabase/server.ts — Server-side Supabase clients
// ============================================================
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Standard server client — respects RLS using the requesting user's session.
 * Use in Server Components and Route Handlers that act on behalf of a user.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch { /* Called from Server Component — safe to ignore */ }
        },
      },
    }
  );
}

/**
 * Admin service-role client — bypasses RLS entirely.
 * ONLY use in trusted server-side API routes (webhooks, admin actions).
 * NEVER pass SUPABASE_SERVICE_ROLE_KEY to the browser.
 */
export function createAdminSupabaseClient() {
  const { createClient } = require('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!   // ← Server-only. Never expose this.
  );
}
