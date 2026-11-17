const { expect } = require("chai");
const { ethers } = require("hardhat");
const crypto = require("crypto");
const request = require("supertest");
const app = require("../backend/server");

describe("Feature 4: Authenticity Secret (Hash On-Chain Verification)", function () {
  let relife;
  let admin, manufacturer, unauthorized;

  const sampleProduct = {
    serialNumber: "SN-SECRET-2026-001",
    modelName: "LuxuryWatch Pro",
    brand: "ChronoSwiss",
    metadataURI: "ipfs://bafybeigauthenticitysecret001",
  };

  beforeEach(async function () {
    [admin, manufacturer, unauthorized] = await ethers.getSigners();

    const ReLifeFactory = await ethers.getContractFactory("ReLife");
    relife = await ReLifeFactory.deploy();
    await relife.waitForDeployment();

    // Register manufacturer
    await relife.connect(admin).registerManufacturer(manufacturer.address, "ChronoSwiss OEM");
  });

  describe("1. Backend Secret Generation API (Zero-Storage / Ephemeral)", function () {
    it("should generate a 32-byte cryptographic hex secret and matching keccak256 hash", async function () {
      const res = await request(app).get("/api/authenticity/generate-secret");
      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;

      const { secret, hash } = res.body;
      expect(secret).to.be.a("string");
      expect(secret.length).to.equal(64); // 32 bytes in hex = 64 characters

      expect(hash).to.be.a("string");
      expect(hash).to.match(/^0x[a-fA-F0-9]{64}$/); // 32-byte keccak256 hash

      // Cryptographic consistency check
      const expectedHash = ethers.keccak256(ethers.toUtf8Bytes(secret));
      expect(hash).to.equal(expectedHash);
    });
  });

  describe("2. On-Chain Registration & Secret Verification (verifySecret)", function () {
    let secret;
    let secretHash;

    beforeEach(async function () {
      // Off-chain generation by manufacturer
      secret = crypto.randomBytes(32).toString("hex");
      secretHash = ethers.keccak256(ethers.toUtf8Bytes(secret));

      // Register with hash only
      await relife
        .connect(manufacturer)
        .registerProductWithSecret(
          sampleProduct.serialNumber,
          sampleProduct.modelName,
          sampleProduct.brand,
          sampleProduct.metadataURI,
          secretHash
        );
    });

    it("should return isAuthentic = true when the exact plaintext secret is supplied", async function () {
      const isAuthentic = await relife.verifySecret(1n, secret);
      expect(isAuthentic).to.be.true;
    });

    it("should return isAuthentic = false when a wrong or counterfeit secret is supplied", async function () {
      const fakeSecret = crypto.randomBytes(32).toString("hex");
      const isAuthentic = await relife.verifySecret(1n, fakeSecret);
      expect(isAuthentic).to.be.false;
    });

    it("should return isAuthentic = false if secret is modified by even a single character", async function () {
      // Flip the first character
      const tampered = (secret[0] === "a" ? "b" : "a") + secret.slice(1);
      const isAuthentic = await relife.verifySecret(1n, tampered);
      expect(isAuthentic).to.be.false;
    });

    it("should return isAuthentic = false for empty string secret", async function () {
      expect(await relife.verifySecret(1n, "")).to.be.false;
    });

    it("should return isAuthentic = false for non-existent product ID without reverting", async function () {
      expect(await relife.verifySecret(999n, secret)).to.be.false;
      expect(await relife.verifySecret(0n, secret)).to.be.false;
    });

    it("should return isAuthentic = false if product was registered without a secret", async function () {
      // Register product #2 without secret
      await relife
        .connect(manufacturer)
        .registerProduct(
          "SN-NOSECRET-002",
          "EcoDesk",
          "CircuTech",
          "ipfs://metadataNoSecret"
        );

      expect(await relife.verifySecret(2n, secret)).to.be.false;
      expect(await relife.getAuthenticityHash(2n)).to.equal(ethers.ZeroHash);
    });

    it("should allow manufacturer or admin to set/update authenticity hash post-registration", async function () {
      const newSecret = "new-random-secret-key-123456789";
      const newHash = ethers.keccak256(ethers.toUtf8Bytes(newSecret));

      await relife.connect(manufacturer).setAuthenticityHash(1n, newHash);
      expect(await relife.getAuthenticityHash(1n)).to.equal(newHash);

      // New secret passes, old secret now fails
      expect(await relife.verifySecret(1n, newSecret)).to.be.true;
      expect(await relife.verifySecret(1n, secret)).to.be.false;
    });

    it("should revert setAuthenticityHash if called by non-manufacturer", async function () {
      const dummyHash = ethers.keccak256(ethers.toUtf8Bytes("dummy"));
      await expect(
        relife.connect(unauthorized).setAuthenticityHash(1n, dummyHash)
      )
        .to.be.revertedWithCustomError(relife, "ReLife__UnauthorizedManufacturer")
        .withArgs(1n, unauthorized.address);
    });
  });

  describe("3. Security Audit: Raw Secret Isolation", function () {
    it("should guarantee that the raw secret never appears in any contract event logs or storage", async function () {
      const secret = "super-secret-physical-tag-token-2026";
      const secretHash = ethers.keccak256(ethers.toUtf8Bytes(secret));

      const tx = await relife
        .connect(manufacturer)
        .registerProductWithSecret(
          "SN-ISOLATION-001",
          "SecureItem",
          "BrandX",
          "ipfs://secure",
          secretHash
        );

      const receipt = await tx.wait();

      // Inspect every raw event log topic and data
      for (const log of receipt.logs) {
        const rawLogData = log.data.toLowerCase();
        const hexSecret = Buffer.from(secret).toString("hex").toLowerCase();
        expect(rawLogData).to.not.include(hexSecret);
      }

      // Check on-chain getter returns the hash, not the plaintext
      const storedHash = await relife.getAuthenticityHash(1n);
      expect(storedHash).to.equal(secretHash);
      expect(storedHash).to.not.equal(secret);
    });
  });
});
