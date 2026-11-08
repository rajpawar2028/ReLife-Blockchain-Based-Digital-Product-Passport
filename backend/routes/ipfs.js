const express = require("express");
const multer = require("multer");
const pinataService = require("../pinataService");

const router = express.Router();

// Configure multer memory storage (files stored in RAM buffer, max 10MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 Megabytes limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/svg+xml",
      "application/pdf",
      "application/json",
      "text/plain",
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${file.mimetype}. Allowed types: JPEG, PNG, WEBP, SVG, PDF, JSON.`));
    }
  },
});

/**
 * @route   POST /api/ipfs/upload-metadata
 * @desc    Validates and pins product passport metadata JSON to Pinata IPFS
 * @access  Public (Protected by input validation)
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
    } = req.body;

    // Strict input validation
    const errors = [];
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      errors.push("Missing or invalid 'name'");
    }
    if (!description || typeof description !== "string" || description.trim().length === 0) {
      errors.push("Missing or invalid 'description'");
    }
    if (!brand || typeof brand !== "string" || brand.trim().length === 0) {
      errors.push("Missing or invalid 'brand'");
    }
    if (!serialNumber || typeof serialNumber !== "string" || serialNumber.trim().length === 0) {
      errors.push("Missing or invalid 'serialNumber'");
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        error: "Validation failed",
        details: errors,
      });
    }

    // Structure standardized Digital Product Passport (DPP) metadata schema
    const passportMetadata = {
      standard: "ReLife-DPP-v1.0",
      name: name.trim(),
      description: description.trim(),
      brand: brand.trim(),
      model: (model || "").trim(),
      serialNumber: serialNumber.trim(),
      category: (category || "General Electronics").trim(),
      materials: Array.isArray(materials) ? materials : (materials ? [materials] : []),
      sustainability: {
        carbonFootprintKg: Number(carbonFootprintKg) || 0,
        originCountry: (originCountry || "Not Specified").trim(),
        recyclabilityScore: Number(recyclabilityScore) || 0,
      },
      image: imageUri || "",
      attributes: additionalAttributes || [],
      createdAt: new Date().toISOString(),
    };

    // Upload to Pinata IPFS
    const pinResult = await pinataService.pinJSONToIPFS(
      passportMetadata,
      `DPP-${serialNumber.trim()}-${name.trim()}`
    );

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
 * @desc    Uploads a physical document (image, test report, certificate) to IPFS
 * @access  Public
 */
router.post("/upload-file", (req, res, next) => {
  upload.single("file")(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          success: false,
          error: "File size exceeds the 10MB limit.",
        });
      }
      return res.status(400).json({ success: false, error: err.message });
    } else if (err) {
      return res.status(400).json({ success: false, error: err.message });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: "No file uploaded. Please include a 'file' field in multipart/form-data.",
      });
    }

    try {
      const pinResult = await pinataService.pinFileToIPFS(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype
      );

      return res.status(200).json({
        success: true,
        message: "File successfully pinned to IPFS",
        cid: pinResult.cid,
        ipfsUri: pinResult.ipfsUri,
        gatewayUrl: pinResult.gatewayUrl,
        filename: pinResult.filename,
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

