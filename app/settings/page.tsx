import { requireManager } from "@/app/manager-session";
import { DashboardClient } from "@/app/dashboard-client";

export const metadata = { title: "Settings · ShiftFlow" };

export default async function SettingsPage() {
  const user = await requireManager();
  return <DashboardClient user={user} initialView="settings" />;
}
