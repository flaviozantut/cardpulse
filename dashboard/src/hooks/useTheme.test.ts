// @vitest-environment jsdom
/**
 * Tests for useTheme — hook that manages light/dark theme preference.
 *
 * Behavior:
 *  - Resolves the active theme from a stored mode (`light` | `dark` | `system`).
 *  - In `system` mode, reads `prefers-color-scheme: dark` and updates live.
 *  - Persists the user's chosen mode to localStorage.
 *  - Toggles the `dark` class on the documentElement.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTheme, THEME_STORAGE_KEY } from "./useTheme";

// Vitest's jsdom environment exposes a non-functional `window.localStorage`
// stub. Replace it with an in-memory shim so the hook (which persists the
// chosen mode) can be exercised end-to-end in tests.
function installLocalStorage(): Storage {
  const store = new Map<string, string>();
  const fake: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => (store.has(key) ? store.get(key)! : null),
    key: (index) => Array.from(store.keys())[index] ?? null,
    removeItem: (key) => void store.delete(key),
    setItem: (key, value) => void store.set(key, String(value)),
  };
  Object.defineProperty(window, "localStorage", {
    writable: true,
    configurable: true,
    value: fake,
  });
  return fake;
}

type MqlListener = (e: { matches: boolean }) => void;

interface MockMql {
  matches: boolean;
  media: string;
  addEventListener: (type: "change", listener: MqlListener) => void;
  removeEventListener: (type: "change", listener: MqlListener) => void;
  dispatch: (matches: boolean) => void;
}

function installMatchMedia(initialMatches: boolean): MockMql {
  const listeners: MqlListener[] = [];
  const mql: MockMql = {
    matches: initialMatches,
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_type, listener) => {
      listeners.push(listener);
    },
    removeEventListener: (_type, listener) => {
      const idx = listeners.indexOf(listener);
      if (idx >= 0) listeners.splice(idx, 1);
    },
    dispatch: (matches: boolean) => {
      mql.matches = matches;
      for (const l of listeners) l({ matches });
    },
  };

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation(() => mql),
  });

  return mql;
}

describe("useTheme", () => {
  beforeEach(() => {
    installLocalStorage();
    document.documentElement.classList.remove("dark");
  });

  afterEach(() => {
    document.documentElement.classList.remove("dark");
  });

  it("defaults to system mode when no preference is stored", () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.mode).toBe("system");
  });

  it("resolves to dark when system preference is dark and mode is system", () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useTheme());
    expect(result.current.mode).toBe("system");
    expect(result.current.resolvedTheme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("resolves to light when system preference is light and mode is system", () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.resolvedTheme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("respects an explicit dark preference even when system is light", () => {
    installMatchMedia(false);
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");
    const { result } = renderHook(() => useTheme());
    expect(result.current.mode).toBe("dark");
    expect(result.current.resolvedTheme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("respects an explicit light preference even when system is dark", () => {
    installMatchMedia(true);
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    const { result } = renderHook(() => useTheme());
    expect(result.current.mode).toBe("light");
    expect(result.current.resolvedTheme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("persists the chosen mode to localStorage when setMode is called", () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setMode("dark");
    });

    expect(result.current.mode).toBe("dark");
    expect(result.current.resolvedTheme).toBe("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("reacts to system theme changes when in system mode", () => {
    const mql = installMatchMedia(false);
    const { result } = renderHook(() => useTheme());
    expect(result.current.resolvedTheme).toBe("light");

    act(() => {
      mql.dispatch(true);
    });

    expect(result.current.resolvedTheme).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
  });

  it("ignores system theme changes when an explicit mode is set", () => {
    const mql = installMatchMedia(false);
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setMode("light");
    });

    act(() => {
      mql.dispatch(true);
    });

    expect(result.current.resolvedTheme).toBe("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("toggle cycles light → dark → system", () => {
    installMatchMedia(false);
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    const { result } = renderHook(() => useTheme());

    expect(result.current.mode).toBe("light");

    act(() => {
      result.current.toggle();
    });
    expect(result.current.mode).toBe("dark");

    act(() => {
      result.current.toggle();
    });
    expect(result.current.mode).toBe("system");

    act(() => {
      result.current.toggle();
    });
    expect(result.current.mode).toBe("light");
  });
});
