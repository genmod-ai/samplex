import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Module mocks — declared before the static import of deployCommand so that
// Vitest's hoisting ensures mocks are in place when the module is loaded.
// ---------------------------------------------------------------------------

vi.mock("../../lib/api.js", () => ({
  rpcUpload: vi.fn(),
}));

vi.mock("../../lib/config.js", () => ({
  loadProjectConfig: vi.fn(() => null),
  saveProjectConfig: vi.fn(),
}));

vi.mock("../../lib/logger.js", () => ({
  log: { debug: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

// Shared spinner instance so tests can inspect calls after the command runs.
const spinner = {
  text: "",
  start: vi.fn(),
  setText: vi.fn((t: string) => { spinner.text = t; }),
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

import { deployCommand } from "../deploy.js";
import { rpcUpload } from "../../lib/api.js";
import { loadProjectConfig, saveProjectConfig } from "../../lib/config.js";

const rpcUploadMock = rpcUpload as ReturnType<typeof vi.fn>;
const loadProjectConfigMock = loadProjectConfig as ReturnType<typeof vi.fn>;
const saveProjectConfigMock = saveProjectConfig as ReturnType<typeof vi.fn>;

// ---------------------------------------------------------------------------
// Test lifecycle
// ---------------------------------------------------------------------------

let tempDir: string;
let originalCwd: string;
let exitSpy: ReturnType<typeof vi.spyOn>;

const DEFAULT_RESULT = {
  siteId: "site-1",
  url: "https://my-site.sample.app",
  siteSlug: "my-site",
  filesUploaded: 1,
  totalSize: 1024,
};

beforeEach(() => {
  originalCwd = process.cwd();
  tempDir = mkdtempSync(join(tmpdir(), "deploy-test-"));

  // Reset shared spinner state
  spinner.text = "";
  spinner.start.mockReset();
  spinner.setText.mockReset().mockImplementation((t: string) => { spinner.text = t; });
  spinner.succeed.mockReset();
  spinner.fail.mockReset();
  spinner.stop.mockReset();

  // Prevent process.exit from terminating the runner; make it throw instead.
  exitSpy = vi
    .spyOn(process, "exit")
    .mockImplementation((_code?: string | number | null | undefined) => {
      throw new Error("process.exit");
    });

  vi.clearAllMocks();

  // Re-apply default loadProjectConfig return after clearAllMocks resets it.
  loadProjectConfigMock.mockReturnValue(null);
});

afterEach(() => {
  process.chdir(originalCwd);
  vi.restoreAllMocks();
  rmSync(tempDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// 1. findOutputDir auto-detection
// ---------------------------------------------------------------------------
describe("findOutputDir — auto-detection", () => {
  it("finds a dist/ subdirectory and calls rpcUpload", async () => {
    const distDir = join(tempDir, "dist");
    mkdirSync(distDir);
    writeFileSync(join(distDir, "index.html"), "<h1>Hello</h1>");

    process.chdir(tempDir);
    rpcUploadMock.mockResolvedValue(DEFAULT_RESULT);

    await deployCommand();

    expect(rpcUploadMock).toHaveBeenCalledOnce();
  });

  it("finds a build/ subdirectory when dist/ is absent", async () => {
    const buildDir = join(tempDir, "build");
    mkdirSync(buildDir);
    writeFileSync(join(buildDir, "app.js"), "console.log('hi')");

    process.chdir(tempDir);
    rpcUploadMock.mockResolvedValue(DEFAULT_RESULT);

    await deployCommand();

    expect(rpcUploadMock).toHaveBeenCalledOnce();
  });

  it("calls process.exit(1) when no known output directory exists", async () => {
    // tempDir has no dist/build/out subdirectories
    process.chdir(tempDir);

    await expect(deployCommand()).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });
});

// ---------------------------------------------------------------------------
// 2. findOutputDir with an explicit directory argument
// ---------------------------------------------------------------------------
describe("findOutputDir — explicit directory", () => {
  it("calls process.exit(1) when the specified directory does not exist", async () => {
    process.chdir(tempDir);

    await expect(deployCommand("/nonexistent/path/xyz")).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("uses the explicit directory when it exists", async () => {
    const customDir = join(tempDir, "custom-output");
    mkdirSync(customDir);
    writeFileSync(join(customDir, "page.html"), "<!doctype html>");

    rpcUploadMock.mockResolvedValue(DEFAULT_RESULT);

    await deployCommand(customDir);

    expect(rpcUploadMock).toHaveBeenCalledOnce();
  });
});

// ---------------------------------------------------------------------------
// 3. walkDir — correct file count and size reflected in spinner text
// ---------------------------------------------------------------------------
describe("walkDir — file count and size", () => {
  it("records correct file count and total size in spinner text", async () => {
    const distDir = join(tempDir, "dist");
    mkdirSync(distDir);
    mkdirSync(join(distDir, "assets"));

    // Write files with known byte sizes (ASCII → 1 byte per char)
    writeFileSync(join(distDir, "index.html"), "A".repeat(100));         // 100 B
    writeFileSync(join(distDir, "assets", "main.css"), "B".repeat(200)); // 200 B
    writeFileSync(join(distDir, "assets", "app.js"), "C".repeat(700));   // 700 B
    // Total: 3 files, 1000 B = 0.976...KB → toFixed(1) → "1.0KB"

    process.chdir(tempDir);
    rpcUploadMock.mockResolvedValue(DEFAULT_RESULT);

    await deployCommand();

    // deployCommand calls spinner.setText with the "Found N files (X.XKB) in ..." string
    const textCalls = spinner.setText.mock.calls.map((c: [string]) => c[0]);
    const foundLine = textCalls.find((t: string) => t.startsWith("Found"));
    expect(foundLine).toBeDefined();
    expect(foundLine).toMatch(/Found 3 files/);
    expect(foundLine).toMatch(/1\.0KB/);
  });
});

// ---------------------------------------------------------------------------
// 4. Slug validation
// ---------------------------------------------------------------------------
describe("slug validation", () => {
  it("calls process.exit(1) when an invalid slug is passed via --slug", async () => {
    const distDir = join(tempDir, "dist");
    mkdirSync(distDir);
    writeFileSync(join(distDir, "index.html"), "hello");

    process.chdir(tempDir);

    // Slugs starting/ending with a hyphen are invalid per validateSlug
    await expect(deployCommand(undefined, { slug: "-bad-slug-" })).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("calls process.exit(1) when the slug in .samplex.config.json is invalid", async () => {
    const distDir = join(tempDir, "dist");
    mkdirSync(distDir);
    writeFileSync(join(distDir, "index.html"), "hello");

    process.chdir(tempDir);
    loadProjectConfigMock.mockReturnValue({ slug: "INVALID_SLUG" });

    await expect(deployCommand()).rejects.toThrow("process.exit");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("proceeds normally when a valid slug is supplied", async () => {
    const distDir = join(tempDir, "dist");
    mkdirSync(distDir);
    writeFileSync(join(distDir, "index.html"), "hello");

    process.chdir(tempDir);
    rpcUploadMock.mockResolvedValue({ ...DEFAULT_RESULT, siteSlug: "valid-slug" });

    await deployCommand(undefined, { slug: "valid-slug" });

    expect(exitSpy).not.toHaveBeenCalled();
    expect(rpcUploadMock).toHaveBeenCalledOnce();
  });

  it("--slug takes precedence over .samplex.config.json slug", async () => {
    const distDir = join(tempDir, "dist");
    mkdirSync(distDir);
    writeFileSync(join(distDir, "index.html"), "hello");

    process.chdir(tempDir);
    loadProjectConfigMock.mockReturnValue({ slug: "config-slug" });
    rpcUploadMock.mockResolvedValue({ ...DEFAULT_RESULT, siteSlug: "cli-slug" });

    await deployCommand(undefined, { slug: "cli-slug" });

    const [, , input] = rpcUploadMock.mock.calls[0]!;
    expect(input.slug).toBe("cli-slug");
  });
});

// ---------------------------------------------------------------------------
// 5. rpcUpload payload correctness
// ---------------------------------------------------------------------------
describe("rpcUpload payload", () => {
  it("sends sha256, slug, and name in the upload input", async () => {
    const distDir = join(tempDir, "dist");
    mkdirSync(distDir);
    writeFileSync(join(distDir, "index.html"), "hello");

    process.chdir(tempDir);
    rpcUploadMock.mockResolvedValue({ ...DEFAULT_RESULT, siteSlug: "my-slug" });

    await deployCommand(undefined, { slug: "my-slug", name: "My Site" });

    expect(rpcUploadMock).toHaveBeenCalledOnce();
    const [procedure, file, input] = rpcUploadMock.mock.calls[0]!;

    expect(procedure).toBe("site.upload");
    expect(file).toEqual(expect.objectContaining({ fieldName: "archive" }));
    expect(input.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(input.slug).toBe("my-slug");
    expect(input.name).toBe("My Site");
  });

  it("omits slug from input when none is configured", async () => {
    const distDir = join(tempDir, "dist");
    mkdirSync(distDir);
    writeFileSync(join(distDir, "index.html"), "hello");

    process.chdir(tempDir);
    rpcUploadMock.mockResolvedValue(DEFAULT_RESULT);

    await deployCommand();

    const [, , input] = rpcUploadMock.mock.calls[0]!;
    expect(input.slug).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// 6. Post-deploy saves config
// ---------------------------------------------------------------------------
describe("post-deploy config persistence", () => {
  it("calls saveProjectConfig with the siteSlug returned by the server", async () => {
    const distDir = join(tempDir, "dist");
    mkdirSync(distDir);
    writeFileSync(join(distDir, "index.html"), "hello");

    process.chdir(tempDir);
    rpcUploadMock.mockResolvedValue({ ...DEFAULT_RESULT, siteSlug: "server-assigned-slug" });

    await deployCommand();

    expect(saveProjectConfigMock).toHaveBeenCalledOnce();
    expect(saveProjectConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "server-assigned-slug" }),
    );
  });

  it("includes the name in saveProjectConfig when --name is provided", async () => {
    const distDir = join(tempDir, "dist");
    mkdirSync(distDir);
    writeFileSync(join(distDir, "index.html"), "hello");

    process.chdir(tempDir);
    rpcUploadMock.mockResolvedValue({ ...DEFAULT_RESULT, siteSlug: "named-site" });

    await deployCommand(undefined, { slug: "named-site", name: "My Named Site" });

    expect(saveProjectConfigMock).toHaveBeenCalledWith(
      expect.objectContaining({ slug: "named-site", name: "My Named Site" }),
    );
  });
});
