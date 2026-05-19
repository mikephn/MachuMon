export type CollectorState = "idle" | "running" | "error";

export type RouteSnapshot = {
  routeId: number;
  circuitId: number;
  circuitName: string;
  routeName: string;
  capacity: number;
  available: number;
  sold: number;
};

export type AvailabilitySnapshot = {
  capturedAt: string;
  observedDate: string;
  totalTickets: number | null;
  routes: RouteSnapshot[];
};

export type CollectorStatus = {
  state: CollectorState;
  sessionStartedAt: string | null;
  lastHeartbeatAt: string | null;
  lastSnapshotAt: string | null;
  lastObservedDate: string | null;
  snapshotsWritten: number;
  uniqueDatesObserved: string[];
  lastError: string | null;
  targetUrl: string;
};

export type RouteSeriesPoint = {
  capturedAt: string;
  available: number;
  sold: number;
  totalTickets: number | null;
};

export type RouteDaySeries = {
  key: string;
  observedDate: string;
  routeId: number;
  circuitName: string;
  routeName: string;
  capacity: number;
  firstSeenAt: string;
  firstAvailableAt: string | null;
  lastAvailableAt: string | null;
  soldOutAt: string | null;
  currentAvailable: number;
  currentSold: number;
  peakAvailable: number;
  points: RouteSeriesPoint[];
};

export type LatestDateSummary = {
  observedDate: string;
  latestCapturedAt: string;
  totalTickets: number | null;
  totalAvailable: number;
  totalSold: number;
  openRoutes: number;
  routes: RouteSnapshot[];
};

export type DashboardMetrics = {
  firstSnapshotAt: string | null;
  lastSnapshotAt: string | null;
  trackedDateCount: number;
  routeCount: number;
  activeRouteDays: number;
  soldOutRouteDays: number;
};

export type DashboardSource = "live" | "static" | "remote" | "empty";

export type DashboardData = {
  generatedAt: string;
  source: DashboardSource;
  snapshotCount: number;
  trackedDates: string[];
  routeDaySeries: RouteDaySeries[];
  latestByDate: LatestDateSummary[];
  metrics: DashboardMetrics;
  status: CollectorStatus | null;
};