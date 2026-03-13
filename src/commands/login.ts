import open from "open";
import ora from "ora";
import chalk from "chalk";
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  startCallbackServer,
  exchangeCodeForTokens,
  buildAuthorizationUrl,
} from "../lib/auth.js";
import { saveCredentials } from "../lib/config.js";
import { log } from "../lib/logger.js";

const CLI_CLIENT_ID = "samplex-cli";

export async function loginCommand(): Promise<void> {
  const spinner = ora("Starting login...").start();

  let close: (() => void) | undefined;

  try {
    // Start local callback server
    const server = await startCallbackServer();
    close = server.close;
    const redirectUri = `http://127.0.0.1:${server.port}/callback`;
    log.debug("Callback server listening on port", server.port);

    // Generate PKCE values
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const state = generateState();

    // Build authorization URL
    const authUrl = buildAuthorizationUrl({
      clientId: CLI_CLIENT_ID,
      redirectUri,
      codeChallenge,
      state,
    });
    log.debug("Authorization URL:", authUrl);

    spinner.text = "Opening browser for login...";

    // Open browser
    await open(authUrl);
    spinner.text = "Waiting for login in browser...";

    // Wait for callback
    const result = await server.waitForCallback();

    // Validate state
    if (result.state !== state) {
      spinner.fail("Login failed: state mismatch (possible CSRF attack)");
      process.exit(1);
    }

    // Exchange code for tokens
    log.debug("Received callback, exchanging code for tokens");
    spinner.text = "Exchanging code for tokens...";
    const tokens = await exchangeCodeForTokens(
      result.code,
      codeVerifier,
      redirectUri,
      CLI_CLIENT_ID,
    );

    // Save credentials
    saveCredentials({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: Date.now() + tokens.expires_in * 1000,
      userEmail: "", // Will be populated from token payload
    });

    spinner.succeed(chalk.green("Logged in successfully!"));
  } catch (error) {
    spinner.fail(`Login failed: ${error instanceof Error ? error.message : "Unknown error"}`);
    process.exit(1);
  } finally {
    close?.();
  }
}
