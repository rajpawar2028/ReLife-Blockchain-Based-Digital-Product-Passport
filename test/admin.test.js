const request = require("supertest");
const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const { ethers } = require("hardhat");
const app = require("../backend/server");

describe("Phase 9: Admin Dashboard & Polish Verification", function () {
  const frontendDir = path.join(__dirname, "..", "frontend");
  const adminHtmlPath = path.join(frontendDir, "admin.html");
  const adminJsPath = path.join(frontendDir, "js", "admin.js");
  const walletJsPath = path.join(frontendDir, "js", "wallet.js");

  let relife;
  let admin, manufacturer, repairCenter, recycler, attacker;

  before(async function () {
    [admin, manufacturer, repairCenter, recycler, attacker] = await ethers.getSigners();
    const ReLifeFactory = await ethers.getContractFactory("ReLife");
    relife = await ReLifeFactory.deploy();
    await relife.waitForDeployment();
  });

  describe("1. Static Asset & Structure Verification", function () {
    it("should have admin.html and js/admin.js present in the frontend directory", function () {
      expect(fs.existsSync(adminHtmlPath)).to.be.true;
      expect(fs.existsSync(adminJsPath)).to.be.true;
    });

    it("should include complete navigation and wallet elements in admin.html", function () {
      const html = fs.readFileSync(adminHtmlPath, "utf8");

      expect(html).to.include('id="connectWalletBtn"');
      expect(html).to.include('id="walletBadge"');
      expect(html).to.include('id="authSection"');
      expect(html).to.include('id="unauthorizedSection"');
      expect(html).to.include('id="unauthAccount"');
      expect(html).to.include('id="adminWorkspace"');
      expect(html).to.include('id="adminAlert"');
    });

    it("should include participant onboarding forms in admin.html", function () {
      const html = fs.readFileSync(adminHtmlPath, "utf8");

      // Manufacturer onboarding
      expect(html).to.include('id="formRegisterMfg"');
      expect(html).to.include('id="mfgAddress"');
      expect(html).to.include('id="mfgName"');
      expect(html).to.include('id="btnRegisterMfg"');

      // Repair Center onboarding
      expect(html).to.include('id="formRegisterRepair"');
      expect(html).to.include('id="repairAddress"');
      expect(html).to.include('id="repairName"');
      expect(html).to.include('id="btnRegisterRepair"');

      // Recycler onboarding
      expect(html).to.include('id="formRegisterRecycler"');
      expect(html).to.include('id="recyclerAddress"');
      expect(html).to.include('id="recyclerName"');
      expect(html).to.include('id="btnRegisterRecycler"');
    });

    it("should include direct role governance and participant directory table in admin.html", function () {
      const html = fs.readFileSync(adminHtmlPath, "utf8");

      // Direct Role Governance
      expect(html).to.include('id="formRoleManagement"');
      expect(html).to.include('id="roleSelect"');
      expect(html).to.include('id="targetRoleAddress"');
      expect(html).to.include('id="btnCheckRole"');
      expect(html).to.include('id="btnGrantRole"');
      expect(html).to.include('id="btnRevokeRole"');
      expect(html).to.include('id="roleCheckResult"');

      // Participant Table
      expect(html).to.include('id="participantsTable"');
      expect(html).to.include('id="participantsTableBody"');
      expect(html).to.include('id="btnRefreshParticipants"');
    });

    it("should implement friendly error parser parseError in wallet.js", function () {
      const walletJs = fs.readFileSync(walletJsPath, "utf8");

      expect(walletJs).to.include("parseError(err)");
      expect(walletJs).to.include("AccessControlUnauthorizedAccount");
      expect(walletJs).to.include("ReLife__SerialAlreadyExists");
      expect(walletJs).to.include("ReLife__ProductAlreadyRecycled");
      expect(walletJs).to.include("INSUFFICIENT_FUNDS");
    });

    it("should implement role administration, error parsing, and event querying in js/admin.js", function () {
      const js = fs.readFileSync(adminJsPath, "utf8");

      expect(js).to.include("DEFAULT_ADMIN_ROLE");
      expect(js).to.include("registerManufacturer");
      expect(js).to.include("registerRepairCenter");
      expect(js).to.include("registerRecycler");
      expect(js).to.include("grantRole");
      expect(js).to.include("revokeRole");
      expect(js).to.include("hasRole");
      expect(js).to.include("ReLifeWallet.parseError");
      expect(js).to.include("ManufacturerRegistered");
      expect(js).to.include("RepairCenterRegistered");
      expect(js).to.include("RecyclerRegistered");
    });
  });

  describe("2. Express Server Static Serving", function () {
    it("should serve /admin.html successfully over Express HTTP server", async function () {
      const res = await request(app).get("/admin.html");
      expect(res.status).to.equal(200);
      expect(res.text).to.include("Admin Portal &amp; Role Governance");
    });
  });

  describe("3. On-Chain Admin Role & Governance Verification", function () {
    it("deployer should possess DEFAULT_ADMIN_ROLE", async function () {
      const defaultAdminRole = await relife.DEFAULT_ADMIN_ROLE();
      expect(await relife.hasRole(defaultAdminRole, admin.address)).to.be.true;
      expect(await relife.hasRole(defaultAdminRole, attacker.address)).to.be.false;
    });

    it("admin can onboard manufacturer, repair center, and recycler", async function () {
      const mfgRole = await relife.MANUFACTURER_ROLE();
      const repairRole = await relife.REPAIR_CENTER_ROLE();
      const recyclerRole = await relife.RECYCLER_ROLE();

      // Register Manufacturer
      await expect(relife.connect(admin).registerManufacturer(manufacturer.address, "EcoCorp Devices"))
        .to.emit(relife, "ManufacturerRegistered")
        .withArgs(manufacturer.address, "EcoCorp Devices", admin.address);
      expect(await relife.hasRole(mfgRole, manufacturer.address)).to.be.true;

      // Register Repair Center
      await expect(relife.connect(admin).registerRepairCenter(repairCenter.address, "Geneva Repair Lab"))
        .to.emit(relife, "RepairCenterRegistered")
        .withArgs(repairCenter.address, "Geneva Repair Lab", admin.address);
      expect(await relife.hasRole(repairRole, repairCenter.address)).to.be.true;

      // Register Recycler
      await expect(relife.connect(admin).registerRecycler(recycler.address, "Swiss Circular Metallurgy"))
        .to.emit(relife, "RecyclerRegistered")
        .withArgs(recycler.address, "Swiss Circular Metallurgy", admin.address);
      expect(await relife.hasRole(recyclerRole, recycler.address)).to.be.true;
    });

    it("non-admin caller cannot register participants or grant roles", async function () {
      await expect(
        relife.connect(attacker).registerManufacturer(attacker.address, "Malicious Factory")
      ).to.be.revertedWithCustomError(relife, "AccessControlUnauthorizedAccount");

      const mfgRole = await relife.MANUFACTURER_ROLE();
      await expect(
        relife.connect(attacker).grantRole(mfgRole, attacker.address)
      ).to.be.revertedWithCustomError(relife, "AccessControlUnauthorizedAccount");
    });

    it("admin can revoke roles from participants", async function () {
      const mfgRole = await relife.MANUFACTURER_ROLE();
      expect(await relife.hasRole(mfgRole, manufacturer.address)).to.be.true;

      // Revoke role
      await relife.connect(admin).revokeRole(mfgRole, manufacturer.address);
      expect(await relife.hasRole(mfgRole, manufacturer.address)).to.be.false;

      // Re-grant role
      await relife.connect(admin).grantRole(mfgRole, manufacturer.address);
      expect(await relife.hasRole(mfgRole, manufacturer.address)).to.be.true;
    });
  });
});

