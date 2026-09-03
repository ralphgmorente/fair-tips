import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseConfig } from "@/lib/supabase/config";

/**
 * Server-side Supabase client, scoped to the current request's cookies. A new client is
 * created per request on purpose — the cookies differ per request.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const config = getSupabaseConfig();

  if (!config) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
    );
  }

  return createServerClient(
    config.url,
    config.publishableKey,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component, where cookies are read-only. Safe to ignore:
            // the middleware refreshes the session on every request.
          }
        }
      }
    }
  );
}
