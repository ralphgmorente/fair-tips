/**
 * Supabase connection settings, read from the environment.
 *
 * Returns null when the app has not been configured, rather than throwing. The auth
 * middleware runs on every request, so a missing variable would otherwise take the whole
 * site down with a 500 instead of showing a usable message.
 */
export type SupabaseConfig = { url: string; publishableKey: string };

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) {
    return null;
  }

  return { url, publishableKey };
}
