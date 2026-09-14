"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { currentStoreId } from "@/lib/current-store";

export type PeriodActionState = { ok: boolean; message: string };

/**
 * Editing and removing saved periods.
 *
 * Row level security already limits writes to managers of the store, so these checks
 * exist to turn a refusal into a sentence rather than a silent no-op. Every write is
 * scoped to the caller's store as well, so an id guessed from elsewhere goes nowhere.
 */
type ManagerContext =
  | { ok: false; message: string }
  | { ok: true; supabase: Awaited<ReturnType<typeof createClient>>; storeId: string };

async function managerContext(): Promise<ManagerContext> {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  if (!claimsData?.claims) {
    return { ok: false, message: "Sign in again to make changes." };
  }

  const storeId = await currentStoreId(supabase);
  if (!storeId) {
    return { ok: false, message: "This account is not attached to a store yet." };
  }

  return { ok: true, supabase, storeId };
}

export type SavedPeriodState = { periodId: string; published: boolean } | null;

/**
 * The saved state of a period, by its date range.
 *
 * A calculation restored from the browser on the next visit has no idea whether it was
 * ever published, which left the header offering to publish something staff could
 * already see.
 */
export async function findSavedPeriod(periodKey: string): Promise<SavedPeriodState> {
  const context = await managerContext();
  if (!context.ok) {
    return null;
  }

  const { data } = await context.supabase
    .from("pay_periods")
    .select("id, status")
    .eq("store_id", context.storeId)
    .eq("period_key", periodKey)
    .maybeSingle();

  return data ? { periodId: data.id, published: data.status === "published" } : null;
}

export async function renamePeriod(
  periodId: string,
  label: string
): Promise<PeriodActionState> {
  const context = await managerContext();
  if (!context.ok) {
    return context;
  }

  const trimmed = label.trim();
  if (!trimmed) {
    return { ok: false, message: "Give the period a name." };
  }
  if (trimmed.length > 120) {
    return { ok: false, message: "That name is too long." };
  }

  const { error } = await context.supabase
    .from("pay_periods")
    .update({ label: trimmed })
    .eq("id", periodId)
    .eq("store_id", context.storeId);

  if (error) {
    console.error("renaming period failed", error);
    return { ok: false, message: "Could not rename this period." };
  }

  revalidatePath("/history");
  return { ok: true, message: "Renamed." };
}

/**
 * Publishes a period to staff, or takes it back to a draft.
 *
 * Unpublishing deletes nothing: the figures stay in History for managers, they just
 * leave the staff's own sign-in until the period is published again.
 */
export async function setPeriodShared(
  periodId: string,
  shared: boolean
): Promise<PeriodActionState> {
  const context = await managerContext();
  if (!context.ok) {
    return context;
  }

  const { error } = await context.supabase
    .from("pay_periods")
    .update({ status: shared ? "published" : "draft" })
    .eq("id", periodId)
    .eq("store_id", context.storeId);

  if (error) {
    console.error("changing period visibility failed", error);
    return { ok: false, message: "Could not change whether this period is published." };
  }

  revalidatePath("/history");
  revalidatePath("/my-tips");
  return {
    ok: true,
    message: shared ? "Published to staff." : "Unpublished \u2014 staff can no longer see it."
  };
}

/**
 * Removes a period for good.
 *
 * Payouts and upload records are removed with it by the foreign keys, so a deleted
 * period leaves nothing behind for a staff member to still see.
 */
export async function deletePeriod(periodId: string): Promise<PeriodActionState> {
  const context = await managerContext();
  if (!context.ok) {
    return context;
  }

  const { error } = await context.supabase
    .from("pay_periods")
    .delete()
    .eq("id", periodId)
    .eq("store_id", context.storeId);

  if (error) {
    console.error("deleting period failed", error);
    return { ok: false, message: "Could not delete this period." };
  }

  revalidatePath("/history");
  revalidatePath("/my-tips");
  return { ok: true, message: "Deleted." };
}
