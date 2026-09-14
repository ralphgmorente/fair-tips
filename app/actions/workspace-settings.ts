"use server";

import { createClient } from "@/lib/supabase/server";
import { currentStoreId } from "@/lib/current-store";
import { emptySettings, type WorkspaceSettings } from "@/lib/workspace-settings";

/**
 * Shared by everyone at one store: these change what the numbers are, so they cannot be
 * per-browser, and they cannot be shared across stores either — the event terminal is a
 * different machine at every venue.
 */
export async function loadWorkspaceSettings(): Promise<WorkspaceSettings> {
  const supabase = await createClient();
  const storeId = await currentStoreId(supabase);
  if (!storeId) {
    return emptySettings;
  }

  const { data, error } = await supabase
    .from("workspace_settings")
    .select("event_device_name, ignored_sales_names")
    .eq("store_id", storeId)
    .maybeSingle();

  if (error || !data) {
    return emptySettings;
  }

  return {
    eventDeviceName: data.event_device_name ?? "",
    ignoredSalesNames: data.ignored_sales_names ?? []
  };
}

export async function saveWorkspaceSettings(
  input: WorkspaceSettings
): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient();

  const { data: claimsData } = await supabase.auth.getClaims();
  const claims = claimsData?.claims;
  if (!claims) {
    return { ok: false, message: "Sign in again to save." };
  }

  const storeId = await currentStoreId(supabase);
  if (!storeId) {
    return { ok: false, message: "This account is not attached to a store yet." };
  }

  // Row level security decides this, per store. Checked here so a refusal reads as a
  // sentence rather than a database error.
  const { data: membership } = await supabase
    .from("store_members")
    .select("role")
    .eq("store_id", storeId)
    .eq("user_id", claims.sub)
    .maybeSingle();

  if (membership?.role !== "manager" && membership?.role !== "admin") {
    return { ok: false, message: "Only managers of this store can change these." };
  }

  const { error } = await supabase
    .from("workspace_settings")
    .update({
      event_device_name: input.eventDeviceName.trim(),
      ignored_sales_names: input.ignoredSalesNames
        .map((name) => name.trim())
        .filter(Boolean),
      updated_by: claims.sub
    })
    .eq("store_id", storeId);

  if (error) {
    console.error("saving workspace settings failed", error);
    return { ok: false, message: "Could not save." };
  }

  return { ok: true, message: "Saved for everyone at this store." };
}
