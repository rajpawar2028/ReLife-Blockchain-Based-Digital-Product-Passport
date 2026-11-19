const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const config = require("../config/scanConfig");

const router = express.Router();

// Ensure data directory exists for file-based demo storage
const dataDir = path.dirname(path.join(__dirname, "..", "..", config.DATA_FILE_PATH));
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dataFilePath = path.join(__dirname, "..", "..", config.DATA_FILE_PATH);

// In-memory scans cache
let scans = [];

// Load existing scans from file if present
function loadScans() {
  try {
    if (fs.existsSync(dataFilePath)) {
      const content = fs.readFileSync(dataFilePath, "utf8");
      scans = JSON.parse(content);
    }
  } catch (err) {
    console.warn("[ScanStorage] Warning reading scans file, starting fresh:", err.message);
    scans = [];
  }
}
loadScans();

function saveScans() {
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(scans, null, 2), "utf8");
  } catch (err) {
    console.warn("[ScanStorage] Warning saving scans file:", err.message);
  }
}

/**
 * Anonymizes client IP address using HMAC-SHA256 with a salt.
 * PRIVACY GUARANTEE: Raw IP addresses are NEVER stored or logged.
 */
function hashClientIp(ip) {
  const cleanIp = (ip || "127.0.0.1").trim();
  return crypto.createHmac("sha256", config.IP_HASH_SALT).update(cleanIp).digest("hex");
}

/**
 * In-Memory Sliding Window Rate Limiter
 */
const rateLimitMap = new Map();

function rateLimiter(req, res, next) {
  const clientIp = req.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress || "127.0.0.1";
  const hashedIp = hashClientIp(clientIp);
  const now = Date.now();

  const history = rateLimitMap.get(hashedIp) || [];
  const recentHistory = history.filter((ts) => now - ts < config.RATE_LIMIT_WINDOW_MS);

  if (recentHistory.length >= config.RATE_LIMIT_MAX_REQUESTS) {
    return res.status(429).json({
      success: false,
      error: "Too Many Requests: Rate limit exceeded. Please wait a minute before scanning again.",
      retryAfterSeconds: Math.ceil((config.RATE_LIMIT_WINDOW_MS - (now - recentHistory[0])) / 1000),
    });
  }

  recentHistory.push(now);
  rateLimitMap.set(hashedIp, recentHistory);
  req.hashedClientIp = hashedIp;
  next();
}

/**
 * Evaluates whether a product passport's scan profile indicates counterfeit duplication.
 */
function evaluateAnomaly(productId) {
  const now = Date.now();
  const productScans = scans.filter((s) => s.productId === productId.toString());
  const totalScans = productScans.length;

  // Windowed scans for velocity check
  const windowScans = productScans.filter((s) => now - s.timestamp <= config.ANOMALY_WINDOW_MS);
  const distinctIpsInWindow = new Set(windowScans.map((s) => s.hashedIp)).size;
  const allTimeDistinctIps = new Set(productScans.map((s) => s.hashedIp)).size;

  const reasons = [];

  if (totalScans > config.SCAN_COUNT_THRESHOLD) {
    reasons.push(
      `Scan count threshold exceeded: Passport scanned ${totalScans} times (Threshold: > ${config.SCAN_COUNT_THRESHOLD})`
    );
  }

  if (distinctIpsInWindow >= config.DISTINCT_IPS_THRESHOLD) {
    reasons.push(
      `Velocity anomaly: Scanned from ${distinctIpsInWindow} distinct locations within ${config.ANOMALY_WINDOW_MS / 60000} minutes (Threshold: >= ${config.DISTINCT_IPS_THRESHOLD})`
    );
  }

  const isSuspicious = reasons.length > 0;

  return {
    productId: productId.toString(),
    totalScans,
    recentScansInWindow: windowScans.length,
    distinctIpsInWindow,
    allTimeDistinctIps,
    isSuspicious,
    reasons,
    warning: isSuspicious
      ? `SUSPICIOUS COUNTERFEIT ALERT: This passport has been scanned ${totalScans} times across ${allTimeDistinctIps} distinct networks. A physical QR tag may have been photocopied or cloned onto counterfeit hardware.`
      : null,
  };
}

/**
 * POST /api/scans/:id
 * Records a new scan for product :id and evaluates anomaly thresholds.
 */
router.post("/:id", rateLimiter, (req, res) => {
  const productId = req.params.id;

  if (!productId || !/^\d+$/.test(productId)) {
    return res.status(400).json({ success: false, error: "Invalid product ID parameter" });
  }

  // Allow simulated IP header for automated multi-IP test verification
  const effectiveIp = req.headers["x-simulated-ip"]
    ? hashClientIp(req.headers["x-simulated-ip"])
    : req.hashedClientIp;

  const now = Date.now();

  scans.push({
    productId: productId.toString(),
    timestamp: now,
    hashedIp: effectiveIp,
  });

  saveScans();

  const metrics = evaluateAnomaly(productId);

  res.status(200).json({
    success: true,
    ...metrics,
    thresholds: {
      maxScans: config.SCAN_COUNT_THRESHOLD,
      maxDistinctIps: config.DISTINCT_IPS_THRESHOLD,
      windowMinutes: config.ANOMALY_WINDOW_MS / 60000,
    },
  });
});

/**
 * GET /api/scans/:id
 * Queries current scan statistics and counterfeit alert status without recording a new scan.
 */
router.get("/:id", rateLimiter, (req, res) => {
  const productId = req.params.id;

  if (!productId || !/^\d+$/.test(productId)) {
    return res.status(400).json({ success: false, error: "Invalid product ID parameter" });
  }

  const metrics = evaluateAnomaly(productId);

  res.status(200).json({
    success: true,
    ...metrics,
    thresholds: {
      maxScans: config.SCAN_COUNT_THRESHOLD,
      maxDistinctIps: config.DISTINCT_IPS_THRESHOLD,
      windowMinutes: config.ANOMALY_WINDOW_MS / 60000,
    },
  });
});

/**
 * POST /api/scans/reset (Testing / Admin Utility)
 */
router.post("/test/reset", (req, res) => {
  scans = [];
  rateLimitMap.clear();
  try {
    if (fs.existsSync(dataFilePath)) {
      fs.unlinkSync(dataFilePath);
    }
  } catch (_) {}
  res.status(200).json({ success: true, message: "Scan storage and rate limits reset." });
});

module.exports = router;
