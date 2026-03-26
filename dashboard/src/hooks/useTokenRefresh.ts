/**
 * Hook that automatically refreshes the JWT token before expiration.
 *
 * Decodes the JWT to find the `exp` claim and schedules a refresh
 * 5 minutes before it expires. If refresh fails, the user is logged out.
 */

import { useEffect } from "react";
import { refreshToken as apiRefreshToken } from "../lib/api";
import { useAuth } from "./useAuth";

/** How many milliseconds before expiration to trigger refresh. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;

/** Minimum interval to prevent rapid refresh loops. */
const MIN_REFRESH_INTERVAL_MS = 30_000;

/**
 * Extracts the expiration timestamp from a JWT without verifying the signature.
 *
 * Returns the `exp` value in milliseconds, or null if the token
 * cannot be decoded or has no `exp` claim.
 */
function getTokenExpMs(token: string): number | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    const payload = JSON.parse(atob(parts[1]));
    if (typeof payload.exp !== "number") return null;

    return payload.exp * 1000;
  } catch {
    return null;
  }
}

/** Automatically refreshes the JWT token before it expires. */
export function useTokenRefresh() {
  const { token, isAuthenticated, refreshToken, logout } = useAuth();

  useEffect(() => {
    if (!isAuthenticated || !token) return;

    const expMs = getTokenExpMs(token);
    if (!expMs) return;

    const now = Date.now();
    const timeUntilRefresh = expMs - now - REFRESH_MARGIN_MS;

    // Token already expired or about to expire — refresh immediately
    const delay = Math.max(timeUntilRefresh, MIN_REFRESH_INTERVAL_MS);

    const timerId = setTimeout(async () => {
      try {
        const data = await apiRefreshToken(token);
        refreshToken(data.token);
      } catch {
        // Refresh failed — force re-login
        logout();
      }
    }, delay);

    return () => clearTimeout(timerId);
  }, [token, isAuthenticated, refreshToken, logout]);
}
