/**
 * Supabase connection settings.
 *
 * Environment variables win. When they are absent the app falls back to the values below,
 * so a deployment without configured env vars still works instead of showing a setup
 * screen.
 *
 * Publishing these two is safe by design: both are `NEXT_PUBLIC_`, so they are compiled
 * into the JavaScript bundle and handed to every visitor's browser anyway. The project is
 * protected by row level security (each user reads only their own profile, and the
 * throttle table is revoked from anon entirely), self-signup is disabled, and Supabase
 * rate-limits sign-in attempts per IP.
 *
 * SUPABASE_SECRET_KEY is deliberately NOT here. It bypasses row level security and must
 * only ever come from the environment.
 */
const FALLBACK_URL = "https://mhulczwvcecygugiuuew.supabase.co";
const FALLBACK_PUBLISHABLE_KEY = "sb_publishable_jPvArpuBVqlDedZPoOSpdQ_ZpmMy487";

export type SupabaseConfig = { url: string; publishableKey: string };

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || FALLBACK_URL;
  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || FALLBACK_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    return null;
  }

  return { url, publishableKey };
}
