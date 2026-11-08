const request = require("supertest");
const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const app = require("../backend/server");

describe("Phase 4: Backend Express API & IPFS Pinata Service", function () {
  describe("1. Health & Configuration Endpoint", function () {
    it("should respond with 200 OK and healthy status", async function () {
      const res = await request(app).get("/api/health");
      expect(res.status).to.equal(200);
      expect(res.body.status).to.equal("healthy");
      expect(res.body).to.have.property("pinataConfigured");
      expect(res.body).to.have.property("timestamp");
    });
  });

  describe("2. Metadata Upload Endpoint (/api/ipfs/upload-metadata)", function () {
    it("should accept valid passport metadata, pin to IPFS, and return a working ipfs:// CID", async function () {
      const validPayload = {
        name: "EcoBook Pro 14",
        description: "Carbon-neutral aluminum laptop designed for circularity.",
        brand: "CircuTech",
        model: "EB-14-2026",
        serialNumber: "SN-EB14-998822",
        category: "Laptops & Computers",
        materials: ["100% Recycled Aluminum", "Cobalt-free LFP Battery", "Recycled Ocean Plastics"],
        carbonFootprintKg: 42.5,
        originCountry: "Germany",
        recyclabilityScore: 94,
        imageUri: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
      };

      const res = await request(app)
        .post("/api/ipfs/upload-metadata")
        .send(validPayload);

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body).to.have.property("cid");
      expect(res.body.cid).to.be.a("string").with.lengthOf.at.least(10);
      expect(res.body.ipfsUri).to.equal(`ipfs://${res.body.cid}`);
      expect(res.body.gatewayUrl).to.include(res.body.cid);
      expect(res.body.metadata.name).to.equal("EcoBook Pro 14");
      expect(res.body.metadata.serialNumber).to.equal("SN-EB14-998822");
    });

    it("should reject metadata missing required fields with 400 Bad Request", async function () {
      const incompletePayload = {
        name: "Incomplete Device",
        // missing description, brand, and serialNumber
      };

      const res = await request(app)
        .post("/api/ipfs/upload-metadata")
        .send(incompletePayload);

      expect(res.status).to.equal(400);
      expect(res.body.success).to.be.false;
      expect(res.body.error).to.equal("Validation failed");
      expect(res.body.details).to.be.an("array").with.lengthOf(3);
    });

    it("should reject empty string values for required fields", async function () {
      const emptyFieldsPayload = {
        name: "   ",
        description: "Valid Description",
        brand: "",
        serialNumber: "SN-12345",
      };

      const res = await request(app)
        .post("/api/ipfs/upload-metadata")
        .send(emptyFieldsPayload);

      expect(res.status).to.equal(400);
      expect(res.body.success).to.be.false;
      expect(res.body.details).to.include("Missing or invalid 'name'");
      expect(res.body.details).to.include("Missing or invalid 'brand'");
    });
  });

  describe("3. File Upload Endpoint (/api/ipfs/upload-file)", function () {
    it("should upload a valid image/document and return an ipfs:// CID", async function () {
      const dummyFileBuffer = Buffer.from("Sample diagnostics inspection report for ReLife passport.");

      const res = await request(app)
        .post("/api/ipfs/upload-file")
        .attach("file", dummyFileBuffer, {
          filename: "diagnostics-report.pdf",
          contentType: "application/pdf",
        });

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body).to.have.property("cid");
      expect(res.body.ipfsUri).to.equal(`ipfs://${res.body.cid}`);
      expect(res.body.filename).to.equal("diagnostics-report.pdf");
      expect(res.body.size).to.equal(dummyFileBuffer.length);
    });

    it("should reject request when no file is attached", async function () {
      const res = await request(app).post("/api/ipfs/upload-file");
      expect(res.status).to.equal(400);
      expect(res.body.success).to.be.false;
      expect(res.body.error).to.include("No file uploaded");
    });

    it("should reject disallowed file formats (e.g. .exe)", async function () {
      const dummyBinary = Buffer.from("MZ dummy binary executable");

      const res = await request(app)
        .post("/api/ipfs/upload-file")
        .attach("file", dummyBinary, {
          filename: "malicious.exe",
          contentType: "application/x-msdownload",
        });

      expect(res.status).to.equal(400);
      expect(res.body.success).to.be.false;
      expect(res.body.error).to.include("Invalid file type");
    });
  });

  describe("4. Security Audit: Secret Isolation", function () {
    it("should guarantee that the frontend contains no private keys, JWTs or Pinata secrets", function () {
      const frontendDir = path.join(__dirname, "..", "frontend");
      const files = fs.readdirSync(frontendDir);

      for (const file of files) {
        const filePath = path.join(frontendDir, file);
        if (fs.statSync(filePath).isFile()) {
          const content = fs.readFileSync(filePath, "utf8");
          // Check for private key keywords or JWT tokens
          expect(content).to.not.include("PINATA_SECRET");
          expect(content).to.not.include("PINATA_JWT");
          expect(content).to.not.match(/ey[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/); // JWT regex
          expect(content).to.not.include("SEPOLIA_PRIVATE_KEY");
        }
      }
    });
  });
});

