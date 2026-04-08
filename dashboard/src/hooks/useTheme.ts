/**
 * useTheme — manages light/dark theme preference for the dashboard.
 *
 * Supports three modes:
 *  - `light`  — force light theme
 *  - `dark`   — force dark theme
 *  - `system` — follow the OS `prefers-color-scheme` media query (default)
 *
 * The chosen mode is persisted to localStorage. The resolved theme is
 * applied by toggling the `dark` class on the document element, which
 * pairs with Tailwind v4's class-based dark variant configured in
 * `index.css`.
 */

import { useCallback, useEffect, useState } from "react";

export type ThemeMode = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

/** localStorage key under which the user's chosen mode is stored. */
export const THEME_STORAGE_KEY = "cardpulse:theme";

/** Reads the stored mode, falling back to `system` for unknown/missing values. */
function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  const value = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (value === "light" || value === "dark" || value === "system") {
    return value;
  }
  return "system";
}

/** Returns the system preference for dark mode (`true` if dark). */
function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Resolves a mode + system preference into a concrete light/dark value. */
function resolveTheme(mode: ThemeMode, systemDark: boolean): ResolvedTheme {
  if (mode === "system") return systemDark ? "dark" : "light";
  return mode;
}

/** Toggles the `dark` class on the document element. */
function applyThemeClass(theme: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

interface UseThemeReturn {
  /** The current user-chosen mode (`light`, `dark`, or `system`). */
  mode: ThemeMode;
  /** The concrete theme actually being rendered. */
  resolvedTheme: ResolvedTheme;
  /** Updates and persists the mode. */
  setMode: (mode: ThemeMode) => void;
  /** Cycles through `light → dark → system → light`. */
  toggle: () => void;
}

export function useTheme(): UseThemeReturn {
  const [mode, setModeState] = useState<ThemeMode>(() => readStoredMode());
  const [systemDark, setSystemDark] = useState<boolean>(() => systemPrefersDark());

  // Subscribe to OS-level theme changes so `system` mode stays live.
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent | { matches: boolean }) => {
      setSystemDark(e.matches);
    };
    mql.addEventListener("change", handler as (e: MediaQueryListEvent) => void);
    return () => {
      mql.removeEventListener(
        "change",
        handler as (e: MediaQueryListEvent) => void,
      );
    };
  }, []);

  const resolvedTheme = resolveTheme(mode, systemDark);

  // Apply the resolved theme to the DOM whenever it changes.
  useEffect(() => {
    applyThemeClass(resolvedTheme);
  }, [resolvedTheme]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
    }
  }, []);

  const toggle = useCallback(() => {
    setModeState((current) => {
      const next: ThemeMode =
        current === "light" ? "dark" : current === "dark" ? "system" : "light";
      if (typeof window !== "undefined") {
        window.localStorage.setItem(THEME_STORAGE_KEY, next);
      }
      return next;
    });
  }, []);

  return { mode, resolvedTheme, setMode, toggle };
}
