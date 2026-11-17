const express = require("express");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const ipfsRouter = require("./routes/ipfs");
const authenticityRouter = require("./routes/authenticity");
const pinataService = require("./pinataService");

const app = express();
const PORT = process.env.PORT || 5000;

// Enable Cross-Origin Resource Sharing (CORS) for frontend clients
app.use(cors());

// Parse incoming JSON payloads with a 2MB limit
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true, limit: "2mb" }));

// Serve frontend static files if requested
app.use(express.static(path.join(__dirname, "..", "frontend")));

// Health check and environment diagnostic endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    service: "ReLife IPFS Backend API",
    version: "1.0.0",
    pinataConfigured: pinataService.isConfigured(),
    timestamp: new Date().toISOString(),
  });
});

// IPFS upload routes
app.use("/api/ipfs", ipfsRouter);

// Authenticity secret generation routes
app.use("/api/authenticity", authenticityRouter);

// Centralized error handling middleware
app.use((err, req, res, next) => {
  console.error("[Backend Error]", err.message);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || "Internal server error occurred",
  });
});

// Start listening if run directly
if (require.main === module) {
  app.listen(PORT, () => {
    console.log("=================================================");
    console.log(`  ReLife Backend API Server running on port ${PORT}`);
    console.log(`  Health Check: http://localhost:${PORT}/api/health`);
    console.log(`  Pinata Status: ${pinataService.isConfigured() ? "Configured (Live Pinata)" : "Mock/Development Mode"}`);
    console.log("=================================================");
  });
}

module.exports = app;

