/**
 * Modal dialog for rotating the master password (key rotation).
 *
 * Flow:
 *  1. User enters current master password → unwrap existing DEK
 *  2. User enters new master password → re-wrap DEK with new password
 *  3. POST new wrapped_dek + dek_salt + dek_params to /v1/key/rotate
 *  4. Update in-memory session with new wrapped DEK data
 */

import { type FormEvent, useState } from "react";
import { rotateKey as apiRotateKey } from "../lib/api";
import {
  CryptoError,
  deriveKey,
  generateDekSalt,
  unwrapDek,
  wrapDek,
} from "../lib/crypto";
import { updateWrappedDek } from "../lib/session";
import { useAuth } from "../hooks/useAuth";

interface RotateKeyModalProps {
  onClose: () => void;
}

type Step = "old-password" | "new-password" | "success";

export function RotateKeyModal({ onClose }: RotateKeyModalProps) {
  const { token, session } = useAuth();

  const [step, setStep] = useState<Step>("old-password");
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [unwrappedDek, setUnwrappedDek] = useState<Uint8Array | null>(null);

  async function handleVerifyOldPassword(e: FormEvent) {
    e.preventDefault();
    if (!session) return;

    setError(null);
    setLoading(true);

    try {
      const derivedKey = await deriveKey(
        oldPassword,
        session.dekSalt,
        session.dekParams
      );
      const dek = await unwrapDek(session.wrappedDek, derivedKey);
      setUnwrappedDek(dek);
      setStep("new-password");
    } catch (err) {
      if (err instanceof CryptoError) {
        setError("Wrong master password. Please try again.");
      } else {
        setError(err instanceof Error ? err.message : "Verification failed");
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleRotate(e: FormEvent) {
    e.preventDefault();
    if (!token || !unwrappedDek || !session) return;

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      const newSalt = generateDekSalt();
      const newParams = session.dekParams;
      const newWrappedDekB64 = await wrapDek(
        unwrappedDek,
        newPassword,
        newSalt,
        newParams
      );

      await apiRotateKey(token, {
        new_wrapped_dek: newWrappedDekB64,
        new_dek_salt: newSalt,
        new_dek_params: JSON.stringify(newParams),
      });

      updateWrappedDek(newWrappedDekB64, newSalt, newParams);
      setStep("success");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Key rotation failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-sm rounded-lg border border-gray-200 bg-white p-6 shadow-lg dark:border-gray-800 dark:bg-gray-900">
        {step === "success" ? (
          <div className="text-center">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              Password rotated
            </h2>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              Your master password has been updated successfully. Use the new
              password next time you unlock your data.
            </p>
            <button
              onClick={onClose}
              className="mt-6 w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Change master password
              </h2>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {step === "old-password"
                  ? "Enter your current master password to verify your identity."
                  : "Choose a new master password. Your encrypted data will remain intact."}
              </p>
            </div>

            {step === "old-password" ? (
              <form onSubmit={handleVerifyOldPassword} className="space-y-4">
                <div>
                  <label
                    htmlFor="old-master-password"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Current master password
                  </label>
                  <input
                    id="old-master-password"
                    type="password"
                    required
                    autoFocus
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>

                {error && (
                  <p className="rounded-md bg-red-50 p-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-300">
                    {error}
                  </p>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
                  >
                    {loading ? "Verifying..." : "Continue"}
                  </button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleRotate} className="space-y-4">
                <div>
                  <label
                    htmlFor="new-master-password"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    New master password
                  </label>
                  <input
                    id="new-master-password"
                    type="password"
                    required
                    autoFocus
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>

                <div>
                  <label
                    htmlFor="confirm-master-password"
                    className="block text-sm font-medium text-gray-700 dark:text-gray-300"
                  >
                    Confirm new master password
                  </label>
                  <input
                    id="confirm-master-password"
                    type="password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
                  />
                </div>

                {error && (
                  <p className="rounded-md bg-red-50 p-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-300">
                    {error}
                  </p>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex-1 rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 dark:bg-blue-500 dark:hover:bg-blue-600"
                  >
                    {loading ? "Rotating..." : "Rotate key"}
                  </button>
                </div>
              </form>
            )}
          </>
        )}
      </div>
    </div>
  );
}
