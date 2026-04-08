import { useState } from "react";
import { Outlet, Link } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";
import { RotateKeyModal } from "./RotateKeyModal";
import { OfflineIndicator } from "./OfflineIndicator";
import { ThemeToggle } from "./ThemeToggle";

export function Layout() {
  const { isAuthenticated, isUnlocked, logout } = useAuth();
  const [showRotateModal, setShowRotateModal] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950">
      <OfflineIndicator />
      <nav className="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link
            to="/"
            className="text-xl font-semibold text-gray-900 dark:text-gray-100"
          >
            CardPulse
          </Link>

          <div className="flex items-center gap-4">
            {isAuthenticated && (
              <>
                <Link
                  to="/"
                  className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
                >
                  Dashboard
                </Link>
                <Link
                  to="/transactions"
                  className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
                >
                  Transactions
                </Link>
                <Link
                  to="/cards"
                  className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100"
                >
                  Cards
                </Link>
                {isUnlocked && (
                  <button
                    onClick={() => setShowRotateModal(true)}
                    className="rounded-md bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    Change password
                  </button>
                )}
                <button
                  onClick={logout}
                  className="rounded-md bg-gray-100 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                >
                  Logout
                </button>
              </>
            )}
            <ThemeToggle />
          </div>
        </div>
      </nav>

      <main className="mx-auto max-w-5xl px-4 py-8">
        <Outlet />
      </main>

      {showRotateModal && (
        <RotateKeyModal onClose={() => setShowRotateModal(false)} />
      )}
    </div>
  );
}
