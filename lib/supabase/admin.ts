import "server-only";
import { createClient } from "@supabase/supabase-js";

/**
 * Supabase client authenticated with the secret key. It bypasses RLS, so it must never be
 * imported into client code — the `server-only` import above turns that into a build
 * error rather than a silent key leak.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secretKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set.");
  }

  return createClient(url, secretKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}
