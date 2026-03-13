import { describe, it, expect, afterEach, vi } from "vitest";
import * as net from "node:net";

vi.mock("../env.ts", () => ({
  env: {
    SAMPLEX_API_URL: "http://localhost:9999",
    SAMPLEX_LOG_LEVEL: "silent",
  },
}));

import {
  generateCodeChallenge,
  buildAuthorizationUrl,
  startCallbackServer,
  exchangeCodeForTokens,
} from "../auth.js";

// ---------------------------------------------------------------------------
// generateCodeChallenge
// ---------------------------------------------------------------------------
describe("generateCodeChallenge", () => {
  it("is deterministic for the same input", () => {
    const a = generateCodeChallenge("deterministic-input");
    const b = generateCodeChallenge("deterministic-input");
    expect(a).toBe(b);
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
    const body = await res.text();
    expect(body).toContain("Login failed");
    expect(body).not.toContain("{{");
  });

  it("falls back to next port when the preferred port is occupied", async () => {
    // Simulate 18457 being in use by making the first listen attempt emit
    // EADDRINUSE. All subsequent listen calls go through to the real
    // implementation so the server properly binds on the fallback port.
    const originalListen = net.Server.prototype.listen;
    let firstCall = true;

    vi.spyOn(net.Server.prototype, "listen").mockImplementation(function (
      this: net.Server,
      ...args: Parameters<typeof net.Server.prototype.listen>
    ) {
      if (firstCall) {
        firstCall = false;
        // Emit EADDRINUSE asynchronously on the next tick, as Node does.
        setImmediate(() => {
          const err = Object.assign(new Error("listen EADDRINUSE"), {
            code: "EADDRINUSE",
          });
          this.emit("error", err);
        });
        return this;
      }
      return originalListen.apply(this, args as never);
    });

    try {
      const { port, close } = await startCallbackServer();
      closeFn = close;
      expect([18458, 18459]).toContain(port);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("rejects with 'Could not bind to any callback port' when all ports are busy", async () => {
    // Occupy all three callback ports by opening three servers via
    // startCallbackServer itself (avoids any SO_REUSEADDR ambiguity).
    const occupiers: Array<{ port: number; close: () => void }> = [];
    try {
      for (let i = 0; i < 3; i++) {
        occupiers.push(await startCallbackServer());
      }

      await expect(startCallbackServer()).rejects.toThrow(
        "Could not bind to any callback port",
      );
    } finally {
      occupiers.forEach((o) => o.close());
    }
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
