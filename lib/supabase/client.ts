import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "@/lib/supabase/config";

/**
 * Browser-side Supabase client. `createBrowserClient` is already a singleton, so calling
 * this repeatedly is cheap.
 *
 * The config comes from the shared helper rather than reading the environment directly.
 * Reading it here meant that on a deployment without env vars this threw on construction,
 * which broke every client-side call — including sign-out, leaving people unable to end
 * their session.
 */
export function createClient() {
  const config = getSupabaseConfig();

  if (!config) {
    throw new Error(
      "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
    );
  }

  return createBrowserClient(config.url, config.publishableKey);
}
