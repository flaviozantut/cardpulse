/**
 * Hook that tracks the browser's network connectivity status.
 *
 * Subscribes to `online` and `offline` window events and reflects
 * the current value of `navigator.onLine`.
 *
 * @returns `true` when the browser is online, `false` when offline
 */
import { useState, useEffect } from "react";

export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}
