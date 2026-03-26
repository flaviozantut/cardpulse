import { useCallback, useSyncExternalStore } from "react";
import { clearToken, getToken, saveToken } from "../lib/auth";

/** Subscribers for token changes. */
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function notifyListeners() {
  listeners.forEach((cb) => cb());
}

/** Hook for authentication state. Returns the token and login/logout helpers. */
export function useAuth() {
  const token = useSyncExternalStore(subscribe, getToken, () => null);

  const login = useCallback((newToken: string) => {
    saveToken(newToken);
    notifyListeners();
  }, []);

  const logout = useCallback(() => {
    clearToken();
    notifyListeners();
  }, []);

  return { token, isAuthenticated: token !== null, login, logout };
}
