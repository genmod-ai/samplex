import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "cli-config-test-"));
  vi.resetModules();

  // Mock node:os so homedir() returns our temp directory.
  // This must happen before the config module is (re-)imported.
  vi.doMock("node:os", async (importOriginal) => {
    const orig = await importOriginal<typeof import("node:os")>();
    return { ...orig, homedir: () => tempDir };
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  if (tempDir && existsSync(tempDir)) {
    rmSync(tempDir, { recursive: true, force: true });
  }
});

async function loadConfigModule() {
  return import("../config.js");
}

// ---------------------------------------------------------------------------
// Credentials round-trip
// ---------------------------------------------------------------------------
describe("credentials", () => {
  const sampleCreds = {
    accessToken: "at_abc123",
    refreshToken: "rt_xyz789",
    expiresAt: Date.now() + 3600_000,
    userEmail: "test@example.com",
  };

  it("saveCredentials + loadCredentials round-trip", async () => {
    const { saveCredentials, loadCredentials } = await loadConfigModule();
    saveCredentials(sampleCreds);
    const loaded = loadCredentials();
    expect(loaded).toEqual(sampleCreds);
  });

  it("loadCredentials returns null when no file exists", async () => {
    const { loadCredentials } = await loadConfigModule();
    expect(loadCredentials()).toBeNull();
  });

  it("clearCredentials removes credential data", async () => {
    const { saveCredentials, loadCredentials, clearCredentials } = await loadConfigModule();

    saveCredentials(sampleCreds);
    expect(loadCredentials()).toEqual(sampleCreds);

    clearCredentials();
    // After clearing, the file is empty so JSON.parse fails -> returns null
    expect(loadCredentials()).toBeNull();
  });

  it("creates the config directory if it does not exist", async () => {
    const { saveCredentials } = await loadConfigModule();
    const configDir = join(tempDir, ".samplex");
    expect(existsSync(configDir)).toBe(false);
    saveCredentials(sampleCreds);
    expect(existsSync(configDir)).toBe(true);
  });

  it("returns null when credentials file contains corrupted JSON", async () => {
    // Write malformed JSON to the credentials file path
    const configDir = join(tempDir, ".samplex");
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, "credentials.json"), "{corrupted: not valid json!!!");

    const { loadCredentials } = await loadConfigModule();
    expect(loadCredentials()).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Project config round-trip
// ---------------------------------------------------------------------------
describe("project config", () => {
  it("saveProjectConfig + loadProjectConfig round-trip", async () => {
    const originalCwd = process.cwd();
    process.chdir(tempDir);
    try {
      const { saveProjectConfig, loadProjectConfig } = await loadConfigModule();
      saveProjectConfig({ slug: "my-site", name: "My Site" });
      const loaded = loadProjectConfig();
      expect(loaded).toMatchObject({ slug: "my-site", name: "My Site" });
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("loadProjectConfig returns null when no file exists", async () => {
    const originalCwd = process.cwd();
    process.chdir(tempDir);
    try {
      const { loadProjectConfig } = await loadConfigModule();
      expect(loadProjectConfig()).toBeNull();
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("saveProjectConfig merges with existing config", async () => {
    const originalCwd = process.cwd();
    process.chdir(tempDir);
    try {
      const { saveProjectConfig, loadProjectConfig } = await loadConfigModule();

      saveProjectConfig({ slug: "first-slug" });
      saveProjectConfig({ name: "Added Name" });

      const loaded = loadProjectConfig();
      expect(loaded).toMatchObject({ slug: "first-slug", name: "Added Name" });
    } finally {
      process.chdir(originalCwd);
    }
  });

  it("returns null when project config contains corrupted JSON", async () => {
    const originalCwd = process.cwd();
    process.chdir(tempDir);
    try {
      writeFileSync(join(tempDir, ".samplex.config.json"), "{corrupted: not valid json!!!");
      const { loadProjectConfig } = await loadConfigModule();
      expect(loadProjectConfig()).toBeNull();
    } finally {
      process.chdir(originalCwd);
    }
  });
});
