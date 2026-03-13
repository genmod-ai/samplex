import { env } from "./env";
import { log } from "./logger";
import { CLI_VERSION, USER_AGENT } from "./version";

const API_BASE = env.SAMPLEX_API_URL;

export function apiUrl(path: string): string {
  const separator = path.startsWith("/") ? "" : "/";
  return `${API_BASE}${separator}${path}`;
}

export function baseHeaders(): Record<string, string> {
  return {
    "User-Agent": USER_AGENT,
    "X-CLI-Version": CLI_VERSION,
  };
}

const DEFAULT_TIMEOUT_MS = 30_000;
const UPLOAD_TIMEOUT_MS = 300_000;

export async function apiFetch(
  url: string,
  init: RequestInit & { headers?: Record<string, string>; timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs, ...fetchInit } = init;
  const headers = { ...baseHeaders(), ...fetchInit.headers };
  const timeout = timeoutMs ?? DEFAULT_TIMEOUT_MS;
  log.debug(`fetch ${fetchInit.method ?? "GET"} →`, url);
  const response = await fetch(url, {
    ...fetchInit,
    headers,
    signal: AbortSignal.timeout(timeout),
  });
  log.debug(`  ← ${response.status} ${response.statusText}`);
  return response;
}

export { UPLOAD_TIMEOUT_MS };
