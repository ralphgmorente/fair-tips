import { ShieldCheck } from "lucide-react";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { LoginForm } from "./login-form";

export const metadata = {
  title: "Sign in \u00b7 ShiftFlow"
};

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  // Without Supabase there is nothing to sign in against. Say so plainly instead of
  // rendering a form that can only fail.
  if (!getSupabaseConfig()) {
    return (
      <main className="access-shell">
        <section className="password-card" aria-label="Setup required">
          <span className="access-icon">
            <ShieldCheck aria-hidden="true" size={24} />
          </span>
          <div>
            <p className="eyebrow">ShiftFlow</p>
            <h1>Setup required</h1>
            <p className="access-copy">
              This deployment has no Supabase connection, so sign-in is unavailable.
            </p>
          </div>
          <p className="access-note">
            Set <code>NEXT_PUBLIC_SUPABASE_URL</code>,{" "}
            <code>NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> and{" "}
            <code>SUPABASE_SECRET_KEY</code> in the hosting environment, then redeploy.
          </p>
        </section>
      </main>
    );
  }

  const { redirectTo } = await searchParams;
  return <LoginForm redirectTo={redirectTo ?? "/"} />;
}
