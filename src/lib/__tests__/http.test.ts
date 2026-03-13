import { describe, it, expect, afterEach, vi } from "vitest";

vi.mock("../env.ts", () => ({
  env: {
    SAMPLEX_API_URL: "http://localhost:9999",
    SAMPLEX_LOG_LEVEL: "silent",
  },
}));

import { apiFetch, apiUrl, baseHeaders } from "../http.js";
import { USER_AGENT, CLI_VERSION } from "../version.js";

// ---------------------------------------------------------------------------
// apiUrl
// ---------------------------------------------------------------------------
describe("apiUrl", () => {
  it("prepends the API base URL from env", () => {
    expect(apiUrl("/some/path")).toBe("http://localhost:9999/some/path");
  });

  it("inserts slash when path has no leading slash", () => {
    expect(apiUrl("no-slash")).toBe("http://localhost:9999/no-slash");
  });
});

// ---------------------------------------------------------------------------
// apiFetch
// ---------------------------------------------------------------------------
describe("apiFetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockFetch(status = 200, body = "{}") {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(body, { status }));
    return spy;
  }

  it("merges User-Agent and X-CLI-Version base headers into every request", async () => {
    const spy = mockFetch();
    await apiFetch("http://localhost:9999/test");

    const [, init] = spy.mock.calls[0]!;
    const headers = init?.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe(USER_AGENT);
    expect(headers["X-CLI-Version"]).toBe(CLI_VERSION);
  });

  it("includes caller-supplied headers alongside base headers", async () => {
    const spy = mockFetch();
    await apiFetch("http://localhost:9999/test", {
      headers: { Authorization: "Bearer tok123", "X-Custom": "yes" },
    });

    const [, init] = spy.mock.calls[0]!;
    const headers = init?.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe(USER_AGENT);
    expect(headers["X-CLI-Version"]).toBe(CLI_VERSION);
    expect(headers["Authorization"]).toBe("Bearer tok123");
    expect(headers["X-Custom"]).toBe("yes");
  });

  it("caller-supplied headers can override base headers", async () => {
    const spy = mockFetch();
    await apiFetch("http://localhost:9999/test", {
      headers: { "User-Agent": "custom-agent/1.0" },
    });

    const [, init] = spy.mock.calls[0]!;
    const headers = init?.headers as Record<string, string>;
    expect(headers["User-Agent"]).toBe("custom-agent/1.0");
    // Other base headers are still present
    expect(headers["X-CLI-Version"]).toBe(CLI_VERSION);
  });

  it("passes through method and body to fetch", async () => {
    const spy = mockFetch();
    await apiFetch("http://localhost:9999/upload", {
      method: "POST",
      body: JSON.stringify({ foo: "bar" }),
    });

    const [url, init] = spy.mock.calls[0]!;
    expect(url).toBe("http://localhost:9999/upload");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBe(JSON.stringify({ foo: "bar" }));
  });

  it("returns the fetch response", async () => {
    mockFetch(201, "created");
    const res = await apiFetch("http://localhost:9999/thing");
    expect(res.status).toBe(201);
  });

  it("defaults to GET when no method is specified", async () => {
    const spy = mockFetch();
    await apiFetch("http://localhost:9999/test");

    const [, init] = spy.mock.calls[0]!;
    // method not explicitly set means fetch defaults to GET; we just confirm
    // it is not overridden by apiFetch itself
    expect(init?.method).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// baseHeaders
// ---------------------------------------------------------------------------
describe("baseHeaders", () => {
  it("returns User-Agent and X-CLI-Version", () => {
    const h = baseHeaders();
    expect(h["User-Agent"]).toBe(USER_AGENT);
    expect(h["X-CLI-Version"]).toBe(CLI_VERSION);
  });

  it("returns a new object each call", () => {
    expect(baseHeaders()).not.toBe(baseHeaders());
  });
});
