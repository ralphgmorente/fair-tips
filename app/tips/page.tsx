import { requireManager } from "@/app/manager-session";
import { DashboardClient } from "@/app/dashboard-client";

export const metadata = { title: "Tips · ShiftFlow" };

export default async function TipsPage() {
  const user = await requireManager();
  return <DashboardClient user={user} initialView="tips" />;
}
