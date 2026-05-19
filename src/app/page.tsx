import { MonitorDashboard } from "@/components/monitor-dashboard";
import { loadDashboardData } from "@/lib/monitor-data";

export const revalidate = 300;

export default async function Home() {
  const dashboardData = await loadDashboardData();

  return <MonitorDashboard data={dashboardData} />;
}
