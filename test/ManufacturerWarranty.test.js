const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("Feature: End-to-End Manufacturer Warranty Registration", function () {
  let relife;
  let admin, manufacturer, seller, customer, unauthorized, recycler;
  let sampleSerial = "SN-WARRANTY-MINT-001";

  beforeEach(async function () {
    [admin, manufacturer, seller, customer, unauthorized, recycler] = await ethers.getSigners();

    const ReLifeFactory = await ethers.getContractFactory("ReLife");
    relife = await ReLifeFactory.deploy();
    await relife.waitForDeployment();

    // Authorize roles
    await relife.connect(admin).registerManufacturer(manufacturer.address, "CircuTech OEM");
    await relife.connect(admin).registerRecycler(recycler.address, "EcoShred Circular");
  });

  describe("1. Contract: registerProductWithWarranty & Overloads", function () {
    it("should mint product and attach 12 months warranty computing warrantyEnd on-chain", async function () {
      const serial = "SN-12MO-001";
      const model = "EcoBook 14";
      const brand = "CircuTech";
      const metaUri = "ipfs://bafybeimfgwarranty123";
      const months = 12n;
      const coverage = "Comprehensive 1-Year Manufacturer Warranty";

      const tx = await relife.connect(manufacturer).registerProductWithWarranty(
        serial,
        model,
        brand,
        metaUri,
        ethers.ZeroHash,
        months,
        coverage
      );

      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);
      const expectedEnd = BigInt(block.timestamp) + (12n * 30n * 86400n);

      // Verify WarrantyAdded event
      await expect(tx)
        .to.emit(relife, "WarrantyAdded")
        .withArgs(1n, expectedEnd, coverage, metaUri, manufacturer.address);

      // Verify getWarranty view method
      const [warranty, isExpired] = await relife.getWarranty(1n);
      expect(warranty.warrantyStart).to.equal(BigInt(block.timestamp));
      expect(warranty.warrantyEnd).to.equal(expectedEnd);
      expect(warranty.expiryTimestamp).to.equal(expectedEnd);
      expect(warranty.warrantyType).to.equal(coverage);
      expect(warranty.isActive).to.be.true;
      expect(isExpired).to.be.false;

      // Verify isWarrantyValid view method
      expect(await relife.isWarrantyValid(1n)).to.be.true;
    });

    it("should allow minting with 0 warranty months resulting in no active warranty", async function () {
      const serial = "SN-NOWARRANTY-001";

      await relife.connect(manufacturer).registerProductWithWarranty(
        serial,
        "Budget Phone",
        "CircuTech",
        "ipfs://bafybeibudget",
        ethers.ZeroHash,
        0n,
        ""
      );

      const [warranty, isExpired] = await relife.getWarranty(1n);
      expect(warranty.isActive).to.be.false;
      expect(warranty.warrantyEnd).to.equal(0n);
      expect(isExpired).to.be.false;
      expect(await relife.isWarrantyValid(1n)).to.be.false;
    });

    it("should support the 6-arg registerProduct overload", async function () {
      const serial = "SN-OVERLOAD-001";
      await relife.connect(manufacturer)["registerProduct(string,string,string,string,uint256,string)"](
        serial,
        "SolarBook",
        "CircuTech",
        "ipfs://bafybeisolar",
        24n,
        "2-Year Green Warranty"
      );

      const [warranty] = await relife.getWarranty(1n);
      expect(warranty.isActive).to.be.true;
      expect(warranty.warrantyType).to.equal("2-Year Green Warranty");
      expect(await relife.isWarrantyValid(1n)).to.be.true;
    });

    it("should reject warranty period exceeding 120 months (10 years)", async function () {
      await expect(
        relife.connect(manufacturer).registerProductWithWarranty(
          "SN-TOOLONG-001",
          "Infinite Laptop",
          "CircuTech",
          "ipfs://bafybeitoolong",
          ethers.ZeroHash,
          121n, // exceeds 120
          "Too Long"
        )
      )
        .to.be.revertedWithCustomError(relife, "ReLife__WarrantyPeriodTooLong")
        .withArgs(121n);
    });
  });

  describe("2. Time-Travel & Expiration Behavior", function () {
    it("should remain valid until expiry and automatically evaluate to expired after expiry", async function () {
      const months = 6n; // 180 days
      await relife.connect(manufacturer).registerProductWithWarranty(
        "SN-EXPIRY-001",
        "EcoTablet",
        "CircuTech",
        "ipfs://bafybeitab",
        ethers.ZeroHash,
        months,
        "6-Month Limited Warranty"
      );

      // Still valid right now
      expect(await relife.isWarrantyValid(1n)).to.be.true;

      // Fast forward 179 days (still valid)
      await time.increase(179 * 86400);
      expect(await relife.isWarrantyValid(1n)).to.be.true;

      // Fast forward 2 more days (moves past 180 days)
      await time.increase(2 * 86400);

      // Now expired
      expect(await relife.isWarrantyValid(1n)).to.be.false;
      const [warranty, isExpired] = await relife.getWarranty(1n);
      expect(isExpired).to.be.true;
    });
  });

  describe("3. Authorized Warranty Extensions (addWarrantyMonths)", function () {
    it("should allow current owner (seller) to extend warranty duration", async function () {
      // Mint with 12 months warranty
      await relife.connect(manufacturer).registerProductWithWarranty(
        "SN-EXTEND-001",
        "Laptop Pro",
        "CircuTech",
        "ipfs://bafybeilaptop",
        ethers.ZeroHash,
        12n,
        "Initial 1-Year"
      );

      // Transfer to seller
      await relife.connect(manufacturer).transferOwnership(1n, seller.address);

      const [initialWarranty] = await relife.getWarranty(1n);
      const initialEnd = initialWarranty.warrantyEnd;

      // Seller adds 12 more months
      await relife.connect(seller).addWarrantyMonths(
        1n,
        12n,
        "Retailer Care+ Extension",
        "ipfs://bafybeiextension"
      );

      const [extendedWarranty] = await relife.getWarranty(1n);
      expect(extendedWarranty.warrantyEnd).to.equal(initialEnd + (12n * 30n * 86400n));
      expect(extendedWarranty.warrantyType).to.equal("Retailer Care+ Extension");
    });

    it("should revert addWarrantyMonths if called by unauthorized account", async function () {
      await relife.connect(manufacturer).registerProductWithWarranty(
        "SN-UNAUTH-001",
        "Laptop",
        "CircuTech",
        "ipfs://bafybeilaptop",
        ethers.ZeroHash,
        12n,
        "Initial 1-Year"
      );

      await expect(
        relife.connect(unauthorized).addWarrantyMonths(1n, 6n, "Hacked", "")
      )
        .to.be.revertedWithCustomError(relife, "ReLife__UnauthorizedWarrantyIssuer")
        .withArgs(1n, unauthorized.address);
    });

    it("should revert addWarrantyMonths if product is Recycled", async function () {
      await relife.connect(manufacturer).registerProductWithWarranty(
        "SN-RECYCLE-001",
        "Laptop",
        "CircuTech",
        "ipfs://bafybeilaptop",
        ethers.ZeroHash,
        12n,
        "Initial 1-Year"
      );

      // Decommission via recycler
      await relife.connect(recycler).addRecyclingRecord(1n, "EcoPlant", "Shredded", "ipfs://bafybeicert");

      // Warranty is immediately invalid
      expect(await relife.isWarrantyValid(1n)).to.be.false;

      // Attempting to add or extend warranty must revert
      await expect(
        relife.connect(manufacturer).addWarrantyMonths(1n, 6n, "Post-Recycle Attempt", "")
      )
        .to.be.revertedWithCustomError(relife, "ReLife__ProductAlreadyRecycled")
        .withArgs(1n);
    });
  });

  describe("4. Shared formatWarranty() Formatting Helper in wallet.js", function () {
    it("should safely format valid warranties without [object Object] or NaN", function () {
      const fs = require("fs");
      const path = require("path");
      const walletJs = fs.readFileSync(path.join(__dirname, "..", "frontend", "js", "wallet.js"), "utf8");

      expect(walletJs).to.include("formatWarranty(warranty, isExpired");
      expect(walletJs).to.include("window.formatWarranty =");

      // Test formatWarranty logic directly
      const dummyWarranty = {
        warrantyStart: 1700000000n,
        warrantyEnd: 1731542400n,
        expiryTimestamp: 1731542400n,
        warrantyType: "2-Year Manufacturer Warranty",
        termsUri: "ipfs://terms",
        isActive: true,
      };

      // Extract formatWarranty function from wallet.js
      const fnMatch = walletJs.match(/formatWarranty\(warranty, isExpired = false\) \{([\s\S]*?)\n  \},/);
      expect(fnMatch).to.not.be.null;

      const formatWarrantyFn = new Function("warranty", "isExpired", fnMatch[1]);
      const res = formatWarrantyFn(dummyWarranty, false);

      expect(res.hasWarranty).to.be.true;
      expect(res.coverage).to.equal("2-Year Manufacturer Warranty");
      expect(res.badgeHtml).to.not.include("[object Object]");
      expect(res.badgeHtml).to.not.include("NaN");
      expect(res.badgeHtml).to.not.include("undefined");
      expect(res.startDateFormatted).to.not.equal("N/A");
      expect(res.endDateFormatted).to.not.equal("N/A");
    });

    it("should safely format zero / null warranty returning No Warranty state", function () {
      const fs = require("fs");
      const path = require("path");
      const walletJs = fs.readFileSync(path.join(__dirname, "..", "frontend", "js", "wallet.js"), "utf8");
      const fnMatch = walletJs.match(/formatWarranty\(warranty, isExpired = false\) \{([\s\S]*?)\n  \},/);
      const formatWarrantyFn = new Function("warranty", "isExpired", fnMatch[1]);

      const nullRes = formatWarrantyFn(null, false);
      expect(nullRes.hasWarranty).to.be.false;
      expect(nullRes.statusText).to.equal("No Warranty");
      expect(nullRes.badgeHtml).to.include("No Warranty");

      const inactiveRes = formatWarrantyFn({ isActive: false, warrantyEnd: 0n }, false);
      expect(inactiveRes.hasWarranty).to.be.false;
      expect(inactiveRes.statusText).to.equal("No Warranty");
    });
  });

  describe("5. End-to-End Backend IPFS & Verification Flow", function () {
    const request = require("supertest");
    const app = require("../backend/server");

    it("should process 12-month warranty metadata and confirm Valid status format", async function () {
      const payload = {
        name: "EcoBook Pro 16",
        description: "High performance circular laptop with aluminum modular chassis.",
        brand: "CircuTech",
        model: "EB-16",
        serialNumber: "SN-EB16-WARR-12M",
        warrantyMonths: 12,
        warrantyCoverage: "Full Hardware & Battery Coverage",
      };

      const res = await request(app).post("/api/ipfs/upload-metadata").send(payload);
      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body.metadata.warranty.periodMonths).to.equal(12);
      expect(res.body.metadata.warranty.coverage).to.equal("Full Hardware & Battery Coverage");

      // Mint on contract
      await relife.connect(manufacturer).registerProductWithWarranty(
        payload.serialNumber,
        payload.model,
        payload.brand,
        res.body.ipfsUri,
        ethers.ZeroHash,
        12n,
        payload.warrantyCoverage
      );

      const [warranty, isExpired] = await relife.getWarranty(1n);

      const fs = require("fs");
      const path = require("path");
      const walletJs = fs.readFileSync(path.join(__dirname, "..", "frontend", "js", "wallet.js"), "utf8");
      const fnMatch = walletJs.match(/formatWarranty\(warranty, isExpired = false\) \{([\s\S]*?)\n  \},/);
      const formatWarrantyFn = new Function("warranty", "isExpired", fnMatch[1]);

      const wInfo = formatWarrantyFn(warranty, isExpired);
      expect(wInfo.hasWarranty).to.be.true;
      expect(wInfo.isValid).to.be.true;
      expect(wInfo.isExpired).to.be.false;
      expect(wInfo.badgeClass).to.equal("badge-success");
      expect(wInfo.statusText).to.include("Valid");
      expect(wInfo.coverage).to.equal("Full Hardware & Battery Coverage");
    });

    it("should process 0-month warranty metadata and confirm No Warranty status format", async function () {
      const payload = {
        name: "Budget Cable",
        description: "USB-C braided cable from recycled ocean plastics.",
        brand: "CircuTech",
        model: "C-100",
        serialNumber: "SN-CABLE-0M",
        warrantyMonths: 0,
        warrantyCoverage: "",
      };

      const res = await request(app).post("/api/ipfs/upload-metadata").send(payload);
      expect(res.status).to.equal(200);
      expect(res.body.metadata.warranty.periodMonths).to.equal(0);
      expect(res.body.metadata.warranty.coverage).to.equal("No Warranty");

      // Mint on contract with 0 months
      await relife.connect(manufacturer).registerProductWithWarranty(
        payload.serialNumber,
        payload.model,
        payload.brand,
        res.body.ipfsUri,
        ethers.ZeroHash,
        0n,
        ""
      );

      const [warranty, isExpired] = await relife.getWarranty(1n);

      const fs = require("fs");
      const path = require("path");
      const walletJs = fs.readFileSync(path.join(__dirname, "..", "frontend", "js", "wallet.js"), "utf8");
      const fnMatch = walletJs.match(/formatWarranty\(warranty, isExpired = false\) \{([\s\S]*?)\n  \},/);
      const formatWarrantyFn = new Function("warranty", "isExpired", fnMatch[1]);

      const wInfo = formatWarrantyFn(warranty, isExpired);
      expect(wInfo.hasWarranty).to.be.false;
      expect(wInfo.statusText).to.equal("No Warranty");
      expect(wInfo.badgeClass).to.equal("badge-secondary");
    });
  });
});
