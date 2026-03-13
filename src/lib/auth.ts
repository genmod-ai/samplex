import { createHash, randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import callbackHtml from "./callback.html" ;
import { apiFetch, apiUrl } from "./http";

function renderCallbackPage(success: boolean): string {
  return callbackHtml
    .replace("{{STATE_CLASS}}", success ? "success" : "error")
    .replace("{{ICON}}", success ? "&#10003;" : "&#10007;")
    .replace("{{TITLE}}", success ? "Login successful" : "Login failed")
    .replace(
      "{{MESSAGE}}",
      success
        ? "You can close this tab and return to the CLI."
        : "Missing authorization code. Please try again.",
    );
}

const CALLBACK_PORTS = [18457, 18458, 18459];

export function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

export function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function generateState(): string {
  return randomBytes(16).toString("hex");
}

interface AuthCallbackResult {
  code: string;
  state: string;
}

export function startCallbackServer(): Promise<{
  port: number;
  waitForCallback: () => Promise<AuthCallbackResult>;
  close: () => void;
}> {
  return new Promise((resolveSetup, rejectSetup) => {
    let resolveCallback: (result: AuthCallbackResult) => void;
    const callbackPromise = new Promise<AuthCallbackResult>((resolve) => {
      resolveCallback = resolve;
    });

    const server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = new URL(req.url!, `http://127.0.0.1`);
      if (url.pathname === "/callback") {
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        if (code && state) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end(renderCallbackPage(true));
          resolveCallback({ code, state });
        } else {
          res.writeHead(400, { "Content-Type": "text/html" });
          res.end(renderCallbackPage(false));
        }
      } else {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
      }
    });

    let portIndex = 0;

    function tryNextPort() {
      if (portIndex >= CALLBACK_PORTS.length) {
        rejectSetup(
          new Error("Could not bind to any callback port. Close other instances and try again."),
        );
        return;
      }

      const port = CALLBACK_PORTS[portIndex]!;
      portIndex++;

      server.once("error", () => {
        tryNextPort();
      });

      server.listen(port, "127.0.0.1", () => {
        resolveSetup({
          port,
          waitForCallback: () => callbackPromise,
          close: () => server.close(),
        });
      });
    }

    tryNextPort();
  });
}

export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  redirectUri: string,
  clientId: string,
): Promise<{
  access_token: string;
  refresh_token: string;
  expires_in: number;
}> {
  const response = await apiFetch(apiUrl("/api/auth/oauth2/token"), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
      client_id: clientId,
      resource: apiUrl("/api/auth"),
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Token exchange failed: ${err}`);
  }

  return (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
}

export function buildAuthorizationUrl(params: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
}): string {
  const url = new URL(apiUrl("/api/auth/oauth2/authorize"));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", params.state);
  url.searchParams.set(
    "scope",
    "openid profile email offline_access site:deploy site:read site:delete",
  );
  url.searchParams.set("resource", apiUrl("/api/auth"));
  return url.toString();
}
