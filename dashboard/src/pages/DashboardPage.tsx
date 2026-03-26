import { useQuery } from "@tanstack/react-query";
import { listCards, listTransactions } from "../lib/api";
import { useAuth } from "../hooks/useAuth";

/** Computes the current month bucket in YYYY-MM format. */
function currentBucket(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${now.getFullYear()}-${month}`;
}

export function DashboardPage() {
  const { token } = useAuth();
  const bucket = currentBucket();

  const cards = useQuery({
    queryKey: ["cards"],
    queryFn: () => listCards(token!),
    enabled: !!token,
  });

  const transactions = useQuery({
    queryKey: ["transactions", bucket],
    queryFn: () => listTransactions(token!, { timestamp_bucket: bucket }),
    enabled: !!token,
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">
          Viewing {bucket} &middot; All data is decrypted client-side
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard
          label="Cards"
          value={cards.data?.length ?? "..."}
          loading={cards.isLoading}
        />
        <StatCard
          label="Transactions"
          value={transactions.data?.length ?? "..."}
          loading={transactions.isLoading}
        />
        <StatCard label="Period" value={bucket} loading={false} />
      </div>

      {/* Transactions list (encrypted — placeholder) */}
      <div className="rounded-lg border border-gray-200 bg-white">
        <div className="border-b border-gray-200 px-4 py-3">
          <h2 className="text-lg font-medium text-gray-900">
            Transactions ({bucket})
          </h2>
        </div>

        {transactions.isLoading ? (
          <p className="p-4 text-sm text-gray-500">Loading...</p>
        ) : transactions.data?.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">
            No transactions this month.
          </p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {transactions.data?.map((tx) => (
              <li key={tx.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {tx.id.slice(0, 8)}...
                  </p>
                  <p className="text-xs text-gray-500">
                    Card: {tx.card_id.slice(0, 8)}... &middot;{" "}
                    {tx.timestamp_bucket}
                  </p>
                </div>
                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-800">
                  Encrypted
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {transactions.isError && (
        <p className="text-sm text-red-600">
          Failed to load transactions: {transactions.error.message}
        </p>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  loading,
}: {
  label: string;
  value: string | number;
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-900">
        {loading ? "..." : value}
      </p>
    </div>
  );
}
