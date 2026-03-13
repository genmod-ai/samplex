import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ---------------------------------------------------------------------------
// Module mocks — hoisted before static imports so they are in place when the
// module under test is first evaluated.
// ---------------------------------------------------------------------------

vi.mock("../../lib/auth.js", () => ({
  generateCodeVerifier: vi.fn(() => "verifier"),
  generateCodeChallenge: vi.fn(() => "challenge"),
  generateState: vi.fn(() => "known-state"),
  startCallbackServer: vi.fn(),
  exchangeCodeForTokens: vi.fn(),
  buildAuthorizationUrl: vi.fn(() => "https://auth.example.com/authorize"),
}));

vi.mock("../../lib/config.js", () => ({
  saveCredentials: vi.fn(),
}));

vi.mock("../../lib/logger.js", () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("open", () => ({ default: vi.fn() }));

const spinner = {
  start: vi.fn(),
  setText: vi.fn(),
  succeed: vi.fn(),
  fail: vi.fn(),
  stop: vi.fn(),
};

vi.mock("picospinner", () => ({
  Spinner: class { constructor() { return spinner; } },
}));

// ---------------------------------------------------------------------------
// Static imports (resolved after mocks are hoisted)
// ---------------------------------------------------------------------------

import { loginCommand } from "../login.js";
import {
  generateState,
  startCallbackServer,
  exchangeCodeForTokens,
} from "../../lib/auth.js";
import { saveCredentials } from "../../lib/config.js";

const generateStateMock = generateState as ReturnType<typeof vi.fn>;
const startCallbackServerMock = startCallbackServer as ReturnType<typeof vi.fn>;
const exchangeCodeForTokensMock = exchangeCodeForTokens as ReturnType<typeof vi.fn>;
const saveCredentialsMock = saveCredentials as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeServer(callbackResult: { code: string; state: string }) {
  const close = vi.fn();
  startCallbackServerMock.mockResolvedValue({
    port: 18457,
    waitForCallback: vi.fn().mockResolvedValue(callbackResult),
    close,
  });
  return { close };
}

const GOOD_TOKENS = {
  access_token: "acc-tok",
  refresh_token: "ref-tok",
  expires_in: 3600,
};

// ---------------------------------------------------------------------------
// Test lifecycle
// ---------------------------------------------------------------------------

let exitSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  spinner.start.mockReset();
  spinner.setText.mockReset();
  spinner.succeed.mockReset();
  spinner.fail.mockReset();
  spinner.stop.mockReset();

  exitSpy = vi
    .spyOn(process, "exit")
    .mockImplementation((_code?: string | number | null | undefined) => {
      throw new Error("process.exit");
    });

  vi.clearAllMocks();

  // Re-apply defaults that clearAllMocks would wipe out.
  generateStateMock.mockReturnValue("known-state");
  exchangeCodeForTokensMock.mockResolvedValue(GOOD_TOKENS);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// 1. State mismatch — CSRF protection
// ---------------------------------------------------------------------------
describe("state mismatch (CSRF protection)", () => {
  it("calls process.exit(1) when the callback state does not match the generated state", async () => {
    makeServer({ code: "auth-code", state: "tampered-state" });

    await expect(loginCommand()).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("closes the server on state mismatch", async () => {
    const { close } = makeServer({ code: "auth-code", state: "tampered-state" });

    await expect(loginCommand()).rejects.toThrow("process.exit");
    expect(close).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// 2. Successful login — credentials shape
// ---------------------------------------------------------------------------
describe("successful login", () => {
  it("saves credentials with the correct shape derived from token response", async () => {
    makeServer({ code: "auth-code", state: "known-state" });

    const before = Date.now();
    await loginCommand();
    const after = Date.now();

    expect(saveCredentialsMock).toHaveBeenCalledOnce();

    const saved = saveCredentialsMock.mock.calls[0]![0];
    expect(saved.accessToken).toBe("acc-tok");
    expect(saved.refreshToken).toBe("ref-tok");
    expect(saved.userEmail).toBe("");

    // expiresAt should be Date.now() + expires_in * 1000 at call time
    expect(saved.expiresAt).toBeGreaterThanOrEqual(before + GOOD_TOKENS.expires_in * 1000);
    expect(saved.expiresAt).toBeLessThanOrEqual(after + GOOD_TOKENS.expires_in * 1000);
  });

  // -------------------------------------------------------------------------
  // 3. Server is closed after successful login
  // -------------------------------------------------------------------------
  it("closes the server after a successful login", async () => {
    const { close } = makeServer({ code: "auth-code", state: "known-state" });

    await loginCommand();

    expect(close).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// 5. Token exchange failure
// ---------------------------------------------------------------------------
describe("token exchange failure", () => {
  it("calls process.exit(1) when exchangeCodeForTokens throws", async () => {
    makeServer({ code: "auth-code", state: "known-state" });
    exchangeCodeForTokensMock.mockRejectedValue(new Error("Token exchange failed: 401"));

    await expect(loginCommand()).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("closes the server even when token exchange fails", async () => {
    const { close } = makeServer({ code: "auth-code", state: "known-state" });
    exchangeCodeForTokensMock.mockRejectedValue(new Error("Token exchange failed"));

    await expect(loginCommand()).rejects.toThrow("process.exit");
    expect(close).toHaveBeenCalledOnce();
  });
});
