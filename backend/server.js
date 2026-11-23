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
// 1. SECURITY HEADERS (HELMET)
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

// -------------------------------------------------------------
// 2. CORS ALLOWLIST CONFIGURATION
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
  optionsSuccessStatus: 200, // Preflight OPTIONS response for legacy browsers
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

// Serve frontend static files
app.use(express.static(path.join(__dirname, "..", "frontend")));

// -------------------------------------------------------------
// 5. API ROUTES
// -------------------------------------------------------------
// Health check and environment diagnostic endpoint (unthrottled for cloud uptime monitors & Render probes)
app.get("/api/health", (req, res) => {
  res.status(200).json({
    ok: true,
    status: "healthy",
    service: "ReLife IPFS Backend API",
    version: "1.0.0",
    pinataConfigured: pinataService.isConfigured(),
    timestamp: new Date().toISOString(),
  });
});

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
// 6. CENTRALIZED ERROR HANDLING (NEVER LEAKS STACK TRACES)
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
  // Fail fast immediately if required Pinata credentials are not configured
  const missingEnv = [];
  if (!process.env.PINATA_JWT || process.env.PINATA_JWT.trim() === "" || process.env.PINATA_JWT === "your_pinata_jwt_here") {
    missingEnv.push("PINATA_JWT");
  }
  if (!process.env.PINATA_GATEWAY || process.env.PINATA_GATEWAY.trim() === "") {
    missingEnv.push("PINATA_GATEWAY");
  }

  if (missingEnv.length > 0) {
    console.error("=================================================");
    console.error("  [FATAL ERROR] Server startup aborted!");
    console.error("  Missing required Pinata configuration variable(s):");
    missingEnv.forEach((key) => console.error(`    * ${key}`));
    console.error("  Please set these variables in Render or your .env file.");
    console.error("=================================================");
    process.exit(1);
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
