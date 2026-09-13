import { requireManager } from "@/app/manager-session";
import { DashboardClient } from "@/app/dashboard-client";

export const metadata = { title: "History · ShiftFlow" };

export default async function HistoryPage() {
  const user = await requireManager();
  return <DashboardClient user={user} initialView="history" />;
}
