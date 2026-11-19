const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const request = require("supertest");
const app = require("../backend/server");
const { scanFileContent, JWT_REGEX, PRIVATE_KEY_ASSIGN_REGEX } = require("../scripts/check-secrets");

describe("Area 5: Secrets Hygiene & Pre-Commit Protection", function () {
  const repoRoot = path.resolve(__dirname, "..");
  const frontendDir = path.join(repoRoot, "frontend");

  describe("1. Environment Files & Gitignore Auditing", function () {
    it("should have .gitignore explicitly ignoring .env and .env.*", function () {
      const gitignorePath = path.join(repoRoot, ".gitignore");
      expect(fs.existsSync(gitignorePath)).to.be.true;

      const content = fs.readFileSync(gitignorePath, "utf8");
      expect(content).to.match(/^\.env$/m);
      expect(content).to.match(/^\.env\.\*$/m);
      expect(content).to.match(/^!\.env\.example$/m);
    });

    it("should have .env.example containing strictly safe placeholder values and no secrets", function () {
      const examplePath = path.join(repoRoot, ".env.example");
      expect(fs.existsSync(examplePath)).to.be.true;

      const content = fs.readFileSync(examplePath, "utf8");

      // Verify safe placeholders
      expect(content).to.include("SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/your_api_key_here");
      expect(content).to.include("PRIVATE_KEY=your_private_key_without_0x_prefix");
      expect(content).to.include("PINATA_JWT=your_pinata_jwt_here");

      // Must never contain a live 64-char hex key or a live JWT
      expect(content).to.not.match(JWT_REGEX);
      expect(content).to.not.match(/\b[0-9a-fA-F]{64}\b/);
    });
  });

  describe("2. Frontend Secret Isolation (Client-Side Inspection)", function () {
    function getAllFrontendFiles(dir) {
      let results = [];
      const list = fs.readdirSync(dir);
      list.forEach((file) => {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) {
          results = results.concat(getAllFrontendFiles(fullPath));
        } else if (file.endsWith(".html") || file.endsWith(".js") || file.endsWith(".css")) {
          results.push(fullPath);
        }
      });
      return results;
    }

    it("should confirm the frontend bundle contains zero private keys, Pinata JWTs, or secrets", function () {
      const files = getAllFrontendFiles(frontendDir);
      expect(files.length).to.be.greaterThan(5);

      for (const file of files) {
        const content = fs.readFileSync(file, "utf8");

        // Disallowed keywords
        expect(content).to.not.include("PINATA_JWT", `Secret leak in ${file}`);
        expect(content).to.not.include("PINATA_SECRET", `Secret leak in ${file}`);
        expect(content).to.not.include("SEPOLIA_PRIVATE_KEY", `Secret leak in ${file}`);
        expect(content).to.not.include("ETHERSCAN_API_KEY", `Secret leak in ${file}`);

        // JWT token pattern check
        expect(content).to.not.match(JWT_REGEX, `JWT found in frontend file: ${file}`);
      }
    });
  });

  describe("3. API Response Secret Leak Prevention", function () {
    it("should never echo or expose PINATA_JWT in /api/health", async function () {
      const res = await request(app).get("/api/health");
      expect(res.status).to.equal(200);
      expect(JSON.stringify(res.body)).to.not.include("PINATA_JWT");
      expect(res.body).to.have.property("pinataConfigured");
      expect(typeof res.body.pinataConfigured).to.equal("boolean");
    });

    it("should never leak secrets in /api/ipfs/upload-metadata response", async function () {
      const res = await request(app)
        .post("/api/ipfs/upload-metadata")
        .set("x-skip-rate-limit", "true")
        .send({
          name: "SecTest Device",
          description: "Auditing response payload for secret leaks.",
          brand: "SafeTech",
          serialNumber: `SN-SEC-${Date.now()}`,
        });

      expect(res.status).to.equal(200);
      const resText = JSON.stringify(res.body);
      expect(resText).to.not.include("PINATA_JWT");
      expect(resText).to.not.include("SEPOLIA_PRIVATE_KEY");
      expect(resText).to.not.match(JWT_REGEX);
    });
  });

  describe("4. Pre-Commit Secret Scanner Verification (scripts/check-secrets.js)", function () {
    it("should immediately flag an attempt to stage a .env file", function () {
      const violations = scanFileContent(".env", "PRIVATE_KEY=abcdef123456");
      expect(violations.length).to.be.greaterThan(0);
      expect(violations[0].rule).to.equal("Blocked Environment File");
    });

    it("should flag a staged file containing a 64-hex private key assignment", function () {
      const fakeKey = "a1b2c3d4e5f678901234567890abcdef1234567890abcdef1234567890abcdef";
      const dirtyContent = `const config = {\n  PRIVATE_KEY: "${fakeKey}"\n};`;

      const violations = scanFileContent("backend/config.js", dirtyContent);
      expect(violations.length).to.be.greaterThan(0);
      expect(violations.some((v) => v.rule === "Private Key Assignment")).to.be.true;
    });

    it("should flag a staged file containing a raw JWT token pattern", function () {
      const fakeJwt = [
        "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
        "eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ",
        "SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c",
      ].join(".");
      const dirtyContent = `const token = "${fakeJwt}";`;

      const violations = scanFileContent("frontend/app.js", dirtyContent);
      expect(violations.length).to.be.greaterThan(0);
      expect(violations.some((v) => v.rule === "JWT Token Pattern")).to.be.true;
    });

    it("should pass cleanly when staged files contain normal code and safe placeholders", function () {
      const cleanContent = `
        const SEPOLIA_CHAIN_ID = 11155111n;
        const RPC_URL = "https://eth-sepolia.g.alchemy.com/v2/your_api_key_here";
        console.log("System initialized");
      `;

      const violations = scanFileContent("frontend/js/wallet.js", cleanContent);
      expect(violations.length).to.equal(0);
    });
  });
});
