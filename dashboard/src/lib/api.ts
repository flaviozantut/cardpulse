import type { ApiResponse, Card, CreateCardRequest, LoginRequest, LoginResponse, Transaction, UpdateTransactionRequest } from "../types/api";

const BASE_URL = import.meta.env.VITE_API_URL ?? "";

/** Builds headers with optional Bearer token. */
function headers(token?: string): HeadersInit {
  const h: HeadersInit = { "Content-Type": "application/json" };
  if (token) h["Authorization"] = `Bearer ${token}`;
  return h;
}

/** Generic fetch wrapper that returns the `data` field or throws. */
async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, init);
  const body = await res.json();

  if (!res.ok) {
    const msg = body?.error?.message ?? res.statusText;
    const code = body?.error?.code ?? "UNKNOWN";
    throw new ApiClientError(msg, code, res.status);
  }

  return (body as ApiResponse<T>).data;
}

/** Typed API error with code and HTTP status. */
export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.code = code;
    this.status = status;
  }
}

// ── Auth ────────────────────────────────────────────────────────────────────

export async function login(payload: LoginRequest): Promise<LoginResponse> {
  return apiFetch<LoginResponse>("/auth/login", {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(payload),
  });
}

export async function refreshToken(token: string): Promise<{ token: string }> {
  return apiFetch<{ token: string }>("/auth/refresh", {
    method: "POST",
    headers: headers(token),
  });
}

// ── Cards ───────────────────────────────────────────────────────────────────

export async function listCards(token: string): Promise<Card[]> {
  return apiFetch<Card[]>("/v1/cards", { headers: headers(token) });
}

export async function createCard(
  token: string,
  payload: CreateCardRequest,
): Promise<Card> {
  return apiFetch<Card>("/v1/cards", {
    method: "POST",
    headers: headers(token),
    body: JSON.stringify(payload),
  });
}

export async function deleteCard(token: string, id: string): Promise<void> {
  const res = await fetch(`${BASE_URL}/v1/cards/${id}`, {
    method: "DELETE",
    headers: headers(token),
  });

  if (!res.ok) {
    const body = await res.json();
    const msg = body?.error?.message ?? res.statusText;
    const code = body?.error?.code ?? "UNKNOWN";
    throw new ApiClientError(msg, code, res.status);
  }
}

// ── Transactions ────────────────────────────────────────────────────────────

export async function listTransactions(
  token: string,
  params?: { card_id?: string; timestamp_bucket?: string },
): Promise<Transaction[]> {
  const query = new URLSearchParams();
  if (params?.card_id) query.set("card_id", params.card_id);
  if (params?.timestamp_bucket) query.set("timestamp_bucket", params.timestamp_bucket);

  const qs = query.toString();
  const path = qs ? `/v1/transactions?${qs}` : "/v1/transactions";

  return apiFetch<Transaction[]>(path, { headers: headers(token) });
}

export async function updateTransaction(
  token: string,
  id: string,
  payload: UpdateTransactionRequest,
): Promise<Transaction> {
  return apiFetch<Transaction>(`/v1/transactions/${id}`, {
    method: "PUT",
    headers: headers(token),
    body: JSON.stringify(payload),
  });
}
