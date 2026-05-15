import { useState } from "react";
import { Outlet, Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  CreditCard,
  ArrowLeftRight,
  RefreshCw,
  Smartphone,
  LogOut,
  Menu,
  X,
  Zap,
} from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import { RotateKeyModal } from "./RotateKeyModal";
import { DeviceSyncModal } from "./DeviceSyncModal";
import { OfflineIndicator } from "./OfflineIndicator";
import { ThemeToggle } from "./ThemeToggle";

function NavLink({
  to,
  icon: Icon,
  label,
  onClick,
}: {
  to: string;
  icon: React.ElementType;
  label: string;
  onClick?: () => void;
}) {
  const location = useLocation();
  const isActive = location.pathname === to;

  return (
    <Link
      to={to}
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
        isActive
          ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300"
          : "text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
      }`}
    >
      <Icon size={16} />
      {label}
    </Link>
  );
}

export function Layout() {
  const { isAuthenticated, isUnlocked, logout } = useAuth();
  const [showRotateModal, setShowRotateModal] = useState(false);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const closeMenu = () => setMobileMenuOpen(false);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      <OfflineIndicator />

      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur-md dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 shadow-sm">
              <Zap size={16} className="text-white" />
            </div>
            <span className="text-base font-semibold text-slate-900 dark:text-slate-100">
              CardPulse
            </span>
          </Link>

          {isAuthenticated && (
            <nav className="hidden items-center gap-1 md:flex">
              <NavLink to="/" icon={LayoutDashboard} label="Dashboard" />
              <NavLink to="/transactions" icon={ArrowLeftRight} label="Transactions" />
              <NavLink to="/cards" icon={CreditCard} label="Cards" />
            </nav>
          )}

          <div className="flex items-center gap-2">
            {isAuthenticated && isUnlocked && (
              <div className="hidden items-center gap-1 md:flex">
                <button
                  onClick={() => setShowSyncModal(true)}
                  title="Sync device"
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <Smartphone size={16} />
                </button>
                <button
                  onClick={() => setShowRotateModal(true)}
                  title="Change password"
                  className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                >
                  <RefreshCw size={16} />
                </button>
                <button
                  onClick={logout}
                  title="Logout"
                  className="rounded-lg p-2 text-slate-500 hover:bg-red-50 hover:text-red-600 dark:text-slate-400 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                >
                  <LogOut size={16} />
                </button>
              </div>
            )}
            <ThemeToggle />
            {isAuthenticated && (
              <button
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 md:hidden"
              >
                {mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            )}
          </div>
        </div>

        {mobileMenuOpen && isAuthenticated && (
          <div className="border-t border-slate-200 bg-white px-4 py-3 dark:border-slate-800 dark:bg-slate-950 md:hidden">
            <nav className="flex flex-col gap-1">
              <NavLink to="/" icon={LayoutDashboard} label="Dashboard" onClick={closeMenu} />
              <NavLink to="/transactions" icon={ArrowLeftRight} label="Transactions" onClick={closeMenu} />
              <NavLink to="/cards" icon={CreditCard} label="Cards" onClick={closeMenu} />
              {isUnlocked && (
                <>
                  <button
                    onClick={() => { setShowSyncModal(true); closeMenu(); }}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    <Smartphone size={16} />
                    Sync device
                  </button>
                  <button
                    onClick={() => { setShowRotateModal(true); closeMenu(); }}
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  >
                    <RefreshCw size={16} />
                    Change password
                  </button>
                </>
              )}
              <button
                onClick={() => { logout(); closeMenu(); }}
                className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
              >
                <LogOut size={16} />
                Logout
              </button>
            </nav>
          </div>
        )}
      </header>

      <main className="mx-auto max-w-6xl px-4 py-8">
        <Outlet />
      </main>

      {showRotateModal && (
        <RotateKeyModal onClose={() => setShowRotateModal(false)} />
      )}
      {showSyncModal && (
        <DeviceSyncModal onClose={() => setShowSyncModal(false)} />
      )}
    </div>
  );
}
