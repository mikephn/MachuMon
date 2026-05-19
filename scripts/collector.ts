import { setTimeout as delay } from "node:timers/promises";

import { chromium, type Response } from "playwright";

import {
  appendSnapshot,
  buildDashboardData,
  createCollectorStatus,
  ensureDataDirs,
  loadRawSnapshots,
  writeCollectorStatus,
  writeDashboardExport,
} from "../src/lib/monitor-data";
import type {
  AvailabilitySnapshot,
  CollectorStatus,
  RouteSnapshot,
} from "../src/lib/monitor-types";

const targetUrl =
  process.env.MONITOR_URL ?? "https://tuboleto.cultura.pe/cusco/1000boletos";
const once = process.argv.includes("--once");
const headed = process.argv.includes("--headed");
const onceSessionDurationMs = Number(
  process.env.MONITOR_ONCE_DURATION_MS ?? 150_000,
);
const sessionDurationMs = once ? onceSessionDurationMs : 6 * 60 * 60 * 1000;
const heartbeatIntervalMs = 15_000;
const restartDelayMs = 5_000;

let stopRequested = false;

process.on("SIGINT", () => {
  stopRequested = true;
});

process.on("SIGTERM", () => {
  stopRequested = true;
});

type AvailabilityResponseRecord = {
  circuito: string;
  ncupo: number;
  ncupoActual: number;
  nidCircuito: number;
  nidRuta: number;
  ruta: string;
};

function formatError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

function buildSnapshotSignature(snapshot: AvailabilitySnapshot) {
  return JSON.stringify({
    observedDate: snapshot.observedDate,
    totalTickets: snapshot.totalTickets,
    routes: snapshot.routes.map((route) => [route.routeId, route.available]),
  });
}

function normaliseRoutes(routes: AvailabilityResponseRecord[]): RouteSnapshot[] {
  return routes
    .map((route) => {
      const capacity = Number(route.ncupo ?? 0);
      const available = Number(route.ncupoActual ?? 0);

      return {
        routeId: Number(route.nidRuta ?? 0),
        circuitId: Number(route.nidCircuito ?? 0),
        circuitName: route.circuito,
        routeName: route.ruta,
        capacity,
        available,
        sold: Math.max(capacity - available, 0),
      };
    })
    .sort((left, right) => left.routeName.localeCompare(right.routeName));
}

async function writeLiveExport(
  snapshots: AvailabilitySnapshot[],
  status: CollectorStatus,
) {
  await writeDashboardExport(buildDashboardData(snapshots, status, "live"));
}

async function runSession(
  snapshots: AvailabilitySnapshot[],
  status: CollectorStatus,
) {
  const browser = await chromium.launch({ headless: !headed });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
  });
  const totalsByDate = new Map<string, number | null>();
  const lastSignatureByDate = new Map<string, string>();

  for (const snapshot of snapshots) {
    lastSignatureByDate.set(snapshot.observedDate, buildSnapshotSignature(snapshot));

    if (snapshot.totalTickets !== null) {
      totalsByDate.set(snapshot.observedDate, snapshot.totalTickets);
    }
  }

  status.state = "running";
  status.sessionStartedAt = new Date().toISOString();
  status.lastHeartbeatAt = status.sessionStartedAt;
  status.lastError = null;
  await writeCollectorStatus(status);
  await writeLiveExport(snapshots, status);

  const handleResponse = async (response: Response) => {
    const url = response.url();

    try {
      if (url.includes("/recaudador/ticket/tickets-por-fecha/")) {
        const observedDate = url.split("/").at(-1);

        if (!observedDate) {
          return;
        }

        const payload = (await response.json()) as { totalticket?: number };
        totalsByDate.set(observedDate, Number(payload.totalticket ?? 0));
        return;
      }

      if (!url.includes("/comunes/disponibilidad-actual")) {
        return;
      }

      const requestBody = response.request().postData();

      if (!requestBody) {
        return;
      }

      const parsedBody = JSON.parse(requestBody) as { fecha?: string };
      const observedDate = parsedBody.fecha;

      if (!observedDate) {
        return;
      }

      const payload = (await response.json()) as AvailabilityResponseRecord[];

      if (!Array.isArray(payload) || payload.length === 0) {
        return;
      }

      const snapshot: AvailabilitySnapshot = {
        capturedAt: new Date().toISOString(),
        observedDate,
        totalTickets: totalsByDate.get(observedDate) ?? null,
        routes: normaliseRoutes(payload),
      };
      const signature = buildSnapshotSignature(snapshot);

      if (lastSignatureByDate.get(observedDate) === signature) {
        return;
      }

      lastSignatureByDate.set(observedDate, signature);
      snapshots.push(snapshot);
      await appendSnapshot(snapshot);

      status.lastHeartbeatAt = snapshot.capturedAt;
      status.lastSnapshotAt = snapshot.capturedAt;
      status.lastObservedDate = snapshot.observedDate;
      status.snapshotsWritten = snapshots.length;
      status.uniqueDatesObserved = Array.from(
        new Set([...status.uniqueDatesObserved, snapshot.observedDate]),
      ).sort();
      await writeCollectorStatus(status);
      await writeLiveExport(snapshots, status);

      console.log(
        `[snapshot] ${snapshot.observedDate} ${snapshot.routes
          .map((route) => `${route.routeName}: ${route.available}`)
          .join(" | ")}`,
      );
    } catch (error) {
      status.lastError = formatError(error);
      status.state = "error";
      await writeCollectorStatus(status);
    }
  };

  page.on("response", (response) => {
    void handleResponse(response);
  });

  page.on("pageerror", async (error) => {
    status.lastError = formatError(error);
    status.state = "error";
    await writeCollectorStatus(status);
  });

  await page.goto(targetUrl, { waitUntil: "domcontentloaded", timeout: 60_000 });

  const sessionStart = Date.now();

  while (!stopRequested && Date.now() - sessionStart < sessionDurationMs) {
    status.lastHeartbeatAt = new Date().toISOString();
    await writeCollectorStatus(status);
    await delay(heartbeatIntervalMs);
  }

  await browser.close();
}

async function main() {
  await ensureDataDirs();

  const snapshots = await loadRawSnapshots();
  const status = createCollectorStatus(targetUrl, snapshots);

  while (!stopRequested) {
    try {
      await runSession(snapshots, status);
    } catch (error) {
      status.state = "error";
      status.lastError = formatError(error);
      status.lastHeartbeatAt = new Date().toISOString();
      await writeCollectorStatus(status);

      if (once) {
        break;
      }

      await delay(restartDelayMs);
      continue;
    }

    if (once) {
      break;
    }
  }

  status.state = stopRequested ? "idle" : status.state;
  status.lastHeartbeatAt = new Date().toISOString();
  await writeCollectorStatus(status);
  await writeLiveExport(snapshots, status);
}

main().catch((error) => {
  console.error(formatError(error));
  process.exitCode = 1;
});