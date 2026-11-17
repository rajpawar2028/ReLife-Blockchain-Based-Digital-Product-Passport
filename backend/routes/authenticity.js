const express = require("express");
const crypto = require("crypto");
const { ethers } = require("ethers");

const router = express.Router();

/**
 * GET /api/authenticity/generate-secret
 * Generates an ephemeral cryptographically random 32-byte secret and computes its keccak256 hash.
 * 
 * SECURITY RULES ENFORCED:
 * 1. The plaintext secret is NEVER logged (no console.log).
 * 2. The secret is NEVER stored in any database or file system.
 * 3. The secret is NEVER committed to git.
 * 4. Only the keccak256 hash is placed on-chain. The plaintext secret is embedded strictly
 *    in the physical QR / tamper-evident label URL.
 */
router.get("/generate-secret", (req, res) => {
  try {
    // Generate 32 bytes of cryptographic randomness (64-char hex string)
    const secret = crypto.randomBytes(32).toString("hex");

    // Compute keccak256 hash using standard UTF-8 string encoding
    const hash = ethers.keccak256(ethers.toUtf8Bytes(secret));

    res.status(200).json({
      success: true,
      secret,
      hash,
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      error: "Failed to generate cryptographic authenticity secret",
    });
  }
});

module.exports = router;
