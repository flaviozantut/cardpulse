/**
 * React hook for authentication and session state.
 *
 * Uses `useSyncExternalStore` to subscribe to the in-memory session store.
 * All session data lives in memory only — never localStorage — so a page
 * refresh requires re-authentication (intentional for zero-knowledge security).
 */

import { useCallback, useSyncExternalStore } from "react";
import {
  type SessionInput,
  clearSession,
  getSessionSnapshot,
  isAuthenticated as checkAuth,
  isUnlocked as checkUnlocked,
  setDek as storeDek,
  setSession,
  subscribe,
  updateToken as refreshStoredToken,
} from "../lib/session";
import { clearOfflineCache } from "../lib/offline-cache";

/** Hook for authentication state. Returns session info and auth helpers. */
export function useAuth() {
  const session = useSyncExternalStore(
    subscribe,
    getSessionSnapshot,
    () => null
  );

  const login = useCallback((input: SessionInput) => {
    setSession(input);
  }, []);

  const unlock = useCallback((dek: Uint8Array) => {
    storeDek(dek);
  }, []);

  const refreshToken = useCallback((newToken: string) => {
    refreshStoredToken(newToken);
  }, []);

  const logout = useCallback(() => {
    clearSession();
    // Clear cached plaintext data from IndexedDB on logout
    clearOfflineCache().catch(() => {});
  }, []);

  return {
    session,
    token: session?.token ?? null,
    dek: session?.dek ?? null,
    isAuthenticated: checkAuth(),
    isUnlocked: checkUnlocked(),
    login,
    unlock,
    refreshToken,
    logout,
  };
}
