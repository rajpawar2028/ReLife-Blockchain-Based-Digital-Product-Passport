const request = require("supertest");
const { expect } = require("chai");
const crypto = require("crypto");
const app = require("../backend/server");
const { ALLOWED_CATEGORIES } = require("../backend/routes/ipfs");

describe("Area 4: Backend Input Validation, File Hardening & Rate Limiting", function () {
  const validMetadata = {
    name: "Fairphone Circular 5",
    description: "Modular, ethically sourced circular smartphone designed for repairability.",
    brand: "Fairphone",
    model: "FP5-5G",
    serialNumber: `SN-FP5-${Date.now()}`,
    category: "Smartphones & Mobile",
    materials: ["Fairtrade Gold", "Post-Consumer Recycled Plastics", "Conflict-Free Tungsten"],
    carbonFootprintKg: 35.8,
    originCountry: "Netherlands",
    recyclabilityScore: 95,
    warrantyMonths: 24,
    warrantyCoverage: "Full 2-Year Hardware Coverage",
    manufacturerAddress: "0x315550A78C276cEb7fa5F54EeE91A03e2fb72dcc",
  };

  describe("1. Metadata Field Validation (Types, Trimming & Length Bounds)", function () {
    it("should accept valid payload with valid types and allowed category", async function () {
      const res = await request(app)
        .post("/api/ipfs/upload-metadata")
        .set("x-skip-rate-limit", "true")
        .send(validMetadata);

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body.cid).to.be.a("string");
      expect(res.body.metadata.category).to.equal("Smartphones & Mobile");
    });

    it("should reject missing or empty required string fields", async function () {
      const res = await request(app)
        .post("/api/ipfs/upload-metadata")
        .set("x-skip-rate-limit", "true")
        .send({
          name: "   ",
          description: "",
          brand: "   ",
          serialNumber: "",
        });

      expect(res.status).to.equal(400);
      expect(res.body.success).to.be.false;
      expect(res.body.details).to.include("Missing or invalid 'name'");
      expect(res.body.details).to.include("Missing or invalid 'description'");
      expect(res.body.details).to.include("Missing or invalid 'brand'");
      expect(res.body.details).to.include("Missing or invalid 'serialNumber'");
    });

    it("should reject oversized string fields (> 100 chars for name/brand/serial, > 2000 chars for description)", async function () {
      const oversizedPayload = {
        ...validMetadata,
        name: "A".repeat(101),
        brand: "B".repeat(101),
        model: "M".repeat(101),
        serialNumber: "S".repeat(101),
        originCountry: "C".repeat(101),
        description: "D".repeat(2001),
      };

      const res = await request(app)
        .post("/api/ipfs/upload-metadata")
        .set("x-skip-rate-limit", "true")
        .send(oversizedPayload);

      expect(res.status).to.equal(400);
      expect(res.body.success).to.be.false;
      expect(res.body.details.some((d) => d.includes("Field 'name' exceeds maximum length"))).to.be.true;
      expect(res.body.details.some((d) => d.includes("Field 'brand' exceeds maximum length"))).to.be.true;
      expect(res.body.details.some((d) => d.includes("Field 'model' exceeds maximum length"))).to.be.true;
      expect(res.body.details.some((d) => d.includes("Field 'serialNumber' exceeds maximum length"))).to.be.true;
      expect(res.body.details.some((d) => d.includes("Field 'originCountry' exceeds maximum length"))).to.be.true;
      expect(res.body.details.some((d) => d.includes("Field 'description' exceeds maximum length"))).to.be.true;
    });

    it("should reject category not present in allowed categories whitelist", async function () {
      const res = await request(app)
        .post("/api/ipfs/upload-metadata")
        .set("x-skip-rate-limit", "true")
        .send({
          ...validMetadata,
          category: "Unregulated Crypto Assets",
        });

      expect(res.status).to.equal(400);
      expect(res.body.success).to.be.false;
      expect(res.body.details.some((d) => d.includes("Invalid 'category'"))).to.be.true;
    });

    it("should reject out-of-range numeric values (carbon footprint & recyclability score)", async function () {
      const res = await request(app)
        .post("/api/ipfs/upload-metadata")
        .set("x-skip-rate-limit", "true")
        .send({
          ...validMetadata,
          carbonFootprintKg: -10,
          recyclabilityScore: 105,
        });

      expect(res.status).to.equal(400);
      expect(res.body.success).to.be.false;
      expect(res.body.details.some((d) => d.includes("carbonFootprintKg"))).to.be.true;
      expect(res.body.details.some((d) => d.includes("recyclabilityScore"))).to.be.true;
    });

    it("should reject invalid Ethereum wallet address format via ethers.isAddress", async function () {
      const res = await request(app)
        .post("/api/ipfs/upload-metadata")
        .set("x-skip-rate-limit", "true")
        .send({
          ...validMetadata,
          manufacturerAddress: "0xNotAValidEthereumAddress12345",
        });

      expect(res.status).to.equal(400);
      expect(res.body.success).to.be.false;
      expect(res.body.details.some((d) => d.includes("Invalid 'manufacturerAddress'"))).to.be.true;
    });

    it("should reject warrantyMonths > 120 or negative, and warrantyCoverage > 500 chars", async function () {
      const res = await request(app)
        .post("/api/ipfs/upload-metadata")
        .set("x-skip-rate-limit", "true")
        .send({
          ...validMetadata,
          warrantyMonths: 150,
          warrantyCoverage: "X".repeat(501),
        });

      expect(res.status).to.equal(400);
      expect(res.body.success).to.be.false;
      expect(res.body.details.some((d) => d.includes("warrantyMonths"))).to.be.true;
      expect(res.body.details.some((d) => d.includes("warrantyCoverage"))).to.be.true;
    });
  });

  describe("2. File Upload Hardening (Magic Bytes, Size & Random File Names)", function () {
    it("should accept valid PNG file with legitimate 8-byte PNG magic header", async function () {
      // 8-byte PNG signature: 89 50 4E 47 0D 0A 1A 0A
      const pngHeader = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00]);
      const res = await request(app)
        .post("/api/ipfs/upload-file")
        .set("x-skip-rate-limit", "true")
        .attach("file", pngHeader, "test-image.png");

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body).to.have.property("cid");
      expect(res.body.storedFilename).to.match(/^[0-9a-fA-F-]{36}\.png$/); // Random UUID filename
    });

    it("should accept valid JPEG file with legitimate FF D8 FF magic header", async function () {
      const jpegHeader = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
      const res = await request(app)
        .post("/api/ipfs/upload-file")
        .set("x-skip-rate-limit", "true")
        .attach("file", jpegHeader, "product-photo.jpg");

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body.storedFilename).to.match(/^[0-9a-fA-F-]{36}\.jpg$/);
    });

    it("should accept valid PDF file starting with %PDF- header", async function () {
      const pdfHeader = Buffer.from("%PDF-1.7\nSample Circular Compliance Certificate");
      const res = await request(app)
        .post("/api/ipfs/upload-file")
        .set("x-skip-rate-limit", "true")
        .attach("file", pdfHeader, "certificate.pdf");

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body.storedFilename).to.match(/^[0-9a-fA-F-]{36}\.pdf$/);
    });

    it("should reject 0-byte empty file upload", async function () {
      const emptyBuffer = Buffer.alloc(0);
      const res = await request(app)
        .post("/api/ipfs/upload-file")
        .set("x-skip-rate-limit", "true")
        .attach("file", emptyBuffer, "empty.pdf");

      expect(res.status).to.equal(400);
      expect(res.body.success).to.be.false;
      expect(res.body.error).to.include("Empty file");
    });

    it("should reject executable disguised as image/PDF by checking content signature (MZ header)", async function () {
      // Windows PE executable header: 'MZ' (0x4D, 0x5A) disguised as .pdf
      const fakePdfBuffer = Buffer.concat([Buffer.from([0x4d, 0x5a, 0x90, 0x00]), Buffer.from("Executable Payload")]);
      const res = await request(app)
        .post("/api/ipfs/upload-file")
        .set("x-skip-rate-limit", "true")
        .attach("file", fakePdfBuffer, {
          filename: "malware-disguised.pdf",
          contentType: "application/pdf",
        });

      expect(res.status).to.equal(400);
      expect(res.body.success).to.be.false;
      expect(res.body.error).to.include("Invalid file type: Disallowed or executable content signature detected");
    });

    it("should reject HTML/script injection disguised as image", async function () {
      const xssBuffer = Buffer.from("<script>alert('xss attack')</script>");
      const res = await request(app)
        .post("/api/ipfs/upload-file")
        .set("x-skip-rate-limit", "true")
        .attach("file", xssBuffer, {
          filename: "exploit.png",
          contentType: "image/png",
        });

      expect(res.status).to.equal(400);
      expect(res.body.success).to.be.false;
      expect(res.body.error).to.include("Invalid file type");
    });

    it("should reject file exceeding 5MB cap with clear message", async function () {
      // Create a 5.2 MB buffer
      const oversizedBuffer = Buffer.alloc(5.2 * 1024 * 1024, 0x41);
      const res = await request(app)
        .post("/api/ipfs/upload-file")
        .set("x-skip-rate-limit", "true")
        .attach("file", oversizedBuffer, "large-file.pdf");

      expect(res.status).to.equal(400);
      expect(res.body.success).to.be.false;
      expect(res.body.error).to.include("File size exceeds");
    });
  });

  describe("3. Security Headers (Helmet) & CORS Whitelist", function () {
    it("should include standard Helmet security headers on responses", async function () {
      const res = await request(app).get("/api/health");
      expect(res.headers).to.have.property("x-content-type-options", "nosniff");
      expect(res.headers).to.have.property("x-frame-options", "SAMEORIGIN");
    });

    it("should reject unauthorized origins not in CORS allowlist with HTTP 403", async function () {
      const res = await request(app)
        .get("/api/health")
        .set("Origin", "https://malicious-counterfeiter-site.com");

      expect(res.status).to.equal(403);
      expect(res.body.success).to.be.false;
      expect(res.body.error).to.include("CORS policy violation");
    });

    it("should allow whitelisted frontend origin", async function () {
      const res = await request(app)
        .get("/api/health")
        .set("Origin", "http://localhost:5000");

      expect(res.status).to.equal(200);
      expect(res.headers["access-control-allow-origin"]).to.equal("http://localhost:5000");
    });
  });

  describe("4. Express Rate Limiting (Upload API: 11th Rapid Request Blocked)", function () {
    it("should allow up to 10 rapid upload requests, then reject the 11th request with HTTP 429", async function () {
      // Use an isolated simulated IP header for rate limit test
      const testIp = `192.168.100.${Math.floor(Math.random() * 200) + 10}`;

      const payload = {
        name: "Test Rate Limit Device",
        description: "Checking rate limit window capacity.",
        brand: "TestBrand",
        serialNumber: "SN-RATE-TEST",
      };

      // Send 10 rapid upload requests
      for (let i = 1; i <= 10; i++) {
        const res = await request(app)
          .post("/api/ipfs/upload-metadata")
          .set("X-Forwarded-For", testIp)
          .send(payload);

        // Requests 1 to 10 should not be rate-limited (status 200)
        expect(res.status).to.equal(200);
      }

      // 11th rapid request must be blocked with HTTP 429 Too Many Requests
      const blockedRes = await request(app)
        .post("/api/ipfs/upload-metadata")
        .set("X-Forwarded-For", testIp)
        .send(payload);

      expect(blockedRes.status).to.equal(429);
      expect(blockedRes.body.success).to.be.false;
      expect(blockedRes.body.error).to.include("Too Many Requests: Rate limit exceeded for uploads");
    });
  });
});
