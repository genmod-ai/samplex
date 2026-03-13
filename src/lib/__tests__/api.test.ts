import { describe, it, expect, afterEach, vi } from "vitest";

vi.mock("../env.ts", () => ({
  env: {
    SAMPLEX_API_URL: "http://localhost:9999",
    SAMPLEX_LOG_LEVEL: "silent",
  },
}));

const { mockLoadCredentials, mockSaveCredentials, mockClearCredentials } = vi.hoisted(() => ({
  mockLoadCredentials: vi.fn(),
  mockSaveCredentials: vi.fn(),
  mockClearCredentials: vi.fn(),
}));

vi.mock("../config.ts", () => ({
  loadCredentials: mockLoadCredentials,
  saveCredentials: mockSaveCredentials,
  clearCredentials: mockClearCredentials,
}));

import { rpc, rpcUpload } from "../api.js";
import { CLI_VERSION } from "../version.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAR_FUTURE = Date.now() + 10 * 60 * 1000; // 10 min from now — not expiring

function validCreds(overrides: Partial<{
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userEmail: string;
}> = {}) {
  return {
    accessToken: "access-token-abc",
    refreshToken: "refresh-token-xyz",
    expiresAt: FAR_FUTURE,
    userEmail: "user@example.com",
    ...overrides,
  };
}

function makeResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  const isString = typeof body === "string";
  return new Response(isString ? body : JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": isString ? "text/plain" : "application/json",
      ...headers,
    },
  });
}

// ---------------------------------------------------------------------------
// rpc()
// ---------------------------------------------------------------------------
describe("rpc()", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("throws 'Not logged in' when credentials are null", async () => {
    mockLoadCredentials.mockReturnValue(null);
    await expect(rpc("some.procedure")).rejects.toThrow("Not logged in");
  });

  it("makes an authenticated POST with Bearer token and correct URL", async () => {
    mockLoadCredentials.mockReturnValue(validCreds());
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeResponse(200, { ok: true }),
    );

    await rpc("model.generate", { prompt: "hello" });

    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe("http://localhost:9999/api/rpc/api-reference/model/generate");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer access-token-abc");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(init?.body).toBe(JSON.stringify({ prompt: "hello" }));
  });

  it("sends POST without Content-Type or body when no input is provided", async () => {
    mockLoadCredentials.mockReturnValue(validCreds());
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeResponse(200, {}),
    );

    await rpc("model.list");

    const [, init] = spy.mock.calls[0]!;
    const headers = init?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
    expect(init?.body).toBeUndefined();
  });

  it("on 401: clears credentials and throws 'Session expired'", async () => {
    mockLoadCredentials.mockReturnValue(validCreds());
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(makeResponse(401, "Unauthorized"));

    await expect(rpc("some.procedure")).rejects.toThrow("Session expired");
    expect(mockClearCredentials).toHaveBeenCalledOnce();
  });

  it("on 426: throws upgrade error with version info", async () => {
    mockLoadCredentials.mockReturnValue(validCreds());
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeResponse(426, "Upgrade Required", { "X-Min-CLI-Version": "1.2.0" }),
    );

    const err = await rpc("some.procedure").catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain(`This CLI version (${CLI_VERSION}) is outdated`);
    expect((err as Error).message).toContain("1.2.0");
  });

  it("on non-ok response: throws with response body text", async () => {
    mockLoadCredentials.mockReturnValue(validCreds());
    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(makeResponse(500, "Internal Server Error"))
      .mockResolvedValueOnce(makeResponse(500, "Internal Server Error"));

    await expect(rpc("some.procedure")).rejects.toThrow("Internal Server Error");
  });

  it("on success: returns parsed JSON", async () => {
    mockLoadCredentials.mockReturnValue(validCreds());
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeResponse(200, { result: 42 }),
    );

    const result = await rpc<{ result: number }>("some.procedure");
    expect(result).toEqual({ result: 42 });
  });
});

// ---------------------------------------------------------------------------
// rpcUpload()
// ---------------------------------------------------------------------------
describe("rpcUpload()", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("throws 'Not logged in' when credentials are null", async () => {
    mockLoadCredentials.mockReturnValue(null);
    const file = { blob: new Blob(["data"]), fieldName: "file" };
    await expect(rpcUpload("upload.file", file)).rejects.toThrow("Not logged in");
  });

  it("makes an authenticated POST with FormData to the correct URL", async () => {
    mockLoadCredentials.mockReturnValue(validCreds());
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeResponse(200, { json: { id: "abc" }, meta: [] }),
    );

    const blob = new Blob(["file contents"], { type: "text/plain" });
    await rpcUpload("upload.artifact", { blob, fieldName: "artifact" }, { name: "test" });

    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe("http://localhost:9999/api/rpc/upload/artifact");
    expect(init?.method).toBe("POST");
    const headers = init?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer access-token-abc");
    expect(init?.body).toBeInstanceOf(FormData);
  });

  it("on 401: clears credentials and throws 'Session expired'", async () => {
    mockLoadCredentials.mockReturnValue(validCreds());
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(makeResponse(401, "Unauthorized"));

    const file = { blob: new Blob(["data"]), fieldName: "file" };
    await expect(rpcUpload("upload.file", file)).rejects.toThrow("Session expired");
    expect(mockClearCredentials).toHaveBeenCalledOnce();
  });

  it("on 426: throws upgrade error with version info", async () => {
    mockLoadCredentials.mockReturnValue(validCreds());
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeResponse(426, "Upgrade Required", { "X-Min-CLI-Version": "2.0.0" }),
    );

    const file = { blob: new Blob(["data"]), fieldName: "file" };
    const err = await rpcUpload("upload.file", file).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain(`This CLI version (${CLI_VERSION}) is outdated`);
    expect((err as Error).message).toContain("2.0.0");
  });

  it("on non-ok response: throws with response body text", async () => {
    mockLoadCredentials.mockReturnValue(validCreds());
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(makeResponse(413, "Payload Too Large"));

    const file = { blob: new Blob(["data"]), fieldName: "file" };
    await expect(rpcUpload("upload.file", file)).rejects.toThrow("Payload Too Large");
  });

  it("on success: returns rpcResult.json", async () => {
    mockLoadCredentials.mockReturnValue(validCreds());
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeResponse(200, { json: { uploaded: true }, meta: [] }),
    );

    const file = { blob: new Blob(["data"]), fieldName: "file" };
    const result = await rpcUpload<{ uploaded: boolean }>("upload.file", file);
    expect(result).toEqual({ uploaded: true });
  });
});

// ---------------------------------------------------------------------------
// Token refresh (getValidCredentials via rpc)
// ---------------------------------------------------------------------------
describe("token refresh", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("uses token as-is when it is far from expiry", async () => {
    const creds = validCreds({ accessToken: "fresh-token", expiresAt: FAR_FUTURE });
    mockLoadCredentials.mockReturnValue(creds);
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      makeResponse(200, { data: "ok" }),
    );

    await rpc("test.proc");

    // Only one fetch call — no refresh
    expect(spy).toHaveBeenCalledTimes(1);
    const [, init] = spy.mock.calls[0]!;
    const headers = init?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer fresh-token");
  });

  it("attempts refresh when token expires within 60s", async () => {
    const NEAR_EXPIRY = Date.now() + 30_000; // 30s — within 60s window
    const creds = validCreds({ accessToken: "old-token", expiresAt: NEAR_EXPIRY });
    mockLoadCredentials.mockReturnValue(creds);

    const refreshPayload = {
      access_token: "new-access-token",
      refresh_token: "new-refresh-token",
      expires_in: 3600,
    };

    const spy = vi.spyOn(globalThis, "fetch")
      // First call: the token refresh endpoint
      .mockResolvedValueOnce(makeResponse(200, refreshPayload))
      // Second call: the actual RPC call
      .mockResolvedValueOnce(makeResponse(200, { result: "done" }));

    await rpc("test.proc");

    expect(spy).toHaveBeenCalledTimes(2);
    // First fetch must be the refresh endpoint
    const [refreshUrl] = spy.mock.calls[0]!;
    expect(refreshUrl).toContain("/api/auth/oauth2/token");
    // New credentials must be saved
    expect(mockSaveCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: "new-access-token" }),
    );
    // The RPC call must use the new token
    const [, rpcInit] = spy.mock.calls[1]!;
    const headers = rpcInit?.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer new-access-token");
  });

  it("clears credentials and throws 'Not logged in' when refresh fails", async () => {
    const NEAR_EXPIRY = Date.now() + 30_000;
    const creds = validCreds({ expiresAt: NEAR_EXPIRY });
    mockLoadCredentials.mockReturnValue(creds);

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(makeResponse(400, "invalid_grant"));

    await expect(rpc("test.proc")).rejects.toThrow("Not logged in");
    expect(mockClearCredentials).toHaveBeenCalledOnce();
    expect(mockSaveCredentials).not.toHaveBeenCalled();
  });

  it("clears credentials and throws 'Not logged in' when refresh throws a network error", async () => {
    const NEAR_EXPIRY = Date.now() + 30_000;
    const creds = validCreds({ expiresAt: NEAR_EXPIRY });
    mockLoadCredentials.mockReturnValue(creds);

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("Network failure"));

    await expect(rpc("test.proc")).rejects.toThrow("Not logged in");
    expect(mockClearCredentials).toHaveBeenCalledOnce();
  });

  it("uses existing refreshToken when server does not return a new one", async () => {
    const NEAR_EXPIRY = Date.now() + 30_000;
    const creds = validCreds({ expiresAt: NEAR_EXPIRY, refreshToken: "original-refresh" });
    mockLoadCredentials.mockReturnValue(creds);

    const refreshPayload = {
      access_token: "brand-new-access",
      // no refresh_token in response
      expires_in: 3600,
    };

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(makeResponse(200, refreshPayload))
      .mockResolvedValueOnce(makeResponse(200, {}));

    await rpc("test.proc");

    expect(mockSaveCredentials).toHaveBeenCalledWith(
      expect.objectContaining({ refreshToken: "original-refresh" }),
    );
  });
});
