const request = require("supertest");
const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const app = require("../backend/server");

describe("Phase 8: Recycler Portal Frontend Verification", function () {
  const frontendDir = path.join(__dirname, "..", "frontend");
  const recyclerHtmlPath = path.join(frontendDir, "recycler.html");
  const recyclerJsPath = path.join(frontendDir, "js", "recycler.js");

  it("should have recycler.html and js/recycler.js present in the frontend directory", function () {
    expect(fs.existsSync(recyclerHtmlPath)).to.be.true;
    expect(fs.existsSync(recyclerJsPath)).to.be.true;
  });

  it("should contain recycler sections and form inputs in recycler.html", function () {
    const html = fs.readFileSync(recyclerHtmlPath, "utf8");

    expect(html).to.include('id="connectWalletBtn"');
    expect(html).to.include('id="walletBadge"');
    expect(html).to.include('id="authSection"');
    expect(html).to.include('id="unauthorizedAlert"');
    expect(html).to.include('id="recyclerSection"');
    expect(html).to.include('id="recycleProdId"');
    expect(html).to.include('id="recycleFacility"');
    expect(html).to.include('id="recycleNotes"');
    expect(html).to.include('id="recycleFile"');
    expect(html).to.include('id="submitRecycleBtn"');
  });

  it("should implement role check and addRecyclingRecord in js/recycler.js", function () {
    const js = fs.readFileSync(recyclerJsPath, "utf8");

    expect(js).to.include("contract.RECYCLER_ROLE");
    expect(js).to.include("contract.hasRole");
    expect(js).to.include("contract.addRecyclingRecord");
    expect(js).to.include("POST");
    expect(js).to.include("/api/ipfs/upload-file");
  });

  it("should serve /recycler.html successfully over Express HTTP server", async function () {
    const res = await request(app).get("/recycler.html");
    expect(res.status).to.equal(200);
    expect(res.text).to.include("Authorized Recycler Portal");
  });
});

