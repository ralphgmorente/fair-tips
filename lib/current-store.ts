import type { createClient } from "@/lib/supabase/server";

/**
 * The store the signed-in user is working in.
 *
 * Row level security already limits `stores` to the caller's memberships, so this
 * returns one of their own stores and never someone else's. Single-store for now: when
 * the store picker lands, this becomes "the selected store, defaulting to the first".
 */
export async function currentStoreId(
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<string | null> {
  const { data } = await supabase.from("stores").select("id").limit(1).maybeSingle();
  return data?.id ?? null;
}
