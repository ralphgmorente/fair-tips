import { requireManager } from "@/app/manager-session";
import { DashboardClient } from "@/app/dashboard-client";

export const metadata = { title: "Dashboard · ShiftFlow" };

export default async function DashboardPage() {
  const user = await requireManager();
  return <DashboardClient user={user} initialView="dashboard" />;
}
