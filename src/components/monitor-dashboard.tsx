"use client";

import dynamic from "next/dynamic";
import { useDeferredValue, useState } from "react";

import {
  format,
  formatDistanceToNowStrict,
  isValid,
  parseISO,
} from "date-fns";

import type { DashboardData, RouteDaySeries } from "@/lib/monitor-types";

const AvailabilityChart = dynamic(
  () =>
    import("@/components/availability-chart").then((module) => module.AvailabilityChart),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full items-center justify-center rounded-[28px] border border-dashed border-[color:var(--line)] bg-white/40">
        <span className="font-mono text-xs uppercase tracking-[0.3em] text-[color:var(--secondary)]">
          Rendering chart
        </span>
      </div>
    ),
  },
);

const numberFormatter = new Intl.NumberFormat("en-US");

function formatObservedDate(value: string) {
  const parsedValue = parseISO(`${value}T00:00:00`);

  return isValid(parsedValue) ? format(parsedValue, "dd MMM yyyy") : value;
}

function formatTimestamp(value: string | null, pattern = "dd MMM yyyy HH:mm") {
  if (!value) {
    return "Not yet";
  }

  const parsedValue = parseISO(value);

  return isValid(parsedValue) ? format(parsedValue, pattern) : value;
}

function formatRelativeTimestamp(value: string | null) {
  if (!value) {
    return "Awaiting first heartbeat";
  }

  const parsedValue = parseISO(value);

  if (!isValid(parsedValue)) {
    return value;
  }

  return `${formatDistanceToNowStrict(parsedValue, { addSuffix: true })}`;
}

function summariseSeries(series: RouteDaySeries) {
  if (series.currentAvailable > 0) {
    return `${numberFormatter.format(series.currentAvailable)} left`;
  }

  if (series.soldOutAt) {
    return "Sold out";
  }

  return "Seen only at zero";
}

function seriesTone(series: RouteDaySeries) {
  if (series.currentAvailable > 0) {
    return "bg-[rgba(63,125,79,0.12)] text-[color:var(--success)]";
  }

  if (series.soldOutAt) {
    return "bg-[rgba(165,75,42,0.12)] text-[color:var(--accent-strong)]";
  }

  return "bg-[rgba(185,120,31,0.12)] text-[color:var(--warning)]";
}

type MonitorDashboardProps = {
  data: DashboardData;
};

export function MonitorDashboard({ data }: MonitorDashboardProps) {
  const sortedRouteDaySeries = [...data.routeDaySeries].sort((left, right) => {
    const dateCompare = right.observedDate.localeCompare(left.observedDate);

    if (dateCompare !== 0) {
      return dateCompare;
    }

    return left.routeName.localeCompare(right.routeName);
  });
  const dropdownDateSummaries = [...data.latestByDate].sort((left, right) =>
    right.observedDate.localeCompare(left.observedDate),
  );
  const latestDateBoards = dropdownDateSummaries.slice(0, 3);
  const initialKey =
    sortedRouteDaySeries.find((series) => series.currentAvailable > 0)?.key ??
    sortedRouteDaySeries[0]?.key ??
    "";
  const [selectedKey, setSelectedKey] = useState(initialKey);
  const deferredSelectedKey = useDeferredValue(selectedKey);
  const selectedSeries =
    sortedRouteDaySeries.find((series) => series.key === deferredSelectedKey) ??
    sortedRouteDaySeries[0] ??
    null;
  const selectedDateSummary =
    data.latestByDate.find(
      (summary) => summary.observedDate === selectedSeries?.observedDate,
    ) ?? data.latestByDate[0] ?? null;
  const chartData =
    selectedSeries?.points.map((point) => ({
      capturedAt: point.capturedAt,
      label: formatTimestamp(point.capturedAt, "dd MMM HH:mm"),
      available: point.available,
      sold: point.sold,
      totalTickets: point.totalTickets,
    })) ?? [];

  const metricCards = [
    {
      label: "Snapshots kept",
      value: numberFormatter.format(data.snapshotCount),
      note: data.metrics.firstSnapshotAt
        ? `First seen ${formatRelativeTimestamp(data.metrics.firstSnapshotAt)}`
        : "Collector has not written history yet",
    },
    {
      label: "Travel dates tracked",
      value: numberFormatter.format(data.metrics.trackedDateCount),
      note:
        data.trackedDates.length > 0
          ? `${formatObservedDate(data.trackedDates[0])} to ${formatObservedDate(data.trackedDates.at(-1) ?? data.trackedDates[0])}`
          : "Waiting for the site rotation to populate dates",
    },
    {
      label: "Route/day pairs live",
      value: numberFormatter.format(data.metrics.activeRouteDays),
      note: `${numberFormatter.format(data.metrics.soldOutRouteDays)} pairs already sold out`,
    },
    {
      label: "Named routes tracked",
      value: numberFormatter.format(data.metrics.routeCount),
      note:
        data.status?.lastObservedDate
          ? `Latest loop hit ${formatObservedDate(data.status.lastObservedDate)}`
          : "Collector status will appear after the first pass",
    },
  ];

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-8 px-6 py-8 lg:px-10 lg:py-10">
      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_340px]">
        <div className="rounded-[32px] border border-[color:var(--line)] bg-[color:var(--panel)] px-6 py-7 shadow-[0_28px_80px_rgba(62,44,22,0.08)] lg:px-8 lg:py-9">
          <p className="font-mono text-xs uppercase tracking-[0.34em] text-[color:var(--secondary)]">
            Machu Picchu Ticket Monitor
          </p>
          <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-[-0.04em] text-[color:var(--foreground)] sm:text-5xl">
            Track when each route opens, drifts, and finally sells out.
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-7 text-[color:var(--ink-soft)] sm:text-lg">
            This dashboard listens to the rotating Tu Boleto Machu Picchu availability page,
            stores the observed route counts over time, and turns those observations into a
            timeline you can inspect locally or export for a Vercel deployment.
          </p>
          <div className="mt-7 flex flex-wrap gap-3 text-sm">
            <span className="rounded-full border border-[color:var(--line)] bg-white/75 px-4 py-2 font-mono text-[color:var(--foreground)]">
              source {data.source}
            </span>
            <span className="rounded-full border border-[color:var(--line)] bg-white/75 px-4 py-2 font-mono text-[color:var(--foreground)]">
              snapshots {numberFormatter.format(data.snapshotCount)}
            </span>
            <span className="rounded-full border border-[color:var(--line)] bg-white/75 px-4 py-2 font-mono text-[color:var(--foreground)]">
              last update {formatRelativeTimestamp(data.status?.lastHeartbeatAt ?? null)}
            </span>
          </div>
        </div>

        <aside className="rounded-[32px] border border-[color:var(--line)] bg-[color:var(--panel-strong)] px-6 py-7 shadow-[0_24px_64px_rgba(62,44,22,0.08)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-mono text-xs uppercase tracking-[0.32em] text-[color:var(--secondary)]">
                Collector status
              </p>
              <p className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-[color:var(--foreground)]">
                {data.status?.state ?? "idle"}
              </p>
            </div>
            <span className="rounded-full bg-[rgba(29,105,114,0.12)] px-3 py-1 font-mono text-xs uppercase tracking-[0.24em] text-[color:var(--secondary)]">
              {data.source}
            </span>
          </div>

          <dl className="mt-6 grid gap-4 text-sm text-[color:var(--ink-soft)]">
            <div className="rounded-2xl border border-[color:var(--line)] bg-white/60 px-4 py-3">
              <dt className="font-mono text-[11px] uppercase tracking-[0.28em] text-[color:var(--secondary)]">
                Session started
              </dt>
              <dd className="mt-2 text-base font-medium text-[color:var(--foreground)]">
                {formatTimestamp(data.status?.sessionStartedAt ?? null)}
              </dd>
            </div>
            <div className="rounded-2xl border border-[color:var(--line)] bg-white/60 px-4 py-3">
              <dt className="font-mono text-[11px] uppercase tracking-[0.28em] text-[color:var(--secondary)]">
                Last heartbeat
              </dt>
              <dd className="mt-2 text-base font-medium text-[color:var(--foreground)]">
                {formatRelativeTimestamp(data.status?.lastHeartbeatAt ?? null)}
              </dd>
            </div>
            <div className="rounded-2xl border border-[color:var(--line)] bg-white/60 px-4 py-3">
              <dt className="font-mono text-[11px] uppercase tracking-[0.28em] text-[color:var(--secondary)]">
                Last snapshot
              </dt>
              <dd className="mt-2 text-base font-medium text-[color:var(--foreground)]">
                {formatTimestamp(data.status?.lastSnapshotAt ?? null)}
              </dd>
            </div>
            <div className="rounded-2xl border border-[color:var(--line)] bg-white/60 px-4 py-3">
              <dt className="font-mono text-[11px] uppercase tracking-[0.28em] text-[color:var(--secondary)]">
                Last issue
              </dt>
              <dd className="mt-2 text-sm font-medium text-[color:var(--foreground)]">
                {data.status?.lastError ?? "No collector errors recorded."}
              </dd>
            </div>
          </dl>
        </aside>
      </section>

      {data.snapshotCount === 0 ? (
        <section className="rounded-[32px] border border-dashed border-[color:var(--line)] bg-[color:var(--panel)] px-8 py-10 shadow-[0_24px_64px_rgba(62,44,22,0.08)]">
          <p className="font-mono text-xs uppercase tracking-[0.34em] text-[color:var(--secondary)]">
            No history yet
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--foreground)]">
            Start the collector, then refresh this page once the first site rotation completes.
          </h2>
          <div className="mt-7 grid gap-4 md:grid-cols-2">
            <div className="rounded-[26px] border border-[color:var(--line)] bg-white/60 p-5">
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-[color:var(--secondary)]">
                1. Keep the monitor running
              </p>
              <pre className="mt-4 overflow-x-auto rounded-2xl bg-[color:var(--foreground)] px-4 py-3 font-mono text-sm text-[#f7f0e1]">
                npm run collector
              </pre>
            </div>
            <div className="rounded-[26px] border border-[color:var(--line)] bg-white/60 p-5">
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-[color:var(--secondary)]">
                2. Serve the dashboard locally
              </p>
              <pre className="mt-4 overflow-x-auto rounded-2xl bg-[color:var(--foreground)] px-4 py-3 font-mono text-sm text-[#f7f0e1]">
                npm run dev
              </pre>
            </div>
          </div>
        </section>
      ) : (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {metricCards.map((card) => (
              <article
                key={card.label}
                className="rounded-[28px] border border-[color:var(--line)] bg-[color:var(--panel)] px-5 py-5 shadow-[0_18px_44px_rgba(62,44,22,0.06)]"
              >
                <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[color:var(--secondary)]">
                  {card.label}
                </p>
                <p className="mt-4 text-4xl font-semibold tracking-[-0.05em] text-[color:var(--foreground)]">
                  {card.value}
                </p>
                <p className="mt-3 text-sm leading-6 text-[color:var(--ink-soft)]">{card.note}</p>
              </article>
            ))}
          </section>

          <section className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_360px]">
            <div className="rounded-[32px] border border-[color:var(--line)] bg-[color:var(--panel)] px-6 py-6 shadow-[0_24px_64px_rgba(62,44,22,0.08)] lg:px-7">
              <div className="flex flex-col gap-4 border-b border-[color:var(--line)] pb-5 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="font-mono text-xs uppercase tracking-[0.34em] text-[color:var(--secondary)]">
                    Availability trace
                  </p>
                  <h2 className="mt-3 text-3xl font-semibold tracking-[-0.04em] text-[color:var(--foreground)]">
                    {selectedSeries
                      ? `${selectedSeries.routeName} on ${formatObservedDate(selectedSeries.observedDate)}`
                      : "Waiting for route history"}
                  </h2>
                </div>
                <label className="flex flex-col gap-2 text-sm text-[color:var(--ink-soft)]">
                  Focus a route/day pair
                  <select
                    className="min-w-[280px] rounded-2xl border border-[color:var(--line)] bg-white/80 px-4 py-3 font-mono text-sm text-[color:var(--foreground)] outline-none"
                    value={selectedSeries?.key ?? ""}
                    onChange={(event) => setSelectedKey(event.target.value)}
                  >
                    {dropdownDateSummaries.map((summary) => (
                      <optgroup
                        key={summary.observedDate}
                        label={formatObservedDate(summary.observedDate)}
                      >
                        {sortedRouteDaySeries
                          .filter((series) => series.observedDate === summary.observedDate)
                          .map((series) => (
                            <option key={series.key} value={series.key}>
                              {series.routeName}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                  </select>
                </label>
              </div>

              <div className="mt-6 h-[340px] min-w-0 w-full">
                <AvailabilityChart chartData={chartData} />
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl border border-[color:var(--line)] bg-white/60 px-4 py-3">
                  <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[color:var(--secondary)]">
                    First seen
                  </p>
                  <p className="mt-2 text-sm font-medium text-[color:var(--foreground)]">
                    {formatTimestamp(selectedSeries?.firstSeenAt ?? null)}
                  </p>
                </div>
                <div className="rounded-2xl border border-[color:var(--line)] bg-white/60 px-4 py-3">
                  <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[color:var(--secondary)]">
                    First availability
                  </p>
                  <p className="mt-2 text-sm font-medium text-[color:var(--foreground)]">
                    {formatTimestamp(selectedSeries?.firstAvailableAt ?? null)}
                  </p>
                </div>
                <div className="rounded-2xl border border-[color:var(--line)] bg-white/60 px-4 py-3">
                  <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[color:var(--secondary)]">
                    Final sell-out seen
                  </p>
                  <p className="mt-2 text-sm font-medium text-[color:var(--foreground)]">
                    {formatTimestamp(selectedSeries?.soldOutAt ?? null)}
                  </p>
                </div>
                <div className="rounded-2xl border border-[color:var(--line)] bg-white/60 px-4 py-3">
                  <p className="font-mono text-[11px] uppercase tracking-[0.28em] text-[color:var(--secondary)]">
                    Current status
                  </p>
                  <p className="mt-2 text-sm font-medium text-[color:var(--foreground)]">
                    {selectedSeries ? summariseSeries(selectedSeries) : "Waiting for data"}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="rounded-[32px] border border-[color:var(--line)] bg-[color:var(--panel-strong)] px-5 py-5 shadow-[0_24px_64px_rgba(62,44,22,0.08)]">
                <p className="font-mono text-xs uppercase tracking-[0.34em] text-[color:var(--secondary)]">
                  Latest date boards
                </p>
                <div className="mt-4 grid gap-3">
                  {latestDateBoards.map((summary) => (
                    <article
                      key={summary.observedDate}
                      className={`rounded-[24px] border px-4 py-4 ${
                        selectedSeries?.observedDate === summary.observedDate
                          ? "border-[color:var(--accent)] bg-[rgba(165,75,42,0.08)]"
                          : "border-[color:var(--line)] bg-white/70"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-lg font-semibold tracking-[-0.03em] text-[color:var(--foreground)]">
                            {formatObservedDate(summary.observedDate)}
                          </h3>
                          <p className="mt-1 text-xs text-[color:var(--ink-soft)]">
                            Last sampled {formatRelativeTimestamp(summary.latestCapturedAt)}
                          </p>
                        </div>
                        <span className="rounded-full bg-[rgba(29,105,114,0.12)] px-3 py-1 font-mono text-xs uppercase tracking-[0.22em] text-[color:var(--secondary)]">
                          {summary.openRoutes} open
                        </span>
                      </div>
                      <div className="mt-4 grid grid-cols-3 gap-3">
                        <div>
                          <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-[color:var(--secondary)]">
                            Available
                          </p>
                          <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[color:var(--foreground)]">
                            {numberFormatter.format(summary.totalAvailable)}
                          </p>
                        </div>
                        <div>
                          <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-[color:var(--secondary)]">
                            Sold
                          </p>
                          <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[color:var(--foreground)]">
                            {numberFormatter.format(summary.totalSold)}
                          </p>
                        </div>
                        <div>
                          <p className="font-mono text-[10px] uppercase tracking-[0.26em] text-[color:var(--secondary)]">
                            Total pool
                          </p>
                          <p className="mt-2 text-xl font-semibold tracking-[-0.04em] text-[color:var(--foreground)]">
                            {summary.totalTickets === null
                              ? "n/a"
                              : numberFormatter.format(summary.totalTickets)}
                          </p>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              </div>

              <div className="rounded-[32px] border border-[color:var(--line)] bg-[color:var(--panel-strong)] px-5 py-5 shadow-[0_24px_64px_rgba(62,44,22,0.08)]">
                <p className="font-mono text-xs uppercase tracking-[0.34em] text-[color:var(--secondary)]">
                  Latest readout for {selectedDateSummary ? formatObservedDate(selectedDateSummary.observedDate) : "pending"}
                </p>
                <div className="mt-4 flex flex-col gap-2">
                  {selectedDateSummary?.routes.map((route) => (
                    <div
                      key={route.routeId}
                      className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-2xl border border-[color:var(--line)] bg-white/70 px-4 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-[color:var(--foreground)]">
                          {route.routeName}
                        </p>
                        <p className="mt-1 text-xs text-[color:var(--ink-soft)]">
                          {route.circuitName}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-semibold tracking-[-0.04em] text-[color:var(--foreground)]">
                          {numberFormatter.format(route.available)}
                        </p>
                        <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-[color:var(--secondary)]">
                          of {numberFormatter.format(route.capacity)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-[32px] border border-[color:var(--line)] bg-[color:var(--panel)] px-6 py-6 shadow-[0_24px_64px_rgba(62,44,22,0.08)] lg:px-7">
            <div className="flex flex-col gap-2 border-b border-[color:var(--line)] pb-5">
              <p className="font-mono text-xs uppercase tracking-[0.34em] text-[color:var(--secondary)]">
                Route lifecycle table
              </p>
              <h2 className="text-3xl font-semibold tracking-[-0.04em] text-[color:var(--foreground)]">
                When each day/route first showed stock and when it finally dropped to zero.
              </h2>
            </div>

            <div className="mt-5 overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-y-3">
                <thead>
                  <tr>
                    <th className="px-3 text-left font-mono text-[11px] uppercase tracking-[0.24em] text-[color:var(--secondary)]">
                      Travel day
                    </th>
                    <th className="px-3 text-left font-mono text-[11px] uppercase tracking-[0.24em] text-[color:var(--secondary)]">
                      Route
                    </th>
                    <th className="px-3 text-left font-mono text-[11px] uppercase tracking-[0.24em] text-[color:var(--secondary)]">
                      First available
                    </th>
                    <th className="px-3 text-left font-mono text-[11px] uppercase tracking-[0.24em] text-[color:var(--secondary)]">
                      Final sell-out
                    </th>
                    <th className="px-3 text-left font-mono text-[11px] uppercase tracking-[0.24em] text-[color:var(--secondary)]">
                      Peak stock
                    </th>
                    <th className="px-3 text-left font-mono text-[11px] uppercase tracking-[0.24em] text-[color:var(--secondary)]">
                      Status now
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRouteDaySeries.map((series) => (
                    <tr key={series.key} className="rounded-2xl bg-white/70 shadow-[0_12px_28px_rgba(62,44,22,0.05)]">
                      <td className="rounded-l-2xl border-y border-l border-[color:var(--line)] px-3 py-4 text-sm font-medium text-[color:var(--foreground)]">
                        {formatObservedDate(series.observedDate)}
                      </td>
                      <td className="border-y border-[color:var(--line)] px-3 py-4 text-sm text-[color:var(--foreground)]">
                        <p className="font-medium">{series.routeName}</p>
                        <p className="mt-1 text-xs text-[color:var(--ink-soft)]">{series.circuitName}</p>
                      </td>
                      <td className="border-y border-[color:var(--line)] px-3 py-4 text-sm text-[color:var(--foreground)]">
                        {formatTimestamp(series.firstAvailableAt)}
                      </td>
                      <td className="border-y border-[color:var(--line)] px-3 py-4 text-sm text-[color:var(--foreground)]">
                        {formatTimestamp(series.soldOutAt)}
                      </td>
                      <td className="border-y border-[color:var(--line)] px-3 py-4 text-sm font-medium text-[color:var(--foreground)]">
                        {numberFormatter.format(series.peakAvailable)}
                      </td>
                      <td className="rounded-r-2xl border-y border-r border-[color:var(--line)] px-3 py-4 text-sm text-[color:var(--foreground)]">
                        <span className={`inline-flex rounded-full px-3 py-1 font-mono text-xs uppercase tracking-[0.2em] ${seriesTone(series)}`}>
                          {summariseSeries(series)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </main>
  );
}