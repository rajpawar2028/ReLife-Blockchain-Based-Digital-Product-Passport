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

  it("should have zero JavaScript syntax errors in manufacturer.js and all frontend scripts", function () {
    const scripts = ["js/manufacturer.js", "js/wallet.js", "js/admin.js", "js/owner.js", "js/recycler.js", "js/product.js", "js/repair.js"];
    for (const relPath of scripts) {
      const fullPath = path.join(frontendDir, relPath);
      const code = fs.readFileSync(fullPath, "utf8");
      // Compiles code into a function to verify syntax validity without executing browser DOM methods
      expect(() => new Function(code), `Syntax error in ${relPath}`).to.not.throw();
    }
  });

  it("should wire up wallet connection, wrong-network alert, and live listeners in manufacturer.js", function () {
    const mfgJs = fs.readFileSync(path.join(frontendDir, "js", "manufacturer.js"), "utf8");
    const mfgHtml = fs.readFileSync(path.join(frontendDir, "manufacturer.html"), "utf8");

    // UI elements present in HTML
    expect(mfgHtml).to.include('id="connectWalletBtn"');
    expect(mfgHtml).to.include('id="wrongNetworkAlert"');
    expect(mfgHtml).to.include('id="btnSwitchNetwork"');

    // Wallet logic in JS
    expect(mfgJs).to.include("ReLifeWallet.init()");
    expect(mfgJs).to.include("ReLifeWallet.connect()");
    expect(mfgJs).to.include("ReLifeWallet.switchToSepolia()");
    expect(mfgJs).to.include('ReLifeWallet.on("accountChanged"');
    expect(mfgJs).to.include('ReLifeWallet.on("chainChanged"');
  });

  it("should wire up wrongNetworkAlert and live listeners in repair.js", function () {
    const repairJs = fs.readFileSync(path.join(frontendDir, "js", "repair.js"), "utf8");
    const repairHtml = fs.readFileSync(path.join(frontendDir, "repair.html"), "utf8");

    // UI elements in HTML
    expect(repairHtml).to.include('id="wrongNetworkAlert"');
    expect(repairHtml).to.include('id="btnSwitchNetwork"');
    expect(repairHtml).to.include('id="currentNetworkDisplay"');

    // Logic in JS
    expect(repairJs).to.include("ReLifeWallet.isCorrectNetwork");
    expect(repairJs).to.include("ReLifeWallet.switchToSepolia()");
    expect(repairJs).to.include('ReLifeWallet.on("chainChanged"');
    expect(repairJs).to.include('ReLifeWallet.on("accountChanged"');
  });

  it("should normalize hex, BigInt, and Number chain IDs correctly in wallet.js", function () {
    const walletJs = fs.readFileSync(path.join(frontendDir, "js", "wallet.js"), "utf8");
    const sandbox = {
      window: { ethereum: null, RELIFE_CONFIG: { chainId: 11155111 } },
      ethers: { BrowserProvider: class {} },
    };
    const fn = new Function("window", "ethers", `${walletJs}; return window.ReLifeWallet;`);
    const wallet = fn(sandbox.window, sandbox.ethers);

    expect(wallet.getNormalizedChainId("0xaa36a7")).to.equal(11155111);
    expect(wallet.getNormalizedChainId(11155111n)).to.equal(11155111);
    expect(wallet.getNormalizedChainId(11155111)).to.equal(11155111);
    expect(wallet.getNormalizedChainId("0x7a69")).to.equal(31337);
    expect(wallet.getNormalizedChainId(31337n)).to.equal(31337);
    expect(wallet.getNormalizedChainId("0x1")).to.equal(1);
    expect(wallet.getNormalizedChainId(null)).to.be.null;

    // Test getter with Sepolia hex
    wallet.chainId = "0xaa36a7";
    expect(wallet.isCorrectNetwork).to.be.true;
    expect(wallet.isSepolia).to.be.true;

    // Test getter with Sepolia BigInt
    wallet.chainId = 11155111n;
    expect(wallet.isCorrectNetwork).to.be.true;
    expect(wallet.isSepolia).to.be.true;

    // Test getter with Mainnet
    wallet.chainId = "0x1";
    expect(wallet.isCorrectNetwork).to.be.false;
    expect(wallet.isSepolia).to.be.false;
  });
});

