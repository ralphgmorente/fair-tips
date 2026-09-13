import { ShieldCheck } from "lucide-react";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { JoinForm } from "./join-form";

export const metadata = { title: "Create your account · ShiftFlow" };

export default function JoinPage() {
  if (!getSupabaseConfig()) {
    return (
      <main className="access-shell">
        <section className="password-card">
          <h1>Setup required</h1>
          <p className="access-copy">This deployment has no Supabase connection.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="access-shell">
      <section className="password-card" aria-label="Create your account">
        <span className="access-icon">
          <ShieldCheck aria-hidden="true" size={24} />
        </span>
        <div>
          <p className="eyebrow">ShiftFlow</p>
          <h1>Create your account</h1>
          <p className="access-copy">
            Use the email your manager invited. Only invited addresses can register.
          </p>
        </div>
        <JoinForm />
      </section>
    </main>
  );
}
