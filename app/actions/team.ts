"use server";

import { createClient } from "@/lib/supabase/server";
import { employeeKey } from "@/lib/employee-key";
import type { TeamMember, TeamInvite, TeamState } from "@/lib/team";
import { currentStoreId } from "@/lib/current-store";

/**
 * Team management for a store.
 *
 * Accounts are created by invitation: an admin records the email, role and timesheet
 * name, and a database trigger refuses any sign-up whose address was not invited. That
 * keeps account creation out of the service key's hands, which this deployment does not
 * hold and must never commit.
 */
export async function loadTeam(): Promise<TeamState> {
  const supabase = await createClient();
  const storeId = await currentStoreId(supabase);
  if (!storeId) {
    return { members: [], invites: [], canManage: false };
  }

  const [{ data: members, error: membersError }, { data: invites, error: invitesError }] =
    await Promise.all([
    supabase
      .from("store_members")
      .select("user_id, role, employee_key, profiles(email, full_name)")
      .eq("store_id", storeId),
    supabase
      .from("store_invites")
      .select("id, email, full_name, role, employee_key, accepted_at")
      .eq("store_id", storeId)
      .order("created_at", { ascending: false })
  ]);

  // Swallowing these is how the team list sat empty for a broken query rather than
  // saying anything at all.
  if (membersError) {
    console.error("loading team members failed", membersError);
  }
  if (invitesError && invitesError.code !== "42501") {
    console.error("loading invites failed", invitesError);
  }

  return {
    // Only a manager can read invites at all, so their presence is the permission signal.
    canManage: invites !== null,
    members: ((members ?? []) as unknown as Array<{
      user_id: string;
      role: string;
      employee_key: string | null;
      profiles: { email: string; full_name: string } | null;
    }>).map((row) => ({
      userId: row.user_id,
      email: row.profiles?.email ?? "",
      fullName: row.profiles?.full_name ?? "",
      role: row.role,
      employeeKey: row.employee_key
    })) as TeamMember[],
    invites: ((invites ?? []) as unknown as TeamInvite[])
  };
}

export async function inviteMember(input: {
  email: string;
  fullName: string;
  role: "staff" | "manager" | "admin";
  employeeName: string;
}): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient();

  const email = input.email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { ok: false, message: "Enter a valid email address." };
  }

  const employee = input.employeeName.trim();
  if (input.role === "staff" && !employee) {
    return {
      ok: false,
      message: "Staff need their name exactly as it appears on the timesheet."
    };
  }

  const storeId = await currentStoreId(supabase);
  if (!storeId) {
    return { ok: false, message: "No store found." };
  }

  const { data: claimsData } = await supabase.auth.getClaims();

  const { error } = await supabase.from("store_invites").upsert(
    {
      store_id: storeId,
      email,
      full_name: input.fullName.trim(),
      role: input.role,
      employee_key: employee ? employeeKey(employee) : null,
      invited_by: claimsData?.claims?.sub ?? null,
      accepted_at: null
    },
    { onConflict: "store_id,email" }
  );

  if (error) {
    console.error("inviting member failed", error);
    // Row level security is what actually refuses a non-manager; this explains it.
    return { ok: false, message: "Could not save the invite. Managers only." };
  }

  return { ok: true, message: `${email} can now create their account.` };
}

export async function revokeInvite(id: string): Promise<{ ok: boolean; message: string }> {
  const supabase = await createClient();
  const { error } = await supabase.from("store_invites").delete().eq("id", id);
  if (error) {
    console.error("revoking invite failed", error);
    return { ok: false, message: "Could not remove that invite." };
  }
  return { ok: true, message: "Invite removed." };
}
