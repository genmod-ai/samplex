import { env } from "./env";
import { log } from "./logger";
import { CLI_VERSION, USER_AGENT } from "./version";

const API_BASE = env.SAMPLEX_API_URL;

export function apiUrl(path: string): string {
  return `${API_BASE}${path}`;
}

export function baseHeaders(): Record<string, string> {
  return {
    "User-Agent": USER_AGENT,
    "X-CLI-Version": CLI_VERSION,
  };
}

export async function apiFetch(
  url: string,
  init: RequestInit & { headers?: Record<string, string> } = {},
): Promise<Response> {
  const headers = { ...baseHeaders(), ...init.headers };
  log.debug(`fetch ${init.method ?? "GET"} →`, url);
  const response = await fetch(url, { ...init, headers });
  log.debug(`  ← ${response.status} ${response.statusText}`);
  return response;
}
