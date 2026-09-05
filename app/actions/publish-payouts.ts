"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { employeeKey } from "@/lib/employee-key";

export type PublishablePayout = {
  employee: string;
  paidHours: number;
  storeTipShare: number;
  eventTipShare: number;
  tipShare: number;
  sharePercent: number;
};

export type PublishInput = {
  label: string;
  startsOn: string | null;
  endsOn: string | null;
  totalTips: number;
  allocatedTips: number;
  unallocatedTips: number;
  employees: PublishablePayout[];
};

export type PublishState = { status: "idle" | "ok" | "error"; message: string };

export async function publishPayouts(input: PublishInput): Promise<PublishState> {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims) {
    return { status: "error", message: "Sign in again to publish." };
  }

  // Row level security already restricts writes to managers; this check exists so the
  // refusal reads as a sentence rather than a database error.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", claims.sub)
    .maybeSingle();

  if (profile?.role !== "manager" && profile?.role !== "admin") {
    return { status: "error", message: "Only managers can publish payouts." };
  }

  if (!input.employees.length) {
    return { status: "error", message: "There is nothing to publish yet." };
  }

  // Identify the period by its dates so republishing the same week corrects the figures
  // instead of listing that week twice with no way to tell which one is owed.
  const periodKey =
    input.startsOn && input.endsOn ? `${input.startsOn}_${input.endsOn}` : input.label;

  const { data: existing } = await supabase
    .from("pay_periods")
    .select("id")
    .eq("period_key", periodKey)
    .maybeSingle();

  const { data: period, error: periodError } = await supabase
    .from("pay_periods")
    .upsert(
      {
        period_key: periodKey,
        label: input.label,
        starts_on: input.startsOn,
        ends_on: input.endsOn,
        status: "published",
        total_tips: input.totalTips,
        allocated_tips: input.allocatedTips,
        unallocated_tips: input.unallocatedTips,
        published_by: claims.sub,
        published_at: new Date().toISOString()
      },
      { onConflict: "period_key" }
    )
    .select("id")
    .single();

  if (periodError || !period) {
    console.error("publish period failed", periodError);
    return { status: "error", message: "Could not save the pay period." };
  }

  // Clear the previous figures so someone removed from the corrected run does not keep a
  // stale payout, and so a shrinking team does not leave orphan rows behind.
  const { error: clearError } = await supabase
    .from("payouts")
    .delete()
    .eq("pay_period_id", period.id);

  if (clearError) {
    console.error("clearing previous payouts failed", clearError);
    return { status: "error", message: "Could not replace the previous payouts." };
  }

  const rows = input.employees.map((employee) => ({
    pay_period_id: period.id,
    employee_name: employee.employee,
    employee_key: employeeKey(employee.employee),
    paid_hours: employee.paidHours,
    store_tips: employee.storeTipShare,
    event_tips: employee.eventTipShare,
    total_tips: employee.tipShare,
    share_percent: employee.sharePercent
  }));

  const { error: payoutError } = await supabase.from("payouts").insert(rows);

  if (payoutError) {
    console.error("publish payouts failed", payoutError);
    // Only drop the period when this run created it. Deleting one that already existed
    // would take a previously correct week away from staff.
    if (!existing) {
      await supabase.from("pay_periods").delete().eq("id", period.id);
    }
    return { status: "error", message: "Could not save the payouts." };
  }

  revalidatePath("/my-tips");
  const count = `${rows.length} ${rows.length === 1 ? "payout" : "payouts"}`;
  return {
    status: "ok",
    message: existing
      ? `Updated this period for staff — ${count}, replacing what was published before.`
      : `Published ${count} to staff.`
  };
}
