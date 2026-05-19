import { appendFile, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  AvailabilitySnapshot,
  CollectorStatus,
  DashboardData,
  DashboardSource,
  LatestDateSummary,
  RouteDaySeries,
} from "./monitor-types";

const rootDir = process.cwd();
const dataDir = path.join(rootDir, "data");
const rawDir = path.join(dataDir, "raw");
const stateDir = path.join(dataDir, "state");
const statusFile = path.join(stateDir, "collector-status.json");
const exportFile = path.join(rootDir, "public", "data", "dashboard.json");
const remoteDashboardUrl = process.env.MONITOR_REMOTE_DATA_URL ?? null;
const remoteDashboardToken = process.env.MONITOR_REMOTE_DATA_TOKEN ?? null;

type GithubContentsResponse = {
  content?: string;
  encoding?: string;
};

export async function ensureDataDirs() {
  await mkdir(rawDir, { recursive: true });
  await mkdir(stateDir, { recursive: true });
  await mkdir(path.dirname(exportFile), { recursive: true });
}

export function createCollectorStatus(
  targetUrl: string,
  snapshots: AvailabilitySnapshot[] = [],
): CollectorStatus {
  const latestSnapshot = snapshots.at(-1) ?? null;

  return {
    state: "idle",
    sessionStartedAt: null,
    lastHeartbeatAt: null,
    lastSnapshotAt: latestSnapshot?.capturedAt ?? null,
    lastObservedDate: latestSnapshot?.observedDate ?? null,
    snapshotsWritten: snapshots.length,
    uniqueDatesObserved: Array.from(
      new Set(snapshots.map((snapshot) => snapshot.observedDate)),
    ).sort(),
    lastError: null,
    targetUrl,
  };
}

export async function readCollectorStatus(): Promise<CollectorStatus | null> {
  try {
    const statusText = await readFile(statusFile, "utf8");
    return JSON.parse(statusText) as CollectorStatus;
  } catch {
    return null;
  }
}

export async function writeCollectorStatus(status: CollectorStatus) {
  await ensureDataDirs();
  await writeFile(statusFile, `${JSON.stringify(status, null, 2)}\n`, "utf8");
}

export async function appendSnapshot(snapshot: AvailabilitySnapshot) {
  await ensureDataDirs();

  const captureDay = snapshot.capturedAt.slice(0, 10);
  const snapshotFile = path.join(rawDir, `${captureDay}.jsonl`);

  await appendFile(snapshotFile, `${JSON.stringify(snapshot)}\n`, "utf8");
}

export async function loadRawSnapshots(): Promise<AvailabilitySnapshot[]> {
  let files: string[];

  try {
    files = (await readdir(rawDir)).filter((file) => file.endsWith(".jsonl")).sort();
  } catch {
    return [];
  }

  const snapshots: AvailabilitySnapshot[] = [];

  for (const file of files) {
    const fileText = await readFile(path.join(rawDir, file), "utf8");
    const lines = fileText
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      try {
        snapshots.push(JSON.parse(line) as AvailabilitySnapshot);
      } catch {
        continue;
      }
    }
  }

  return snapshots.sort((left, right) =>
    left.capturedAt.localeCompare(right.capturedAt),
  );
}

export function buildDashboardData(
  snapshots: AvailabilitySnapshot[],
  status: CollectorStatus | null,
  source: DashboardSource,
): DashboardData {
  const orderedSnapshots = [...snapshots].sort((left, right) =>
    left.capturedAt.localeCompare(right.capturedAt),
  );
  const routeSeries = new Map<string, RouteDaySeries>();
  const latestByDate = new Map<string, AvailabilitySnapshot>();
  const routeNames = new Set<string>();

  for (const snapshot of orderedSnapshots) {
    const latestSnapshot = latestByDate.get(snapshot.observedDate);

    if (
      !latestSnapshot ||
      latestSnapshot.capturedAt.localeCompare(snapshot.capturedAt) < 0
    ) {
      latestByDate.set(snapshot.observedDate, snapshot);
    }

    for (const route of snapshot.routes) {
      routeNames.add(route.routeName);

      const key = `${snapshot.observedDate}:${route.routeId}`;
      const currentSeries = routeSeries.get(key);

      if (currentSeries) {
        currentSeries.points.push({
          capturedAt: snapshot.capturedAt,
          available: route.available,
          sold: route.sold,
          totalTickets: snapshot.totalTickets,
        });
        currentSeries.currentAvailable = route.available;
        currentSeries.currentSold = route.sold;
        currentSeries.peakAvailable = Math.max(
          currentSeries.peakAvailable,
          route.available,
        );

        if (route.available > 0) {
          currentSeries.firstAvailableAt ??= snapshot.capturedAt;
          currentSeries.lastAvailableAt = snapshot.capturedAt;
        }

        continue;
      }

      routeSeries.set(key, {
        key,
        observedDate: snapshot.observedDate,
        routeId: route.routeId,
        circuitName: route.circuitName,
        routeName: route.routeName,
        capacity: route.capacity,
        firstSeenAt: snapshot.capturedAt,
        firstAvailableAt: route.available > 0 ? snapshot.capturedAt : null,
        lastAvailableAt: route.available > 0 ? snapshot.capturedAt : null,
        soldOutAt: null,
        currentAvailable: route.available,
        currentSold: route.sold,
        peakAvailable: route.available,
        points: [
          {
            capturedAt: snapshot.capturedAt,
            available: route.available,
            sold: route.sold,
            totalTickets: snapshot.totalTickets,
          },
        ],
      });
    }
  }

  const routeDaySeries = [...routeSeries.values()]
    .map((series) => {
      const soldOutAt =
        series.currentAvailable === 0 && series.lastAvailableAt
          ? series.points.find(
              (point) =>
                point.capturedAt > (series.lastAvailableAt ?? "") &&
                point.available === 0,
            )?.capturedAt ?? null
          : null;

      return {
        ...series,
        soldOutAt,
      };
    })
    .sort((left, right) => {
      const dateCompare = right.observedDate.localeCompare(left.observedDate);

      if (dateCompare !== 0) {
        return dateCompare;
      }

      return left.routeName.localeCompare(right.routeName);
    });

  const latestDateSummaries: LatestDateSummary[] = [...latestByDate.values()]
    .sort((left, right) => left.observedDate.localeCompare(right.observedDate))
    .map((snapshot) => {
      const totalAvailable = snapshot.routes.reduce(
        (sum, route) => sum + route.available,
        0,
      );
      const totalSold = snapshot.routes.reduce(
        (sum, route) => sum + route.sold,
        0,
      );
      const openRoutes = snapshot.routes.filter((route) => route.available > 0)
        .length;

      return {
        observedDate: snapshot.observedDate,
        latestCapturedAt: snapshot.capturedAt,
        totalTickets: snapshot.totalTickets,
        totalAvailable,
        totalSold,
        openRoutes,
        routes: [...snapshot.routes].sort((left, right) =>
          left.routeName.localeCompare(right.routeName),
        ),
      };
    });

  return {
    generatedAt: new Date().toISOString(),
    source,
    snapshotCount: orderedSnapshots.length,
    trackedDates: latestDateSummaries.map((summary) => summary.observedDate),
    routeDaySeries,
    latestByDate: latestDateSummaries,
    metrics: {
      firstSnapshotAt: orderedSnapshots[0]?.capturedAt ?? null,
      lastSnapshotAt: orderedSnapshots.at(-1)?.capturedAt ?? null,
      trackedDateCount: latestDateSummaries.length,
      routeCount: routeNames.size,
      activeRouteDays: routeDaySeries.filter(
        (series) => series.currentAvailable > 0,
      ).length,
      soldOutRouteDays: routeDaySeries.filter(
        (series) => series.currentAvailable === 0 && series.lastAvailableAt,
      ).length,
    },
    status,
  };
}

export async function writeDashboardExport(data: DashboardData) {
  await ensureDataDirs();
  await writeFile(exportFile, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function loadRemoteDashboardData(): Promise<DashboardData | null> {
  if (!remoteDashboardUrl) {
    return null;
  }

  try {
    const response = await fetch(remoteDashboardUrl, {
      headers: {
        accept: "application/json",
        ...(remoteDashboardToken
          ? { authorization: `Bearer ${remoteDashboardToken}` }
          : {}),
      },
      cache: "no-store",
    });

    if (!response.ok) {
      return null;
    }

    const responseJson = (await response.json()) as
      | DashboardData
      | GithubContentsResponse;

    const remoteData =
      "content" in responseJson && responseJson.encoding === "base64"
        ? (JSON.parse(
            Buffer.from(responseJson.content ?? "", "base64").toString("utf8"),
          ) as DashboardData)
        : (responseJson as DashboardData);

    return {
      ...remoteData,
      source: "remote",
    };
  } catch {
    return null;
  }
}

export async function loadDashboardData(): Promise<DashboardData> {
  const remoteData = await loadRemoteDashboardData();

  if (remoteData) {
    return remoteData;
  }

  const status = await readCollectorStatus();
  const snapshots = await loadRawSnapshots();

  if (snapshots.length > 0) {
    return buildDashboardData(snapshots, status, "live");
  }

  try {
    const exportText = await readFile(exportFile, "utf8");
    return JSON.parse(exportText) as DashboardData;
  } catch {
    return buildDashboardData([], status, "empty");
  }
}