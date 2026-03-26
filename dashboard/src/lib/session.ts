/**
 * In-memory session management for CardPulse.
 *
 * Stores the JWT token, DEK, and wrapped DEK data exclusively in memory
 * (never localStorage) for security. All data is lost on page refresh,
 * requiring the user to re-authenticate — this is intentional for a
 * zero-knowledge encryption model.
 */

import type { DekParams } from "./crypto";

/** Immutable session state stored in memory. */
export interface Session {
  readonly token: string;
  readonly wrappedDek: string;
  readonly dekSalt: string;
  readonly dekParams: DekParams;
  readonly dek: Uint8Array | null;
}

/** Input for creating a new session after login. */
export interface SessionInput {
  token: string;
  wrappedDek: string;
  dekSalt: string;
  dekParams: DekParams;
  dek?: Uint8Array;
}

// ── Private state ────────────────────────────────────────────────────────────

let currentSession: Session | null = null;
const listeners = new Set<() => void>();

function notifyListeners(): void {
  listeners.forEach((cb) => cb());
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Returns the current session, or null if not logged in. */
export function getSession(): Session | null {
  return currentSession;
}

/** Returns a snapshot function compatible with useSyncExternalStore. */
export function getSessionSnapshot(): Session | null {
  return currentSession;
}

/** Whether the user has a valid JWT (logged in). */
export function isAuthenticated(): boolean {
  return currentSession !== null;
}

/** Whether the DEK has been unwrapped (master password entered). */
export function isUnlocked(): boolean {
  return currentSession?.dek !== null && currentSession?.dek !== undefined;
}

/**
 * Creates a new session after successful API login.
 *
 * The DEK is initially null — it gets set after the user
 * enters their master password and the DEK is unwrapped.
 */
export function setSession(input: SessionInput): void {
  currentSession = {
    token: input.token,
    wrappedDek: input.wrappedDek,
    dekSalt: input.dekSalt,
    dekParams: input.dekParams,
    dek: input.dek ?? null,
  };
  notifyListeners();
}

/** Sets the DEK on the current session after master password unlock. */
export function setDek(dek: Uint8Array): void {
  if (!currentSession) return;
  currentSession = { ...currentSession, dek };
  notifyListeners();
}

/** Updates only the JWT token (after refresh) without touching other state. */
export function updateToken(token: string): void {
  if (!currentSession) return;
  currentSession = { ...currentSession, token };
  notifyListeners();
}

/** Clears all session data (logout). */
export function clearSession(): void {
  currentSession = null;
  notifyListeners();
}

/**
 * Subscribes to session changes.
 *
 * Compatible with React's `useSyncExternalStore`.
 * Returns an unsubscribe function.
 */
export function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
