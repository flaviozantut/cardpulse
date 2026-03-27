/** API response wrapper for successful responses. */
export interface ApiResponse<T> {
  data: T;
}

/** API error response. */
export interface ApiError {
  error: {
    code: string;
    message: string;
  };
}

/** Login request payload. */
export interface LoginRequest {
  email: string;
  password: string;
}

/** Login response data. */
export interface LoginResponse {
  token: string;
  wrapped_dek: string;
  dek_salt: string;
  dek_params: string;
}

/** Card as returned by the API (encrypted). */
export interface Card {
  id: string;
  user_id: string;
  encrypted_data: string;
  iv: string;
  auth_tag: string;
  created_at: string;
}

/** Payload for creating a new card (encrypted client-side). */
export interface CreateCardRequest {
  encrypted_data: string;
  iv: string;
  auth_tag: string;
}

/** Payload for updating a transaction (re-encrypted client-side). */
export interface UpdateTransactionRequest {
  card_id: string;
  encrypted_data: string;
  iv: string;
  auth_tag: string;
  timestamp_bucket: string;
}

/** Transaction as returned by the API (encrypted). */
export interface Transaction {
  id: string;
  user_id: string;
  card_id: string;
  encrypted_data: string;
  iv: string;
  auth_tag: string;
  timestamp_bucket: string;
  created_at: string;
}
