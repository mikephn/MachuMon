import {
  buildDashboardData,
  ensureDataDirs,
  loadRawSnapshots,
  readCollectorStatus,
  writeDashboardExport,
} from "../src/lib/monitor-data";

async function main() {
  await ensureDataDirs();

  const snapshots = await loadRawSnapshots();
  const status = await readCollectorStatus();
  const source = snapshots.length > 0 ? "static" : "empty";
  const dashboardData = buildDashboardData(snapshots, status, source);

  await writeDashboardExport(dashboardData);

  console.log(
    `Exported ${dashboardData.snapshotCount} snapshots across ${dashboardData.metrics.trackedDateCount} dates.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});