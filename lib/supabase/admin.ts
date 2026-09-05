import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseConfig } from "@/lib/supabase/config";

/**
 * Supabase client authenticated with the secret key. It bypasses RLS, so it must never be
 * imported into client code — the `server-only` import above turns that into a build
 * error rather than a silent key leak.
 */
export function createAdminClient() {
  // The URL comes from the shared helper so this agrees with every other client; only
  // the secret key must come from the environment, since it bypasses row level security
  // and must never be committed.
  const config = getSupabaseConfig();
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!config || !secretKey) {
    throw new Error("Supabase URL and SUPABASE_SECRET_KEY must both be available.");
  }

  return createClient(config.url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
