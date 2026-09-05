import { redirect } from "next/navigation";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { DashboardClient, type SessionUser } from "./dashboard-client";

/**
 * Server-rendered shell for the dashboard.
 *
 * The middleware already redirects signed-out visitors, but this check is deliberately
 * repeated here: it is the page itself that must not render payout data without a
 * verified session, and getClaims() validates the JWT signature rather than trusting
 * the cookie.
 */
export default async function Home() {
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

  // Staff have no business on the manager dashboard, which shows every person's payout.
  // The redirect is the friendly path; row level security is what actually stops them.
  if (profile?.role === "staff") {
    redirect("/my-tips");
  }

  const user: SessionUser = {
    email: profile?.email ?? (typeof claims.email === "string" ? claims.email : ""),
    fullName: profile?.full_name ?? "",
    role: profile?.role ?? "manager"
  };

  return <DashboardClient user={user} />;
}
