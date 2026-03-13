import { env } from "./env";
import pc from "picocolors";

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 } as const;

const threshold = LEVELS[env.SAMPLEX_LOG_LEVEL];

export const log = {
  debug(...args: unknown[]) {
    if (threshold <= LEVELS.debug) {
      console.error(pc.gray("[debug]"), ...args);
    }
  },
  info(...args: unknown[]) {
    if (threshold <= LEVELS.info) {
      console.error(...args);
    }
  },
  warn(...args: unknown[]) {
    if (threshold <= LEVELS.warn) {
      console.error(pc.yellow("[warn]"), ...args);
    }
  },
  error(...args: unknown[]) {
    if (threshold <= LEVELS.error) {
      console.error(pc.red("[error]"), ...args);
    }
  },
};
