const TOKEN_KEY = "cardpulse_token";

/** Stores the JWT token in localStorage. */
export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

/** Retrieves the stored JWT token, or null if not logged in. */
export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

/** Removes the stored JWT token (logout). */
export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}
