const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Phase 1 & 2: ReLife Smart Contract (Core & Repair History)", function () {
  let relife;
  let admin, manufacturer, repairCenter, repairCenter2, recycler, customer, unauthorized;
  let MANUFACTURER_ROLE, REPAIR_CENTER_ROLE, RECYCLER_ROLE, DEFAULT_ADMIN_ROLE;

  const sampleProduct = {
    serialNumber: "SN-ECO-2026-001",
    modelName: "EcoPhone 15",
    brand: "GreenTech",
    metadataURI: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
  };

  beforeEach(async function () {
    [admin, manufacturer, repairCenter, repairCenter2, recycler, customer, unauthorized] =
      await ethers.getSigners();

    const ReLifeFactory = await ethers.getContractFactory("ReLife");
    relife = await ReLifeFactory.deploy();
    await relife.waitForDeployment();

    MANUFACTURER_ROLE = await relife.MANUFACTURER_ROLE();
    REPAIR_CENTER_ROLE = await relife.REPAIR_CENTER_ROLE();
    RECYCLER_ROLE = await relife.RECYCLER_ROLE();
    DEFAULT_ADMIN_ROLE = await relife.DEFAULT_ADMIN_ROLE();
  });

  describe("Phase 1: Deployment & Role Setup", function () {
    it("should grant DEFAULT_ADMIN_ROLE to the deployer", async function () {
      expect(await relife.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
    });

    it("should not grant roles to unauthorized accounts by default", async function () {
      expect(await relife.hasRole(DEFAULT_ADMIN_ROLE, unauthorized.address)).to.be.false;
      expect(await relife.hasRole(MANUFACTURER_ROLE, unauthorized.address)).to.be.false;
      expect(await relife.hasRole(REPAIR_CENTER_ROLE, unauthorized.address)).to.be.false;
      expect(await relife.hasRole(RECYCLER_ROLE, unauthorized.address)).to.be.false;
    });

    it("should start with a product count of zero", async function () {
      expect(await relife.getTotalProducts()).to.equal(0n);
    });
  });

  describe("Phase 1: Manufacturer Registration (registerManufacturer)", function () {
    it("should allow admin to register a manufacturer and emit ManufacturerRegistered event", async function () {
      await expect(
        relife.connect(admin).registerManufacturer(manufacturer.address, "GreenTech Electronics")
      )
        .to.emit(relife, "ManufacturerRegistered")
        .withArgs(manufacturer.address, "GreenTech Electronics", admin.address);

      expect(await relife.hasRole(MANUFACTURER_ROLE, manufacturer.address)).to.be.true;
    });

    it("should revert if a non-admin attempts to register a manufacturer", async function () {
      await expect(
        relife.connect(unauthorized).registerManufacturer(manufacturer.address, "Rogue Corp")
      )
        .to.be.revertedWithCustomError(relife, "AccessControlUnauthorizedAccount")
        .withArgs(unauthorized.address, DEFAULT_ADMIN_ROLE);
    });

    it("should revert if registering zero address as manufacturer", async function () {
      await expect(
        relife.connect(admin).registerManufacturer(ethers.ZeroAddress, "Valid Name")
      ).to.be.revertedWithCustomError(relife, "ReLife__ZeroAddress");
    });

    it("should revert if registering manufacturer with empty name", async function () {
      await expect(
        relife.connect(admin).registerManufacturer(manufacturer.address, "")
      )
        .to.be.revertedWithCustomError(relife, "ReLife__EmptyString")
        .withArgs("name");
    });
  });

  describe("Phase 1: Product Passport Registration (registerProduct)", function () {
    beforeEach(async function () {
      await relife.connect(admin).registerManufacturer(manufacturer.address, "GreenTech Electronics");
    });

    it("should allow an authorized manufacturer to register a product", async function () {
      const tx = await relife
        .connect(manufacturer)
        .registerProduct(
          sampleProduct.serialNumber,
          sampleProduct.modelName,
          sampleProduct.brand,
          sampleProduct.metadataURI
        );

      await expect(tx)
        .to.emit(relife, "ProductRegistered")
        .withArgs(
          1n,
          sampleProduct.serialNumber,
          manufacturer.address,
          sampleProduct.modelName,
          sampleProduct.brand,
          sampleProduct.metadataURI,
          await time.latest()
        );

      expect(await relife.getTotalProducts()).to.equal(1n);
      expect(await relife.isSerialRegistered(sampleProduct.serialNumber)).to.be.true;
    });

    it("should auto-increment product IDs (1, 2, ...)", async function () {
      await relife
        .connect(manufacturer)
        .registerProduct("SN-001", "Model A", "Brand X", "ipfs://cid1");
      await relife
        .connect(manufacturer)
        .registerProduct("SN-002", "Model B", "Brand X", "ipfs://cid2");

      expect(await relife.getTotalProducts()).to.equal(2n);

      const prod1 = await relife.getProduct(1n);
      const prod2 = await relife.getProduct(2n);

      expect(prod1.id).to.equal(1n);
      expect(prod1.serialNumber).to.equal("SN-001");
      expect(prod2.id).to.equal(2n);
      expect(prod2.serialNumber).to.equal("SN-002");
    });

    it("should set initial owner to the registering manufacturer", async function () {
      await relife
        .connect(manufacturer)
        .registerProduct(
          sampleProduct.serialNumber,
          sampleProduct.modelName,
          sampleProduct.brand,
          sampleProduct.metadataURI
        );

      const product = await relife.getProduct(1n);
      expect(product.manufacturer).to.equal(manufacturer.address);
      expect(product.currentOwner).to.equal(manufacturer.address);
      expect(product.isRecycled).to.be.false;
    });

    it("should revert if an unauthorized account attempts to register a product", async function () {
      await expect(
        relife
          .connect(unauthorized)
          .registerProduct(
            sampleProduct.serialNumber,
            sampleProduct.modelName,
            sampleProduct.brand,
            sampleProduct.metadataURI
          )
      )
        .to.be.revertedWithCustomError(relife, "AccessControlUnauthorizedAccount")
        .withArgs(unauthorized.address, MANUFACTURER_ROLE);
    });

    it("should revert if registering a product with a duplicate serial number", async function () {
      await relife
        .connect(manufacturer)
        .registerProduct(
          sampleProduct.serialNumber,
          sampleProduct.modelName,
          sampleProduct.brand,
          sampleProduct.metadataURI
        );

      await expect(
        relife
          .connect(manufacturer)
          .registerProduct(
            sampleProduct.serialNumber,
            "Another Model",
            "Another Brand",
            "ipfs://different-cid"
          )
      )
        .to.be.revertedWithCustomError(relife, "ReLife__SerialAlreadyExists")
        .withArgs(sampleProduct.serialNumber);
    });

    it("should revert if serialNumber is empty", async function () {
      await expect(
        relife
          .connect(manufacturer)
          .registerProduct("", sampleProduct.modelName, sampleProduct.brand, sampleProduct.metadataURI)
      )
        .to.be.revertedWithCustomError(relife, "ReLife__EmptyString")
        .withArgs("serialNumber");
    });

    it("should revert if modelName is empty", async function () {
      await expect(
        relife
          .connect(manufacturer)
          .registerProduct(sampleProduct.serialNumber, "", sampleProduct.brand, sampleProduct.metadataURI)
      )
        .to.be.revertedWithCustomError(relife, "ReLife__EmptyString")
        .withArgs("modelName");
    });

    it("should revert if brand is empty", async function () {
      await expect(
        relife
          .connect(manufacturer)
          .registerProduct(sampleProduct.serialNumber, sampleProduct.modelName, "", sampleProduct.metadataURI)
      )
        .to.be.revertedWithCustomError(relife, "ReLife__EmptyString")
        .withArgs("brand");
    });

    it("should revert if metadataURI is empty", async function () {
      await expect(
        relife
          .connect(manufacturer)
          .registerProduct(sampleProduct.serialNumber, sampleProduct.modelName, sampleProduct.brand, "")
      )
        .to.be.revertedWithCustomError(relife, "ReLife__EmptyString")
        .withArgs("metadataURI");
    });
  });

  describe("Phase 1: Product Query & Verification", function () {
    beforeEach(async function () {
      await relife.connect(admin).registerManufacturer(manufacturer.address, "GreenTech Electronics");
      await relife
        .connect(manufacturer)
        .registerProduct(
          sampleProduct.serialNumber,
          sampleProduct.modelName,
          sampleProduct.brand,
          sampleProduct.metadataURI
        );
    });

    it("should getProduct details accurately", async function () {
      const prod = await relife.getProduct(1n);
      expect(prod.id).to.equal(1n);
      expect(prod.serialNumber).to.equal(sampleProduct.serialNumber);
      expect(prod.modelName).to.equal(sampleProduct.modelName);
      expect(prod.brand).to.equal(sampleProduct.brand);
      expect(prod.manufacturer).to.equal(manufacturer.address);
      expect(prod.currentOwner).to.equal(manufacturer.address);
      expect(prod.metadataURI).to.equal(sampleProduct.metadataURI);
      expect(prod.isRecycled).to.be.false;
    });

    it("should revert getProduct for non-existent product ID", async function () {
      await expect(relife.getProduct(0n))
        .to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound")
        .withArgs(0n);

      await expect(relife.getProduct(999n))
        .to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound")
        .withArgs(999n);
    });

    it("should look up product by serial number", async function () {
      const prod = await relife.getProductBySerial(sampleProduct.serialNumber);
      expect(prod.id).to.equal(1n);
      expect(prod.modelName).to.equal(sampleProduct.modelName);
    });

    it("should revert getProductBySerial for non-existent serial number", async function () {
      await expect(relife.getProductBySerial("NON-EXISTENT-SN"))
        .to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound")
        .withArgs(0n);
    });

    it("should verifyProduct successfully for registered product", async function () {
      const result = await relife.verifyProduct(1n);
      expect(result.isValid).to.be.true;
      expect(result.manufacturer).to.equal(manufacturer.address);
      expect(result.modelName).to.equal(sampleProduct.modelName);
      expect(result.brand).to.equal(sampleProduct.brand);
      expect(result.serialNumber).to.equal(sampleProduct.serialNumber);
      expect(result.currentOwner).to.equal(manufacturer.address);
      expect(result.metadataURI).to.equal(sampleProduct.metadataURI);
      expect(result.isRecycled).to.be.false;
    });

    it("should safely return isValid = false for non-existent product ID without reverting", async function () {
      const resultZero = await relife.verifyProduct(0n);
      expect(resultZero.isValid).to.be.false;
      expect(resultZero.manufacturer).to.equal(ethers.ZeroAddress);

      const resultNotFound = await relife.verifyProduct(999n);
      expect(resultNotFound.isValid).to.be.false;
      expect(resultNotFound.manufacturer).to.equal(ethers.ZeroAddress);
    });
  });

  describe("Phase 2: Repair Center Registration (registerRepairCenter)", function () {
    it("should allow admin to register a repair center and emit RepairCenterRegistered", async function () {
      await expect(
        relife.connect(admin).registerRepairCenter(repairCenter.address, "iFix Quick Repair")
      )
        .to.emit(relife, "RepairCenterRegistered")
        .withArgs(repairCenter.address, "iFix Quick Repair", admin.address);

      expect(await relife.hasRole(REPAIR_CENTER_ROLE, repairCenter.address)).to.be.true;
    });

    it("should revert if a non-admin attempts to register a repair center", async function () {
      await expect(
        relife.connect(unauthorized).registerRepairCenter(repairCenter.address, "Shady Fixes")
      )
        .to.be.revertedWithCustomError(relife, "AccessControlUnauthorizedAccount")
        .withArgs(unauthorized.address, DEFAULT_ADMIN_ROLE);
    });

    it("should revert if registering zero address as repair center", async function () {
      await expect(
        relife.connect(admin).registerRepairCenter(ethers.ZeroAddress, "Valid Repair")
      ).to.be.revertedWithCustomError(relife, "ReLife__ZeroAddress");
    });

    it("should revert if registering repair center with empty name", async function () {
      await expect(
        relife.connect(admin).registerRepairCenter(repairCenter.address, "")
      )
        .to.be.revertedWithCustomError(relife, "ReLife__EmptyString")
        .withArgs("name");
    });
  });

  describe("Phase 2: Add Repair Records (addRepairRecord)", function () {
    let productId;

    beforeEach(async function () {
      // Setup manufacturer and product
      await relife.connect(admin).registerManufacturer(manufacturer.address, "GreenTech Electronics");
      await relife
        .connect(manufacturer)
        .registerProduct(
          sampleProduct.serialNumber,
          sampleProduct.modelName,
          sampleProduct.brand,
          sampleProduct.metadataURI
        );
      productId = 1n;

      // Setup repair center
      await relife.connect(admin).registerRepairCenter(repairCenter.address, "iFix Quick Repair");
    });

    it("should allow an authorized repair center to add a repair record", async function () {
      const tx = await relife
        .connect(repairCenter)
        .addRepairRecord(
          productId,
          "Screen Replacement",
          "Replaced cracked OLED panel with OEM Grade-A display.",
          "ipfs://bafybeirepairdiagnosticdoc1"
        );

      await expect(tx)
        .to.emit(relife, "RepairRecordAdded")
        .withArgs(
          productId,
          1n, // repairId = 1
          repairCenter.address,
          "Screen Replacement",
          "Replaced cracked OLED panel with OEM Grade-A display.",
          "ipfs://bafybeirepairdiagnosticdoc1",
          await time.latest()
        );

      expect(await relife.getRepairCount(productId)).to.equal(1n);
    });

    it("should assign sequential repair IDs for each product", async function () {
      await relife
        .connect(repairCenter)
        .addRepairRecord(productId, "Service 1", "Desc 1", "ipfs://uri1");
      await relife
        .connect(repairCenter)
        .addRepairRecord(productId, "Service 2", "Desc 2", "ipfs://uri2");

      expect(await relife.getRepairCount(productId)).to.equal(2n);

      const history = await relife.getProductHistory(productId);
      expect(history[0].id).to.equal(1n);
      expect(history[0].repairType).to.equal("Service 1");
      expect(history[1].id).to.equal(2n);
      expect(history[1].repairType).to.equal("Service 2");
    });

    it("should revert if an unauthorized account attempts to add a repair record", async function () {
      await expect(
        relife
          .connect(unauthorized)
          .addRepairRecord(productId, "Hacked Repair", "Illicit service", "ipfs://fake")
      )
        .to.be.revertedWithCustomError(relife, "AccessControlUnauthorizedAccount")
        .withArgs(unauthorized.address, REPAIR_CENTER_ROLE);
    });

    it("should revert if adding repair record for non-existent product", async function () {
      await expect(
        relife
          .connect(repairCenter)
          .addRepairRecord(999n, "Screen", "Fixed", "ipfs://uri")
      )
        .to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound")
        .withArgs(999n);

      await expect(
        relife
          .connect(repairCenter)
          .addRepairRecord(0n, "Screen", "Fixed", "ipfs://uri")
      )
        .to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound")
        .withArgs(0n);
    });

    it("should revert if repairType is empty", async function () {
      await expect(
        relife
          .connect(repairCenter)
          .addRepairRecord(productId, "", "Description", "ipfs://uri")
      )
        .to.be.revertedWithCustomError(relife, "ReLife__EmptyString")
        .withArgs("repairType");
    });

    it("should revert if description is empty", async function () {
      await expect(
        relife
          .connect(repairCenter)
          .addRepairRecord(productId, "Battery", "", "ipfs://uri")
      )
        .to.be.revertedWithCustomError(relife, "ReLife__EmptyString")
        .withArgs("description");
    });

    it("should revert if serviceUri is empty", async function () {
      await expect(
        relife
          .connect(repairCenter)
          .addRepairRecord(productId, "Battery", "Installed new OEM battery", "")
      )
        .to.be.revertedWithCustomError(relife, "ReLife__EmptyString")
        .withArgs("serviceUri");
    });
  });

  describe("Phase 2: Chronological History (getProductHistory)", function () {
    let productId;

    beforeEach(async function () {
      await relife.connect(admin).registerManufacturer(manufacturer.address, "GreenTech Electronics");
      await relife
        .connect(manufacturer)
        .registerProduct(
          sampleProduct.serialNumber,
          sampleProduct.modelName,
          sampleProduct.brand,
          sampleProduct.metadataURI
        );
      productId = 1n;

      await relife.connect(admin).registerRepairCenter(repairCenter.address, "Authorized Tech Lab 1");
      await relife.connect(admin).registerRepairCenter(repairCenter2.address, "Authorized Tech Lab 2");
    });

    it("should return empty history array for product with no repairs", async function () {
      const history = await relife.getProductHistory(productId);
      expect(history).to.be.an("array").that.is.empty;
      expect(await relife.getRepairCount(productId)).to.equal(0n);
    });

    it("should return repair records in exact chronological order across multiple centers and times", async function () {
      // Repair 1 by Center 1 at T1
      await relife
        .connect(repairCenter)
        .addRepairRecord(productId, "Diagnostic Check", "Routine checkup passed", "ipfs://diag1");
      const t1 = await time.latest();

      // Fast-forward 1 day
      await time.increase(86400);

      // Repair 2 by Center 2 at T2
      await relife
        .connect(repairCenter2)
        .addRepairRecord(productId, "Battery Replacement", "Upgraded 4000mAh battery", "ipfs://diag2");
      const t2 = await time.latest();

      // Fast-forward 30 days
      await time.increase(86400 * 30);

      // Repair 3 by Center 1 at T3
      await relife
        .connect(repairCenter)
        .addRepairRecord(productId, "Camera Sensor Fix", "Re-aligned wide angle optical sensor", "ipfs://diag3");
      const t3 = await time.latest();

      // Retrieve full history
      const history = await relife.getProductHistory(productId);
      expect(history.length).to.equal(3);

      // Verify Record 1
      expect(history[0].id).to.equal(1n);
      expect(history[0].repairCenter).to.equal(repairCenter.address);
      expect(history[0].repairType).to.equal("Diagnostic Check");
      expect(history[0].timestamp).to.equal(t1);

      // Verify Record 2
      expect(history[1].id).to.equal(2n);
      expect(history[1].repairCenter).to.equal(repairCenter2.address);
      expect(history[1].repairType).to.equal("Battery Replacement");
      expect(history[1].timestamp).to.equal(t2);

      // Verify Record 3
      expect(history[2].id).to.equal(3n);
      expect(history[2].repairCenter).to.equal(repairCenter.address);
      expect(history[2].repairType).to.equal("Camera Sensor Fix");
      expect(history[2].timestamp).to.equal(t3);

      // Verify strict chronological order
      expect(history[0].timestamp).to.be.lessThan(history[1].timestamp);
      expect(history[1].timestamp).to.be.lessThan(history[2].timestamp);
    });

    it("should revert getProductHistory for non-existent product ID", async function () {
      await expect(relife.getProductHistory(999n))
        .to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound")
        .withArgs(999n);
    });

    it("should revert getRepairCount for non-existent product ID", async function () {
      await expect(relife.getRepairCount(999n))
        .to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound")
        .withArgs(999n);
    });
  });

  describe("Phase 7: Ownership Transfer (transferOwnership)", function () {
    let productId;

    beforeEach(async function () {
      await relife.connect(admin).registerManufacturer(manufacturer.address, "GreenTech Electronics");
      await relife
        .connect(manufacturer)
        .registerProduct(
          sampleProduct.serialNumber,
          sampleProduct.modelName,
          sampleProduct.brand,
          sampleProduct.metadataURI
        );
      productId = 1n;
    });

    it("should allow the current owner to transfer ownership to another address", async function () {
      const tx = await relife.connect(manufacturer).transferOwnership(productId, customer.address);

      await expect(tx)
        .to.emit(relife, "OwnershipTransferred")
        .withArgs(productId, manufacturer.address, customer.address, await time.latest());

      const prod = await relife.getProduct(productId);
      expect(prod.currentOwner).to.equal(customer.address);
    });

    it("should allow sequential secondary market transfers", async function () {
      // Transfer 1: Manufacturer -> Customer 1
      await relife.connect(manufacturer).transferOwnership(productId, customer.address);
      expect((await relife.getProduct(productId)).currentOwner).to.equal(customer.address);

      // Transfer 2: Customer 1 -> Unauthorized (acting as buyer 2)
      await relife.connect(customer).transferOwnership(productId, unauthorized.address);
      expect((await relife.getProduct(productId)).currentOwner).to.equal(unauthorized.address);
    });

    it("should revert if a non-owner attempts to transfer ownership", async function () {
      await expect(
        relife.connect(unauthorized).transferOwnership(productId, customer.address)
      )
        .to.be.revertedWithCustomError(relife, "ReLife__NotProductOwner")
        .withArgs(productId, unauthorized.address);
    });

    it("should revert if transferring ownership to zero address", async function () {
      await expect(
        relife.connect(manufacturer).transferOwnership(productId, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(relife, "ReLife__ZeroAddress");
    });

    it("should revert if transferring ownership to self", async function () {
      await expect(
        relife.connect(manufacturer).transferOwnership(productId, manufacturer.address)
      ).to.be.revertedWithCustomError(relife, "ReLife__CannotTransferToSelf");
    });

    it("should revert transfer for non-existent product", async function () {
      await expect(
        relife.connect(manufacturer).transferOwnership(999n, customer.address)
      )
        .to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound")
        .withArgs(999n);
    });
  });

  describe("Phase 7: Auditable Chain of Custody (getOwnershipHistory)", function () {
    let productId;

    beforeEach(async function () {
      await relife.connect(admin).registerManufacturer(manufacturer.address, "GreenTech Electronics");
      await relife
        .connect(manufacturer)
        .registerProduct(
          sampleProduct.serialNumber,
          sampleProduct.modelName,
          sampleProduct.brand,
          sampleProduct.metadataURI
        );
      productId = 1n;
    });

    it("should record full chronological chain of custody from origin through secondary owners", async function () {
      const t0 = await time.latest();

      // Transfer to User 1
      await time.increase(3600);
      await relife.connect(manufacturer).transferOwnership(productId, customer.address);
      const t1 = await time.latest();

      // Transfer to User 2
      await time.increase(7200);
      await relife.connect(customer).transferOwnership(productId, unauthorized.address);
      const t2 = await time.latest();

      const history = await relife.getOwnershipHistory(productId);
      expect(history.length).to.equal(3);

      // Record 0: Initial Minting / Origin
      expect(history[0].previousOwner).to.equal(ethers.ZeroAddress);
      expect(history[0].newOwner).to.equal(manufacturer.address);

      // Record 1: Manufacturer -> Customer
      expect(history[1].previousOwner).to.equal(manufacturer.address);
      expect(history[1].newOwner).to.equal(customer.address);
      expect(history[1].timestamp).to.equal(t1);

      // Record 2: Customer -> Second buyer
      expect(history[2].previousOwner).to.equal(customer.address);
      expect(history[2].newOwner).to.equal(unauthorized.address);
      expect(history[2].timestamp).to.equal(t2);

      expect(history[0].timestamp).to.be.lessThanOrEqual(history[1].timestamp);
      expect(history[1].timestamp).to.be.lessThan(history[2].timestamp);
    });

    it("should revert getOwnershipHistory for non-existent product", async function () {
      await expect(relife.getOwnershipHistory(999n))
        .to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound")
        .withArgs(999n);
    });
  });

  describe("Phase 7: Warranty Management (addWarranty & getWarranty)", function () {
    let productId;

    beforeEach(async function () {
      await relife.connect(admin).registerManufacturer(manufacturer.address, "GreenTech Electronics");
      await relife
        .connect(manufacturer)
        .registerProduct(
          sampleProduct.serialNumber,
          sampleProduct.modelName,
          sampleProduct.brand,
          sampleProduct.metadataURI
        );
      productId = 1n;
    });

    it("should allow manufacturer to add warranty and query active status", async function () {
      const now = await time.latest();
      const twoYearsInSeconds = 2 * 365 * 86400;
      const expiry = now + twoYearsInSeconds;

      await expect(
        relife
          .connect(manufacturer)
          .addWarranty(productId, expiry, "2-Year All-Inclusive Manufacturer Warranty", "ipfs://warrantyTermsDoc1")
      )
        .to.emit(relife, "WarrantyAdded")
        .withArgs(productId, expiry, "2-Year All-Inclusive Manufacturer Warranty", "ipfs://warrantyTermsDoc1", manufacturer.address);

      const [warranty, isExpired] = await relife.getWarranty(productId);
      expect(warranty.expiryTimestamp).to.equal(expiry);
      expect(warranty.warrantyType).to.equal("2-Year All-Inclusive Manufacturer Warranty");
      expect(warranty.termsUri).to.equal("ipfs://warrantyTermsDoc1");
      expect(warranty.isActive).to.be.true;
      expect(isExpired).to.be.false;
    });

    it("should allow contract admin to add warranty", async function () {
      const now = await time.latest();
      const expiry = now + 86400 * 365;

      await expect(
        relife.connect(admin).addWarranty(productId, expiry, "Extended Protection", "ipfs://adminWarranty")
      ).to.emit(relife, "WarrantyAdded");
    });

    it("should accurately reflect isExpired = true after warranty expiry timestamp passes", async function () {
      const now = await time.latest();
      const expiry = now + 1000;

      await relife
        .connect(manufacturer)
        .addWarranty(productId, expiry, "Short Warranty", "ipfs://terms");

      // Before expiry
      let [, isExpired] = await relife.getWarranty(productId);
      expect(isExpired).to.be.false;

      // Fast forward past expiry
      await time.increase(1005);

      [, isExpired] = await relife.getWarranty(productId);
      expect(isExpired).to.be.true;
    });

    it("should revert if adding warranty with past or current timestamp", async function () {
      const now = await time.latest();
      await expect(
        relife
          .connect(manufacturer)
          .addWarranty(productId, now - 10, "Expired Warranty", "ipfs://terms")
      )
        .to.be.revertedWithCustomError(relife, "ReLife__InvalidWarrantyExpiry")
        .withArgs(now - 10);
    });

    it("should revert if non-manufacturer and non-admin attempts to add warranty", async function () {
      const now = await time.latest();
      const expiry = now + 86400 * 30;

      await expect(
        relife
          .connect(unauthorized)
          .addWarranty(productId, expiry, "Fake Warranty", "ipfs://terms")
      )
        .to.be.revertedWithCustomError(relife, "ReLife__UnauthorizedWarrantyIssuer")
        .withArgs(productId, unauthorized.address);
    });

    it("should revert if warrantyType is empty", async function () {
      const now = await time.latest();
      await expect(
        relife
          .connect(manufacturer)
          .addWarranty(productId, now + 1000, "", "ipfs://terms")
      )
        .to.be.revertedWithCustomError(relife, "ReLife__EmptyString")
        .withArgs("warrantyType");
    });
  });

  describe("Phase 8: Recycler Registration (registerRecycler)", function () {
    it("should allow admin to register a recycler and emit RecyclerRegistered", async function () {
      await expect(
        relife.connect(admin).registerRecycler(recycler.address, "EcoCycle Deconstruction Plant")
      )
        .to.emit(relife, "RecyclerRegistered")
        .withArgs(recycler.address, "EcoCycle Deconstruction Plant", admin.address);

      expect(await relife.hasRole(RECYCLER_ROLE, recycler.address)).to.be.true;
    });

    it("should revert if a non-admin attempts to register a recycler", async function () {
      await expect(
        relife.connect(unauthorized).registerRecycler(recycler.address, "Illegal Scrapper")
      )
        .to.be.revertedWithCustomError(relife, "AccessControlUnauthorizedAccount")
        .withArgs(unauthorized.address, DEFAULT_ADMIN_ROLE);
    });

    it("should revert if registering zero address as recycler", async function () {
      await expect(
        relife.connect(admin).registerRecycler(ethers.ZeroAddress, "Valid Plant")
      ).to.be.revertedWithCustomError(relife, "ReLife__ZeroAddress");
    });

    it("should revert if registering recycler with empty name", async function () {
      await expect(
        relife.connect(admin).registerRecycler(recycler.address, "")
      )
        .to.be.revertedWithCustomError(relife, "ReLife__EmptyString")
        .withArgs("name");
    });
  });

  describe("Phase 8: Product Decommissioning (addRecyclingRecord)", function () {
    let productId;

    beforeEach(async function () {
      await relife.connect(admin).registerManufacturer(manufacturer.address, "GreenTech Electronics");
      await relife
        .connect(manufacturer)
        .registerProduct(
          sampleProduct.serialNumber,
          sampleProduct.modelName,
          sampleProduct.brand,
          sampleProduct.metadataURI
        );
      productId = 1n;

      await relife.connect(admin).registerRecycler(recycler.address, "EcoCycle Recovery");
    });

    it("should allow authorized recycler to decommission product, emit event, and store record", async function () {
      const tx = await relife
        .connect(recycler)
        .addRecyclingRecord(
          productId,
          "EcoCycle Recovery Facility #1",
          "Dismantled for circular aluminum and lithium extraction",
          "ipfs://bafybeirecyclingcertificate1"
        );

      await expect(tx)
        .to.emit(relife, "ProductRecycled")
        .withArgs(
          productId,
          recycler.address,
          "EcoCycle Recovery Facility #1",
          "Dismantled for circular aluminum and lithium extraction",
          "ipfs://bafybeirecyclingcertificate1",
          await time.latest()
        );

      const prod = await relife.getProduct(productId);
      expect(prod.isRecycled).to.be.true;

      const recRecord = await relife.getRecyclingRecord(productId);
      expect(recRecord.recycler).to.equal(recycler.address);
      expect(recRecord.recyclingFacility).to.equal("EcoCycle Recovery Facility #1");
      expect(recRecord.notes).to.equal("Dismantled for circular aluminum and lithium extraction");
      expect(recRecord.certificateUri).to.equal("ipfs://bafybeirecyclingcertificate1");
    });

    it("should revert if non-recycler attempts to call addRecyclingRecord", async function () {
      await expect(
        relife
          .connect(unauthorized)
          .addRecyclingRecord(productId, "Illegal Facility", "Scrapped", "ipfs://fake")
      )
        .to.be.revertedWithCustomError(relife, "AccessControlUnauthorizedAccount")
        .withArgs(unauthorized.address, RECYCLER_ROLE);
    });

    it("should revert if decommissioning a non-existent product", async function () {
      await expect(
        relife
          .connect(recycler)
          .addRecyclingRecord(999n, "Facility", "Notes", "ipfs://cert")
      )
        .to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound")
        .withArgs(999n);
    });

    it("should revert if facility name or notes are empty", async function () {
      await expect(
        relife.connect(recycler).addRecyclingRecord(productId, "", "Notes", "ipfs://cert")
      )
        .to.be.revertedWithCustomError(relife, "ReLife__EmptyString")
        .withArgs("recyclingFacility");

      await expect(
        relife.connect(recycler).addRecyclingRecord(productId, "Facility", "", "ipfs://cert")
      )
        .to.be.revertedWithCustomError(relife, "ReLife__EmptyString")
        .withArgs("notes");
    });

    it("should revert if attempting to decommission an already recycled product", async function () {
      await relife
        .connect(recycler)
        .addRecyclingRecord(productId, "Facility 1", "Notes 1", "ipfs://cert1");

      await expect(
        relife
          .connect(recycler)
          .addRecyclingRecord(productId, "Facility 2", "Notes 2", "ipfs://cert2")
      )
        .to.be.revertedWithCustomError(relife, "ReLife__ProductAlreadyRecycled")
        .withArgs(productId);
    });
  });

  describe("Phase 8: Post-Recycling Freeze Enforcement", function () {
    let productId;

    beforeEach(async function () {
      await relife.connect(admin).registerManufacturer(manufacturer.address, "GreenTech Electronics");
      await relife
        .connect(manufacturer)
        .registerProduct(
          sampleProduct.serialNumber,
          sampleProduct.modelName,
          sampleProduct.brand,
          sampleProduct.metadataURI
        );
      productId = 1n;

      await relife.connect(admin).registerRepairCenter(repairCenter.address, "Quick Fix");
      await relife.connect(admin).registerRecycler(recycler.address, "EcoCycle Recovery");

      // Decommission the product
      await relife
        .connect(recycler)
        .addRecyclingRecord(productId, "EcoCycle Facility", "Deconstructed", "ipfs://cert");
    });

    it("should block ownership transfers on recycled products", async function () {
      await expect(
        relife.connect(manufacturer).transferOwnership(productId, customer.address)
      )
        .to.be.revertedWithCustomError(relife, "ReLife__ProductAlreadyRecycled")
        .withArgs(productId);
    });

    it("should block new repair records on recycled products", async function () {
      await expect(
        relife
          .connect(repairCenter)
          .addRepairRecord(productId, "Resurrection Attempt", "Should fail", "ipfs://report")
      )
        .to.be.revertedWithCustomError(relife, "ReLife__ProductAlreadyRecycled")
        .withArgs(productId);
    });

    it("should block adding warranties on recycled products", async function () {
      const now = await time.latest();
      await expect(
        relife
          .connect(manufacturer)
          .addWarranty(productId, now + 1000, "Post-Mortem Warranty", "ipfs://terms")
      )
        .to.be.revertedWithCustomError(relife, "ReLife__ProductAlreadyRecycled")
        .withArgs(productId);
    });
  });
});
