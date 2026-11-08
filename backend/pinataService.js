const axios = require("axios");
const FormData = require("form-data");
const crypto = require("crypto");
require("dotenv").config();

/**
 * Service encapsulating Pinata IPFS integration.
 * Supports both Pinata JWT (recommended) and API Key/Secret.
 * Falls back gracefully to deterministic cryptographic IPFS simulation
 * when API keys are not yet configured in local development.
 */
class PinataService {
  constructor() {
    this.jwt = process.env.PINATA_JWT || "";
    this.apiKey = process.env.PINATA_API_KEY || "";
    this.apiSecret = process.env.PINATA_API_SECRET || "";
    this.gateway = (process.env.PINATA_GATEWAY || "https://gateway.pinata.cloud/ipfs/").replace(/\/?$/, "/");

    // Local simulation storage for offline development & testing
    this.localMockStore = new Map();
  }

  /**
   * Checks if live Pinata credentials are configured.
   */
  isConfigured() {
    const hasJwt = Boolean(this.jwt && this.jwt !== "your_pinata_jwt_here" && this.jwt.trim().length > 10);
    const hasApiKeys = Boolean(
      this.apiKey &&
      this.apiKey !== "your_pinata_api_key_here" &&
      this.apiSecret &&
      this.apiSecret !== "your_pinata_api_secret_here"
    );
    return hasJwt || hasApiKeys;
  }

  /**
   * Generates authorization headers for Pinata API requests.
   */
  _getHeaders() {
    if (this.jwt && this.jwt !== "your_pinata_jwt_here") {
      return {
        Authorization: `Bearer ${this.jwt}`,
      };
    }
    return {
      pinata_api_key: this.apiKey,
      pinata_secret_api_key: this.apiSecret,
    };
  }

  /**
   * Generates a realistic IPFS v1 multihash CID from data buffer
   * for mock/offline testing.
   */
  _generateMockCID(buffer) {
    const hash = crypto.createHash("sha256").update(buffer).digest("hex");
    // Standard IPFS CIDv1 starts with "bafybei" followed by base32
    return `bafybei${hash.slice(0, 52)}`;
  }

  /**
   * Pins a JSON metadata object to IPFS.
   * @param {Object} metadataObject - Product passport metadata.
   * @param {string} [customName] - Optional name tag in Pinata dashboard.
   */
  async pinJSONToIPFS(metadataObject, customName = "ReLife-Passport-Metadata") {
    if (!this.isConfigured()) {
      const jsonBuffer = Buffer.from(JSON.stringify(metadataObject));
      const cid = this._generateMockCID(jsonBuffer);
      this.localMockStore.set(cid, metadataObject);

      return {
        success: true,
        isMock: true,
        cid: cid,
        ipfsUri: `ipfs://${cid}`,
        gatewayUrl: `${this.gateway}${cid}`,
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const payload = {
        pinataOptions: { cidVersion: 1 },
        pinataMetadata: { name: customName },
        pinataContent: metadataObject,
      };

      const response = await axios.post(
        "https://api.pinata.cloud/pinning/pinJSONToIPFS",
        payload,
        {
          headers: {
            "Content-Type": "application/json",
            ...this._getHeaders(),
          },
        }
      );

      const cid = response.data.IpfsHash;
      return {
        success: true,
        isMock: false,
        cid: cid,
        ipfsUri: `ipfs://${cid}`,
        gatewayUrl: `${this.gateway}${cid}`,
        timestamp: response.data.Timestamp || new Date().toISOString(),
      };
    } catch (error) {
      const errMsg = error.response?.data?.error?.details || error.response?.data?.message || error.message;
      throw new Error(`Pinata pinJSONToIPFS failed: ${errMsg}`);
    }
  }

  /**
   * Pins a binary file (image, PDF, diagnostic log) to IPFS.
   * @param {Buffer} fileBuffer - The binary file contents.
   * @param {string} originalName - Original filename.
   * @param {string} mimeType - File MIME type.
   */
  async pinFileToIPFS(fileBuffer, originalName, mimeType) {
    if (!this.isConfigured()) {
      const cid = this._generateMockCID(fileBuffer);
      this.localMockStore.set(cid, { originalName, mimeType, size: fileBuffer.length });

      return {
        success: true,
        isMock: true,
        cid: cid,
        ipfsUri: `ipfs://${cid}`,
        gatewayUrl: `${this.gateway}${cid}`,
        filename: originalName,
        size: fileBuffer.length,
        timestamp: new Date().toISOString(),
      };
    }

    try {
      const formData = new FormData();
      formData.append("file", fileBuffer, {
        filename: originalName,
        contentType: mimeType,
      });

      const pinataMetadata = JSON.stringify({
        name: `ReLife-${originalName}`,
      });
      formData.append("pinataMetadata", pinataMetadata);

      const pinataOptions = JSON.stringify({
        cidVersion: 1,
      });
      formData.append("pinataOptions", pinataOptions);

      const response = await axios.post(
        "https://api.pinata.cloud/pinning/pinFileToIPFS",
        formData,
        {
          maxBodyLength: "Infinity",
          headers: {
            ...formData.getHeaders(),
            ...this._getHeaders(),
          },
        }
      );

      const cid = response.data.IpfsHash;
      return {
        success: true,
        isMock: false,
        cid: cid,
        ipfsUri: `ipfs://${cid}`,
        gatewayUrl: `${this.gateway}${cid}`,
        filename: originalName,
        size: fileBuffer.length,
        timestamp: response.data.Timestamp || new Date().toISOString(),
      };
    } catch (error) {
      const errMsg = error.response?.data?.error?.details || error.response?.data?.message || error.message;
      throw new Error(`Pinata pinFileToIPFS failed: ${errMsg}`);
    }
  }
}

module.exports = new PinataService();

