const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("Feature 3: Ownership Transfer with 2-Step Accept Flow", function () {
  let relife;
  let admin, manufacturer, buyer1, buyer2, unauthorized, repairCenter, recycler;

  const sampleProduct = {
    serialNumber: "SN-TRANSFER-2026-001",
    modelName: "EcoLaptop 14",
    brand: "CircuTech",
    metadataURI: "ipfs://bafybeigtransfertest001",
  };

  beforeEach(async function () {
    [admin, manufacturer, buyer1, buyer2, unauthorized, repairCenter, recycler] =
      await ethers.getSigners();

    const ReLifeFactory = await ethers.getContractFactory("ReLife");
    relife = await ReLifeFactory.deploy();
    await relife.waitForDeployment();

    // Register roles
    await relife.connect(admin).registerManufacturer(manufacturer.address, "CircuTech OEM");
    await relife.connect(admin).registerRepairCenter(repairCenter.address, "FixFast Center");
    await relife.connect(admin).registerRecycler(recycler.address, "EcoRecycle Plant");

    // Mint test product #1 (initial owner: manufacturer, initial status: Manufactured)
    await relife
      .connect(manufacturer)
      .registerProduct(
        sampleProduct.serialNumber,
        sampleProduct.modelName,
        sampleProduct.brand,
        sampleProduct.metadataURI
      );
  });

  describe("1. Happy Path: 2-Step Transfer (Initiate -> Accept)", function () {
    it("should allow current owner to initiate transfer and record pendingOwner", async function () {
      expect(await relife.getPendingOwner(1n)).to.equal(ethers.ZeroAddress);

      await expect(relife.connect(manufacturer).initiateTransfer(1n, buyer1.address))
        .to.emit(relife, "TransferInitiated")
        .withArgs(1n, manufacturer.address, buyer1.address, (val) => val > 0n);

      expect(await relife.getPendingOwner(1n)).to.equal(buyer1.address);

      // Ownership should NOT have changed yet
      const prod = await relife.getProduct(1n);
      expect(prod.currentOwner).to.equal(manufacturer.address);
    });

    it("should allow pendingOwner to accept transfer, updating ownership and history", async function () {
      // 1. Initiate
      await relife.connect(manufacturer).initiateTransfer(1n, buyer1.address);

      // 2. Accept by designated pendingOwner
      await expect(relife.connect(buyer1).acceptTransfer(1n))
        .to.emit(relife, "TransferAccepted")
        .withArgs(1n, manufacturer.address, buyer1.address, (val) => val > 0n)
        .and.to.emit(relife, "OwnershipTransferred")
        .withArgs(1n, manufacturer.address, buyer1.address, (val) => val > 0n)
        .and.to.emit(relife, "StatusChanged")
        .withArgs(1n, 0, 1, buyer1.address, (val) => val > 0n); // Manufactured -> Sold

      // 3. Verify state updates
      const prod = await relife.getProduct(1n);
      expect(prod.currentOwner).to.equal(buyer1.address);
      expect(prod.status).to.equal(1); // Sold
      expect(await relife.getPendingOwner(1n)).to.equal(ethers.ZeroAddress);

      // 4. Verify auditable history
      const history = await relife.getOwnershipHistory(1n);
      expect(history.length).to.equal(2);
      expect(history[0].previousOwner).to.equal(ethers.ZeroAddress);
      expect(history[0].newOwner).to.equal(manufacturer.address);
      expect(history[1].previousOwner).to.equal(manufacturer.address);
      expect(history[1].newOwner).to.equal(buyer1.address);
    });

    it("should allow sequential secondary market 2-step transfers (A -> B -> C)", async function () {
      // Manufacturer -> Buyer1
      await relife.connect(manufacturer).initiateTransfer(1n, buyer1.address);
      await relife.connect(buyer1).acceptTransfer(1n);

      // Buyer1 -> Buyer2
      await expect(relife.connect(buyer1).initiateTransfer(1n, buyer2.address))
        .to.emit(relife, "TransferInitiated")
        .withArgs(1n, buyer1.address, buyer2.address, (val) => val > 0n);

      await expect(relife.connect(buyer2).acceptTransfer(1n))
        .to.emit(relife, "TransferAccepted")
        .withArgs(1n, buyer1.address, buyer2.address, (val) => val > 0n);

      const prod = await relife.getProduct(1n);
      expect(prod.currentOwner).to.equal(buyer2.address);
      expect(await relife.getPendingOwner(1n)).to.equal(ethers.ZeroAddress);

      const history = await relife.getOwnershipHistory(1n);
      expect(history.length).to.equal(3);
      expect(history[0].previousOwner).to.equal(ethers.ZeroAddress);
      expect(history[0].newOwner).to.equal(manufacturer.address);
      expect(history[1].previousOwner).to.equal(manufacturer.address);
      expect(history[1].newOwner).to.equal(buyer1.address);
      expect(history[2].previousOwner).to.equal(buyer1.address);
      expect(history[2].newOwner).to.equal(buyer2.address);
    });
  });

  describe("2. Cancellation Flow (cancelTransfer)", function () {
    it("should allow current owner to cancel an active pending transfer", async function () {
      await relife.connect(manufacturer).initiateTransfer(1n, buyer1.address);
      expect(await relife.getPendingOwner(1n)).to.equal(buyer1.address);

      await expect(relife.connect(manufacturer).cancelTransfer(1n))
        .to.emit(relife, "TransferCancelled")
        .withArgs(1n, manufacturer.address, buyer1.address, (val) => val > 0n);

      // Pending owner is reset
      expect(await relife.getPendingOwner(1n)).to.equal(ethers.ZeroAddress);

      // Original owner remains unchanged
      const prod = await relife.getProduct(1n);
      expect(prod.currentOwner).to.equal(manufacturer.address);

      // Attempted accept by previously pending buyer must now revert
      await expect(
        relife.connect(buyer1).acceptTransfer(1n)
      ).to.be.revertedWithCustomError(relife, "ReLife__NoTransferPending");
    });

    it("should allow owner to initiate a new transfer after cancelling previous one", async function () {
      await relife.connect(manufacturer).initiateTransfer(1n, buyer1.address);
      await relife.connect(manufacturer).cancelTransfer(1n);

      // Offer to buyer2 instead
      await expect(relife.connect(manufacturer).initiateTransfer(1n, buyer2.address))
        .to.emit(relife, "TransferInitiated")
        .withArgs(1n, manufacturer.address, buyer2.address, (val) => val > 0n);

      expect(await relife.getPendingOwner(1n)).to.equal(buyer2.address);
      await relife.connect(buyer2).acceptTransfer(1n);

      const prod = await relife.getProduct(1n);
      expect(prod.currentOwner).to.equal(buyer2.address);
    });

    it("should revert cancelTransfer if no transfer is currently pending", async function () {
      await expect(
        relife.connect(manufacturer).cancelTransfer(1n)
      ).to.be.revertedWithCustomError(relife, "ReLife__NoTransferPending");
    });

    it("should revert cancelTransfer if called by a non-owner", async function () {
      await relife.connect(manufacturer).initiateTransfer(1n, buyer1.address);

      await expect(
        relife.connect(unauthorized).cancelTransfer(1n)
      )
        .to.be.revertedWithCustomError(relife, "ReLife__NotProductOwner")
        .withArgs(1n, unauthorized.address);
    });
  });

  describe("3. Access Control & Validation Failures", function () {
    it("should revert initiateTransfer if called by non-owner", async function () {
      await expect(
        relife.connect(unauthorized).initiateTransfer(1n, buyer1.address)
      )
        .to.be.revertedWithCustomError(relife, "ReLife__NotProductOwner")
        .withArgs(1n, unauthorized.address);
    });

    it("should revert initiateTransfer if recipient is the zero address", async function () {
      await expect(
        relife.connect(manufacturer).initiateTransfer(1n, ethers.ZeroAddress)
      ).to.be.revertedWithCustomError(relife, "ReLife__ZeroAddress");
    });

    it("should revert initiateTransfer if recipient is the current owner", async function () {
      await expect(
        relife.connect(manufacturer).initiateTransfer(1n, manufacturer.address)
      ).to.be.revertedWithCustomError(relife, "ReLife__CannotTransferToSelf");
    });

    it("should revert initiateTransfer if a transfer is already pending", async function () {
      await relife.connect(manufacturer).initiateTransfer(1n, buyer1.address);

      await expect(
        relife.connect(manufacturer).initiateTransfer(1n, buyer2.address)
      )
        .to.be.revertedWithCustomError(relife, "ReLife__TransferAlreadyPending")
        .withArgs(1n, buyer1.address);
    });

    it("should revert acceptTransfer if called by an account other than pendingOwner", async function () {
      await relife.connect(manufacturer).initiateTransfer(1n, buyer1.address);

      // buyer2 attempts to steal or accept the transfer
      await expect(
        relife.connect(buyer2).acceptTransfer(1n)
      )
        .to.be.revertedWithCustomError(relife, "ReLife__NotPendingOwner")
        .withArgs(1n, buyer2.address);

      // manufacturer cannot accept their own initiated transfer
      await expect(
        relife.connect(manufacturer).acceptTransfer(1n)
      )
        .to.be.revertedWithCustomError(relife, "ReLife__NotPendingOwner")
        .withArgs(1n, manufacturer.address);
    });

    it("should revert acceptTransfer if no transfer is pending", async function () {
      await expect(
        relife.connect(buyer1).acceptTransfer(1n)
      ).to.be.revertedWithCustomError(relife, "ReLife__NoTransferPending");
    });

    it("should revert initiateTransfer, acceptTransfer, and cancelTransfer for invalid product ID", async function () {
      await expect(
        relife.connect(manufacturer).initiateTransfer(999n, buyer1.address)
      ).to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound");

      await expect(
        relife.connect(buyer1).acceptTransfer(999n)
      ).to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound");

      await expect(
        relife.connect(manufacturer).cancelTransfer(999n)
      ).to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound");

      await expect(
        relife.getPendingOwner(999n)
      ).to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound");
    });
  });

  describe("4. Lifecycle State Machine Locks (InRepair & Recycled)", function () {
    it("should block initiateTransfer and acceptTransfer while product status is InRepair", async function () {
      // Advance to Sold
      await relife.connect(manufacturer).transferOwnership(1n, buyer1.address);

      // Put InRepair
      await relife.connect(buyer1).updateProductStatus(1n, 2); // InRepair

      // Initiate transfer must be blocked
      await expect(
        relife.connect(buyer1).initiateTransfer(1n, buyer2.address)
      )
        .to.be.revertedWithCustomError(relife, "ReLife__ProductInRepair")
        .withArgs(1n);
    });

    it("should block initiateTransfer and acceptTransfer once product is Recycled", async function () {
      // 1. Initiate transfer to buyer1
      await relife.connect(manufacturer).initiateTransfer(1n, buyer1.address);
      expect(await relife.getPendingOwner(1n)).to.equal(buyer1.address);

      // 2. Recycler decommissions the product
      await relife
        .connect(recycler)
        .addRecyclingRecord(1n, "EcoRecycle Facility", "Crushed & Recycled", "ipfs://cert");

      // 3. Pending buyer cannot accept now
      await expect(
        relife.connect(buyer1).acceptTransfer(1n)
      )
        .to.be.revertedWithCustomError(relife, "ReLife__ProductAlreadyRecycled")
        .withArgs(1n);

      // 4. Initiating new transfer on recycled product must revert
      await expect(
        relife.connect(manufacturer).initiateTransfer(1n, buyer2.address)
      )
        .to.be.revertedWithCustomError(relife, "ReLife__ProductAlreadyRecycled")
        .withArgs(1n);
    });
  });
});
