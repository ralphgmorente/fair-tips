import "server-only";
import { redirect } from "next/navigation";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { currentStoreId } from "@/lib/current-store";
import type { SessionUser } from "./dashboard-client";

/**
 * Resolves the signed-in manager, or redirects.
 *
 * Shared by every manager route so the check cannot drift between them. The middleware
 * already turns away signed-out visitors; this repeats it because it is the page itself
 * that must not render payout data without a verified session, and getClaims() checks the
 * JWT signature rather than trusting the cookie.
 */
export async function requireManager(): Promise<SessionUser> {
  if (!getSupabaseConfig()) {
    redirect("/login");
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;

  if (!claims) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("email, full_name, role")
    .eq("id", claims.sub)
    .maybeSingle();

  // The role that counts is the one held at this store, not the account's old global
  // one. They can disagree — someone can be a manager at one venue and staff at
  // another — and every rule in the database now reads the per-store role, so this
  // gate has to as well.
  const storeId = await currentStoreId(supabase);
  const { data: membership } = storeId
    ? await supabase
        .from("store_members")
        .select("role")
        .eq("store_id", storeId)
        .eq("user_id", claims.sub)
        .maybeSingle()
    : { data: null };

  const role = membership?.role ?? profile?.role ?? "manager";

  // Staff have no business on the manager views, which show everyone's payout. The
  // redirect is the friendly path; row level security is what actually stops them.
  if (role === "staff") {
    redirect("/my-tips");
  }

  return {
    email: profile?.email ?? (typeof claims.email === "string" ? claims.email : ""),
    fullName: profile?.full_name ?? "",
    role
  };
}
