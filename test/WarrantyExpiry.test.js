const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Feature 2: Warranty with Expiry & Validity Check", function () {
  let relife;
  let admin, manufacturer, seller, customer, unauthorized;

  const sampleProduct = {
    serialNumber: "SN-WARRANTY-2026-001",
    modelName: "EcoTab 12",
    brand: "CircuTech",
    metadataURI: "ipfs://bafybeigwarrantytest123",
  };

  beforeEach(async function () {
    [admin, manufacturer, seller, customer, unauthorized] =
      await ethers.getSigners();

    const ReLifeFactory = await ethers.getContractFactory("ReLife");
    relife = await ReLifeFactory.deploy();
    await relife.waitForDeployment();

    // Register manufacturer and mint test product #1
    await relife.connect(admin).registerManufacturer(manufacturer.address, "CircuTech OEM");
    await relife
      .connect(manufacturer)
      .registerProduct(
        sampleProduct.serialNumber,
        sampleProduct.modelName,
        sampleProduct.brand,
        sampleProduct.metadataURI
      );
  });

  describe("1. Warranty Issuance (setProductWarranty & addWarranty)", function () {
    it("should allow manufacturer to set warranty with explicit start and end timestamps", async function () {
      const now = await time.latest();
      const startTime = now;
      const endTime = now + 86400 * 365; // 1 year

      await expect(
        relife
          .connect(manufacturer)
          .setProductWarranty(1n, startTime, endTime, "1-Year Hardware Warranty", "ipfs://terms/hardware-1yr")
      )
        .to.emit(relife, "WarrantyAdded")
        .withArgs(1n, endTime, "1-Year Hardware Warranty", "ipfs://terms/hardware-1yr", manufacturer.address);

      const [warranty, isExpired] = await relife.getWarranty(1n);
      expect(warranty.warrantyStart).to.equal(startTime);
      expect(warranty.warrantyEnd).to.equal(endTime);
      expect(warranty.expiryTimestamp).to.equal(endTime);
      expect(warranty.warrantyType).to.equal("1-Year Hardware Warranty");
      expect(warranty.termsUri).to.equal("ipfs://terms/hardware-1yr");
      expect(warranty.isActive).to.be.true;
      expect(isExpired).to.be.false;
    });

    it("should allow authorized seller (current product owner) to set warranty", async function () {
      // Transfer to seller
      await relife.connect(manufacturer).transferOwnership(1n, seller.address);
      const product = await relife.getProduct(1n);
      expect(product.currentOwner).to.equal(seller.address);

      const now = await time.latest();
      const startTime = now;
      const endTime = now + 86400 * 180; // 6 months

      await expect(
        relife
          .connect(seller)
          .setProductWarranty(1n, startTime, endTime, "6-Month Retailer Care", "ipfs://terms/seller-6mo")
      )
        .to.emit(relife, "WarrantyAdded")
        .withArgs(1n, endTime, "6-Month Retailer Care", "ipfs://terms/seller-6mo", seller.address);

      const [warranty] = await relife.getWarranty(1n);
      expect(warranty.warrantyStart).to.equal(startTime);
      expect(warranty.warrantyEnd).to.equal(endTime);
      expect(warranty.warrantyType).to.equal("6-Month Retailer Care");
    });

    it("should allow contract admin to set warranty", async function () {
      const now = await time.latest();
      const startTime = now;
      const endTime = now + 86400 * 730; // 2 years

      await expect(
        relife
          .connect(admin)
          .setProductWarranty(1n, startTime, endTime, "2-Year Extended Care", "ipfs://terms/admin-2yr")
      ).to.emit(relife, "WarrantyAdded");

      const [warranty] = await relife.getWarranty(1n);
      expect(warranty.warrantyEnd).to.equal(endTime);
    });

    it("should maintain backward compatibility for addWarranty defaulting start to block.timestamp", async function () {
      const now = await time.latest();
      const endTime = now + 86400 * 30;

      await relife
        .connect(manufacturer)
        .addWarranty(1n, endTime, "30-Day Express Warranty", "ipfs://terms/30d");

      const [warranty] = await relife.getWarranty(1n);
      expect(warranty.warrantyEnd).to.equal(endTime);
      expect(warranty.expiryTimestamp).to.equal(endTime);
      expect(warranty.warrantyStart).to.be.closeTo(now, 5);
      expect(warranty.isActive).to.be.true;
    });
  });

  describe("2. Automatic Validity Check (isWarrantyValid) & Expiration", function () {
    it("should return false before any warranty is attached", async function () {
      expect(await relife.isWarrantyValid(1n)).to.be.false;
    });

    it("should return true when current time is strictly within [warrantyStart, warrantyEnd)", async function () {
      const now = await time.latest();
      const startTime = now;
      const endTime = now + 86400 * 100; // 100 days

      await relife
        .connect(manufacturer)
        .setProductWarranty(1n, startTime, endTime, "Standard 100-Day", "ipfs://terms/100d");

      expect(await relife.isWarrantyValid(1n)).to.be.true;
    });

    it("should automatically evaluate to false once block.timestamp moves past warrantyEnd", async function () {
      const now = await time.latest();
      const duration = 86400 * 30; // 30 days
      const endTime = now + duration;

      await relife
        .connect(manufacturer)
        .setProductWarranty(1n, now, endTime, "30-Day Policy", "ipfs://terms/30d");

      // Verify active initially
      expect(await relife.isWarrantyValid(1n)).to.be.true;
      let [w1, isExpired1] = await relife.getWarranty(1n);
      expect(isExpired1).to.be.false;

      // Fast forward time past expiry (31 days into future)
      await time.increase(duration + 100);

      // Now warranty must automatically be invalid & expired without any write transaction
      expect(await relife.isWarrantyValid(1n)).to.be.false;
      let [w2, isExpired2] = await relife.getWarranty(1n);
      expect(isExpired2).to.be.true;
    });

    it("should return false if warrantyStart is set in the future and block.timestamp has not reached it", async function () {
      const now = await time.latest();
      const startTime = now + 86400; // starts tomorrow
      const endTime = now + 86400 * 30; // ends in 30 days

      await relife
        .connect(manufacturer)
        .setProductWarranty(1n, startTime, endTime, "Future Commencing Warranty", "ipfs://terms/future");

      // Before start time, isWarrantyValid returns false
      expect(await relife.isWarrantyValid(1n)).to.be.false;

      // Advance time to start time
      await time.increase(86400 + 10);
      expect(await relife.isWarrantyValid(1n)).to.be.true;
    });
  });

  describe("3. Input Validation & Access Control Failure Cases", function () {
    it("should revert if an unauthorized caller attempts to set warranty", async function () {
      const now = await time.latest();
      const endTime = now + 86400 * 30;

      await expect(
        relife
          .connect(unauthorized)
          .setProductWarranty(1n, now, endTime, "Bogus Warranty", "ipfs://bogus")
      )
        .to.be.revertedWithCustomError(relife, "ReLife__UnauthorizedWarrantyIssuer")
        .withArgs(1n, unauthorized.address);
    });

    it("should revert if warrantyEnd is in the past or equal to current timestamp", async function () {
      const now = await time.latest();

      await expect(
        relife
          .connect(manufacturer)
          .setProductWarranty(1n, now - 100, now - 50, "Past Warranty", "ipfs://terms")
      )
        .to.be.revertedWithCustomError(relife, "ReLife__InvalidWarrantyExpiry")
        .withArgs(now - 50);
    });

    it("should revert if warrantyEnd is less than or equal to warrantyStart", async function () {
      const now = await time.latest();
      const startTime = now + 86400 * 10;
      const endTime = startTime; // equal

      await expect(
        relife
          .connect(manufacturer)
          .setProductWarranty(1n, startTime, endTime, "Invalid Duration", "ipfs://terms")
      )
        .to.be.revertedWithCustomError(relife, "ReLife__InvalidWarrantyExpiry")
        .withArgs(endTime);
    });

    it("should revert if warrantyType is empty", async function () {
      const now = await time.latest();
      await expect(
        relife
          .connect(manufacturer)
          .setProductWarranty(1n, now, now + 86400, "", "ipfs://terms")
      )
        .to.be.revertedWithCustomError(relife, "ReLife__EmptyString")
        .withArgs("warrantyType");
    });

    it("should revert if product ID is invalid", async function () {
      const now = await time.latest();
      await expect(
        relife
          .connect(manufacturer)
          .setProductWarranty(999n, now, now + 86400, "Valid Type", "ipfs://terms")
      )
        .to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound")
        .withArgs(999n);

      await expect(relife.isWarrantyValid(999n)).to.be.revertedWithCustomError(
        relife,
        "ReLife__ProductNotFound"
      );
    });

    it("should revert and invalidate warranty after product is Recycled", async function () {
      const [, , , , , recycler] = await ethers.getSigners();
      await relife.connect(admin).registerRecycler(recycler.address, "EcoRecycler Plant");

      const now = await time.latest();
      await relife
        .connect(manufacturer)
        .setProductWarranty(1n, now, now + 86400 * 365, "Valid 1-Year", "ipfs://terms");

      expect(await relife.isWarrantyValid(1n)).to.be.true;

      // Decommission product
      await relife
        .connect(recycler)
        .addRecyclingRecord(1n, "EcoRecycler Plant", "Processed", "ipfs://cert");

      // Warranty is now invalid because product is decommissioned
      expect(await relife.isWarrantyValid(1n)).to.be.false;

      // Setting new warranty on recycled product must revert
      await expect(
        relife
          .connect(manufacturer)
          .setProductWarranty(1n, now, now + 86400 * 100, "Zombie Warranty", "ipfs://terms")
      )
        .to.be.revertedWithCustomError(relife, "ReLife__ProductAlreadyRecycled")
        .withArgs(1n);
    });
  });
});
