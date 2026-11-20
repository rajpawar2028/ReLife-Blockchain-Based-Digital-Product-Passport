const express = require("express");
const multer = require("multer");
const crypto = require("crypto");
const path = require("path");
const { ethers } = require("ethers");
const pinataService = require("../pinataService");

const router = express.Router();

// Strict whitelist of permitted product categories for Digital Product Passports
const ALLOWED_CATEGORIES = [
  // Categories from manufacturer form
  "Electronics & Smartphones",
  "Computers & Laptops",
  "Appliances",
  "Automotive & Batteries",
  "Apparel & Textiles",
  "Other",
  // Standard Circular Economy / DPP categories
  "Electronics",
  "Laptops & Computers",
  "Smartphones & Mobile",
  "Audio & Wearables",
  "Household Appliances",
  "Industrial Machinery",
  "Textiles & Apparel",
  "Vehicles & Mobility",
  "Batteries & Energy",
  "General Electronics",
];

// Configure multer memory storage (files stored strictly in RAM buffer, capped at 5MB, max 1 file)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 Megabytes limit
    files: 1, // Only 1 file per upload request
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/svg+xml",
      "application/pdf",
      "text/plain",
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Allowed types: JPEG, PNG, WEBP, SVG, PDF.`));
    }
  },
});

/**
 * Inspects raw buffer bytes to detect the true file content signature (magic numbers).
 * Defends against file extension spoofing (e.g. an .exe or script renamed to .png or .pdf).
 * @param {Buffer} buffer - File buffer in memory.
 * @returns {string} Detected MIME category or "unknown" / "executable".
 */
function detectFileSignature(buffer) {
  if (!buffer || buffer.length === 0) return null;

  // 1. Detect dangerous binary executable & archive headers
  // Windows PE executable (MZ = 0x4D, 0x5A)
  if (buffer.length >= 2 && buffer[0] === 0x4d && buffer[1] === 0x5a) {
    return "executable";
  }
  // Linux ELF binary (0x7F, 0x45, 0x4C, 0x46)
  if (buffer.length >= 4 && buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46) {
    return "executable";
  }
  // Mach-O binary (0xCA, 0xFE, 0xBA, 0xBE or 0xFE, 0xED, 0xFA, 0xCE/CF)
  if (
    buffer.length >= 4 &&
    ((buffer[0] === 0xca && buffer[1] === 0xfe && buffer[2] === 0xba && buffer[3] === 0xbe) ||
      (buffer[0] === 0xfe && buffer[1] === 0xed && buffer[2] === 0xfa && (buffer[3] === 0xce || buffer[3] === 0xcf)))
  ) {
    return "executable";
  }
  // ZIP / PK archive / JAR (0x50, 0x4B, 0x03, 0x04)
  if (buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04) {
    return "archive";
  }
  // Disguised HTML / JavaScript (<script, <!DOCTYPE, <html)
  const prefixStr = buffer.slice(0, Math.min(buffer.length, 128)).toString("utf8").toLowerCase();
  if (prefixStr.includes("<script") || prefixStr.includes("<!doctype html") || prefixStr.includes("<html")) {
    return "html_script";
  }

  // 2. Validate legitimate image & document content signatures
  // Real PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return "image/png";
  }

  // Real JPEG: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // Real WEBP: RIFF....WEBP (0x52 0x49 0x46 0x46 .... 0x57 0x45 0x42 0x50)
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }

  // Real PDF: %PDF- (0x25, 0x50, 0x44, 0x46, 0x2D)
  if (
    buffer.length >= 5 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2d
  ) {
    return "application/pdf";
  }

  // Valid plain-text / test inspection reports (printable ASCII/UTF-8 with no binary null bytes)
  if (!buffer.includes(0x00)) {
    return "text/plain";
  }

  return "unknown";
}

/**
 * @route   POST /api/ipfs/upload-metadata
 * @desc    Validates and pins product passport metadata JSON to Pinata IPFS
 * @access  Public (Protected by strict server-side validation & rate limiting)
 */
router.post("/upload-metadata", async (req, res, next) => {
  try {
    const {
      name,
      description,
      brand,
      model,
      serialNumber,
      category,
      materials,
      carbonFootprintKg,
      originCountry,
      recyclabilityScore,
      imageUri,
      additionalAttributes,
      warrantyMonths,
      warrantyCoverage,
      warrantyUnit,
      walletAddress,
      manufacturerAddress,
      ownerAddress,
    } = req.body;

    const errors = [];

    // 1. Mandatory text fields: type, non-empty, and trimmed length caps
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      errors.push("Missing or invalid 'name'");
    } else if (name.trim().length > 100) {
      errors.push("Field 'name' exceeds maximum length of 100 characters");
    }

    if (!description || typeof description !== "string" || description.trim().length === 0) {
      errors.push("Missing or invalid 'description'");
    } else if (description.trim().length > 2000) {
      errors.push("Field 'description' exceeds maximum length of 2000 characters");
    }

    if (!brand || typeof brand !== "string" || brand.trim().length === 0) {
      errors.push("Missing or invalid 'brand'");
    } else if (brand.trim().length > 100) {
      errors.push("Field 'brand' exceeds maximum length of 100 characters");
    }

    if (!serialNumber || typeof serialNumber !== "string" || serialNumber.trim().length === 0) {
      errors.push("Missing or invalid 'serialNumber'");
    } else if (serialNumber.trim().length > 100) {
      errors.push("Field 'serialNumber' exceeds maximum length of 100 characters");
    }

    // 2. Optional model & originCountry length bounds
    if (model !== undefined && model !== null) {
      if (typeof model !== "string") {
        errors.push("Invalid 'model': must be a string");
      } else if (model.trim().length > 100) {
        errors.push("Field 'model' exceeds maximum length of 100 characters");
      }
    }

    if (originCountry !== undefined && originCountry !== null) {
      if (typeof originCountry !== "string") {
        errors.push("Invalid 'originCountry': must be a string");
      } else if (originCountry.trim().length > 100) {
        errors.push("Field 'originCountry' exceeds maximum length of 100 characters");
      }
    }

    // 3. Category Whitelist Validation
    if (category !== undefined && category !== null && category !== "") {
      if (typeof category !== "string" || !ALLOWED_CATEGORIES.includes(category.trim())) {
        errors.push(`Invalid 'category': must be one of [${ALLOWED_CATEGORIES.join(", ")}]`);
      }
    }

    // 4. Numeric Range Validation
    if (carbonFootprintKg !== undefined && carbonFootprintKg !== null && carbonFootprintKg !== "") {
      const parsedCarbon = Number(carbonFootprintKg);
      if (isNaN(parsedCarbon) || parsedCarbon < 0 || parsedCarbon > 1000000) {
        errors.push("Invalid 'carbonFootprintKg': must be a number between 0 and 1,000,000");
      }
    }

    if (recyclabilityScore !== undefined && recyclabilityScore !== null && recyclabilityScore !== "") {
      const parsedScore = Number(recyclabilityScore);
      if (isNaN(parsedScore) || parsedScore < 0 || parsedScore > 100) {
        errors.push("Invalid 'recyclabilityScore': must be a number between 0 and 100");
      }
    }

    // 5. Ethereum Address Format Validation (if any wallet address is supplied)
    const checkAddressField = (addr, fieldName) => {
      if (addr !== undefined && addr !== null && addr !== "") {
        if (typeof addr !== "string" || !ethers.isAddress(addr.trim())) {
          errors.push(`Invalid '${fieldName}': must be a valid 42-character Ethereum address (0x...)`);
        }
      }
    };
    checkAddressField(walletAddress, "walletAddress");
    checkAddressField(manufacturerAddress, "manufacturerAddress");
    checkAddressField(ownerAddress, "ownerAddress");

    // 6. Warranty Validation
    if (warrantyMonths !== undefined && warrantyMonths !== null && warrantyMonths !== "") {
      const parsedMonths = Number(warrantyMonths);
      if (isNaN(parsedMonths) || !Number.isInteger(parsedMonths) || parsedMonths < 0 || parsedMonths > 120) {
        errors.push("Invalid 'warrantyMonths': must be an integer between 0 and 120");
      }
    }
    if (warrantyCoverage !== undefined && warrantyCoverage !== null) {
      if (typeof warrantyCoverage !== "string" || warrantyCoverage.length > 500) {
        errors.push("Invalid 'warrantyCoverage': must be a string up to 500 characters");
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: errors,
      });
    }

    // Standardized Digital Product Passport (DPP) metadata schema
    const passportMetadata = {
      standard: "ReLife-DPP-v1.0",
      name: name.trim(),
      description: description.trim(),
      brand: brand.trim(),
      model: (model || "").trim(),
      serialNumber: serialNumber.trim(),
      category: (category ? category.trim() : "General Electronics"),
      materials: Array.isArray(materials) ? materials : (materials ? [materials] : []),
      sustainability: {
        carbonFootprintKg: Number(carbonFootprintKg) || 0,
        originCountry: (originCountry || "Not Specified").trim(),
        recyclabilityScore: Number(recyclabilityScore) || 0,
      },
      image: imageUri || "",
      warranty: {
        periodMonths: Number(warrantyMonths) || 0,
        coverage: (warrantyCoverage || (Number(warrantyMonths) > 0 ? "Standard Manufacturer Warranty" : "No Warranty")).trim(),
      },
      attributes: additionalAttributes || [],
      createdAt: new Date().toISOString(),
    };

    // Upload to Pinata IPFS with explicit error handling and 502 status
    let pinResult;
    try {
      pinResult = await pinataService.pinJSONToIPFS(
        passportMetadata,
        `DPP-${serialNumber.trim()}-${name.trim()}`
      );
    } catch (pinErr) {
      return res.status(pinErr.statusCode || 502).json({
        success: false,
        error: "Pinata IPFS upload failed",
        details: pinErr.details || pinErr.message,
      });
    }

    return res.status(200).json({
      success: true,
      message: "Product metadata successfully pinned to IPFS",
      cid: pinResult.cid,
      ipfsUri: pinResult.ipfsUri,
      gatewayUrl: pinResult.gatewayUrl,
      isMock: pinResult.isMock,
      timestamp: pinResult.timestamp,
      metadata: passportMetadata,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * @route   POST /api/ipfs/upload-file
 * @desc    Uploads a physical document or image to IPFS with real content signature validation
 * @access  Public (Protected by 5MB cap, magic byte verification, and random file names)
 */
router.post("/upload-file", (req, res, next) => {
  upload.single("file")(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          error: "File size exceeds the 5MB limit.",
        });
      }
      return res.status(400).json({ success: false, error: err.message });
    } else if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }

    // 1. Enforce file presence
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No file uploaded. Please include a 'file' field in multipart/form-data.",
      });
    }

    // 2. Reject empty 0-byte files
    if (req.file.size === 0 || !req.file.buffer || req.file.buffer.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Empty file: Uploaded file contains 0 bytes.",
      });
    }

    // 3. Inspect real content signature (magic bytes)
    const detectedType = detectFileSignature(req.file.buffer);
    if (detectedType === "executable" || detectedType === "archive" || detectedType === "html_script") {
      return res.status(400).json({
        success: false,
        error: "Invalid file type: Disallowed or executable content signature detected.",
      });
    }

    if (detectedType === "unknown") {
      return res.status(400).json({
        success: false,
        error: "Invalid file type: File content signature does not match allowed image or PDF formats.",
      });
    }

    try {
      // 4. Generate cryptographically random file name to prevent directory traversal
      const originalExt = path.extname(req.file.originalname).toLowerCase();
      const safeExt = originalExt || (detectedType === "image/png" ? ".png" : detectedType === "image/jpeg" ? ".jpg" : detectedType === "application/pdf" ? ".pdf" : ".bin");
      const randomFilename = `${crypto.randomUUID()}${safeExt}`;

      let pinResult;
      try {
        pinResult = await pinataService.pinFileToIPFS(
          req.file.buffer,
          randomFilename,
          req.file.mimetype
        );
      } catch (pinErr) {
        return res.status(pinErr.statusCode || 502).json({
          success: false,
          error: "Pinata file upload failed",
          details: pinErr.details || pinErr.message,
        });
      }

      return res.status(200).json({
        success: true,
        message: "File successfully pinned to IPFS",
        cid: pinResult.cid,
        ipfsUri: pinResult.ipfsUri,
        gatewayUrl: pinResult.gatewayUrl,
        filename: req.file.originalname,
        storedFilename: randomFilename,
        randomFilename: randomFilename,
        size: pinResult.size,
        isMock: pinResult.isMock,
        timestamp: pinResult.timestamp,
      });
    } catch (uploadError) {
      next(uploadError);
    }
  });
});

module.exports = router;
module.exports.ALLOWED_CATEGORIES = ALLOWED_CATEGORIES;
module.exports.detectFileSignature = detectFileSignature;
