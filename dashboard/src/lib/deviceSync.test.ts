/**
 * Tests for deviceSync — multi-device pairing helpers.
 *
 * The pairing payload encodes the API URL and email for the source account
 * (NEVER the master password or DEK) so a second device can pre-fill the
 * login form by scanning a QR code. The user must still enter their master
 * password on the new device — the zero-knowledge model is preserved.
 */

import { describe, it, expect } from "vitest";
import {
  encodePairPayload,
  decodePairPayload,
  buildPairUrl,
  parsePairUrl,
  PAIR_QUERY_PARAM,
  PairPayloadError,
  type PairPayload,
} from "./deviceSync";

const SAMPLE: PairPayload = {
  v: 1,
  apiBaseUrl: "https://cardpulse-api.fly.dev",
  email: "user@example.com",
};

describe("encodePairPayload / decodePairPayload", () => {
  it("round-trips a valid payload", () => {
    const encoded = encodePairPayload(SAMPLE);
    const decoded = decodePairPayload(encoded);
    expect(decoded).toEqual(SAMPLE);
  });

  it("produces a URL-safe string with no padding", () => {
    const encoded = encodePairPayload(SAMPLE);
    expect(encoded).not.toContain("+");
    expect(encoded).not.toContain("/");
    expect(encoded).not.toContain("=");
  });

  it("handles unicode emails", () => {
    const payload: PairPayload = {
      v: 1,
      apiBaseUrl: "https://example.test",
      email: "usuário@exemplo.com.br",
    };
    expect(decodePairPayload(encodePairPayload(payload))).toEqual(payload);
  });

  it("throws PairPayloadError on malformed base64url input", () => {
    expect(() => decodePairPayload("not-valid-base64!!!")).toThrow(
      PairPayloadError,
    );
  });

  it("throws PairPayloadError on non-JSON content", () => {
    // base64url("hello") = "aGVsbG8"
    expect(() => decodePairPayload("aGVsbG8")).toThrow(PairPayloadError);
  });

  it("throws PairPayloadError when version is missing", () => {
    const bad = encodePairPayload({
      ...SAMPLE,
      // @ts-expect-error — intentionally invalid for the test
      v: undefined,
    });
    expect(() => decodePairPayload(bad)).toThrow(PairPayloadError);
  });

  it("throws PairPayloadError on unsupported version", () => {
    const bad = encodePairPayload({ ...SAMPLE, v: 99 as 1 });
    expect(() => decodePairPayload(bad)).toThrow(PairPayloadError);
  });

  it("throws PairPayloadError when apiBaseUrl is missing", () => {
    const bad = encodePairPayload({
      ...SAMPLE,
      // @ts-expect-error — intentionally invalid for the test
      apiBaseUrl: undefined,
    });
    expect(() => decodePairPayload(bad)).toThrow(PairPayloadError);
  });

  it("throws PairPayloadError when email is missing", () => {
    const bad = encodePairPayload({
      ...SAMPLE,
      // @ts-expect-error — intentionally invalid for the test
      email: undefined,
    });
    expect(() => decodePairPayload(bad)).toThrow(PairPayloadError);
  });

  it("rejects payloads with non-http(s) URLs", () => {
    const bad = encodePairPayload({
      ...SAMPLE,
      apiBaseUrl: "javascript:alert(1)",
    });
    expect(() => decodePairPayload(bad)).toThrow(PairPayloadError);
  });

  it("never includes a master password field", () => {
    const encoded = encodePairPayload(SAMPLE);
    const json = atob(
      encoded.replace(/-/g, "+").replace(/_/g, "/") +
        "==".slice(0, (4 - (encoded.length % 4)) % 4),
    );
    expect(json).not.toMatch(/password/i);
    expect(json).not.toMatch(/dek/i);
    expect(json).not.toMatch(/master/i);
  });
});

describe("buildPairUrl / parsePairUrl", () => {
  it("appends the encoded payload as a query param", () => {
    const url = buildPairUrl("https://app.example.com/login", SAMPLE);
    const parsed = new URL(url);
    expect(parsed.searchParams.get(PAIR_QUERY_PARAM)).toBe(
      encodePairPayload(SAMPLE),
    );
    expect(parsed.origin + parsed.pathname).toBe(
      "https://app.example.com/login",
    );
  });

  it("preserves an existing query string on the dashboard URL", () => {
    const url = buildPairUrl("https://app.example.com/?utm=email", SAMPLE);
    const parsed = new URL(url);
    expect(parsed.searchParams.get("utm")).toBe("email");
    expect(parsed.searchParams.get(PAIR_QUERY_PARAM)).not.toBeNull();
  });

  it("parses a valid pair URL into a payload", () => {
    const url = buildPairUrl("https://app.example.com/", SAMPLE);
    expect(parsePairUrl(url)).toEqual(SAMPLE);
  });

  it("returns null for a URL without the pair param", () => {
    expect(parsePairUrl("https://app.example.com/")).toBeNull();
  });

  it("accepts a query string fragment", () => {
    const encoded = encodePairPayload(SAMPLE);
    expect(parsePairUrl(`?${PAIR_QUERY_PARAM}=${encoded}`)).toEqual(SAMPLE);
  });

  it("returns null when the param value is malformed", () => {
    expect(parsePairUrl(`?${PAIR_QUERY_PARAM}=garbage!!!`)).toBeNull();
  });
});
