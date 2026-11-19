const { expect } = require("chai");
const fs = require("fs");
const path = require("path");

describe("Feature 7: Mobile-Optimized Camera QR Scanner & Payload Parsing", function () {
  const frontendDir = path.join(__dirname, "..", "frontend");
  const productHtmlPath = path.join(frontendDir, "product.html");
  const productJsPath = path.join(frontendDir, "js", "product.js");

  let parseQrPayload;

  before(function () {
    // Extract and test parseQrPayload in Node.js environment
    const jsContent = fs.readFileSync(productJsPath, "utf8");
    // Isolate parseQrPayload function
    const fnMatch = jsContent.match(/function parseQrPayload\(raw\) \{([\s\S]*?)\n  \}/);
    expect(fnMatch, "parseQrPayload function must be defined in js/product.js").to.not.be.null;

    const fnBody = fnMatch[1];
    parseQrPayload = new Function("raw", fnBody);
  });

  describe("1. QR Payload Parsing (URL, Query, JSON, and Raw Identifiers)", function () {
    it("should parse full production HTTPS URLs with ID and secret", function () {
      const qrUrl = "https://relife-dpp.vercel.app/product.html?id=101&secret=c7f93a4e98f7c1d2e3f4a5b6c7d8e9f0";
      const result = parseQrPayload(qrUrl);

      expect(result.invalid).to.be.undefined;
      expect(result.productId).to.equal("101");
      expect(result.secret).to.equal("c7f93a4e98f7c1d2e3f4a5b6c7d8e9f0");
      expect(result.isUrl).to.be.true;
    });

    it("should parse localhost development URLs with ID only", function () {
      const qrUrl = "http://localhost:5000/product.html?id=7";
      const result = parseQrPayload(qrUrl);

      expect(result.invalid).to.be.undefined;
      expect(result.productId).to.equal("7");
      expect(result.secret).to.be.null;
    });

    it("should parse URLs containing serial numbers", function () {
      const qrUrl = "http://localhost:5000/product.html?serial=SN-LAPTOP-2026-X1";
      const result = parseQrPayload(qrUrl);

      expect(result.invalid).to.be.undefined;
      expect(result.serial).to.equal("SN-LAPTOP-2026-X1");
    });

    it("should parse relative URLs (/product.html?id=15&secret=relife_pass)", function () {
      const qrUrl = "/product.html?id=15&secret=relife_pass";
      const result = parseQrPayload(qrUrl);

      expect(result.invalid).to.be.undefined;
      expect(result.productId).to.equal("15");
      expect(result.secret).to.equal("relife_pass");
    });

    it("should parse query string only formats (id=99&secret=sec99)", function () {
      const qrQuery = "id=99&secret=sec99";
      const result = parseQrPayload(qrQuery);

      expect(result.invalid).to.be.undefined;
      expect(result.productId).to.equal("99");
      expect(result.secret).to.equal("sec99");
    });

    it("should parse JSON payload formats ({\"id\": 4, \"secret\": \"json_sec\"})", function () {
      const qrJson = JSON.stringify({ id: 4, secret: "json_sec" });
      const result = parseQrPayload(qrJson);

      expect(result.invalid).to.be.undefined;
      expect(result.productId).to.equal("4");
      expect(result.secret).to.equal("json_sec");
    });

    it("should parse raw integer product ID strings", function () {
      const result = parseQrPayload("42");
      expect(result.invalid).to.be.undefined;
      expect(result.productId).to.equal("42");
      expect(result.secret).to.be.null;
    });

    it("should parse raw serial number strings", function () {
      const result = parseQrPayload("SN-CRN-2026-9988");
      expect(result.invalid).to.be.undefined;
      expect(result.serial).to.equal("SN-CRN-2026-9988");
      expect(result.secret).to.be.null;
    });

    it("should reject unrelated URLs that do not contain product identifiers", function () {
      const invalidUrl = "https://google.com/search?q=blockchain+dpp";
      const result = parseQrPayload(invalidUrl);

      expect(result.invalid).to.be.true;
      expect(result.reason).to.include("does not contain a product ID or serial");
    });

    it("should reject empty, null, or corrupted strings gracefully", function () {
      expect(parseQrPayload("").invalid).to.be.true;
      expect(parseQrPayload("   ").invalid).to.be.true;
      expect(parseQrPayload(null).invalid).to.be.true;
      expect(parseQrPayload(undefined).invalid).to.be.true;
    });
  });

  describe("2. UI Structure & Elements in product.html", function () {
    let htmlContent;

    before(function () {
      htmlContent = fs.readFileSync(productHtmlPath, "utf8");
    });

    it("should include camera trigger and close buttons", function () {
      expect(htmlContent).to.include('id="toggleScannerBtn"');
      expect(htmlContent).to.include('id="closeScannerBtn"');
    });

    it("should include manual fallback button for camera denial or hardware issues", function () {
      expect(htmlContent).to.include('id="fallbackManualBtn"');
      expect(htmlContent).to.include("Enter ID Manually Instead");
    });

    it("should include scanner wrapper and status alert container", function () {
      expect(htmlContent).to.include('id="scannerWrapper"');
      expect(htmlContent).to.include('id="scannerStatusMessage"');
      expect(htmlContent).to.include('id="qr-reader"');
    });

    it("should load maintained html5-qrcode library from CDN", function () {
      expect(htmlContent).to.include("html5-qrcode");
    });

    it("should have product ID and secret inputs for manual entry fallback", function () {
      expect(htmlContent).to.include('id="productIdInput"');
      expect(htmlContent).to.include('id="secretInput"');
    });
  });

  describe("3. Camera Permissions & Security Implementation in product.js", function () {
    let jsContent;

    before(function () {
      jsContent = fs.readFileSync(productJsPath, "utf8");
    });

    it("should check secure context (HTTPS / localhost) for mobile device compatibility", function () {
      expect(jsContent).to.include("isSecureContext");
      expect(jsContent).to.include("Mobile browsers require HTTPS");
    });

    it("should handle NotAllowedError (camera permission denied)", function () {
      expect(jsContent).to.include("NotAllowedError");
      expect(jsContent).to.include("Camera permission was denied");
    });

    it("should handle NotFoundError (no camera hardware detected)", function () {
      expect(jsContent).to.include("NotFoundError");
      expect(jsContent).to.include("No camera device detected");
    });

    it("should focus manual product ID input when camera permission fails", function () {
      expect(jsContent).to.include("productIdInput.focus()");
    });

    it("should expose ReLifeScanner globally for client and test access", function () {
      expect(jsContent).to.include("window.ReLifeScanner =");
      expect(jsContent).to.include("parseQrPayload");
    });
  });
});
