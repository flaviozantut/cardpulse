/**
 * Spending visualization charts using Recharts.
 *
 * Three chart types computed from decrypted transaction data:
 * - Monthly bar chart: total spending per month
 * - Category pie chart: spending distribution by category
 * - Daily trend line: spending over time within the filtered period
 *
 * Chart colors adapt to the active theme via the `useTheme` hook so the
 * grids, axes, and tooltips remain legible in both light and dark mode.
 */

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  LineChart,
  Line,
} from "recharts";
import type { DecryptedTransaction } from "../types/dashboard";
import {
  aggregateByMonth,
  aggregateByCategory,
  aggregateByDay,
} from "../lib/chart-data";
import { useTheme, type ResolvedTheme } from "../hooks/useTheme";

/** Color palette for pie chart slices. */
const COLORS = [
  "#3b82f6", // blue
  "#10b981", // emerald
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#14b8a6", // teal
  "#6366f1", // indigo
];

/** Returns a theme-appropriate palette for axes, grid, and tooltips. */
function chartPalette(theme: ResolvedTheme) {
  if (theme === "dark") {
    return {
      grid: "#374151", // gray-700
      axis: "#9ca3af", // gray-400
      tooltipBg: "#1f2937", // gray-800
      tooltipBorder: "#374151",
      tooltipText: "#f3f4f6", // gray-100
    };
  }
  return {
    grid: "#f0f0f0",
    axis: "#9ca3af",
    tooltipBg: "#ffffff",
    tooltipBorder: "#e5e7eb",
    tooltipText: "#111827",
  };
}

/** Formats amount as compact BRL for chart tooltips. */
function formatBRL(value: number): string {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

interface SpendingChartsProps {
  transactions: DecryptedTransaction[];
}

export function SpendingCharts({ transactions }: SpendingChartsProps) {
  const monthlyData = aggregateByMonth(transactions);
  const categoryData = aggregateByCategory(transactions);
  const dailyData = aggregateByDay(transactions);
  const { resolvedTheme } = useTheme();
  const palette = chartPalette(resolvedTheme);

  const tooltipStyle = {
    borderRadius: "8px",
    border: `1px solid ${palette.tooltipBorder}`,
    backgroundColor: palette.tooltipBg,
    color: palette.tooltipText,
  } as const;
  const tooltipItemStyle = { color: palette.tooltipText };
  const tooltipLabelStyle = { color: palette.tooltipText };

  if (transactions.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Monthly bar chart */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <h3 className="mb-4 text-sm font-medium text-gray-700 dark:text-gray-200">
          Monthly Spending
        </h3>
        {monthlyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 12, fill: palette.axis }}
                stroke={palette.axis}
              />
              <YAxis
                tick={{ fontSize: 12, fill: palette.axis }}
                stroke={palette.axis}
              />
              <Tooltip
                formatter={(value) => [formatBRL(Number(value)), "Total"]}
                contentStyle={tooltipStyle}
                itemStyle={tooltipItemStyle}
                labelStyle={tooltipLabelStyle}
                cursor={{ fill: palette.grid, fillOpacity: 0.3 }}
              />
              <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
            No data available
          </p>
        )}
      </div>

      {/* Category pie chart */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 dark:border-gray-800 dark:bg-gray-900">
        <h3 className="mb-4 text-sm font-medium text-gray-700 dark:text-gray-200">
          By Category
        </h3>
        {categoryData.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={categoryData}
                dataKey="total"
                nameKey="category"
                cx="50%"
                cy="50%"
                outerRadius={80}
                label={({ name, percent }) =>
                  `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`
                }
                labelLine={false}
              >
                {categoryData.map((_, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={COLORS[index % COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                formatter={(value) => [formatBRL(Number(value)), "Total"]}
                contentStyle={tooltipStyle}
                itemStyle={tooltipItemStyle}
                labelStyle={tooltipLabelStyle}
              />
              <Legend
                wrapperStyle={{ color: palette.axis }}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
            No data available
          </p>
        )}
      </div>

      {/* Daily trend line */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 lg:col-span-2 dark:border-gray-800 dark:bg-gray-900">
        <h3 className="mb-4 text-sm font-medium text-gray-700 dark:text-gray-200">
          Daily Spending Trend
        </h3>
        {dailyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke={palette.grid} />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 11, fill: palette.axis }}
                stroke={palette.axis}
                tickFormatter={(day: string) => day.slice(5)}
              />
              <YAxis
                tick={{ fontSize: 12, fill: palette.axis }}
                stroke={palette.axis}
              />
              <Tooltip
                formatter={(value) => [formatBRL(Number(value)), "Total"]}
                labelFormatter={(day) => `Date: ${String(day)}`}
                contentStyle={tooltipStyle}
                itemStyle={tooltipItemStyle}
                labelStyle={tooltipLabelStyle}
                cursor={{ stroke: palette.grid }}
              />
              <Line
                type="monotone"
                dataKey="total"
                stroke="#3b82f6"
                strokeWidth={2}
                dot={{ fill: "#3b82f6", r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-8 text-center text-sm text-gray-400 dark:text-gray-500">
            No data available
          </p>
        )}
      </div>
    </div>
  );
}
