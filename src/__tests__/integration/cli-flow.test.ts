import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { createMockApiServer, type MockApiServer } from "./mock-server.js";

let mock: MockApiServer;
let baseUrl: string;

/**
 * Helper that mirrors what `rpc()` does in packages/cli/src/lib/api.ts.
 * Makes a POST to the mock server with the same header/body conventions.
 */
async function rpc(procedure: string, input?: unknown, token?: string): Promise<Response> {
  const path = procedure.replaceAll(".", "/");
  const url = `${baseUrl}/api/rpc/api-reference/${path}`;

  const headers: Record<string, string> = {
    "X-CLI-Version": "0.1.0",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  if (input !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  return fetch(url, {
    method: "POST",
    headers,
    body: input !== undefined ? JSON.stringify(input) : undefined,
  });
}

/**
 * Helper for the OAuth token exchange endpoint, mirroring getValidCredentials().
 */
async function tokenExchange(
  grantType: string,
  extraParams: Record<string, string> = {},
): Promise<Response> {
  const url = `${baseUrl}/api/auth/oauth2/token`;
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: grantType,
      client_id: "samplex-cli",
      ...extraParams,
    }),
  });
}

beforeAll(async () => {
  mock = createMockApiServer();
  const port = await mock.start();
  baseUrl = `http://localhost:${port}`;
});

afterAll(async () => {
  await mock.stop();
});

beforeEach(() => {
  mock.clear();
});

// ---------------------------------------------------------------------------
// Auth flow
// ---------------------------------------------------------------------------
describe("Auth flow", () => {
  it("Refresh token exchange works with valid refresh token", async () => {
    // First get tokens via authorization_code
    const initial = await tokenExchange("authorization_code");
    const { refresh_token } = (await initial.json()) as {
      refresh_token: string;
    };

    // Now refresh
    const res = await tokenExchange("refresh_token", { refresh_token });
    expect(res.status).toBe(200);

    const data = (await res.json()) as {
      access_token: string;
      expires_in: number;
    };
    expect(data.access_token).toBeTruthy();
    expect(data.expires_in).toBeGreaterThan(0);
  });

  it("Refresh with invalid token returns 401", async () => {
    const res = await tokenExchange("refresh_token", {
      refresh_token: "bad-token",
    });
    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// API communication
// ---------------------------------------------------------------------------
describe("API communication", () => {
  it("RPC call with valid Bearer token succeeds (list sites)", async () => {
    mock.addSite({ slug: "my-site" });

    const res = await rpc("site.list", undefined, mock.validToken);
    expect(res.status).toBe(200);

    const data = (await res.json()) as Array<{ slug: string }>;
    expect(Array.isArray(data)).toBe(true);
    expect(data).toHaveLength(1);
    expect(data[0]?.slug).toBe("my-site");
  });

  it("RPC call without auth token gets 401", async () => {
    const res = await rpc("site.list");
    expect(res.status).toBe(401);

    const data = (await res.json()) as { error: string };
    expect(data.error).toBe("Unauthorized");
  });

  it("Delete flow: add site, delete it, verify it is gone from list", async () => {
    mock.addSite({ slug: "to-delete" });

    // Verify it exists
    const listBefore = await rpc("site.list", undefined, mock.validToken);
    const before = (await listBefore.json()) as Array<{ slug: string }>;
    expect(before).toHaveLength(1);

    // Delete it
    const delRes = await rpc("site.delete", { slug: "to-delete" }, mock.validToken);
    expect(delRes.status).toBe(200);
    const delData = (await delRes.json()) as { success: boolean };
    expect(delData.success).toBe(true);

    // Verify it is gone
    const listAfter = await rpc("site.list", undefined, mock.validToken);
    const after = (await listAfter.json()) as Array<{ slug: string }>;
    expect(after).toHaveLength(0);
  });

  it("Delete non-existent site returns 404", async () => {
    const res = await rpc("site.delete", { slug: "ghost" }, mock.validToken);
    expect(res.status).toBe(404);
  });

  it("List returns multiple sites correctly", async () => {
    mock.addSite({ slug: "alpha", name: "Alpha Site" });
    mock.addSite({ slug: "beta", name: "Beta Site" });
    mock.addSite({ slug: "gamma", name: "Gamma Site" });

    const res = await rpc("site.list", undefined, mock.validToken);
    const data = (await res.json()) as Array<{ slug: string }>;

    expect(data).toHaveLength(3);
    const slugs = data.map((s: { slug: string }) => s.slug);
    expect(slugs).toContain("alpha");
    expect(slugs).toContain("beta");
    expect(slugs).toContain("gamma");
  });

  it("getUsage returns usage stats", async () => {
    mock.addSite({ slug: "s1" });
    mock.addSite({ slug: "s2" });

    const res = await rpc("site.getUsage", undefined, mock.validToken);
    expect(res.status).toBe(200);

    const data = (await res.json()) as {
      sitesUsed: number;
      sitesLimit: number;
      storageUsedBytes: number;
      storageLimitBytes: number;
    };
    expect(data.sitesUsed).toBe(2);
    expect(data.sitesLimit).toBe(5);
    expect(typeof data.storageUsedBytes).toBe("number");
    expect(typeof data.storageLimitBytes).toBe("number");
  });
});
