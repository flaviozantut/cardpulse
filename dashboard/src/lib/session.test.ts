import { describe, it, expect, beforeEach } from "vitest";
import {
  getSession,
  setSession,
  clearSession,
  subscribe,
  isAuthenticated,
  isUnlocked,
} from "./session";

describe("session", () => {
  beforeEach(() => {
    clearSession();
  });

  describe("initial state", () => {
    it("starts with no session", () => {
      const session = getSession();
      expect(session).toBeNull();
    });

    it("is not authenticated initially", () => {
      expect(isAuthenticated()).toBe(false);
    });

    it("is not unlocked initially", () => {
      expect(isUnlocked()).toBe(false);
    });
  });

  describe("setSession", () => {
    it("stores token and login response data", () => {
      setSession({
        token: "jwt-token-123",
        wrappedDek: "wrapped-dek-base64",
        dekSalt: "salt-base64",
        dekParams: { iterations: 600000 },
      });

      const session = getSession();
      expect(session).not.toBeNull();
      expect(session!.token).toBe("jwt-token-123");
      expect(session!.wrappedDek).toBe("wrapped-dek-base64");
      expect(session!.dekSalt).toBe("salt-base64");
      expect(session!.dekParams).toEqual({ iterations: 600000 });
      expect(session!.dek).toBeNull();
    });

    it("marks as authenticated after setting session", () => {
      setSession({
        token: "token",
        wrappedDek: "dek",
        dekSalt: "salt",
        dekParams: {},
      });

      expect(isAuthenticated()).toBe(true);
    });

    it("is not unlocked until DEK is set", () => {
      setSession({
        token: "token",
        wrappedDek: "dek",
        dekSalt: "salt",
        dekParams: {},
      });

      expect(isUnlocked()).toBe(false);
    });
  });

  describe("setSession with DEK", () => {
    it("stores the DEK when provided", () => {
      const dek = new Uint8Array(32);
      setSession({
        token: "token",
        wrappedDek: "dek",
        dekSalt: "salt",
        dekParams: {},
        dek,
      });

      const session = getSession();
      expect(session!.dek).toBe(dek);
      expect(isUnlocked()).toBe(true);
    });
  });

  describe("clearSession", () => {
    it("removes all session data", () => {
      setSession({
        token: "token",
        wrappedDek: "dek",
        dekSalt: "salt",
        dekParams: {},
      });

      clearSession();

      expect(getSession()).toBeNull();
      expect(isAuthenticated()).toBe(false);
      expect(isUnlocked()).toBe(false);
    });
  });

  describe("updateToken", () => {
    it("updates only the token without affecting other fields", async () => {
      const { updateToken } = await import("./session");
      const dek = new Uint8Array(32);
      setSession({
        token: "old-token",
        wrappedDek: "dek",
        dekSalt: "salt",
        dekParams: { iterations: 1000 },
        dek,
      });

      updateToken("new-token");

      const session = getSession();
      expect(session!.token).toBe("new-token");
      expect(session!.wrappedDek).toBe("dek");
      expect(session!.dek).toBe(dek);
    });
  });

  describe("subscribe", () => {
    it("notifies listeners on setSession", () => {
      let notified = false;
      const unsubscribe = subscribe(() => {
        notified = true;
      });

      setSession({
        token: "token",
        wrappedDek: "dek",
        dekSalt: "salt",
        dekParams: {},
      });

      expect(notified).toBe(true);
      unsubscribe();
    });

    it("notifies listeners on clearSession", () => {
      setSession({
        token: "token",
        wrappedDek: "dek",
        dekSalt: "salt",
        dekParams: {},
      });

      let notified = false;
      const unsubscribe = subscribe(() => {
        notified = true;
      });

      clearSession();

      expect(notified).toBe(true);
      unsubscribe();
    });

    it("stops notifying after unsubscribe", () => {
      let count = 0;
      const unsubscribe = subscribe(() => {
        count++;
      });

      setSession({
        token: "token",
        wrappedDek: "dek",
        dekSalt: "salt",
        dekParams: {},
      });
      expect(count).toBe(1);

      unsubscribe();

      clearSession();
      expect(count).toBe(1);
    });
  });

  describe("setDek", () => {
    it("sets the DEK on an existing session", async () => {
      const { setDek } = await import("./session");
      setSession({
        token: "token",
        wrappedDek: "dek",
        dekSalt: "salt",
        dekParams: {},
      });

      const dek = new Uint8Array(32);
      setDek(dek);

      expect(getSession()!.dek).toBe(dek);
      expect(isUnlocked()).toBe(true);
    });

    it("notifies listeners when DEK is set", async () => {
      const { setDek } = await import("./session");
      setSession({
        token: "token",
        wrappedDek: "dek",
        dekSalt: "salt",
        dekParams: {},
      });

      let notified = false;
      const unsubscribe = subscribe(() => {
        notified = true;
      });

      setDek(new Uint8Array(32));
      expect(notified).toBe(true);
      unsubscribe();
    });
  });
});
