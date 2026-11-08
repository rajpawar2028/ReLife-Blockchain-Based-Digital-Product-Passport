const request = require("supertest");
const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const app = require("../backend/server");

describe("Phase 6: QR Code & Public Verification (MVP Complete)", function () {
  const frontendDir = path.join(__dirname, "..", "frontend");
  const productHtmlPath = path.join(frontendDir, "product.html");
  const productJsPath = path.join(frontendDir, "js", "product.js");

  it("should have product.html and js/product.js present in the frontend directory", function () {
    expect(fs.existsSync(productHtmlPath)).to.be.true;
    expect(fs.existsSync(productJsPath)).to.be.true;
  });

  it("should contain all mandatory Phase 6 UI elements and verification states in product.html", function () {
    const html = fs.readFileSync(productHtmlPath, "utf8");

    // Search & Scanner
    expect(html).to.include('id="productIdInput"');
    expect(html).to.include('id="verifyBtn"');
    expect(html).to.include('id="toggleScannerBtn"');
    expect(html).to.include('id="qr-reader"');

    // States: Loading, Not Found, Passport Card
    expect(html).to.include('id="loadingCard"');
    expect(html).to.include('id="notFoundCard"');
    expect(html).to.include("NOT REGISTERED / POTENTIAL COUNTERFEIT");
    expect(html).to.include('id="passportCard"');

    // Dynamic QR & Timeline
    expect(html).to.include('id="qrcodeContainer"');
    expect(html).to.include('id="repairTimeline"');

    // Mandatory Caution Note
    expect(html).to.include("Important Anti-Fraud Notice");
    expect(html).to.include("A physical QR code or barcode alone does");
    expect(html).to.include("prove physical authenticity");
  });

  it("should implement URL param parsing, verifyProduct, QR rendering, and timeline in js/product.js", function () {
    const js = fs.readFileSync(productJsPath, "utf8");

    expect(js).to.include("urlParams.get(\"id\")");
    expect(js).to.include("verifyProductPassport");
    expect(js).to.include("contract.verifyProduct");
    expect(js).to.include("contract.getProductHistory");
    expect(js).to.include("renderPassportQR");
    expect(js).to.include("Html5QrcodeScanner");
  });

  it("should serve /product.html successfully over Express HTTP server", async function () {
    const res = await request(app).get("/product.html?id=1");
    expect(res.status).to.equal(200);
    expect(res.text).to.include("Digital Product Passport Verification");
    expect(res.text).to.include("VERIFIED AUTHENTIC PASSPORT");
  });
});
