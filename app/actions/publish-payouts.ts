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

  const { data: period, error: periodError } = await supabase
    .from("pay_periods")
    .insert({
      label: input.label,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
      status: "published",
      total_tips: input.totalTips,
      allocated_tips: input.allocatedTips,
      unallocated_tips: input.unallocatedTips,
      published_by: claims.sub
    })
    .select("id")
    .single();

  if (periodError || !period) {
    console.error("publish period failed", periodError);
    return { status: "error", message: "Could not save the pay period." };
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
    // Leave no half-published period behind for staff to find.
    await supabase.from("pay_periods").delete().eq("id", period.id);
    return { status: "error", message: "Could not save the payouts." };
  }

  revalidatePath("/my-tips");
  return {
    status: "ok",
    message: `Published ${rows.length} ${rows.length === 1 ? "payout" : "payouts"} to staff.`
  };
}
