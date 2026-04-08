/**
 * Multi-device pairing helpers.
 *
 * CardPulse's zero-knowledge model already supports multi-device usage out
 * of the box: the wrapped DEK is stored on the server, so any device with
 * the user's email + master password can log in and decrypt their data.
 *
 * This module adds an optional convenience layer: the source device can
 * generate a "pair payload" containing the API base URL and email (NEVER
 * the master password or DEK). The payload is encoded as a base64url JSON
 * blob, attached to a dashboard URL via the `pair` query parameter, and
 * rendered as a QR code. The destination device scans the code, opens the
 * URL, and the login form pre-fills the API URL + email — the user only
 * needs to type their master password.
 *
 * The master password never leaves the user's head, so the security model
 * is unchanged.
 */

/** Query parameter name used in pair URLs. */
export const PAIR_QUERY_PARAM = "pair";

/** Current schema version for forward compatibility. */
export const PAIR_PAYLOAD_VERSION = 1 as const;

/**
 * Pairing payload encoded into the QR code.
 *
 * Intentionally limited to non-secret fields. Adding a master password
 * or DEK here would break the zero-knowledge guarantee.
 */
export interface PairPayload {
  /** Schema version. Always {@link PAIR_PAYLOAD_VERSION}. */
  v: typeof PAIR_PAYLOAD_VERSION;
  /** API base URL the destination device should talk to. */
  apiBaseUrl: string;
  /** Account email to pre-fill in the login form. */
  email: string;
}

/** Thrown when a pair payload fails to decode or validate. */
export class PairPayloadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PairPayloadError";
  }
}

// ── base64url helpers ────────────────────────────────────────────────────────

/** Encodes a UTF-8 string into base64url (no padding, URL-safe alphabet). */
function toBase64Url(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/** Decodes a base64url string back into a UTF-8 string. */
function fromBase64Url(input: string): string {
  // Reject any character outside the base64url alphabet up front so callers
  // get a deterministic error instead of relying on `atob`'s lenient parser.
  if (!/^[A-Za-z0-9_-]*$/.test(input)) {
    throw new PairPayloadError("Pair payload contains invalid characters");
  }
  const padded =
    input.replace(/-/g, "+").replace(/_/g, "/") +
    "==".slice(0, (4 - (input.length % 4)) % 4);
  let binary: string;
  try {
    binary = atob(padded);
  } catch {
    throw new PairPayloadError("Pair payload is not valid base64url");
  }
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

// ── Encode / decode ─────────────────────────────────────────────────────────

/**
 * Validates a payload shape and returns it as a {@link PairPayload}.
 *
 * @throws {PairPayloadError} if any required field is missing or invalid.
 */
function validatePayload(value: unknown): PairPayload {
  if (typeof value !== "object" || value === null) {
    throw new PairPayloadError("Pair payload is not an object");
  }
  const obj = value as Record<string, unknown>;
  if (obj.v !== PAIR_PAYLOAD_VERSION) {
    throw new PairPayloadError(
      `Unsupported pair payload version: ${String(obj.v)}`,
    );
  }
  if (typeof obj.apiBaseUrl !== "string" || obj.apiBaseUrl.length === 0) {
    throw new PairPayloadError("Pair payload is missing apiBaseUrl");
  }
  if (typeof obj.email !== "string" || obj.email.length === 0) {
    throw new PairPayloadError("Pair payload is missing email");
  }
  // Defense in depth: refuse anything that doesn't parse as http(s).
  let parsed: URL;
  try {
    parsed = new URL(obj.apiBaseUrl);
  } catch {
    throw new PairPayloadError("Pair payload apiBaseUrl is not a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new PairPayloadError(
      "Pair payload apiBaseUrl must use http or https",
    );
  }
  return {
    v: PAIR_PAYLOAD_VERSION,
    apiBaseUrl: obj.apiBaseUrl,
    email: obj.email,
  };
}

/** Encodes a payload as a base64url JSON string. */
export function encodePairPayload(payload: PairPayload): string {
  // We deliberately do NOT validate on encode — call sites occasionally
  // need to construct intentionally malformed payloads (e.g. tests).
  // Decode is the canonical validation boundary.
  return toBase64Url(JSON.stringify(payload));
}

/**
 * Decodes a base64url JSON string back into a {@link PairPayload}.
 *
 * @throws {PairPayloadError} if the input cannot be decoded or fails
 *   structural validation.
 */
export function decodePairPayload(encoded: string): PairPayload {
  let json: string;
  try {
    json = fromBase64Url(encoded);
  } catch (error) {
    if (error instanceof PairPayloadError) throw error;
    throw new PairPayloadError("Pair payload could not be decoded");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new PairPayloadError("Pair payload is not valid JSON");
  }
  return validatePayload(parsed);
}

// ── URL helpers ─────────────────────────────────────────────────────────────

/**
 * Returns a dashboard URL with the encoded payload appended as a query
 * parameter, preserving any existing query string.
 */
export function buildPairUrl(dashboardUrl: string, payload: PairPayload): string {
  // Use a permissive base so callers can pass either an absolute URL or a
  // relative path.
  const url = new URL(dashboardUrl, "https://placeholder.invalid");
  url.searchParams.set(PAIR_QUERY_PARAM, encodePairPayload(payload));
  if (url.hostname === "placeholder.invalid") {
    return url.pathname + url.search + url.hash;
  }
  return url.toString();
}

/**
 * Extracts and decodes a pair payload from a URL or query string.
 *
 * Returns `null` if the input has no `pair` parameter or if the payload
 * fails to decode. Errors are intentionally swallowed here so callers can
 * fall through to a normal login flow when scanning a stale or
 * tampered-with QR.
 */
export function parsePairUrl(input: string): PairPayload | null {
  let params: URLSearchParams;
  try {
    if (input.startsWith("?")) {
      params = new URLSearchParams(input);
    } else {
      params = new URL(input, "https://placeholder.invalid").searchParams;
    }
  } catch {
    return null;
  }
  const encoded = params.get(PAIR_QUERY_PARAM);
  if (!encoded) return null;
  try {
    return decodePairPayload(encoded);
  } catch {
    return null;
  }
}
