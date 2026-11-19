const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Area 6: Comprehensive Failure Cases & Gas Optimization Matrix", function () {
  let relife;
  let admin, manufacturer, repairCenter, recycler, owner, buyer, unauthorized;
  let DEFAULT_ADMIN_ROLE, MANUFACTURER_ROLE, REPAIR_CENTER_ROLE, RECYCLER_ROLE;
  let testProductId;

  beforeEach(async function () {
    [admin, manufacturer, repairCenter, recycler, owner, buyer, unauthorized] =
      await ethers.getSigners();

    const ReLifeFactory = await ethers.getContractFactory("ReLife");
    relife = await ReLifeFactory.deploy();
    await relife.waitForDeployment();

    DEFAULT_ADMIN_ROLE = await relife.DEFAULT_ADMIN_ROLE();
    MANUFACTURER_ROLE = await relife.MANUFACTURER_ROLE();
    REPAIR_CENTER_ROLE = await relife.REPAIR_CENTER_ROLE();
    RECYCLER_ROLE = await relife.RECYCLER_ROLE();

    // Onboard standard actors
    await relife.connect(admin).registerManufacturer(manufacturer.address, "GreenTech OEM");
    await relife.connect(admin).registerRepairCenter(repairCenter.address, "EcoFix Certified");
    await relife.connect(admin).registerRecycler(recycler.address, "EcoRecycle Facility");

    // Mint test product passport #1
    const tx = await relife.connect(manufacturer).registerProductWithWarranty(
      "SN-TEST-001",
      "EcoLaptop 15",
      "GreenTech",
      "ipfs://bafy-product-1",
      ethers.keccak256(ethers.toUtf8Bytes("secret-token-1")),
      24,
      "2-Year Limited Warranty"
    );
    await tx.wait();
    testProductId = 1n;
  });

  describe("1. Zero Address Boundary Rejections (ReLife__ZeroAddress)", function () {
    it("should revert registerManufacturer with zero address", async function () {
      await expect(
        relife.connect(admin).registerManufacturer(ethers.ZeroAddress, "Bad Mfg")
      ).to.be.revertedWithCustomError(relife, "ReLife__ZeroAddress");
    });

    it("should revert registerRepairCenter with zero address", async function () {
      await expect(
        relife.connect(admin).registerRepairCenter(ethers.ZeroAddress, "Bad Repair")
      ).to.be.revertedWithCustomError(relife, "ReLife__ZeroAddress");
    });

    it("should revert registerRecycler with zero address", async function () {
      await expect(
        relife.connect(admin).registerRecycler(ethers.ZeroAddress, "Bad Recycler")
      ).to.be.revertedWithCustomError(relife, "ReLife__ZeroAddress");
    });

    it("should revert initiateTransfer with zero address recipient", async function () {
      await expect(
        relife.connect(manufacturer).initiateTransfer(testProductId, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(relife, "ReLife__ZeroAddress");
    });

    it("should revert transferOwnership with zero address recipient", async function () {
      await expect(
        relife.connect(manufacturer).transferOwnership(testProductId, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(relife, "ReLife__ZeroAddress");
    });
  });

  describe("2. Empty String Input Rejections (ReLife__EmptyString)", function () {
    it("should revert onboarding when name is empty", async function () {
      await expect(
        relife.connect(admin).registerManufacturer(unauthorized.address, "")
      ).to.be.revertedWithCustomError(relife, "ReLife__EmptyString").withArgs("name");

      await expect(
        relife.connect(admin).registerRepairCenter(unauthorized.address, "")
      ).to.be.revertedWithCustomError(relife, "ReLife__EmptyString").withArgs("name");

      await expect(
        relife.connect(admin).registerRecycler(unauthorized.address, "")
      ).to.be.revertedWithCustomError(relife, "ReLife__EmptyString").withArgs("name");
    });

    it("should revert registerProduct when string parameters are empty", async function () {
      await expect(
        relife.connect(manufacturer).registerProduct("", "Model", "Brand", "ipfs://uri")
      ).to.be.revertedWithCustomError(relife, "ReLife__EmptyString").withArgs("serialNumber");

      await expect(
        relife.connect(manufacturer).registerProduct("SN-E1", "", "Brand", "ipfs://uri")
      ).to.be.revertedWithCustomError(relife, "ReLife__EmptyString").withArgs("modelName");

      await expect(
        relife.connect(manufacturer).registerProduct("SN-E2", "Model", "", "ipfs://uri")
      ).to.be.revertedWithCustomError(relife, "ReLife__EmptyString").withArgs("brand");

      await expect(
        relife.connect(manufacturer).registerProduct("SN-E3", "Model", "Brand", "")
      ).to.be.revertedWithCustomError(relife, "ReLife__EmptyString").withArgs("metadataURI");
    });

    it("should revert addRepairRecord when repair strings are empty", async function () {
      await expect(
        relife.connect(repairCenter).addRepairRecord(testProductId, "", "Diagnostics", "ipfs://uri")
      ).to.be.revertedWithCustomError(relife, "ReLife__EmptyString").withArgs("repairType");

      await expect(
        relife.connect(repairCenter).addRepairRecord(testProductId, "Type", "", "ipfs://uri")
      ).to.be.revertedWithCustomError(relife, "ReLife__EmptyString").withArgs("description");

      await expect(
        relife.connect(repairCenter).addRepairRecord(testProductId, "Type", "Diagnostics", "")
      ).to.be.revertedWithCustomError(relife, "ReLife__EmptyString").withArgs("serviceUri");
    });

    it("should revert addRecyclingRecord when facility or notes are empty", async function () {
      await expect(
        relife.connect(recycler).addRecyclingRecord(testProductId, "", "Notes", "ipfs://uri")
      ).to.be.revertedWithCustomError(relife, "ReLife__EmptyString").withArgs("recyclingFacility");

      await expect(
        relife.connect(recycler).addRecyclingRecord(testProductId, "Facility", "", "ipfs://uri")
      ).to.be.revertedWithCustomError(relife, "ReLife__EmptyString").withArgs("notes");
    });

    it("should revert setProductWarranty when warrantyType is empty", async function () {
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      await expect(
        relife.connect(manufacturer).setProductWarranty(testProductId, now, now + 1000, "", "ipfs://terms")
      ).to.be.revertedWithCustomError(relife, "ReLife__EmptyString").withArgs("warrantyType");
    });
  });

  describe("3. Non-Existent Product ID Boundaries (ReLife__ProductNotFound & Safe Views)", function () {
    const invalidIds = [0n, 99999n];

    it("should revert mutator functions for non-existent IDs (0 and 99999)", async function () {
      for (const id of invalidIds) {
        await expect(
          relife.connect(manufacturer).setAuthenticityHash(id, ethers.ZeroHash)
        ).to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound").withArgs(id);

        await expect(
          relife.connect(manufacturer).initiateTransfer(id, buyer.address)
        ).to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound").withArgs(id);

        await expect(
          relife.connect(buyer).acceptTransfer(id)
        ).to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound").withArgs(id);

        await expect(
          relife.connect(manufacturer).cancelTransfer(id)
        ).to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound").withArgs(id);

        await expect(
          relife.connect(manufacturer).transferOwnership(id, buyer.address)
        ).to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound").withArgs(id);

        await expect(
          relife.connect(repairCenter).addRepairRecord(id, "Type", "Parts", "ipfs://uri")
        ).to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound").withArgs(id);

        await expect(
          relife.connect(recycler).addRecyclingRecord(id, "Facility", "Notes", "ipfs://uri")
        ).to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound").withArgs(id);

        await expect(
          relife.connect(manufacturer).updateProductStatus(id, 1)
        ).to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound").withArgs(id);

        await expect(
          relife.connect(manufacturer).addWarrantyMonths(id, 12, "Care+", "ipfs://terms")
        ).to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound").withArgs(id);
      }
    });

    it("should revert strict view functions for non-existent IDs", async function () {
      for (const id of invalidIds) {
        await expect(relife.getProduct(id))
          .to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound").withArgs(id);

        await expect(relife.getProductHistory(id))
          .to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound").withArgs(id);

        await expect(relife.getOwnershipHistory(id))
          .to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound").withArgs(id);

        await expect(relife.getWarranty(id))
          .to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound").withArgs(id);

        await expect(relife.getRecyclingRecord(id))
          .to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound").withArgs(id);

        await expect(relife.getRepairCount(id))
          .to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound").withArgs(id);

        await expect(relife.getAuthenticityHash(id))
          .to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound").withArgs(id);

        await expect(relife.getProductStatus(id))
          .to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound").withArgs(id);
      }
    });

    it("should return isValid = false without reverting on verifyProduct for non-existent IDs", async function () {
      for (const id of invalidIds) {
        const [isValid, mfg, model, brand, serial] = await relife.verifyProduct(id);
        expect(isValid).to.be.false;
        expect(mfg).to.equal(ethers.ZeroAddress);
        expect(model).to.equal("");
        expect(brand).to.equal("");
        expect(serial).to.equal("");
      }
    });

    it("should return false without reverting on verifySecret for non-existent IDs", async function () {
      for (const id of invalidIds) {
        expect(await relife.verifySecret(id, "some-secret")).to.be.false;
      }
    });
  });

  describe("4. Unauthorized Caller Enforcements (Role & Custody Access Control)", function () {
    it("should reject non-admin calling admin-only functions", async function () {
      await expect(
        relife.connect(unauthorized).registerManufacturer(unauthorized.address, "Mfg")
      ).to.be.revertedWithCustomError(relife, "AccessControlUnauthorizedAccount");

      await expect(
        relife.connect(unauthorized).registerRepairCenter(unauthorized.address, "Repair")
      ).to.be.revertedWithCustomError(relife, "AccessControlUnauthorizedAccount");

      await expect(
        relife.connect(unauthorized).registerRecycler(unauthorized.address, "Recycler")
      ).to.be.revertedWithCustomError(relife, "AccessControlUnauthorizedAccount");

      await expect(
        relife.connect(unauthorized).pause()
      ).to.be.revertedWithCustomError(relife, "AccessControlUnauthorizedAccount");

      await expect(
        relife.connect(unauthorized).unpause()
      ).to.be.revertedWithCustomError(relife, "AccessControlUnauthorizedAccount");
    });

    it("should reject non-manufacturer attempting to mint products", async function () {
      await expect(
        relife.connect(unauthorized).registerProduct("SN-BAD", "Model", "Brand", "ipfs://uri")
      ).to.be.revertedWithCustomError(relife, "AccessControlUnauthorizedAccount");

      await expect(
        relife.connect(unauthorized).registerProductWithSecret("SN-BAD-S", "M", "B", "uri", ethers.ZeroHash)
      ).to.be.revertedWithCustomError(relife, "AccessControlUnauthorizedAccount");

      await expect(
        relife.connect(unauthorized).registerProductWithWarranty("SN-BAD-W", "M", "B", "uri", ethers.ZeroHash, 12, "cov")
      ).to.be.revertedWithCustomError(relife, "AccessControlUnauthorizedAccount");
    });

    it("should reject non-repair-center attempting to log repair", async function () {
      await expect(
        relife.connect(unauthorized).addRepairRecord(testProductId, "Battery", "Lithium Pack", "ipfs://uri")
      ).to.be.revertedWithCustomError(relife, "AccessControlUnauthorizedAccount");
    });

    it("should reject non-recycler attempting to decommission product", async function () {
      await expect(
        relife.connect(unauthorized).addRecyclingRecord(testProductId, "Facility", "Notes", "ipfs://uri")
      ).to.be.revertedWithCustomError(relife, "AccessControlUnauthorizedAccount");
    });

    it("should reject non-owner attempting to transfer or cancel transfer", async function () {
      await expect(
        relife.connect(unauthorized).initiateTransfer(testProductId, buyer.address)
      ).to.be.revertedWithCustomError(relife, "ReLife__NotProductOwner");

      await expect(
        relife.connect(unauthorized).cancelTransfer(testProductId)
      ).to.be.revertedWithCustomError(relife, "ReLife__NotProductOwner");

      await expect(
        relife.connect(unauthorized).transferOwnership(testProductId, buyer.address)
      ).to.be.revertedWithCustomError(relife, "ReLife__NotProductOwner");
    });

    it("should reject non-pending-owner calling acceptTransfer", async function () {
      await relife.connect(manufacturer).initiateTransfer(testProductId, buyer.address);

      await expect(
        relife.connect(unauthorized).acceptTransfer(testProductId)
      ).to.be.revertedWithCustomError(relife, "ReLife__NotPendingOwner");
    });

    it("should reject unauthorized caller setting authenticity hash or warranty", async function () {
      await expect(
        relife.connect(unauthorized).setAuthenticityHash(testProductId, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(relife, "ReLife__UnauthorizedManufacturer");

      const now = (await ethers.provider.getBlock("latest")).timestamp;
      await expect(
        relife.connect(unauthorized).setProductWarranty(testProductId, now, now + 1000, "Cov", "ipfs://terms")
      ).to.be.revertedWithCustomError(relife, "ReLife__UnauthorizedWarrantyIssuer");
    });
  });

  describe("5. Custody & State Machine Invariant Rejections", function () {
    it("should reject transfer to self", async function () {
      await expect(
        relife.connect(manufacturer).initiateTransfer(testProductId, manufacturer.address)
      ).to.be.revertedWithCustomError(relife, "ReLife__CannotTransferToSelf");

      await expect(
        relife.connect(manufacturer).transferOwnership(testProductId, manufacturer.address)
      ).to.be.revertedWithCustomError(relife, "ReLife__CannotTransferToSelf");
    });

    it("should reject initiateTransfer if a transfer is already pending", async function () {
      await relife.connect(manufacturer).initiateTransfer(testProductId, buyer.address);

      await expect(
        relife.connect(manufacturer).initiateTransfer(testProductId, owner.address)
      ).to.be.revertedWithCustomError(relife, "ReLife__TransferAlreadyPending");
    });

    it("should reject cancelTransfer or acceptTransfer when no transfer is pending", async function () {
      await expect(
        relife.connect(manufacturer).cancelTransfer(testProductId)
      ).to.be.revertedWithCustomError(relife, "ReLife__NoTransferPending");

      await expect(
        relife.connect(buyer).acceptTransfer(testProductId)
      ).to.be.revertedWithCustomError(relife, "ReLife__NoTransferPending");
    });

    it("should reject transfer while product is InRepair", async function () {
      // Transition from Manufactured -> Sold -> InRepair
      await relife.connect(manufacturer).updateProductStatus(testProductId, 1); // Sold
      await relife.connect(repairCenter).updateProductStatus(testProductId, 2); // InRepair

      await expect(
        relife.connect(manufacturer).initiateTransfer(testProductId, buyer.address)
      ).to.be.revertedWithCustomError(relife, "ReLife__ProductInRepair");

      await expect(
        relife.connect(manufacturer).transferOwnership(testProductId, buyer.address)
      ).to.be.revertedWithCustomError(relife, "ReLife__ProductInRepair");
    });

    it("should reject illegal status transitions", async function () {
      // Transition from Manufactured to InRepair directly without Sold is invalid
      await expect(
        relife.connect(manufacturer).updateProductStatus(testProductId, 2) // InRepair
      ).to.be.revertedWithCustomError(relife, "ReLife__InvalidStatusTransition");
    });

    it("should reject all mutators once product is Recycled (Terminal Decommissioning)", async function () {
      // Recycle product
      await relife.connect(recycler).addRecyclingRecord(testProductId, "Circular Hub", "95% yield", "ipfs://cert");

      await expect(
        relife.connect(manufacturer).setAuthenticityHash(testProductId, ethers.ZeroHash)
      ).to.be.revertedWithCustomError(relife, "ReLife__ProductAlreadyRecycled");

      await expect(
        relife.connect(manufacturer).initiateTransfer(testProductId, buyer.address)
      ).to.be.revertedWithCustomError(relife, "ReLife__ProductAlreadyRecycled");

      await expect(
        relife.connect(manufacturer).transferOwnership(testProductId, buyer.address)
      ).to.be.revertedWithCustomError(relife, "ReLife__ProductAlreadyRecycled");

      await expect(
        relife.connect(repairCenter).addRepairRecord(testProductId, "Repair", "Parts", "ipfs://uri")
      ).to.be.revertedWithCustomError(relife, "ReLife__ProductAlreadyRecycled");

      await expect(
        relife.connect(recycler).addRecyclingRecord(testProductId, "Hub2", "Notes", "ipfs://uri")
      ).to.be.revertedWithCustomError(relife, "ReLife__ProductAlreadyRecycled");

      await expect(
        relife.connect(manufacturer).updateProductStatus(testProductId, 1)
      ).to.be.revertedWithCustomError(relife, "ReLife__ProductAlreadyRecycled");

      await expect(
        relife.connect(manufacturer).addWarrantyMonths(testProductId, 12, "Care+", "ipfs://terms")
      ).to.be.revertedWithCustomError(relife, "ReLife__ProductAlreadyRecycled");
    });
  });

  describe("6. Warranty & Pagination Boundary Values", function () {
    it("should reject warrantyMonths > 120 with ReLife__WarrantyPeriodTooLong", async function () {
      await expect(
        relife.connect(manufacturer).registerProductWithWarranty(
          "SN-TOO-LONG",
          "Device",
          "Brand",
          "ipfs://uri",
          ethers.ZeroHash,
          121,
          "Over 10 Years"
        )
      ).to.be.revertedWithCustomError(relife, "ReLife__WarrantyPeriodTooLong").withArgs(121);
    });

    it("should accept warrantyMonths = 120 (maximum boundary)", async function () {
      await expect(
        relife.connect(manufacturer).registerProductWithWarranty(
          "SN-MAX-WARRANTY",
          "Device",
          "Brand",
          "ipfs://uri",
          ethers.ZeroHash,
          120,
          "10-Year Max Warranty"
        )
      ).to.emit(relife, "WarrantyAdded");
    });

    it("should reject setProductWarranty when warrantyEnd is in past or <= warrantyStart", async function () {
      const now = (await ethers.provider.getBlock("latest")).timestamp;

      await expect(
        relife.connect(manufacturer).setProductWarranty(testProductId, now, now - 100, "Past", "ipfs://terms")
      ).to.be.revertedWithCustomError(relife, "ReLife__InvalidWarrantyExpiry");

      await expect(
        relife.connect(manufacturer).setProductWarranty(testProductId, now + 1000, now + 500, "Backwards", "ipfs://terms")
      ).to.be.revertedWithCustomError(relife, "ReLife__InvalidWarrantyExpiry");
    });

    it("should cap limit > 50 and default limit = 0 in getProductsByManufacturerPaginated", async function () {
      // Test limit > 50 cap (covers line 1411 in ReLife.sol)
      const [itemsCap, totalCap] = await relife.getProductsByManufacturerPaginated(
        manufacturer.address,
        0,
        100
      );
      expect(itemsCap.length).to.be.at.most(50);
      expect(totalCap).to.be.at.least(1n);

      // Test limit = 0 default (covers line 1414 in ReLife.sol)
      const [itemsDef, totalDef] = await relife.getProductsByManufacturerPaginated(
        manufacturer.address,
        0,
        0
      );
      expect(itemsDef.length).to.be.at.most(10);
      expect(totalDef).to.be.at.least(1n);
    });
  });
});
