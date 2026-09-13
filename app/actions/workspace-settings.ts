"use server";

import { createClient } from "@/lib/supabase/server";
import { emptySettings, type WorkspaceSettings } from "@/lib/workspace-settings";

/** Shared by everyone: these change what the numbers are, so they cannot be per-browser. */
export async function loadWorkspaceSettings(): Promise<WorkspaceSettings> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("workspace_settings")
    .select("event_device_name, ignored_sales_names")
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

  // Row level security already restricts this to managers; checked here so a refusal
  // reads as a sentence rather than a database error.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", claims.sub)
    .maybeSingle();

  if (profile?.role !== "manager" && profile?.role !== "admin") {
    return { ok: false, message: "Only managers can change these." };
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
    .eq("id", true);

  if (error) {
    console.error("saving workspace settings failed", error);
    return { ok: false, message: "Could not save." };
  }

  return { ok: true, message: "Saved for everyone." };
}
