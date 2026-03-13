import { describe, it, expect, afterEach, vi } from "vitest";

vi.mock("../env.ts", () => ({
  env: {
    SAMPLEX_API_URL: "http://localhost:9999",
    SAMPLEX_LOG_LEVEL: "silent",
  },
}));

import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  buildAuthorizationUrl,
  startCallbackServer,
  exchangeCodeForTokens,
} from "../auth.js";

// ---------------------------------------------------------------------------
// generateCodeVerifier
// ---------------------------------------------------------------------------
describe("generateCodeVerifier", () => {
  it("returns a base64url-encoded string (no +, /, or = chars)", () => {
    const verifier = generateCodeVerifier();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("produces a string of at least 43 characters (RFC 7636 minimum)", () => {
    const verifier = generateCodeVerifier();
    // 32 random bytes -> 43 base64url chars
    expect(verifier.length).toBeGreaterThanOrEqual(43);
  });

});

// ---------------------------------------------------------------------------
// generateCodeChallenge
// ---------------------------------------------------------------------------
describe("generateCodeChallenge", () => {
  it("returns a base64url-encoded string", () => {
    const challenge = generateCodeChallenge("test-verifier");
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("is deterministic for the same input", () => {
    const a = generateCodeChallenge("deterministic-input");
    const b = generateCodeChallenge("deterministic-input");
    expect(a).toBe(b);
  });

  it("produces a SHA-256 digest (43 base64url chars)", () => {
    const challenge = generateCodeChallenge("any-verifier");
    // SHA-256 = 32 bytes -> 43 base64url chars (no padding)
    expect(challenge.length).toBe(43);
  });
});

// ---------------------------------------------------------------------------
// generateState
// ---------------------------------------------------------------------------
describe("generateState", () => {
  it("returns a hex string", () => {
    const state = generateState();
    expect(state).toMatch(/^[0-9a-f]+$/);
  });

  it("has expected length (16 bytes = 32 hex chars)", () => {
    const state = generateState();
    expect(state.length).toBe(32);
  });

});

// ---------------------------------------------------------------------------
// buildAuthorizationUrl
// ---------------------------------------------------------------------------
describe("buildAuthorizationUrl", () => {
  const defaultParams = {
    clientId: "test-client-id",
    redirectUri: "http://127.0.0.1:18457/callback",
    codeChallenge: "test-code-challenge",
    state: "abc123",
  };

  it("builds URL with correct origin and OAuth query parameters", () => {
    const url = new URL(buildAuthorizationUrl(defaultParams));

    expect(url.origin).toBe("http://localhost:9999");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("test-client-id");
    expect(url.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:18457/callback");
    expect(url.searchParams.get("code_challenge")).toBe("test-code-challenge");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("abc123");
  });

  it("includes all required scopes", () => {
    const url = new URL(buildAuthorizationUrl(defaultParams));
    const scope = url.searchParams.get("scope")!;

    expect(scope).toContain("site:deploy");
    expect(scope).toContain("site:read");
    expect(scope).toContain("site:delete");
    expect(scope).toContain("openid");
    expect(scope).toContain("offline_access");
  });
});

// ---------------------------------------------------------------------------
// startCallbackServer
// ---------------------------------------------------------------------------
describe("startCallbackServer", () => {
  let closeFn: (() => void) | undefined;

  afterEach(() => {
    closeFn?.();
    closeFn = undefined;
  });

  it("starts a server and returns a port from the expected range", async () => {
    const { port, close } = await startCallbackServer();
    closeFn = close;

    expect([18457, 18458, 18459]).toContain(port);
  });

  it("resolves the callback promise when /callback receives code and state", async () => {
    const { port, waitForCallback, close } = await startCallbackServer();
    closeFn = close;

    const res = await fetch(
      `http://127.0.0.1:${port}/callback?code=test-code&state=test-state`,
    );

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain("Login successful");

    const result = await waitForCallback();
    expect(result).toEqual({ code: "test-code", state: "test-state" });
  });

  it("returns 400 when code or state is missing", async () => {
    const { port, close } = await startCallbackServer();
    closeFn = close;

    const res = await fetch(`http://127.0.0.1:${port}/callback?code=only-code`);
    expect(res.status).toBe(400);
  });

  it("renders success callback page with correct placeholders", async () => {
    const { port, waitForCallback, close } = await startCallbackServer();
    closeFn = close;

    const res = await fetch(
      `http://127.0.0.1:${port}/callback?code=c&state=s`,
    );
    const body = await res.text();

    expect(body).toContain('class="card success"');
    expect(body).toContain("&#10003;");
    expect(body).toContain("Login successful");
    expect(body).toContain("You can close this tab and return to the CLI.");
    // No raw placeholders should remain
    expect(body).not.toContain("{{");

    await waitForCallback();
  });

  it("renders error callback page when state is missing", async () => {
    const { port, close } = await startCallbackServer();
    closeFn = close;

    const res = await fetch(
      `http://127.0.0.1:${port}/callback?code=only-code`,
    );
    const body = await res.text();

    expect(body).toContain('class="card error"');
    expect(body).toContain("&#10007;");
    expect(body).toContain("Login failed");
    expect(body).toContain("Missing authorization code. Please try again.");
    expect(body).not.toContain("{{");
  });

});

// ---------------------------------------------------------------------------
// exchangeCodeForTokens
// ---------------------------------------------------------------------------
describe("exchangeCodeForTokens", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("sends a POST with correct form-encoded body and returns tokens", async () => {
    const mockTokens = {
      access_token: "at_123",
      refresh_token: "rt_456",
      expires_in: 3600,
    };

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify(mockTokens), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const tokens = await exchangeCodeForTokens(
      "auth-code",
      "verifier-123",
      "http://127.0.0.1:18457/callback",
      "client-id",
    );

    expect(tokens).toEqual(mockTokens);

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe("http://localhost:9999/api/auth/oauth2/token");
    expect(init!.method).toBe("POST");

    const body = new URLSearchParams(init!.body as string);
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code")).toBe("auth-code");
    expect(body.get("code_verifier")).toBe("verifier-123");
    expect(body.get("redirect_uri")).toBe("http://127.0.0.1:18457/callback");
    expect(body.get("client_id")).toBe("client-id");
  });

  it("throws when the token endpoint returns an error", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response("invalid_grant", { status: 400 }),
    );

    await expect(
      exchangeCodeForTokens("bad-code", "v", "http://localhost/cb", "cid"),
    ).rejects.toThrow("Token exchange failed: invalid_grant");
  });
});
