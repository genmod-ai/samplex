import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const CONFIG_DIR = join(homedir(), ".smpx");
const CREDENTIALS_FILE = join(CONFIG_DIR, "credentials.json");
const PROJECT_CONFIG_FILE = ".smpx.config.json";

interface Credentials {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  userEmail: string;
}

export function ensureConfigDir(): void {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  chmodSync(CONFIG_DIR, 0o700);
}

export function saveCredentials(credentials: Credentials): void {
  ensureConfigDir();
  writeFileSync(CREDENTIALS_FILE, JSON.stringify(credentials, null, 2), { mode: 0o600 });
}

export function loadCredentials(): Credentials | null {
  if (!existsSync(CREDENTIALS_FILE)) return null;
  try {
    return JSON.parse(readFileSync(CREDENTIALS_FILE, "utf-8"));
  } catch {
    return null;
  }
}

export function clearCredentials(): void {
  rmSync(CREDENTIALS_FILE, { force: true });
}

// --- Project config (.smpx.config.json in project root) ---

interface ProjectConfig {
  slug?: string;
  name?: string;
}

function projectConfigPath(): string {
  return resolve(PROJECT_CONFIG_FILE);
}

export function loadProjectConfig(): ProjectConfig | null {
  const path = projectConfigPath();
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

export function saveProjectConfig(config: ProjectConfig): void {
  const path = projectConfigPath();
  const existing = loadProjectConfig() || {};
  writeFileSync(path, JSON.stringify({ ...existing, ...config }, null, 2) + "\n");
}
