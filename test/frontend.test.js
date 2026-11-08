const request = require("supertest");
const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const app = require("../backend/server");

describe("Phase 5: Frontend Core & Role-Based UI Verification", function () {
  const frontendDir = path.join(__dirname, "..", "frontend");

  it("should have all required Phase 5 frontend files present in frontend/ directory", function () {
    const requiredFiles = [
      "index.html",
      "manufacturer.html",
      "css/styles.css",
      "js/wallet.js",
      "js/manufacturer.js",
      "contract-data.js",
      "contract-data.json",
    ];

    for (const relPath of requiredFiles) {
      const fullPath = path.join(frontendDir, relPath);
      expect(fs.existsSync(fullPath), `Missing file: ${relPath}`).to.be.true;
    }
  });

  it("should contain all role-based UI sections and registration inputs in manufacturer.html", function () {
    const htmlContent = fs.readFileSync(path.join(frontendDir, "manufacturer.html"), "utf8");

    // Role-based UI sections
    expect(htmlContent).to.include('id="connectWalletBtn"');
    expect(htmlContent).to.include('id="walletBadge"');
    expect(htmlContent).to.include('id="authSection"');
    expect(htmlContent).to.include('id="unauthorizedAlert"');
    expect(htmlContent).to.include('id="registrationCard"');
    expect(htmlContent).to.include('id="txStatusCard"');
    expect(htmlContent).to.include('id="productsTableBody"');

    // Registration inputs
    expect(htmlContent).to.include('id="prodName"');
    expect(htmlContent).to.include('id="description"');
    expect(htmlContent).to.include('id="prodBrand"');
    expect(htmlContent).to.include('id="prodModel"');
    expect(htmlContent).to.include('id="prodSerial"');
    expect(htmlContent).to.include('id="prodCategory"');
    expect(htmlContent).to.include('id="prodMaterials"');
    expect(htmlContent).to.include('id="prodCarbon"');
    expect(htmlContent).to.include('id="prodOrigin"');
    expect(htmlContent).to.include('id="prodRecyclability"');
    expect(htmlContent).to.include('id="prodFile"');
  });

  it("should define ReLifeWallet with proper provider and contract methods in js/wallet.js", function () {
    const jsContent = fs.readFileSync(path.join(frontendDir, "js", "wallet.js"), "utf8");
    expect(jsContent).to.include("window.ReLifeWallet = ReLifeWallet;");
    expect(jsContent).to.include("getEthereumProvider()");
    expect(jsContent).to.include("async init()");
    expect(jsContent).to.include("async connect()");
    expect(jsContent).to.include("getReadOnlyContract()");
    expect(jsContent).to.include("async switchToSepolia()");
    expect(jsContent).to.include("-32002");
    expect(jsContent).to.include("https://metamask.io/download/");
  });

  it("should handle wallet connection button and badge in product.js", function () {
    const productJs = fs.readFileSync(path.join(frontendDir, "js", "product.js"), "utf8");
    expect(productJs).to.include("connectWalletBtn");
    expect(productJs).to.include("ReLifeWallet.connect()");
  });

  it("should serve frontend HTML pages properly via Express static server", async function () {
    const indexRes = await request(app).get("/index.html");
    expect(indexRes.status).to.equal(200);
    expect(indexRes.text).to.include("ReLife");
    expect(indexRes.text).to.include("Digital Product Passport");

    const mfgRes = await request(app).get("/manufacturer.html");
    expect(mfgRes.status).to.equal(200);
    expect(mfgRes.text).to.include("Manufacturer Portal");
    expect(mfgRes.text).to.include("Register New Product Passport");
    expect(mfgRes.text).to.include('id="description"');
  });

  it("should extract description from form and include it in manufacturer.js metadataPayload", function () {
    const mfgJs = fs.readFileSync(path.join(frontendDir, "js", "manufacturer.js"), "utf8");
    expect(mfgJs).to.include('document.getElementById("description")');
    expect(mfgJs).to.include("description,");
  });

  it("should successfully upload metadata and register a product with description via backend", async function () {
    const payload = {
      name: "Fairphone 5",
      description: "Modular, repairable smartphone with fairtrade components.",
      brand: "Fairphone",
      model: "FP5",
      serialNumber: "SN-FP5-DESC-TEST-01",
      category: "Electronics & Smartphones",
    };

    const res = await request(app)
      .post("/api/ipfs/upload-metadata")
      .send(payload);

    expect(res.status).to.equal(200);
    expect(res.body.success).to.be.true;
    expect(res.body.metadata.description).to.equal(payload.description);
    expect(res.body.ipfsUri).to.include("ipfs://");
  });
});

