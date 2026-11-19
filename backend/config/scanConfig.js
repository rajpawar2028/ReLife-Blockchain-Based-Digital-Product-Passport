/**
 * ReLife - Scan Monitoring & Anomaly Detection Configuration
 * Centralized constants governing scan rate limits and counterfeit detection thresholds.
 */

module.exports = {
  // Threshold 1: Maximum cumulative scans before passport is flagged suspicious
  SCAN_COUNT_THRESHOLD: 5,

  // Threshold 2: Maximum distinct hashed IPs within the anomaly window
  DISTINCT_IPS_THRESHOLD: 3,

  // Sliding time window for velocity detection (10 minutes in milliseconds)
  ANOMALY_WINDOW_MS: 10 * 60 * 1000,

  // Client rate limiting window (1 minute in milliseconds)
  RATE_LIMIT_WINDOW_MS: 60 * 1000,

  // Maximum allowed scan API requests per client IP within the rate-limit window
  RATE_LIMIT_MAX_REQUESTS: 20,

  // Secret salt for HMAC-SHA256 IP anonymization (strictly eliminates raw PII)
  IP_HASH_SALT: process.env.IP_HASH_SALT || "relife-privacy-salt-2026-dpp",

  // Demo file-based persistence path
  // NOTE: On serverless platforms (e.g. Vercel), local filesystem is ephemeral/read-only.
  // In production cloud deployments, point to a managed database (e.g. Redis/Vercel KV/PostgreSQL).
  DATA_FILE_PATH: "backend/data/scans.json",
};
