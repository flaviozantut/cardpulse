/**
 * Two-step login page for CardPulse.
 *
 * Step 1: Email + server password — authenticates with the API.
 * Step 2: Master password — derives key, unwraps DEK, stores in memory.
 *
 * The master password is separate from the server password. It never
 * leaves the browser and is used only to decrypt the user's data.
 */

import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { login as apiLogin } from "../lib/api";
import { deriveKey, unwrapDek, CryptoError } from "../lib/crypto";
import type { DekParams } from "../lib/crypto";
import { useAuth } from "../hooks/useAuth";
import type { LoginResponse } from "../types/api";

/** State for the two-step login flow. */
type LoginStep = "credentials" | "master-password";

export function LoginPage() {
  const [step, setStep] = useState<LoginStep>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [masterPassword, setMasterPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loginData, setLoginData] = useState<LoginResponse | null>(null);

  const { login, unlock } = useAuth();
  const navigate = useNavigate();

  /** Step 1: Authenticate with the API using email + server password. */
  async function handleCredentials(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const data = await apiLogin({ email, password });

      // Parse dek_params from JSON string
      const dekParams: DekParams =
        typeof data.dek_params === "string"
          ? JSON.parse(data.dek_params)
          : data.dek_params;

      // Store session (JWT + wrapped DEK data) in memory
      login({
        token: data.token,
        wrappedDek: data.wrapped_dek,
        dekSalt: data.dek_salt,
        dekParams,
      });

      setLoginData(data);
      setStep("master-password");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  /** Step 2: Derive key from master password and unwrap DEK. */
  async function handleMasterPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!loginData) throw new Error("No login data available");

      const dekParams: DekParams =
        typeof loginData.dek_params === "string"
          ? JSON.parse(loginData.dek_params)
          : loginData.dek_params;

      // Derive key from master password + salt
      const derivedKey = await deriveKey(
        masterPassword,
        loginData.dek_salt,
        dekParams
      );

      // Unwrap the DEK
      const dek = await unwrapDek(loginData.wrapped_dek, derivedKey);

      // Store DEK in memory and redirect
      unlock(dek);
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof CryptoError) {
        setError("Wrong master password. Please try again.");
      } else {
        setError(err instanceof Error ? err.message : "Decryption failed");
      }
    } finally {
      setLoading(false);
    }
  }

  if (step === "master-password") {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <div className="mb-6 text-center">
            <h1 className="text-2xl font-semibold text-gray-900">
              Unlock your data
            </h1>
            <p className="mt-2 text-sm text-gray-500">
              Enter your master password to decrypt your cards and transactions.
            </p>
          </div>

          <form onSubmit={handleMasterPassword} className="space-y-4">
            <div>
              <label
                htmlFor="master-password"
                className="block text-sm font-medium text-gray-700"
              >
                Master Password
              </label>
              <input
                id="master-password"
                type="password"
                required
                autoFocus
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
                placeholder="Your encryption password"
              />
            </div>

            {error && (
              <p className="rounded-md bg-red-50 p-2 text-sm text-red-600">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "Decrypting..." : "Unlock"}
            </button>

            <button
              type="button"
              onClick={() => {
                setStep("credentials");
                setMasterPassword("");
                setError(null);
              }}
              className="w-full text-sm text-gray-500 hover:text-gray-700"
            >
              Use a different account
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="mb-6 text-center text-2xl font-semibold text-gray-900">
          Sign in to CardPulse
        </h1>

        <form onSubmit={handleCredentials} className="space-y-4">
          <div>
            <label
              htmlFor="email"
              className="block text-sm font-medium text-gray-700"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-gray-700"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            />
          </div>

          {error && (
            <p className="rounded-md bg-red-50 p-2 text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
