const request = require("supertest");
const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const app = require("../backend/server");
const config = require("../backend/config/scanConfig");

describe("Feature 5: Scan Counter & Counterfeit Anomaly Alert API", function () {
  beforeEach(async function () {
    // Reset test storage before each test case
    await request(app).post("/api/scans/test/reset");
  });

  after(async function () {
    // Clean up test storage after all tests
    await request(app).post("/api/scans/test/reset");
  });

  describe("1. Normal Scan Logging & Querying", function () {
    it("should record a new scan and return normal status for initial scans", async function () {
      const res = await request(app)
        .post("/api/scans/101")
        .set("X-Simulated-IP", "192.168.1.50");

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body.productId).to.equal("101");
      expect(res.body.totalScans).to.equal(1);
      expect(res.body.isSuspicious).to.be.false;
      expect(res.body.reasons).to.be.an("array").with.lengthOf(0);
      expect(res.body.warning).to.be.null;
    });

    it("should allow querying scan stats via GET without incrementing count", async function () {
      // Record 2 scans
      await request(app).post("/api/scans/102").set("X-Simulated-IP", "10.0.0.1");
      await request(app).post("/api/scans/102").set("X-Simulated-IP", "10.0.0.1");

      // Query via GET
      const getRes = await request(app).get("/api/scans/102");
      expect(getRes.status).to.equal(200);
      expect(getRes.body.totalScans).to.equal(2);
      expect(getRes.body.isSuspicious).to.be.false;

      // Query again to verify count did NOT increment on GET
      const getRes2 = await request(app).get("/api/scans/102");
      expect(getRes2.body.totalScans).to.equal(2);
    });

    it("should return zero scans for an unscanned product ID", async function () {
      const res = await request(app).get("/api/scans/9999");
      expect(res.status).to.equal(200);
      expect(res.body.totalScans).to.equal(0);
      expect(res.body.isSuspicious).to.be.false;
    });
  });

  describe("2. Counterfeit Detection: Scan Count Threshold (> 5 Scans)", function () {
    it("should remain normal up to 5 scans and trigger alert on the 6th scan", async function () {
      const pId = "200";

      // 1st to 5th scan from same IP
      for (let i = 1; i <= 5; i++) {
        const res = await request(app)
          .post(`/api/scans/${pId}`)
          .set("X-Simulated-IP", "172.16.0.10");
        expect(res.status).to.equal(200);
        expect(res.body.totalScans).to.equal(i);
        expect(res.body.isSuspicious).to.be.false;
      }

      // 6th scan exceeds SCAN_COUNT_THRESHOLD (5)
      const alertRes = await request(app)
        .post(`/api/scans/${pId}`)
        .set("X-Simulated-IP", "172.16.0.10");

      expect(alertRes.status).to.equal(200);
      expect(alertRes.body.totalScans).to.equal(6);
      expect(alertRes.body.isSuspicious).to.be.true;
      expect(alertRes.body.reasons.length).to.be.greaterThan(0);
      expect(alertRes.body.reasons[0]).to.include("Scan count threshold exceeded");
      expect(alertRes.body.warning).to.include("SUSPICIOUS COUNTERFEIT ALERT");
    });
  });

  describe("3. Counterfeit Detection: Velocity Anomaly (>= 3 Distinct IPs)", function () {
    it("should flag suspicious if scanned from 3 distinct network IPs in anomaly window", async function () {
      const pId = "300";

      // Scan 1: Network A
      const res1 = await request(app)
        .post(`/api/scans/${pId}`)
        .set("X-Simulated-IP", "198.51.100.1");
      expect(res1.body.distinctIpsInWindow).to.equal(1);
      expect(res1.body.isSuspicious).to.be.false;

      // Scan 2: Network B
      const res2 = await request(app)
        .post(`/api/scans/${pId}`)
        .set("X-Simulated-IP", "198.51.100.2");
      expect(res2.body.distinctIpsInWindow).to.equal(2);
      expect(res2.body.isSuspicious).to.be.false;

      // Scan 3: Network C (reaches DISTINCT_IPS_THRESHOLD of 3)
      const res3 = await request(app)
        .post(`/api/scans/${pId}`)
        .set("X-Simulated-IP", "198.51.100.3");
      expect(res3.body.distinctIpsInWindow).to.equal(3);
      expect(res3.body.isSuspicious).to.be.true;
      expect(res3.body.reasons.some((r) => r.includes("Velocity anomaly"))).to.be.true;
    });
  });

  describe("4. Privacy & GDPR Compliance Audit", function () {
    it("should never log or store raw IP addresses in scans.json", async function () {
      const rawIp = "203.0.113.88";
      await request(app)
        .post("/api/scans/401")
        .set("X-Simulated-IP", rawIp);

      const filePath = path.join(__dirname, "..", config.DATA_FILE_PATH);
      if (fs.existsSync(filePath)) {
        const fileContent = fs.readFileSync(filePath, "utf8");
        expect(fileContent).to.not.include(rawIp);
      }
    });
  });

  describe("5. Client Rate Limiting Protection", function () {
    it("should reject requests exceeding 20 scans per minute with HTTP 429", async function () {
      const clientIp = "192.0.2.77";

      // Fire 20 allowed requests
      for (let i = 0; i < config.RATE_LIMIT_MAX_REQUESTS; i++) {
        const res = await request(app)
          .post("/api/scans/500")
          .set("X-Forwarded-For", clientIp);
        expect(res.status).to.equal(200);
      }

      // 21st request should be rate-limited
      const limitedRes = await request(app)
        .post("/api/scans/500")
        .set("X-Forwarded-For", clientIp);

      expect(limitedRes.status).to.equal(429);
      expect(limitedRes.body.success).to.be.false;
      expect(limitedRes.body.error).to.include("Too Many Requests");
      expect(limitedRes.body).to.have.property("retryAfterSeconds");
    });
  });

  describe("6. Input Validation & Error Handling", function () {
    it("should reject non-numeric product ID parameters with 400 Bad Request", async function () {
      const postRes = await request(app).post("/api/scans/abc-invalid");
      expect(postRes.status).to.equal(400);
      expect(postRes.body.error).to.include("Invalid product ID");

      const getRes = await request(app).get("/api/scans/hack;drop");
      expect(getRes.status).to.equal(400);
      expect(getRes.body.error).to.include("Invalid product ID");
    });
  });
});
