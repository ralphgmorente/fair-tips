"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { employeeKey } from "@/lib/employee-key";
import { currentStoreId } from "@/lib/current-store";

export type PublishablePayout = {
  employee: string;
  paidHours: number;
  storeTipShare: number;
  eventTipShare: number;
  tipShare: number;
  sharePercent: number;
};

export type PublishableUpload = {
  kind: "orders" | "payments" | "timesheet";
  fileName: string;
  rowCount: number;
  contentHash: string;
};

export type PublishInput = {
  label: string;
  startsOn: string | null;
  endsOn: string | null;
  totalTips: number;
  allocatedTips: number;
  unallocatedTips: number;
  employees: PublishablePayout[];
  uploads: PublishableUpload[];
  metrics: Record<string, unknown>;
  /** Set once the manager has confirmed they mean to replace an existing period. */
  replaceExisting?: boolean;
  /**
   * "draft" keeps the period in History for managers only; "published" also puts each
   * person's total on their own sign-in. Calculating saves a draft on its own, so a
   * report is never lost just because nobody pressed publish.
   */
  status?: "draft" | "published";
};

export type PublishState = {
  status: "idle" | "ok" | "error" | "confirm";
  message: string;
};

/**
 * Recognises a period that has already been saved.
 *
 * Matching on the files rather than the dates catches the common case — the same two
 * exports uploaded twice — even if the label differs. Returns what the manager needs to
 * decide, never acting on its own.
 */
async function findExistingPeriod(
  supabase: Awaited<ReturnType<typeof createClient>>,
  storeId: string,
  periodKey: string,
  uploads: PublishableUpload[]
) {
  const { data: byKey } = await supabase
    .from("pay_periods")
    .select("id, label, status")
    .eq("store_id", storeId)
    .eq("period_key", periodKey)
    .maybeSingle();

  if (byKey) {
    return { period: byKey, reason: "same period" as const };
  }

  const hashes = uploads.map((upload) => upload.contentHash).filter(Boolean);
  if (hashes.length === 0) {
    return null;
  }

  // Scoped to this store: two businesses can legitimately upload a byte-identical
  // export, and matching across them would have one store's period claim the other's.
  const { data: byHash } = await supabase
    .from("report_uploads")
    .select("pay_period_id, pay_periods!inner(id, label, status, store_id)")
    .eq("pay_periods.store_id", storeId)
    .in("content_hash", hashes)
    .limit(1)
    .maybeSingle();

  const period = (byHash as {
    pay_periods?: { id: string; label: string; status: string };
  } | null)?.pay_periods;
  return period ? { period, reason: "same files" as const } : null;
}

export async function publishPayouts(input: PublishInput): Promise<PublishState> {
  const supabase = await createClient();
  const status = input.status ?? "published";

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

  const storeId = await currentStoreId(supabase);
  if (!storeId) {
    return { status: "error", message: "This account is not attached to a store yet." };
  }

  const match = await findExistingPeriod(supabase, storeId, periodKey, input.uploads);

  // Replacing a saved period changes what staff already see, so it is never silent.
  // A draft has been shown to nobody — neither saving over one nor publishing one for
  // the first time needs a warning, and asking there made the normal path feel wrong.
  if (
    match &&
    match.period.status === "published" &&
    !input.replaceExisting &&
    status === "published"
  ) {
    return {
      status: "confirm",
      message:
        match.reason === "same files"
          ? `These exact files were already saved as "${match.period.label}". Replace that period with this calculation?`
          : `"${match.period.label}" is already saved. Replace it with this calculation?`
    };
  }

  const existing = match?.period ?? null;

  const { data: period, error: periodError } = await supabase
    .from("pay_periods")
    .upsert(
      {
        store_id: storeId,
        period_key: periodKey,
        label: input.label,
        starts_on: input.startsOn,
        ends_on: input.endsOn,
        status,
        total_tips: input.totalTips,
        allocated_tips: input.allocatedTips,
        unallocated_tips: input.unallocatedTips,
        metrics: input.metrics,
        published_by: claims.sub,
        published_at: new Date().toISOString()
      },
      // Matches pay_periods_store_period_key_idx. Keying on period_key alone stopped
      // matching any constraint once periods became per-store, and every publish failed.
      { onConflict: "store_id,period_key" }
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
  // Replace the fingerprints too, so the history always describes the files behind the
  // figures currently stored.
  await supabase.from("report_uploads").delete().eq("pay_period_id", period.id);

  if (input.uploads.length) {
    const { error: uploadError } = await supabase.from("report_uploads").insert(
      input.uploads.map((upload) => ({
        pay_period_id: period.id,
        kind: upload.kind,
        file_name: upload.fileName,
        row_count: upload.rowCount,
        content_hash: upload.contentHash,
        uploaded_by: claims.sub
      }))
    );
    if (uploadError) {
      console.error("recording uploads failed", uploadError);
    }
  }

  if (status === "draft") {
    return { status: "ok", message: "Saved to History." };
  }

  const count = `${rows.length} ${rows.length === 1 ? "payout" : "payouts"}`;
  return {
    status: "ok",
    message: existing
      ? `Updated this period for staff — ${count}, replacing what was published before.`
      : `Published ${count} to staff.`
  };
}

/**
 * Keeps every calculated period in History without showing it to staff.
 *
 * Called straight after a calculation, so "I ran the report" and "the report is saved"
 * are the same act — publishing is then only about who can see it.
 */
export async function saveDraftPayouts(input: PublishInput): Promise<PublishState> {
  return publishPayouts({ ...input, status: "draft", replaceExisting: true });
}
