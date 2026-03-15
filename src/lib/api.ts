import { loadCredentials, saveCredentials, clearCredentials } from "./config";
import { env } from "./env";
import { apiFetch, apiUrl, UPLOAD_TIMEOUT_MS } from "./http";
import { log } from "./logger";
import { CLI_VERSION } from "./version";

function getUpgradeHint(): string {
  const script = process.argv[1] || "";
  // npx/bunx/dlx run from cache or temp dirs; a global install lives elsewhere
  const isExec = /\/_npx\/|\/\.npm\/_npx|\/dlx-|\/bunx-/i.test(script);
  if (isExec) {
    return "Re-run with: npx samplex@latest, bunx samplex@latest, or pnpm dlx samplex@latest";
  }
  return "Update with: npm update -g samplex, bun update -g samplex, or pnpm update -g samplex";
}

function checkUpgradeRequired(response: Response): void {
  if (response.status === 426) {
    const minVersion = response.headers.get("X-Min-CLI-Version") || "latest";
    throw new Error(
      `This CLI version (${CLI_VERSION}) is outdated. ` +
        `Minimum required: ${minVersion}. ` +
        getUpgradeHint(),
    );
  }
}

function handleResponseErrors(response: Response): void {
  checkUpgradeRequired(response);

  if (response.status === 401) {
    if (!env.SAMPLEX_API_KEY) {
      clearCredentials();
    }
    throw new Error(
      env.SAMPLEX_API_KEY
        ? "API key is invalid or expired. Check your SAMPLEX_API_KEY environment variable."
        : "Session expired. Run `samplex login` again.",
    );
  }
}

function getAuthHeaders(): Record<string, string> {
  if (env.SAMPLEX_API_KEY) {
    return { "x-api-key": env.SAMPLEX_API_KEY };
  }
  throw new Error("No auth method available");
}

async function getValidCredentials() {
  const credentials = loadCredentials();
  if (!credentials) return null;

  // If token expires within 60s, try to refresh
  const now = Date.now();
  if (credentials.expiresAt > now + 60_000) {
    return credentials;
  }

  log.debug("Token expired or expiring soon, refreshing...");

  try {
    const res = await apiFetch(apiUrl("/api/auth/oauth2/token"), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: credentials.refreshToken,
        client_id: "samplex-cli",
      }),
    });

    if (!res.ok) {
      log.debug(`Token refresh failed: ${res.status}`);
      clearCredentials();
      return null;
    }

    const data = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    const updated = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || credentials.refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
      userEmail: credentials.userEmail,
    };

    saveCredentials(updated);
    log.debug("Token refreshed successfully");
    return updated;
  } catch (err) {
    log.debug(`Token refresh error: ${err}`);
    clearCredentials();
    return null;
  }
}

async function requireAuth(): Promise<Record<string, string>> {
  // API key takes precedence — no OAuth needed
  if (env.SAMPLEX_API_KEY) {
    log.debug("Using SAMPLEX_API_KEY for authentication");
    return getAuthHeaders();
  }

  // Fall back to OAuth credentials
  const credentials = await getValidCredentials();
  if (!credentials) {
    throw new Error(
      "Not logged in. Run `samplex login` or set the SAMPLEX_API_KEY environment variable.",
    );
  }
  return { Authorization: `Bearer ${credentials.accessToken}` };
}

export async function rpc<T = unknown>(procedure: string, input?: unknown): Promise<T> {
  const authHeaders = await requireAuth();

  const path = procedure.replaceAll(".", "/");
  const url = apiUrl(`/api/rpc/api-reference/${path}`);

  log.debug(`RPC ${procedure} →`, url);
  if (input !== undefined) log.debug("  input:", JSON.stringify(input));

  const headers: Record<string, string> = {
    ...authHeaders,
  };
  let body: string | undefined;

  if (input !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(input);
  }

  const response = await apiFetch(url, { method: "POST", headers, body });

  handleResponseErrors(response);

  if (!response.ok) {
    const text = await response.text();
    log.debug("  error body:", text);
    throw new Error(text);
  }

  const result = (await response.json()) as T;
  log.debug("  result:", JSON.stringify(result));
  return result;
}

/**
 * Upload a file via oRPC's RPC protocol using FormData.
 * See: https://orpc.dev/docs/advanced/rpc-protocol
 */
export async function rpcUpload<T = unknown>(
  procedure: string,
  file: { blob: Blob; fieldName: string },
  input: Record<string, unknown> = {},
): Promise<T> {
  const authHeaders = await requireAuth();

  const path = procedure.replaceAll(".", "/");
  const url = apiUrl(`/api/rpc/${path}`);

  log.debug(`RPC upload ${procedure} →`, url);

  // Build oRPC FormData wire format:
  // - 'data' field contains JSON with { json, meta, maps }
  // - '0', '1', etc. contain the blob parts
  const json = { ...input, [file.fieldName]: {} };
  const form = new FormData();
  form.set(
    "data",
    JSON.stringify({
      json,
      meta: [],
      maps: [[file.fieldName]],
    }),
  );
  form.set("0", file.blob);

  const response = await apiFetch(url, {
    method: "POST",
    headers: authHeaders,
    body: form,
    timeoutMs: UPLOAD_TIMEOUT_MS,
  });

  handleResponseErrors(response);

  if (!response.ok) {
    const text = await response.text();
    log.debug("  error body:", text);
    throw new Error(text);
  }

  // oRPC RPC response format: { json, meta }
  const rpcResult = (await response.json()) as { json: T; meta: unknown[] };
  log.debug("  result:", JSON.stringify(rpcResult.json));
  return rpcResult.json;
}
