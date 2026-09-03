import { createBrowserClient } from "@supabase/ssr";

/**
 * Browser-side Supabase client. `createBrowserClient` is already a singleton, so calling
 * this repeatedly is cheap.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
