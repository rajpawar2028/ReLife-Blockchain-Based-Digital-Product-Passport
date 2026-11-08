const request = require("supertest");
const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const app = require("../backend/server");

describe("Phase 7: Owner Dashboard & Transfer Frontend Verification", function () {
  const frontendDir = path.join(__dirname, "..", "frontend");
  const ownerHtmlPath = path.join(frontendDir, "owner.html");
  const ownerJsPath = path.join(frontendDir, "js", "owner.js");

  it("should have owner.html and js/owner.js present in the frontend directory", function () {
    expect(fs.existsSync(ownerHtmlPath)).to.be.true;
    expect(fs.existsSync(ownerJsPath)).to.be.true;
  });

  it("should contain owner dashboard sections and transfer elements in owner.html", function () {
    const html = fs.readFileSync(ownerHtmlPath, "utf8");

    expect(html).to.include('id="connectWalletBtn"');
    expect(html).to.include('id="walletBadge"');
    expect(html).to.include('id="authSection"');
    expect(html).to.include('id="dashboardSection"');
    expect(html).to.include('id="ownedCount"');
    expect(html).to.include('id="productsGrid"');
    expect(html).to.include('id="txStatusCard"');
    expect(html).to.include('id="refreshBtn"');
  });

  it("should implement loadOwnedProducts, executeTransfer, and toggleTransferForm in js/owner.js", function () {
    const js = fs.readFileSync(ownerJsPath, "utf8");

    expect(js).to.include("loadOwnedProducts");
    expect(js).to.include("contract.transferOwnership");
    expect(js).to.include("contract.getWarranty");
    expect(js).to.include("contract.getOwnershipHistory");
    expect(js).to.include("window.executeTransfer");
    expect(js).to.include("window.toggleTransferForm");
  });

  it("should serve /owner.html successfully over Express HTTP server", async function () {
    const res = await request(app).get("/owner.html");
    expect(res.status).to.equal(200);
    expect(res.text).to.include("Product Owner Dashboard");
  });
});

