import * as pkg from "../../package.json";
function loadVersion(): string {
  return pkg.version ?? "0.0.0";
}

export const CLI_VERSION = loadVersion();
export const USER_AGENT = `samplex-cli/${CLI_VERSION}`;
