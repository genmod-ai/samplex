export const env = {
  SMPL_API_URL: process.env.SMPL_API_URL || "https://sample.app",
  SMPL_LOG_LEVEL: (process.env.SMPL_LOG_LEVEL || "info") as
    | "debug"
    | "info"
    | "warn"
    | "error"
    | "silent",
};
