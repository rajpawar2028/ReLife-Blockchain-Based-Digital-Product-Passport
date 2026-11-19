const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Area 3: Pausable Emergency Circuit Breaker & Role Revocation", function () {
  let relife;
  let admin, admin2, manufacturer, repairCenter, recycler, buyer, unauthorized;
  let DEFAULT_ADMIN_ROLE, MANUFACTURER_ROLE, REPAIR_CENTER_ROLE, RECYCLER_ROLE;

  beforeEach(async function () {
    [admin, admin2, manufacturer, repairCenter, recycler, buyer, unauthorized] =
      await ethers.getSigners();

    const ReLifeFactory = await ethers.getContractFactory("ReLife");
    relife = await ReLifeFactory.deploy();
    await relife.waitForDeployment();

    DEFAULT_ADMIN_ROLE = await relife.DEFAULT_ADMIN_ROLE();
    MANUFACTURER_ROLE = await relife.MANUFACTURER_ROLE();
    REPAIR_CENTER_ROLE = await relife.REPAIR_CENTER_ROLE();
    RECYCLER_ROLE = await relife.RECYCLER_ROLE();

    // Register active ecosystem participants
    await relife.registerManufacturer(manufacturer.address, "GreenTech Electronics");
    await relife.registerRepairCenter(repairCenter.address, "EcoFix Certified");
    await relife.registerRecycler(recycler.address, "Circular Recoveries");
  });

  describe("1. Pausable State & Access Control", function () {
    it("should deploy in an unpaused state", async function () {
      expect(await relife.paused()).to.be.false;
    });

    it("should allow DEFAULT_ADMIN_ROLE to pause the contract and emit Paused", async function () {
      await expect(relife.connect(admin).pause())
        .to.emit(relife, "Paused")
        .withArgs(admin.address);

      expect(await relife.paused()).to.be.true;
    });

    it("should allow DEFAULT_ADMIN_ROLE to unpause the contract and emit Unpaused", async function () {
      await relife.connect(admin).pause();
      expect(await relife.paused()).to.be.true;

      await expect(relife.connect(admin).unpause())
        .to.emit(relife, "Unpaused")
        .withArgs(admin.address);

      expect(await relife.paused()).to.be.false;
    });

    it("should reject pause from non-admin accounts", async function () {
      await expect(relife.connect(unauthorized).pause())
        .to.be.revertedWithCustomError(relife, "AccessControlUnauthorizedAccount")
        .withArgs(unauthorized.address, DEFAULT_ADMIN_ROLE);
    });

    it("should reject unpause from non-admin accounts", async function () {
      await relife.connect(admin).pause();

      await expect(relife.connect(unauthorized).unpause())
        .to.be.revertedWithCustomError(relife, "AccessControlUnauthorizedAccount")
        .withArgs(unauthorized.address, DEFAULT_ADMIN_ROLE);
    });

    it("should revert if attempting to pause an already paused contract", async function () {
      await relife.connect(admin).pause();
      await expect(relife.connect(admin).pause()).to.be.revertedWithCustomError(
        relife,
        "EnforcedPause"
      );
    });

    it("should revert if attempting to unpause an already unpaused contract", async function () {
      await expect(relife.connect(admin).unpause()).to.be.revertedWithCustomError(
        relife,
        "ExpectedPause"
      );
    });
  });

  describe("2. State-Changing Operations Blocked When Paused (EnforcedPause)", function () {
    let testProductId;

    beforeEach(async function () {
      // Register a product while unpaused for testing subsequent state transitions
      const tx = await relife.connect(manufacturer).registerProductWithWarranty(
        "SN-PAUSE-001",
        "Pausable Device X",
        "GreenTech",
        "ipfs://bafy-pause-test",
        ethers.keccak256(ethers.toUtf8Bytes("secret-pause")),
        24,
        "2-Year Warranty"
      );
      const receipt = await tx.wait();
      testProductId = 1n;

      // Now pause the contract
      await relife.connect(admin).pause();
      expect(await relife.paused()).to.be.true;
    });

    it("should reject registerProduct when paused", async function () {
      await expect(
        relife.connect(manufacturer).registerProduct(
          "SN-PAUSE-002",
          "Blocked Product",
          "GreenTech",
          "ipfs://bafy-blocked"
        )
      ).to.be.revertedWithCustomError(relife, "EnforcedPause");
    });

    it("should reject registerProductWithWarranty when paused", async function () {
      await expect(
        relife.connect(manufacturer).registerProductWithWarranty(
          "SN-PAUSE-003",
          "Blocked Product W",
          "GreenTech",
          "ipfs://bafy-blocked",
          ethers.ZeroHash,
          12,
          "1-Year"
        )
      ).to.be.revertedWithCustomError(relife, "EnforcedPause");
    });

    it("should reject initiateTransfer and transferOwnership when paused", async function () {
      await expect(
        relife.connect(manufacturer).initiateTransfer(testProductId, buyer.address)
      ).to.be.revertedWithCustomError(relife, "EnforcedPause");

      await expect(
        relife.connect(manufacturer).transferOwnership(testProductId, buyer.address)
      ).to.be.revertedWithCustomError(relife, "EnforcedPause");
    });

    it("should reject addRepairRecord when paused", async function () {
      await expect(
        relife.connect(repairCenter).addRepairRecord(
          testProductId,
          "Battery Replacement",
          "REPLACED_BATTERY",
          "ipfs://bafy-repair"
        )
      ).to.be.revertedWithCustomError(relife, "EnforcedPause");
    });

    it("should reject addRecyclingRecord when paused", async function () {
      await expect(
        relife.connect(recycler).addRecyclingRecord(
          testProductId,
          "Circular Decommissioning Facility",
          "Yield 92% reclaimed copper & aluminum",
          "ipfs://bafy-recycle"
        )
      ).to.be.revertedWithCustomError(relife, "EnforcedPause");
    });

    it("should reject updateProductStatus when paused", async function () {
      await expect(
        relife.connect(manufacturer).updateProductStatus(testProductId, 1) // Sold
      ).to.be.revertedWithCustomError(relife, "EnforcedPause");
    });

    it("should reject participant onboarding (registerManufacturer, etc.) when paused", async function () {
      await expect(
        relife.connect(admin).registerManufacturer(unauthorized.address, "New Mfg")
      ).to.be.revertedWithCustomError(relife, "EnforcedPause");

      await expect(
        relife.connect(admin).registerRepairCenter(unauthorized.address, "New Repair")
      ).to.be.revertedWithCustomError(relife, "EnforcedPause");

      await expect(
        relife.connect(admin).registerRecycler(unauthorized.address, "New Recycler")
      ).to.be.revertedWithCustomError(relife, "EnforcedPause");
    });

    it("should resume state-changing functions after unpause", async function () {
      await relife.connect(admin).unpause();
      expect(await relife.paused()).to.be.false;

      // Now registerProduct succeeds
      await expect(
        relife.connect(manufacturer).registerProduct(
          "SN-RESUME-001",
          "Resumed Product",
          "GreenTech",
          "ipfs://bafy-resumed"
        )
      ).to.emit(relife, "ProductRegistered");
    });
  });

  describe("3. Read-Only / View Functions Remain Operational When Paused", function () {
    let testProductId;

    beforeEach(async function () {
      const tx = await relife.connect(manufacturer).registerProductWithWarranty(
        "SN-VIEW-001",
        "View Device",
        "GreenTech",
        "ipfs://bafy-view",
        ethers.keccak256(ethers.toUtf8Bytes("view-secret")),
        12,
        "Standard 1-Year"
      );
      await tx.wait();
      testProductId = 1n;

      // Pause contract
      await relife.connect(admin).pause();
    });

    it("should allow getProduct while paused", async function () {
      const product = await relife.getProduct(testProductId);
      expect(product.serialNumber).to.equal("SN-VIEW-001");
      expect(product.brand).to.equal("GreenTech");
    });

    it("should allow getProductBySerial while paused", async function () {
      const product = await relife.getProductBySerial("SN-VIEW-001");
      expect(product.id).to.equal(testProductId);
    });

    it("should allow verifyProduct and verifySecret while paused", async function () {
      const [isValid, mfg, model, brand, serial, owner, mfgTime, metadataURI, isRecycled] =
        await relife.verifyProduct(testProductId);

      expect(isValid).to.be.true;
      expect(mfg).to.equal(manufacturer.address);
      expect(model).to.equal("View Device");
      expect(brand).to.equal("GreenTech");
      expect(isRecycled).to.be.false;

      const isMatch = await relife.verifySecret(testProductId, "view-secret");
      expect(isMatch).to.be.true;
    });

    it("should allow isWarrantyValid and getWarranty while paused", async function () {
      const isValid = await relife.isWarrantyValid(testProductId);
      expect(isValid).to.be.true;

      const [warranty, isExpired] = await relife.getWarranty(testProductId);
      expect(warranty.warrantyEnd).to.be.gt(warranty.warrantyStart);
      expect(warranty.warrantyType).to.equal("Standard 1-Year");
      expect(isExpired).to.be.false;
    });

    it("should allow pagination queries while paused", async function () {
      const [items, total] = await relife.getProductsPaginated(0, 10);
      expect(total).to.equal(1n);
      expect(items.length).to.equal(1);

      const [mfgItems, mfgTotal] = await relife.getProductsByManufacturerPaginated(
        manufacturer.address,
        0,
        10
      );
      expect(mfgTotal).to.equal(1n);
      expect(mfgItems.length).to.equal(1);
    });
  });

  describe("4. Role Revocation & Immutability of Existing Products", function () {
    let preRevocationProductId;

    beforeEach(async function () {
      // Register product before revocation
      const tx = await relife.connect(manufacturer).registerProduct(
        "SN-REVOKE-001",
        "Legacy Product",
        "GreenTech",
        "ipfs://bafy-legacy"
      );
      await tx.wait();
      preRevocationProductId = 1n;
    });

    it("should allow admin to revoke MANUFACTURER_ROLE and block subsequent minting", async function () {
      expect(await relife.hasRole(MANUFACTURER_ROLE, manufacturer.address)).to.be.true;

      // Revoke role
      await expect(relife.connect(admin).revokeRole(MANUFACTURER_ROLE, manufacturer.address))
        .to.emit(relife, "RoleRevoked")
        .withArgs(MANUFACTURER_ROLE, manufacturer.address, admin.address);

      expect(await relife.hasRole(MANUFACTURER_ROLE, manufacturer.address)).to.be.false;

      // Attempt to mint new product fails
      await expect(
        relife.connect(manufacturer).registerProduct(
          "SN-REVOKE-002",
          "Should Fail",
          "GreenTech",
          "ipfs://bafy-fail"
        )
      ).to.be.revertedWithCustomError(relife, "AccessControlUnauthorizedAccount");
    });

    it("should preserve validity and queryability of existing products after manufacturer revocation", async function () {
      // Revoke manufacturer
      await relife.connect(admin).revokeRole(MANUFACTURER_ROLE, manufacturer.address);

      // Existing product passport is still 100% accessible and valid
      const product = await relife.getProduct(preRevocationProductId);
      expect(product.manufacturer).to.equal(manufacturer.address);
      expect(product.serialNumber).to.equal("SN-REVOKE-001");

      const [isValid, mfg] = await relife.verifyProduct(preRevocationProductId);
      expect(isValid).to.be.true;
      expect(mfg).to.equal(manufacturer.address);
    });

    it("should allow admin to revoke REPAIR_CENTER_ROLE and block repairs", async function () {
      await relife.connect(admin).revokeRole(REPAIR_CENTER_ROLE, repairCenter.address);

      await expect(
        relife.connect(repairCenter).addRepairRecord(
          preRevocationProductId,
          "Unauthorized Fix",
          "SCREEN",
          "ipfs://bafy-screen"
        )
      ).to.be.revertedWithCustomError(relife, "AccessControlUnauthorizedAccount");
    });

    it("should allow admin to revoke RECYCLER_ROLE and block recycling", async function () {
      await relife.connect(admin).revokeRole(RECYCLER_ROLE, recycler.address);

      await expect(
        relife.connect(recycler).addRecyclingRecord(
          preRevocationProductId,
          "Unauthorized Recycling Facility",
          "Unauthorized Shred",
          "ipfs://bafy-shred"
        )
      ).to.be.revertedWithCustomError(relife, "AccessControlUnauthorizedAccount");
    });
  });

  describe("5. Last Administrator Lockout Protection", function () {
    it("should initialize with exactly 1 administrator", async function () {
      expect(await relife.getAdminCount()).to.equal(1n);
    });

    it("should revert if the sole administrator attempts to revoke their own admin role", async function () {
      await expect(
        relife.connect(admin).revokeRole(DEFAULT_ADMIN_ROLE, admin.address)
      ).to.be.revertedWithCustomError(relife, "ReLife__CannotRevokeLastAdmin");

      // Admin role must still be active
      expect(await relife.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
      expect(await relife.getAdminCount()).to.equal(1n);
    });

    it("should revert if the sole administrator attempts to renounce their own admin role", async function () {
      await expect(
        relife.connect(admin).renounceRole(DEFAULT_ADMIN_ROLE, admin.address)
      ).to.be.revertedWithCustomError(relife, "ReLife__CannotRevokeLastAdmin");

      expect(await relife.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
      expect(await relife.getAdminCount()).to.equal(1n);
    });

    it("should allow revocation/renunciation when multiple administrators exist", async function () {
      // Grant DEFAULT_ADMIN_ROLE to second admin
      await relife.connect(admin).grantRole(DEFAULT_ADMIN_ROLE, admin2.address);
      expect(await relife.getAdminCount()).to.equal(2n);

      // Now admin can safely revoke admin2
      await expect(relife.connect(admin).revokeRole(DEFAULT_ADMIN_ROLE, admin2.address))
        .to.emit(relife, "RoleRevoked")
        .withArgs(DEFAULT_ADMIN_ROLE, admin2.address, admin.address);

      expect(await relife.getAdminCount()).to.equal(1n);

      // Once count drops back to 1, revoking the sole admin fails again
      await expect(
        relife.connect(admin).revokeRole(DEFAULT_ADMIN_ROLE, admin.address)
      ).to.be.revertedWithCustomError(relife, "ReLife__CannotRevokeLastAdmin");
    });

    it("should allow an admin to renounce their role if another admin remains", async function () {
      await relife.connect(admin).grantRole(DEFAULT_ADMIN_ROLE, admin2.address);
      expect(await relife.getAdminCount()).to.equal(2n);

      // admin2 renounces their own role
      await expect(
        relife.connect(admin2).renounceRole(DEFAULT_ADMIN_ROLE, admin2.address)
      ).to.emit(relife, "RoleRevoked");

      expect(await relife.getAdminCount()).to.equal(1n);
      expect(await relife.hasRole(DEFAULT_ADMIN_ROLE, admin2.address)).to.be.false;
      expect(await relife.hasRole(DEFAULT_ADMIN_ROLE, admin.address)).to.be.true;
    });
  });
});
