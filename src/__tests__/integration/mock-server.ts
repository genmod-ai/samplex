import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";

export interface MockSite {
  slug: string;
  name: string;
  domain: string;
  createdAt: string;
}

export interface RecordedRequest {
  method: string;
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

export interface MockApiServer {
  server: Server;
  start: () => Promise<number>;
  stop: () => Promise<void>;
  clear: () => void;
  addSite: (site: Partial<MockSite> & { slug: string }) => void;
  requests: RecordedRequest[];
  validToken: string;
  baseUrl: () => string;
}

export function createMockApiServer(): MockApiServer {
  const validToken = "test-valid-token-abc123";
  const validRefreshToken = "test-refresh-token-xyz789";
  let sites: MockSite[] = [];
  let requests: RecordedRequest[] = [];
  let port = 0;

  function json(res: ServerResponse, data: unknown, status = 200) {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  }

  function isAuthorized(req: IncomingMessage): boolean {
    const auth = req.headers.authorization;
    return auth === `Bearer ${validToken}`;
  }

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    // Collect body
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const bodyStr = Buffer.concat(chunks).toString("utf-8");

    // Record request
    requests.push({
      method: req.method || "UNKNOWN",
      url: req.url || "/",
      headers: req.headers as Record<string, string | string[] | undefined>,
      body: bodyStr,
    });

    const url = req.url || "/";

    // OAuth token exchange endpoint
    if (url.includes("/oauth2/token")) {
      const params = new URLSearchParams(bodyStr);
      const grantType = params.get("grant_type");

      if (grantType === "authorization_code") {
        return json(res, {
          access_token: validToken,
          refresh_token: validRefreshToken,
          expires_in: 3600,
          token_type: "Bearer",
        });
      }

      if (grantType === "refresh_token") {
        const refreshToken = params.get("refresh_token");
        if (refreshToken === validRefreshToken) {
          return json(res, {
            access_token: validToken,
            refresh_token: validRefreshToken,
            expires_in: 3600,
            token_type: "Bearer",
          });
        }
        return json(res, { error: "invalid_grant" }, 401);
      }

      return json(res, { error: "unsupported_grant_type" }, 400);
    }

    // All RPC endpoints below require auth
    if (!isAuthorized(req)) {
      return json(res, { error: "Unauthorized" }, 401);
    }

    // site.list
    if (url.includes("site/list") || url.includes("site.list")) {
      return json(res, sites);
    }

    // site.delete
    if (url.includes("site/delete") || url.includes("site.delete")) {
      let input: { slug?: string } = {};
      try {
        input = JSON.parse(bodyStr);
      } catch {
        // body might be empty
      }

      const slug = input.slug;
      const idx = sites.findIndex((s) => s.slug === slug);
      if (idx === -1) {
        return json(res, { error: "Site not found" }, 404);
      }
      sites.splice(idx, 1);
      return json(res, { success: true });
    }

    // site.getUsage
    if (url.includes("site/getUsage") || url.includes("site.getUsage")) {
      return json(res, {
        sitesUsed: sites.length,
        sitesLimit: 5,
        storageUsedBytes: 1024 * 1024 * 10,
        storageLimitBytes: 1024 * 1024 * 100,
      });
    }

    // Fallback: unknown procedure
    json(res, { error: "Not found" }, 404);
  });

  return {
    server,
    validToken,
    requests,

    start(): Promise<number> {
      return new Promise((resolve) => {
        server.listen(0, "127.0.0.1", () => {
          const addr = server.address();
          port = typeof addr === "object" && addr ? addr.port : 0;
          resolve(port);
        });
      });
    },

    stop(): Promise<void> {
      return new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      });
    },

    clear() {
      sites = [];
      requests.length = 0;
    },

    addSite(site: Partial<MockSite> & { slug: string }) {
      sites.push({
        name: site.name || site.slug,
        domain: site.domain || `${site.slug}.sample.app`,
        createdAt: site.createdAt || new Date().toISOString(),
        ...site,
      });
    },

    baseUrl() {
      return `http://localhost:${port}`;
    },
  };
}
