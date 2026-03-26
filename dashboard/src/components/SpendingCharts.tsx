/**
 * Spending visualization charts using Recharts.
 *
 * Three chart types computed from decrypted transaction data:
 * - Monthly bar chart: total spending per month
 * - Category pie chart: spending distribution by category
 * - Daily trend line: spending over time within the filtered period
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

  if (transactions.length === 0) {
    return null;
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Monthly bar chart */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="mb-4 text-sm font-medium text-gray-700">
          Monthly Spending
        </h3>
        {monthlyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 12 }}
                stroke="#9ca3af"
              />
              <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
              <Tooltip
                formatter={(value) => [formatBRL(Number(value)), "Total"]}
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                }}
              />
              <Bar dataKey="total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-8 text-center text-sm text-gray-400">
            No data available
          </p>
        )}
      </div>

      {/* Category pie chart */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="mb-4 text-sm font-medium text-gray-700">
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
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                }}
              />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-8 text-center text-sm text-gray-400">
            No data available
          </p>
        )}
      </div>

      {/* Daily trend line */}
      <div className="rounded-lg border border-gray-200 bg-white p-4 lg:col-span-2">
        <h3 className="mb-4 text-sm font-medium text-gray-700">
          Daily Spending Trend
        </h3>
        {dailyData.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <LineChart data={dailyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 11 }}
                stroke="#9ca3af"
                tickFormatter={(day: string) => day.slice(5)}
              />
              <YAxis tick={{ fontSize: 12 }} stroke="#9ca3af" />
              <Tooltip
                formatter={(value) => [formatBRL(Number(value)), "Total"]}
                labelFormatter={(day) => `Date: ${String(day)}`}
                contentStyle={{
                  borderRadius: "8px",
                  border: "1px solid #e5e7eb",
                }}
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
          <p className="py-8 text-center text-sm text-gray-400">
            No data available
          </p>
        )}
      </div>
    </div>
  );
}
