import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createCard, deleteCard, ApiClientError } from "./api";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createCard", () => {
  it("sends POST with encrypted card data and returns the card", async () => {
    const card = {
      id: "card-new",
      user_id: "user-1",
      encrypted_data: "enc",
      iv: "iv",
      auth_tag: "tag",
      created_at: "2026-03-15T10:00:00Z",
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: card }),
    });

    const result = await createCard("test-token", {
      encrypted_data: "enc",
      iv: "iv",
      auth_tag: "tag",
    });

    expect(result).toEqual(card);
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/v1/cards");
    expect(options.method).toBe("POST");
    expect(options.headers["Authorization"]).toBe("Bearer test-token");
    expect(JSON.parse(options.body)).toEqual({
      encrypted_data: "enc",
      iv: "iv",
      auth_tag: "tag",
    });
  });

  it("throws ApiClientError on failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      statusText: "Unprocessable Entity",
      json: async () => ({
        error: { code: "VALIDATION_ERROR", message: "Invalid payload" },
      }),
    });

    await expect(
      createCard("test-token", {
        encrypted_data: "enc",
        iv: "iv",
        auth_tag: "tag",
      })
    ).rejects.toThrow(ApiClientError);
  });
});

describe("deleteCard", () => {
  it("sends DELETE request and resolves on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: null }),
    });

    await deleteCard("test-token", "card-123");

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toContain("/v1/cards/card-123");
    expect(options.method).toBe("DELETE");
    expect(options.headers["Authorization"]).toBe("Bearer test-token");
  });

  it("throws ApiClientError on failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
      json: async () => ({
        error: { code: "NOT_FOUND", message: "Card not found" },
      }),
    });

    await expect(deleteCard("test-token", "card-123")).rejects.toThrow(
      ApiClientError
    );
  });
});
