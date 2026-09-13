"use server";

import { createClient } from "@/lib/supabase/server";

export type HistoryUpload = {
  kind: string;
  file_name: string;
  row_count: number;
};

export type HistoryPayout = {
  employee_name: string;
  paid_hours: number;
  total_tips: number;
  share_percent: number;
};

export type HistoryPeriod = {
  id: string;
  label: string;
  published_at: string;
  total_tips: number;
  allocated_tips: number;
  unallocated_tips: number;
  metrics: Record<string, unknown> | null;
  report_uploads: HistoryUpload[];
  payouts: HistoryPayout[];
};

/**
 * Saved periods, newest first.
 *
 * No filtering here on purpose: row level security already limits a staff session to
 * published periods and their own payout line, so the same query serves both roles and
 * there is no second place for the rules to drift out of step.
 */
export async function loadHistory(): Promise<HistoryPeriod[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("pay_periods")
    .select(
      "id, label, published_at, total_tips, allocated_tips, unallocated_tips, metrics, " +
        "report_uploads(kind, file_name, row_count), " +
        "payouts(employee_name, paid_hours, total_tips, share_percent)"
    )
    .order("published_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("loading history failed", error);
    return [];
  }

  return (data ?? []) as unknown as HistoryPeriod[];
}
