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
import { Lock, Mail, KeyRound, ChevronLeft, Zap } from "lucide-react";
import { login as apiLogin } from "../lib/api";
import { deriveKey, unwrapDek, CryptoError } from "../lib/crypto";
import type { DekParams } from "../lib/crypto";
import { useAuth } from "../hooks/useAuth";
import type { LoginResponse } from "../types/api";
import { parsePairUrl } from "../lib/deviceSync";

type LoginStep = "credentials" | "master-password";

function readPairedEmail(): string {
  if (typeof window === "undefined") return "";
  const payload = parsePairUrl(window.location.href);
  return payload?.email ?? "";
}

function InputField({
  id,
  label,
  type,
  value,
  onChange,
  placeholder,
  icon: Icon,
  autoFocus,
}: {
  id: string;
  label: string;
  type: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  icon: React.ElementType;
  autoFocus?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 dark:text-slate-300">
        {label}
      </label>
      <div className="relative mt-1">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <Icon size={16} className="text-slate-400" />
        </div>
        <input
          id={id}
          type={type}
          required
          autoFocus={autoFocus}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="block w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-indigo-500 dark:focus:ring-indigo-900/40"
        />
      </div>
    </div>
  );
}

export function LoginPage() {
  const [step, setStep] = useState<LoginStep>("credentials");
  const [email, setEmail] = useState(() => readPairedEmail());
  const [password, setPassword] = useState("");
  const [masterPassword, setMasterPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loginData, setLoginData] = useState<LoginResponse | null>(null);

  const { login, unlock } = useAuth();
  const navigate = useNavigate();

  async function handleCredentials(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const data = await apiLogin({ email, password });

      const dekParams: DekParams =
        typeof data.dek_params === "string"
          ? JSON.parse(data.dek_params)
          : data.dek_params;

      login({
        token: data.token,
        wrappedDek: data.wrapped_dek,
        dekSalt: data.dek_salt,
        dekParams,
        email,
      });

      setLoginData(data);
      setStep("master-password");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

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

      const derivedKey = await deriveKey(masterPassword, loginData.dek_salt, dekParams);
      const dek = await unwrapDek(loginData.wrapped_dek, derivedKey);

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

  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-200 dark:shadow-indigo-900/40">
            <Zap size={22} className="text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">CardPulse</h1>
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {step === "credentials" ? "Sign in to your account" : "Unlock your data"}
            </p>
          </div>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
          {step === "master-password" ? (
            <form onSubmit={handleMasterPassword} className="space-y-4">
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Enter your master password to decrypt your cards and transactions. It never leaves your device.
              </p>

              <InputField
                id="master-password"
                label="Master Password"
                type="password"
                value={masterPassword}
                onChange={setMasterPassword}
                placeholder="Your encryption password"
                icon={KeyRound}
                autoFocus
              />

              {error && (
                <div className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-indigo-500 hover:to-violet-500 disabled:opacity-60"
              >
                {loading ? "Decrypting..." : "Unlock"}
              </button>

              <button
                type="button"
                onClick={() => { setStep("credentials"); setMasterPassword(""); setError(null); }}
                className="flex w-full items-center justify-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              >
                <ChevronLeft size={14} />
                Use a different account
              </button>
            </form>
          ) : (
            <form onSubmit={handleCredentials} className="space-y-4">
              <InputField
                id="email"
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
                placeholder="you@example.com"
                icon={Mail}
              />

              <InputField
                id="password"
                label="Password"
                type="password"
                value={password}
                onChange={setPassword}
                icon={Lock}
              />

              {error && (
                <div className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-xl bg-gradient-to-r from-indigo-600 to-violet-600 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-indigo-500 hover:to-violet-500 disabled:opacity-60"
              >
                {loading ? "Signing in..." : "Sign in"}
              </button>
            </form>
          )}
        </div>

        <p className="mt-4 text-center text-xs text-slate-400 dark:text-slate-600">
          End-to-end encrypted · Zero-knowledge
        </p>
      </div>
    </div>
  );
}
