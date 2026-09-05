import { redirect } from "next/navigation";
import { CalendarDays, CircleDollarSign, Clock, Wallet } from "lucide-react";
import { getSupabaseConfig } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/tip-calculator";
import { SignOutButton } from "./sign-out-button";

export const metadata = { title: "My tips · ShiftFlow" };

type PayoutRow = {
  paid_hours: number;
  store_tips: number;
  event_tips: number;
  total_tips: number;
  share_percent: number;
  pay_periods: { label: string; published_at: string } | null;
};

export default async function MyTipsPage() {
  if (!getSupabaseConfig()) {
    redirect("/login");
  }

  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims) {
    redirect("/login");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, employee_key")
    .eq("id", claims.sub)
    .maybeSingle();

  // Row level security already limits this to the signed-in person's own rows.
  const { data } = await supabase
    .from("payouts")
    .select(
      "paid_hours, store_tips, event_tips, total_tips, share_percent, pay_periods(label, published_at)"
    )
    .order("published_at", { ascending: false, referencedTable: "pay_periods" });

  const payouts = (data ?? []) as unknown as PayoutRow[];
  const lifetime = payouts.reduce((total, row) => total + Number(row.total_tips), 0);
  const displayName = profile?.full_name || profile?.email || "there";

  return (
    <main className="staff-shell">
      <header className="staff-header">
        <div>
          <p className="eyebrow">ShiftFlow</p>
          <h1>Hi {displayName}</h1>
        </div>
        <SignOutButton />
      </header>

      <p className="method-note">
        Each order&rsquo;s tip is split equally between the staff clocked in at that
        moment, so your share follows the shifts you covered rather than your total hours.
      </p>

      {payouts.length === 0 ? (
        <section className="panel-card staff-empty">
          <span className="breakdown-icon">
            <Wallet aria-hidden="true" size={20} />
          </span>
          <span>
            <strong>No payouts published yet</strong>
            <small>
              {profile?.employee_key
                ? "Your manager has not published a pay period yet. Check back after payday."
                : "Your account is not linked to a name on the timesheet yet. Ask your manager to link it."}
            </small>
          </span>
        </section>
      ) : (
        <>
          <section className="staff-total panel-card">
            <span className="breakdown-icon">
              <CircleDollarSign aria-hidden="true" size={20} />
            </span>
            <div>
              <small>Total tips earned</small>
              <strong>{formatCurrency(lifetime)}</strong>
            </div>
          </section>

          <ul className="staff-periods">
            {payouts.map((row, index) => (
              <li className="panel-card staff-period" key={index}>
                <div className="staff-period-head">
                  <span className="staff-period-label">
                    <CalendarDays aria-hidden="true" size={16} />
                    {row.pay_periods?.label ?? "Pay period"}
                  </span>
                  <strong>{formatCurrency(Number(row.total_tips))}</strong>
                </div>
                <dl className="staff-period-grid">
                  <div>
                    <dt>
                      <Clock aria-hidden="true" size={14} /> Hours
                    </dt>
                    <dd>{formatNumber(Number(row.paid_hours))}</dd>
                  </div>
                  <div>
                    <dt>Store tips</dt>
                    <dd>{formatCurrency(Number(row.store_tips))}</dd>
                  </div>
                  <div>
                    <dt>Event tips</dt>
                    <dd>{formatCurrency(Number(row.event_tips))}</dd>
                  </div>
                  <div>
                    <dt>Share of pool</dt>
                    <dd>{formatPercent(Number(row.share_percent))}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
