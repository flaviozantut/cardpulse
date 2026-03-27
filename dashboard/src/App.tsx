import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { CardsPage } from "./pages/CardsPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { useAuth } from "./hooks/useAuth";
import { useTokenRefresh } from "./hooks/useTokenRefresh";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
    },
  },
});

/** Redirects to /login if not authenticated and unlocked. */
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isUnlocked } = useAuth();
  if (!isAuthenticated || !isUnlocked) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

/** Redirects to / if already fully authenticated and unlocked. */
function GuestRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isUnlocked } = useAuth();
  if (isAuthenticated && isUnlocked) return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Wrapper that activates token refresh when authenticated. */
function TokenRefreshProvider({ children }: { children: React.ReactNode }) {
  useTokenRefresh();
  return <>{children}</>;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <TokenRefreshProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <DashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/cards"
                element={
                  <ProtectedRoute>
                    <CardsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/login"
                element={
                  <GuestRoute>
                    <LoginPage />
                  </GuestRoute>
                }
              />
              <Route path="*" element={<NotFoundPage />} />
            </Route>
          </Routes>
        </TokenRefreshProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
