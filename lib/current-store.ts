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
  // Ordered, not just limited: an unordered "first row" can differ between two requests
  // in the same page load, which would show one store's figures beside another's.
  const { data } = await supabase
    .from("stores")
    .select("id")
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}
