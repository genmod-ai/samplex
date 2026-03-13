export const env = {
  SAMPLEX_API_URL: process.env.SAMPLEX_API_URL || "https://sample.app",
  SAMPLEX_LOG_LEVEL: (process.env.SAMPLEX_LOG_LEVEL || "info") as
    | "debug"
    | "info"
    | "warn"
    | "error"
    | "silent",
  SAMPLE_API_KEY: process.env.SAMPLE_API_KEY || "",
};
