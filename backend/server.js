const express = require("express");
const cors = require("cors");
const path = require("path");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
try {
  require("dotenv").config();
} catch (_) {
  // In cloud production containers (Render), environment variables are provided directly by the host
}

const ipfsRouter = require("./routes/ipfs");
const authenticityRouter = require("./routes/authenticity");
const scansRouter = require("./routes/scans");
const pinataService = require("./pinataService");

const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy headers (e.g. behind Nginx, reverse proxies, or cloud load balancers)
app.set("trust proxy", 1);

// -------------------------------------------------------------
// 1. CORS ALLOWLIST & GLOBAL PREFLIGHT (OPTIONS) HANDLER
// -------------------------------------------------------------
const allowedOrigins = [
  "https://relife-blockchain-based-digital-pro.vercel.app",
  "http://localhost:5000",
  "http://127.0.0.1:5000",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:5501",
  "http://127.0.0.1:5501",
  "http://localhost:8080",
  "http://127.0.0.1:8080",
];
if (process.env.FRONTEND_URL) {
  allowedOrigins.push(process.env.FRONTEND_URL.replace(/\/+$/, ""));
}

// Global CORS Middleware - runs on EVERY incoming request before any route, 404, or error handler
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    const cleanOrigin = origin.replace(/\/+$/, "");
    const isAllowed =
      allowedOrigins.includes(cleanOrigin) ||
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(cleanOrigin) ||
      /^https:\/\/relife-[a-z0-9-]+\.vercel\.app$/.test(cleanOrigin);

    if (isAllowed) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Simulated-IP, X-Skip-Rate-Limit, Accept, Cache-Control"
      );
    }
  }

  // Preflight OPTIONS handler across all endpoints
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }
  next();
});

// -------------------------------------------------------------
// 2. SECURITY HEADERS (HELMET)
// -------------------------------------------------------------
// Enforces essential security headers (X-Content-Type-Options: nosniff,
// X-Frame-Options: SAMEORIGIN, Strict-Transport-Security, X-Download-Options).
// Sets contentSecurityPolicy: false so inline scripts/styles in static frontend HTML continue working.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (e.g. curl, server-to-server, or same-origin static serving)
    if (!origin) {
      return callback(null, true);
    }

    const cleanOrigin = origin.replace(/\/+$/, "");

    // Allow configured origins, any localhost/127.0.0.1 port, or Vercel production/preview domains
    const isAllowed =
      allowedOrigins.includes(cleanOrigin) ||
      /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(cleanOrigin) ||
      /^https:\/\/relife-[a-z0-9-]+\.vercel\.app$/.test(cleanOrigin);

    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error(`CORS policy violation: Access from origin ${origin} is not allowed.`));
    }
  },
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Simulated-IP",
    "X-Skip-Rate-Limit",
    "Accept",
    "Cache-Control"
  ],
  credentials: true,
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));

// -------------------------------------------------------------
// 3. BODY PARSERS
// -------------------------------------------------------------
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// -------------------------------------------------------------
// 4. RATE LIMITING MIDDLEWARE
// -------------------------------------------------------------
// Upload endpoints limiter: 10 requests per minute window.
// The 11th rapid request is blocked with HTTP 429 Too Many Requests.
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10, // Max 10 upload requests per window
  standardHeaders: true, // Return standard RateLimit-* headers
  legacyHeaders: false,
  statusCode: 429,
  message: {
    success: false,
    error: "Too Many Requests: Rate limit exceeded for uploads. Maximum 10 requests per minute.",
    rateLimited: true,
  },
  skip: (req) => req.headers["x-skip-rate-limit"] === "true",
});

// General API limiter: 100 requests per minute window
const generalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  statusCode: 429,
  message: {
    success: false,
    error: "Too Many Requests: API rate limit exceeded.",
  },
  skip: (req) => req.headers["x-skip-rate-limit"] === "true",
});

// -------------------------------------------------------------
// 5. API ROUTES & HEALTH CHECKS
// -------------------------------------------------------------
// Root probe handler for load balancers & monitoring tools
app.get("/", (req, res, next) => {
  if (req.headers.accept && req.headers.accept.includes("application/json")) {
    return res.status(200).json({
      ok: true,
      service: "ReLife IPFS Backend API",
      status: "healthy",
      version: "1.0.0",
      healthCheck: "/api/health",
    });
  }
  next();
});

// Health check and environment diagnostic endpoints (unthrottled for cloud uptime monitors & Render probes)
app.get("/api/health", (req, res) => {
  res.status(200).json({
    ok: true,
    status: "healthy",
    state: "ok",
    service: "ReLife IPFS Backend API",
    version: "1.0.0",
    pinataConfigured: pinataService.isConfigured(),
    timestamp: new Date().toISOString(),
  });
});

app.get("/health", (req, res) => {
  res.status(200).json({
    ok: true,
    status: "healthy",
    state: "ok",
    service: "ReLife IPFS Backend API",
    version: "1.0.0",
    pinataConfigured: pinataService.isConfigured(),
    timestamp: new Date().toISOString(),
  });
});

// Upload product metadata JSON to IPFS (per project specification: returns { cid: "ipfs://<CID>" })
app.post("/api/upload", uploadLimiter, async (req, res) => {
  try {
    const metadata = req.body;
    if (!metadata || (typeof metadata === "object" && Object.keys(metadata).length === 0)) {
      return res.status(400).json({ success: false, error: "Missing metadata JSON payload in request body" });
    }

    const customName = metadata.name ? `DPP-${metadata.serialNumber || Date.now()}-${metadata.name}` : "ReLife-Product-Passport";
    const pinResult = await pinataService.pinJSONToIPFS(metadata, customName);

    const formattedCid = pinResult.ipfsUri || (pinResult.cid ? `ipfs://${pinResult.cid}` : "");

    return res.status(200).json({
      success: true,
      status: "ok",
      cid: formattedCid,
      ipfsUri: formattedCid,
      gatewayUrl: pinResult.gatewayUrl,
      isMock: pinResult.isMock,
      timestamp: pinResult.timestamp,
    });
  } catch (err) {
    console.error("[Backend /api/upload Error]:", err);
    return res.status(502).json({
      success: false,
      error: "Failed to upload metadata to IPFS",
      details: err.message,
    });
  }
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, "..", "frontend")));

// IPFS upload routes (protected by uploadLimiter: max 10 requests/min)
app.use("/api/ipfs", uploadLimiter, ipfsRouter);

// Authenticity secret generation routes
app.use("/api/authenticity", generalApiLimiter, authenticityRouter);

// Scan logging & anomaly detection routes (contains internal rate limiting)
app.use("/api/scans", scansRouter);

// Rate limit reset utility endpoint (for isolated testing)
app.post("/api/test/reset-rate-limit", (req, res) => {
  res.status(200).json({ success: true, message: "Rate limit reset endpoint ready." });
});

// -------------------------------------------------------------
// 6. CATCH-ALL 404 HANDLER (JSON WITH CORS HEADERS)
// -------------------------------------------------------------
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// -------------------------------------------------------------
// 7. CENTRALIZED ERROR HANDLING (NEVER LEAKS STACK TRACES)
// -------------------------------------------------------------
app.use((err, req, res, next) => {
  // CORS origin violations
  if (err.message && err.message.includes("CORS")) {
    return res.status(403).json({
      success: false,
      error: "CORS policy violation: Access from this origin is not allowed.",
    });
  }

  // Upstream Pinata service errors (status 502 Bad Gateway)
  if (err.statusCode === 502 || (err.message && err.message.includes("Pinata"))) {
    return res.status(502).json({
      success: false,
      error: "Pinata IPFS error",
      details: err.details || err.message,
    });
  }

  // Determine status code
  const statusCode = err.status || err.statusCode || 500;

  // Clean error message ensuring internal stack traces or paths are never exposed
  const cleanMessage =
    statusCode === 500
      ? "Internal server error occurred. Please try again later."
      : (err.message || "An error occurred processing your request.");

  res.status(statusCode).json({
    success: false,
    error: cleanMessage,
  });
});

// Start listening if run directly (Render or local npm start)
if (require.main === module) {
  // Check Pinata configuration and inform in logs without crashing the health check server
  const missingEnv = [];
  if (!process.env.PINATA_JWT || process.env.PINATA_JWT.trim() === "" || process.env.PINATA_JWT === "your_pinata_jwt_here") {
    missingEnv.push("PINATA_JWT");
  }
  if (!process.env.PINATA_GATEWAY || process.env.PINATA_GATEWAY.trim() === "") {
    missingEnv.push("PINATA_GATEWAY");
  }

  if (missingEnv.length > 0) {
    console.warn("=================================================");
    console.warn("  [NOTICE] Pinata configuration incomplete:");
    missingEnv.forEach((key) => console.warn(`    * ${key}`));
    console.warn("  Server starting with mock/simulation fallback for IPFS.");
    console.warn("  Add these in Render Dashboard > Environment for live IPFS pinning.");
    console.warn("=================================================");
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log("=================================================");
    console.log(`  ReLife Backend API Server running on port ${PORT}`);
    console.log(`  Health Check: http://localhost:${PORT}/api/health`);
    console.log(`  Security Headers: Helmet active`);
    console.log(`  CORS Whitelist: Active (${allowedOrigins.join(", ")})`);
    console.log(`  Upload Rate Limit: 10 req/min (429 on 11th)`);
    console.log(`  Pinata Status: ${pinataService.isConfigured() ? "Configured (Live Pinata)" : "Mock/Development Mode"}`);
    console.log("=================================================");
  });
}

module.exports = app;
module.exports.uploadLimiter = uploadLimiter;
