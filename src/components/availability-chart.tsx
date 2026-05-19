"use client";

import { format, isValid, parseISO } from "date-fns";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

const numberFormatter = new Intl.NumberFormat("en-US");

type ChartPoint = {
  capturedAt: string;
  label: string;
  available: number;
  sold: number;
  totalTickets: number | null;
};

type AvailabilityChartProps = {
  chartData: ChartPoint[];
};

function formatTimestamp(value: string, pattern = "dd MMM yyyy HH:mm") {
  const parsedValue = parseISO(value);

  return isValid(parsedValue) ? format(parsedValue, pattern) : value;
}

export function AvailabilityChart({ chartData }: AvailabilityChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%" minWidth={0}>
      <AreaChart data={chartData} margin={{ left: 4, right: 4, top: 12, bottom: 4 }}>
        <defs>
          <linearGradient id="availableGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1d6972" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#1d6972" stopOpacity={0.04} />
          </linearGradient>
          <linearGradient id="soldGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#a54b2a" stopOpacity={0.35} />
            <stop offset="100%" stopColor="#a54b2a" stopOpacity={0.03} />
          </linearGradient>
        </defs>
        <CartesianGrid stroke="rgba(107, 89, 70, 0.18)" strokeDasharray="4 4" />
        <XAxis
          dataKey="label"
          minTickGap={24}
          stroke="#6b5946"
          tick={{ fill: "#6b5946", fontSize: 12 }}
        />
        <YAxis
          stroke="#6b5946"
          tick={{ fill: "#6b5946", fontSize: 12 }}
          tickFormatter={(value: number) => numberFormatter.format(value)}
        />
        <Tooltip
          contentStyle={{
            borderRadius: 20,
            border: "1px solid rgba(212, 193, 159, 0.9)",
            backgroundColor: "rgba(29, 24, 16, 0.94)",
            color: "#f7f0e1",
          }}
          labelFormatter={(_, payload) => {
            const nextLabel = payload?.[0]?.payload?.capturedAt as string | undefined;
            return nextLabel ? formatTimestamp(nextLabel) : "Observation";
          }}
          formatter={(value, name) => [
            numberFormatter.format(Number(value ?? 0)),
            name === "available" ? "Available" : "Sold",
          ]}
        />
        <Area
          type="monotone"
          dataKey="available"
          stroke="#1d6972"
          fill="url(#availableGradient)"
          strokeWidth={3}
          dot={false}
          activeDot={{ r: 4, fill: "#1d6972" }}
        />
        <Area
          type="monotone"
          dataKey="sold"
          stroke="#a54b2a"
          fill="url(#soldGradient)"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4, fill: "#a54b2a" }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}