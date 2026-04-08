/**
 * Modal that helps the user log in on a second device.
 *
 * Renders a QR code containing a `pair` URL with the current account's
 * email and API base URL. Scanning the code on a second device opens the
 * dashboard with the email pre-filled — the user only needs to type their
 * master password.
 *
 * Critical: the QR NEVER contains the master password or DEK. The
 * zero-knowledge model is preserved.
 */

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { useAuth } from "../hooks/useAuth";
import {
  buildPairUrl,
  PAIR_PAYLOAD_VERSION,
  type PairPayload,
} from "../lib/deviceSync";

interface DeviceSyncModalProps {
  onClose: () => void;
}

/** Returns the dashboard origin to use as the destination of the pair URL. */
function dashboardOrigin(): string {
  if (typeof window === "undefined") return "";
  return window.location.origin + window.location.pathname;
}

/** Returns the API base URL the current dashboard is talking to. */
function apiBaseUrl(): string {
  const fromEnv = import.meta.env.VITE_API_URL;
  if (typeof fromEnv === "string" && fromEnv.length > 0) return fromEnv;
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

export function DeviceSyncModal({ onClose }: DeviceSyncModalProps) {
  const { email } = useAuth();
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const payload: PairPayload | null = email
    ? {
        v: PAIR_PAYLOAD_VERSION,
        apiBaseUrl: apiBaseUrl(),
        email,
      }
    : null;

  const pairUrl = payload ? buildPairUrl(dashboardOrigin(), payload) : null;

  useEffect(() => {
    if (!pairUrl) return;
    let cancelled = false;
    QRCode.toDataURL(pairUrl, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 256,
      color: { dark: "#111827", light: "#ffffff" },
    })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : "Failed to render QR code",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pairUrl]);

  async function handleCopy() {
    if (!pairUrl) return;
    try {
      await navigator.clipboard.writeText(pairUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy link to clipboard.");
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-lg border border-gray-200 bg-white p-6 shadow-lg dark:border-gray-800 dark:bg-gray-900">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
            Sync to another device
          </h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Your encrypted vault already lives on the server. Any device with
            your email and master password can decrypt it.
          </p>
        </div>

        {!email ? (
          <p className="rounded-md bg-amber-50 p-3 text-sm text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            Email not available in this session. Log out and sign in again to
            generate a pairing code.
          </p>
        ) : (
          <>
            <div className="flex flex-col items-center gap-3">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="QR code containing your CardPulse pairing link"
                  className="h-56 w-56 rounded-md border border-gray-200 bg-white p-2 dark:border-gray-700"
                  data-testid="device-sync-qr"
                />
              ) : (
                <div className="flex h-56 w-56 items-center justify-center rounded-md border border-dashed border-gray-300 text-xs text-gray-400 dark:border-gray-700 dark:text-gray-500">
                  Generating QR…
                </div>
              )}

              <button
                type="button"
                onClick={handleCopy}
                className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
              >
                {copied ? "Copied!" : "Copy pairing link"}
              </button>
            </div>

            <ol className="mt-5 list-decimal space-y-2 pl-5 text-sm text-gray-700 dark:text-gray-300">
              <li>
                On your second device, scan this QR with the camera or open the
                copied link in a browser.
              </li>
              <li>
                The dashboard will open with your email already filled in.
              </li>
              <li>
                Enter your{" "}
                <span className="font-medium">server password</span>, then your{" "}
                <span className="font-medium">master password</span> to unlock
                your data.
              </li>
            </ol>

            <p className="mt-4 rounded-md bg-gray-50 p-3 text-xs text-gray-600 dark:bg-gray-800 dark:text-gray-400">
              <span className="font-medium">Privacy note:</span> the QR code
              contains only your account email and API URL. Your master
              password and encryption keys never leave this device.
            </p>
          </>
        )}

        {error && (
          <p className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-600 dark:bg-red-950/40 dark:text-red-300">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-5 w-full rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700"
        >
          Close
        </button>
      </div>
    </div>
  );
}
