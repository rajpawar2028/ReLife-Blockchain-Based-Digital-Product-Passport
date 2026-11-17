const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Feature 1: Product Status State Machine", function () {
  let relife;
  let admin, manufacturer, repairCenter, recycler, customer, unauthorized;

  // Status enum mapping
  const Status = {
    Manufactured: 0,
    Sold: 1,
    InRepair: 2,
    Recycled: 3,
  };

  const sampleProduct = {
    serialNumber: "SN-STATUS-2026-001",
    modelName: "EcoLaptop 14",
    brand: "CircuTech",
    metadataURI: "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi",
  };

  beforeEach(async function () {
    [admin, manufacturer, repairCenter, recycler, customer, unauthorized] =
      await ethers.getSigners();

    const ReLifeFactory = await ethers.getContractFactory("ReLife");
    relife = await ReLifeFactory.deploy();
    await relife.waitForDeployment();

    // Onboard ecosystem participants
    await relife.connect(admin).registerManufacturer(manufacturer.address, "CircuTech OEM");
    await relife.connect(admin).registerRepairCenter(repairCenter.address, "Certified Repair Lab");
    await relife.connect(admin).registerRecycler(recycler.address, "EcoMetal Recycling");

    // Mint a sample product passport
    await relife
      .connect(manufacturer)
      .registerProduct(
        sampleProduct.serialNumber,
        sampleProduct.modelName,
        sampleProduct.brand,
        sampleProduct.metadataURI
      );
  });

  describe("Initial State & Status Query", function () {
    it("should set initial product status to Manufactured (0)", async function () {
      const status = await relife.getProductStatus(1n);
      expect(status).to.equal(Status.Manufactured);

      const prod = await relife.getProduct(1n);
      expect(prod.status).to.equal(Status.Manufactured);
      expect(prod.isRecycled).to.be.false;
    });

    it("should revert getProductStatus for invalid product IDs", async function () {
      await expect(relife.getProductStatus(0n))
        .to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound")
        .withArgs(0n);

      await expect(relife.getProductStatus(999n))
        .to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound")
        .withArgs(999n);
    });
  });

  describe("Valid State Transitions (Happy Paths)", function () {
    it("should allow transitioning Manufactured -> Sold and emit StatusChanged", async function () {
      await expect(
        relife.connect(manufacturer).updateProductStatus(1n, Status.Sold)
      )
        .to.emit(relife, "StatusChanged")
        .withArgs(1n, Status.Manufactured, Status.Sold, manufacturer.address, (val) => val > 0n);

      expect(await relife.getProductStatus(1n)).to.equal(Status.Sold);
    });

    it("should allow full cycle Sold -> InRepair -> Sold", async function () {
      // Manufactured -> Sold
      await relife.connect(manufacturer).updateProductStatus(1n, Status.Sold);

      // Sold -> InRepair by authorized repair center
      await expect(
        relife.connect(repairCenter).updateProductStatus(1n, Status.InRepair)
      )
        .to.emit(relife, "StatusChanged")
        .withArgs(1n, Status.Sold, Status.InRepair, repairCenter.address, (val) => val > 0n);

      expect(await relife.getProductStatus(1n)).to.equal(Status.InRepair);

      // InRepair -> Sold by repair center once servicing completes
      await expect(
        relife.connect(repairCenter).updateProductStatus(1n, Status.Sold)
      )
        .to.emit(relife, "StatusChanged")
        .withArgs(1n, Status.InRepair, Status.Sold, repairCenter.address, (val) => val > 0n);

      expect(await relife.getProductStatus(1n)).to.equal(Status.Sold);
    });

    it("should allow any active state to transition to Recycled by authorized recycler", async function () {
      // 1. Manufactured -> Recycled
      await relife
        .connect(manufacturer)
        .registerProduct("SN-DEFECTIVE-001", "EcoLaptop 14", "CircuTech", "ipfs://spec");
      const defectiveId = 2n;

      await expect(
        relife.connect(recycler).updateProductStatus(defectiveId, Status.Recycled)
      )
        .to.emit(relife, "StatusChanged")
        .withArgs(defectiveId, Status.Manufactured, Status.Recycled, recycler.address, (val) => val > 0n);

      expect(await relife.getProductStatus(defectiveId)).to.equal(Status.Recycled);
      expect((await relife.getProduct(defectiveId)).isRecycled).to.be.true;

      // 2. Sold -> Recycled
      await relife.connect(manufacturer).updateProductStatus(1n, Status.Sold);
      await relife.connect(recycler).updateProductStatus(1n, Status.Recycled);
      expect(await relife.getProductStatus(1n)).to.equal(Status.Recycled);
    });

    it("should allow InRepair -> Recycled if unfixable", async function () {
      await relife.connect(manufacturer).updateProductStatus(1n, Status.Sold);
      await relife.connect(repairCenter).updateProductStatus(1n, Status.InRepair);

      await relife.connect(recycler).updateProductStatus(1n, Status.Recycled);
      expect(await relife.getProductStatus(1n)).to.equal(Status.Recycled);
    });

    it("should auto-transition Manufactured -> Sold on transferOwnership", async function () {
      expect(await relife.getProductStatus(1n)).to.equal(Status.Manufactured);

      await expect(
        relife.connect(manufacturer).transferOwnership(1n, customer.address)
      )
        .to.emit(relife, "StatusChanged")
        .withArgs(1n, Status.Manufactured, Status.Sold, manufacturer.address, (val) => val > 0n);

      expect(await relife.getProductStatus(1n)).to.equal(Status.Sold);
      expect((await relife.getProduct(1n)).currentOwner).to.equal(customer.address);
    });

    it("should update status to Recycled when addRecyclingRecord is called", async function () {
      await relife.connect(recycler).addRecyclingRecord(
        1n,
        "Zero-Waste Metallurgy Hub",
        "Reclaimed 92% aluminum chassis",
        "ipfs://manifest-001"
      );

      expect(await relife.getProductStatus(1n)).to.equal(Status.Recycled);
      expect((await relife.getProduct(1n)).isRecycled).to.be.true;
    });
  });

  describe("Invalid Transitions & State Machine Blocking (Failure Paths)", function () {
    it("should revert if attempting Manufactured -> InRepair directly", async function () {
      await expect(
        relife.connect(repairCenter).updateProductStatus(1n, Status.InRepair)
      )
        .to.be.revertedWithCustomError(relife, "ReLife__InvalidStatusTransition")
        .withArgs(Status.Manufactured, Status.InRepair);
    });

    it("should revert if attempting Sold -> Manufactured (backward move)", async function () {
      await relife.connect(manufacturer).updateProductStatus(1n, Status.Sold);

      await expect(
        relife.connect(manufacturer).updateProductStatus(1n, Status.Manufactured)
      )
        .to.be.revertedWithCustomError(relife, "ReLife__InvalidStatusTransition")
        .withArgs(Status.Sold, Status.Manufactured);
    });

    it("should revert if attempting InRepair -> Manufactured (backward move)", async function () {
      await relife.connect(manufacturer).updateProductStatus(1n, Status.Sold);
      await relife.connect(repairCenter).updateProductStatus(1n, Status.InRepair);

      await expect(
        relife.connect(repairCenter).updateProductStatus(1n, Status.Manufactured)
      )
        .to.be.revertedWithCustomError(relife, "ReLife__InvalidStatusTransition")
        .withArgs(Status.InRepair, Status.Manufactured);
    });

    it("should revert if attempting any transition out of Recycled (Recycled is terminal)", async function () {
      await relife.connect(recycler).updateProductStatus(1n, Status.Recycled);

      await expect(
        relife.connect(manufacturer).updateProductStatus(1n, Status.Sold)
      )
        .to.be.revertedWithCustomError(relife, "ReLife__ProductAlreadyRecycled")
        .withArgs(1n);

      await expect(
        relife.connect(repairCenter).updateProductStatus(1n, Status.InRepair)
      )
        .to.be.revertedWithCustomError(relife, "ReLife__ProductAlreadyRecycled")
        .withArgs(1n);

      await expect(
        relife.connect(manufacturer).updateProductStatus(1n, Status.Manufactured)
      )
        .to.be.revertedWithCustomError(relife, "ReLife__ProductAlreadyRecycled")
        .withArgs(1n);
    });

    it("should revert if unauthorized caller attempts to update status", async function () {
      // Unauthorized attempts to mark Sold
      await expect(
        relife.connect(unauthorized).updateProductStatus(1n, Status.Sold)
      )
        .to.be.revertedWithCustomError(relife, "ReLife__UnauthorizedStatusUpdater")
        .withArgs(1n, unauthorized.address);

      // Transition to Sold
      await relife.connect(manufacturer).updateProductStatus(1n, Status.Sold);

      // Unauthorized attempts to mark InRepair
      await expect(
        relife.connect(unauthorized).updateProductStatus(1n, Status.InRepair)
      )
        .to.be.revertedWithCustomError(relife, "ReLife__UnauthorizedStatusUpdater")
        .withArgs(1n, unauthorized.address);

      // Unauthorized attempts to mark Recycled
      await expect(
        relife.connect(unauthorized).updateProductStatus(1n, Status.Recycled)
      )
        .to.be.revertedWithCustomError(relife, "ReLife__UnauthorizedStatusUpdater")
        .withArgs(1n, unauthorized.address);
    });

    it("should block ownership transfer while product is InRepair", async function () {
      await relife.connect(manufacturer).updateProductStatus(1n, Status.Sold);
      await relife.connect(repairCenter).updateProductStatus(1n, Status.InRepair);

      await expect(
        relife.connect(manufacturer).transferOwnership(1n, customer.address)
      )
        .to.be.revertedWithCustomError(relife, "ReLife__ProductInRepair")
        .withArgs(1n);
    });

    it("should block transfer, repair and warranty after product is Recycled", async function () {
      await relife.connect(recycler).updateProductStatus(1n, Status.Recycled);

      // Transfer blocked
      await expect(
        relife.connect(manufacturer).transferOwnership(1n, customer.address)
      )
        .to.be.revertedWithCustomError(relife, "ReLife__ProductAlreadyRecycled")
        .withArgs(1n);

      // Repair blocked
      await expect(
        relife.connect(repairCenter).addRepairRecord(1n, "Screen", "Fixed", "ipfs://diag")
      )
        .to.be.revertedWithCustomError(relife, "ReLife__ProductAlreadyRecycled")
        .withArgs(1n);

      // Warranty blocked
      const futureExpiry = Math.floor(Date.now() / 1000) + 86400 * 365;
      await expect(
        relife.connect(manufacturer).addWarranty(1n, futureExpiry, "Standard", "ipfs://terms")
      )
        .to.be.revertedWithCustomError(relife, "ReLife__ProductAlreadyRecycled")
        .withArgs(1n);
    });
  });
});
