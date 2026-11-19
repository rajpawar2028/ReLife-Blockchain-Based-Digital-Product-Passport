const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Area 1: Events for Every State Change & Event-Driven History", function () {
  let relife;
  let admin, manufacturer, repairCenter, recycler, buyer, buyer2, unauthorized;
  const MANUFACTURER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MANUFACTURER_ROLE"));
  const REPAIR_CENTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("REPAIR_CENTER_ROLE"));
  const RECYCLER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("RECYCLER_ROLE"));

  beforeEach(async function () {
    [admin, manufacturer, repairCenter, recycler, buyer, buyer2, unauthorized] =
      await ethers.getSigners();

    const ReLifeFactory = await ethers.getContractFactory("ReLife");
    relife = await ReLifeFactory.deploy();
    await relife.waitForDeployment();

    // Authorize participants
    await relife.registerManufacturer(manufacturer.address, "CircuTech OEM");
    await relife.registerRepairCenter(repairCenter.address, "GreenFix Service");
    await relife.registerRecycler(recycler.address, "EcoDecommission Plant");
  });

  describe("1. Participant Onboarding & Role Governance Events", function () {
    it("should emit ManufacturerRegistered and RoleGranted when admin onboards a manufacturer", async function () {
      const tx = await relife.registerManufacturer(unauthorized.address, "New OEM");
      await expect(tx)
        .to.emit(relife, "ManufacturerRegistered")
        .withArgs(unauthorized.address, "New OEM", admin.address);
      await expect(tx)
        .to.emit(relife, "RoleGranted")
        .withArgs(MANUFACTURER_ROLE, unauthorized.address, admin.address);
    });

    it("should emit RepairCenterRegistered and RoleGranted when admin onboards a repair center", async function () {
      const tx = await relife.registerRepairCenter(unauthorized.address, "New Repairer");
      await expect(tx)
        .to.emit(relife, "RepairCenterRegistered")
        .withArgs(unauthorized.address, "New Repairer", admin.address);
      await expect(tx)
        .to.emit(relife, "RoleGranted")
        .withArgs(REPAIR_CENTER_ROLE, unauthorized.address, admin.address);
    });

    it("should emit RecyclerRegistered and RoleGranted when admin onboards a recycler", async function () {
      const tx = await relife.registerRecycler(unauthorized.address, "New Recycler");
      await expect(tx)
        .to.emit(relife, "RecyclerRegistered")
        .withArgs(unauthorized.address, "New Recycler", admin.address);
      await expect(tx)
        .to.emit(relife, "RoleGranted")
        .withArgs(RECYCLER_ROLE, unauthorized.address, admin.address);
    });
  });

  describe("2. Product Registration & Authenticity Events", function () {
    it("should emit ProductRegistered with indexed productId and manufacturer actor", async function () {
      const tx = await relife.connect(manufacturer).registerProduct(
        "SN-EV-001",
        "EcoBook 14",
        "CircuTech",
        "ipfs://bafy-metadata-1"
      );
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      await expect(tx)
        .to.emit(relife, "ProductRegistered")
        .withArgs(
          1n,
          "SN-EV-001",
          manufacturer.address,
          "EcoBook 14",
          "CircuTech",
          "ipfs://bafy-metadata-1",
          block.timestamp
        );
    });

    it("should emit AuthenticityHashSet when registering with secret hash", async function () {
      const secretHash = ethers.keccak256(ethers.toUtf8Bytes("secret_key_123"));
      const tx = await relife.connect(manufacturer).registerProductWithSecret(
        "SN-EV-002",
        "EcoBook 15",
        "CircuTech",
        "ipfs://bafy-metadata-2",
        secretHash
      );
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      await expect(tx)
        .to.emit(relife, "ProductRegistered")
        .withArgs(1n, "SN-EV-002", manufacturer.address, "EcoBook 15", "CircuTech", "ipfs://bafy-metadata-2", block.timestamp);

      await expect(tx)
        .to.emit(relife, "AuthenticityHashSet")
        .withArgs(1n, secretHash, manufacturer.address, block.timestamp);
    });

    it("should emit AuthenticityHashSet when setAuthenticityHash is called post-registration", async function () {
      await relife.connect(manufacturer).registerProduct(
        "SN-EV-003",
        "EcoBook 16",
        "CircuTech",
        "ipfs://bafy-metadata-3"
      );
      const newHash = ethers.keccak256(ethers.toUtf8Bytes("post_secret_456"));
      const tx = await relife.connect(manufacturer).setAuthenticityHash(1n, newHash);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      await expect(tx)
        .to.emit(relife, "AuthenticityHashSet")
        .withArgs(1n, newHash, manufacturer.address, block.timestamp);
    });
  });

  describe("3. Warranty State Change Events", function () {
    it("should emit WarrantyAdded on registerProductWithWarranty", async function () {
      const tx = await relife.connect(manufacturer).registerProductWithWarranty(
        "SN-EV-004",
        "EcoBook Pro",
        "CircuTech",
        "ipfs://bafy-metadata-4",
        ethers.ZeroHash,
        12n,
        "1-Year Comprehensive Warranty"
      );
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);
      const expectedEnd = BigInt(block.timestamp) + (12n * 30n * 86400n);

      await expect(tx)
        .to.emit(relife, "WarrantyAdded")
        .withArgs(1n, expectedEnd, "1-Year Comprehensive Warranty", "ipfs://bafy-metadata-4", manufacturer.address);
    });

    it("should emit WarrantyAdded on setProductWarranty and addWarrantyMonths", async function () {
      await relife.connect(manufacturer).registerProduct(
        "SN-EV-005",
        "EcoBook Air",
        "CircuTech",
        "ipfs://bafy-metadata-5"
      );
      const blockNow = await ethers.provider.getBlock("latest");
      const start = BigInt(blockNow.timestamp);
      const end = start + (365n * 86400n);

      const tx1 = await relife.connect(manufacturer).setProductWarranty(
        1n,
        start,
        end,
        "Extended Protection",
        "ipfs://bafy-warranty-doc"
      );
      await expect(tx1)
        .to.emit(relife, "WarrantyAdded")
        .withArgs(1n, end, "Extended Protection", "ipfs://bafy-warranty-doc", manufacturer.address);

      // Extend warranty by 6 months
      const tx2 = await relife.connect(manufacturer).addWarrantyMonths(
        1n,
        6n,
        "Extended Protection Plus",
        "ipfs://bafy-warranty-doc-v2"
      );
      const expectedNewEnd = end + (6n * 30n * 86400n);
      await expect(tx2)
        .to.emit(relife, "WarrantyAdded")
        .withArgs(1n, expectedNewEnd, "Extended Protection Plus", "ipfs://bafy-warranty-doc-v2", manufacturer.address);
    });
  });

  describe("4. Ownership Transfer Events (2-Step & Direct)", function () {
    beforeEach(async function () {
      await relife.connect(manufacturer).registerProduct(
        "SN-EV-006",
        "EcoBook Handover",
        "CircuTech",
        "ipfs://bafy-metadata-6"
      );
    });

    it("should emit TransferInitiated with actor from and to", async function () {
      const tx = await relife.connect(manufacturer).initiateTransfer(1n, buyer.address);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      await expect(tx)
        .to.emit(relife, "TransferInitiated")
        .withArgs(1n, manufacturer.address, buyer.address, block.timestamp);
    });

    it("should emit TransferCancelled when owner cancels pending transfer", async function () {
      await relife.connect(manufacturer).initiateTransfer(1n, buyer.address);
      const tx = await relife.connect(manufacturer).cancelTransfer(1n);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      await expect(tx)
        .to.emit(relife, "TransferCancelled")
        .withArgs(1n, manufacturer.address, buyer.address, block.timestamp);
    });

    it("should emit TransferAccepted, OwnershipTransferred, and StatusChanged on acceptTransfer", async function () {
      await relife.connect(manufacturer).initiateTransfer(1n, buyer.address);
      const tx = await relife.connect(buyer).acceptTransfer(1n);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      // Status auto-transitions Manufactured -> Sold
      await expect(tx)
        .to.emit(relife, "StatusChanged")
        .withArgs(1n, 0, 1, buyer.address, block.timestamp);

      await expect(tx)
        .to.emit(relife, "TransferAccepted")
        .withArgs(1n, manufacturer.address, buyer.address, block.timestamp);

      await expect(tx)
        .to.emit(relife, "OwnershipTransferred")
        .withArgs(1n, manufacturer.address, buyer.address, block.timestamp);
    });

    it("should emit OwnershipTransferred on legacy direct transferOwnership", async function () {
      const tx = await relife.connect(manufacturer).transferOwnership(1n, buyer.address);
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      await expect(tx)
        .to.emit(relife, "OwnershipTransferred")
        .withArgs(1n, manufacturer.address, buyer.address, block.timestamp);
    });
  });

  describe("5. Maintenance, Status & Recycling Events", function () {
    beforeEach(async function () {
      await relife.connect(manufacturer).registerProduct(
        "SN-EV-007",
        "EcoBook Serviceable",
        "CircuTech",
        "ipfs://bafy-metadata-7"
      );
      await relife.connect(manufacturer).transferOwnership(1n, buyer.address);
    });

    it("should emit StatusChanged when entering and exiting InRepair", async function () {
      // Sold -> InRepair
      const tx1 = await relife.connect(repairCenter).updateProductStatus(1n, 2); // Status.InRepair
      const receipt1 = await tx1.wait();
      const block1 = await ethers.provider.getBlock(receipt1.blockNumber);
      await expect(tx1)
        .to.emit(relife, "StatusChanged")
        .withArgs(1n, 1, 2, repairCenter.address, block1.timestamp);

      // Add Repair Record
      const txRepair = await relife.connect(repairCenter).addRepairRecord(
        1n,
        "Screen Replacement",
        "Replaced damaged OLED display panel",
        "ipfs://bafy-repair-doc"
      );
      const receiptRepair = await txRepair.wait();
      const blockRepair = await ethers.provider.getBlock(receiptRepair.blockNumber);
      await expect(txRepair)
        .to.emit(relife, "RepairRecordAdded")
        .withArgs(
          1n,
          1n,
          repairCenter.address,
          "Screen Replacement",
          "Replaced damaged OLED display panel",
          "ipfs://bafy-repair-doc",
          blockRepair.timestamp
        );

      // InRepair -> Sold
      const tx2 = await relife.connect(repairCenter).updateProductStatus(1n, 1); // Status.Sold
      const receipt2 = await tx2.wait();
      const block2 = await ethers.provider.getBlock(receipt2.blockNumber);
      await expect(tx2)
        .to.emit(relife, "StatusChanged")
        .withArgs(1n, 2, 1, repairCenter.address, block2.timestamp);
    });

    it("should emit ProductRecycled and StatusChanged when recycler decommissions product", async function () {
      const tx = await relife.connect(recycler).addRecyclingRecord(
        1n,
        "EcoPlant Munich",
        "98% metals recovered, zero hazardous residue",
        "ipfs://bafy-destruction-cert"
      );
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);

      await expect(tx)
        .to.emit(relife, "ProductRecycled")
        .withArgs(
          1n,
          recycler.address,
          "EcoPlant Munich",
          "98% metals recovered, zero hazardous residue",
          "ipfs://bafy-destruction-cert",
          block.timestamp
        );

      await expect(tx)
        .to.emit(relife, "StatusChanged")
        .withArgs(1n, 1, 3, recycler.address, block.timestamp);
    });
  });

  describe("6. Event History Reconstruction & Scoping", function () {
    it("should query all lifecycle events for a specific product ID via filters and sort them chronologically", async function () {
      // 1. Mint Product
      await relife.connect(manufacturer).registerProduct(
        "SN-EV-008",
        "EcoBook Chronology",
        "CircuTech",
        "ipfs://bafy-metadata-8"
      );

      // 2. Set authenticity secret hash
      const authHash = ethers.keccak256(ethers.toUtf8Bytes("secret_chrono"));
      await relife.connect(manufacturer).setAuthenticityHash(1n, authHash);

      // 3. Initiate & accept transfer
      await relife.connect(manufacturer).initiateTransfer(1n, buyer.address);
      await relife.connect(buyer).acceptTransfer(1n);

      // 4. Add warranty
      const now = (await ethers.provider.getBlock("latest")).timestamp;
      await relife.connect(manufacturer).setProductWarranty(1n, now, now + 100000, "Care+", "ipfs://terms");

      // 5. Repair
      await relife.connect(repairCenter).updateProductStatus(1n, 2); // InRepair
      await relife.connect(repairCenter).addRepairRecord(1n, "Battery Fix", "Replaced cells", "ipfs://diag");
      await relife.connect(repairCenter).updateProductStatus(1n, 1); // Sold

      // 6. Recycle
      await relife.connect(recycler).addRecyclingRecord(1n, "Plant #1", "Processed", "ipfs://cert");

      // Query through event filters for Product ID 1
      const p1Filter = relife.filters.ProductRegistered(1n);
      const authFilter = relife.filters.AuthenticityHashSet(1n);
      const transferInitFilter = relife.filters.TransferInitiated(1n);
      const transferAcceptFilter = relife.filters.TransferAccepted(1n);
      const warrantyFilter = relife.filters.WarrantyAdded(1n);
      const repairFilter = relife.filters.RepairRecordAdded(1n);
      const statusFilter = relife.filters.StatusChanged(1n);
      const recycleFilter = relife.filters.ProductRecycled(1n);

      const [
        p1Events,
        authEvents,
        tInitEvents,
        tAcceptEvents,
        wEvents,
        rEvents,
        sEvents,
        recEvents,
      ] = await Promise.all([
        relife.queryFilter(p1Filter),
        relife.queryFilter(authFilter),
        relife.queryFilter(transferInitFilter),
        relife.queryFilter(transferAcceptFilter),
        relife.queryFilter(warrantyFilter),
        relife.queryFilter(repairFilter),
        relife.queryFilter(statusFilter),
        relife.queryFilter(recycleFilter),
      ]);

      const allEvents = [
        ...p1Events,
        ...authEvents,
        ...tInitEvents,
        ...tAcceptEvents,
        ...wEvents,
        ...rEvents,
        ...sEvents,
        ...recEvents,
      ];

      // Sort by blockNumber ascending, then transactionIndex, then index
      allEvents.sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) {
          return a.blockNumber - b.blockNumber;
        }
        return (a.index || 0) - (b.index || 0);
      });

      expect(allEvents.length).to.be.greaterThanOrEqual(8);
      // First event must be ProductRegistered
      expect(allEvents[0].fragment.name).to.equal("ProductRegistered");
      // Last event must be ProductRecycled or StatusChanged (Recycled)
      const lastEventName = allEvents[allEvents.length - 1].fragment.name;
      expect(["ProductRecycled", "StatusChanged"]).to.include(lastEventName);
    });

    it("should never return events for other product IDs when querying scoped filters", async function () {
      await relife.connect(manufacturer).registerProduct(
        "SN-P1",
        "Item 1",
        "Brand 1",
        "ipfs://1"
      );
      await relife.connect(manufacturer).registerProduct(
        "SN-P2",
        "Item 2",
        "Brand 2",
        "ipfs://2"
      );

      const p1Events = await relife.queryFilter(relife.filters.ProductRegistered(1n));
      const p2Events = await relife.queryFilter(relife.filters.ProductRegistered(2n));

      expect(p1Events.length).to.equal(1);
      expect(p1Events[0].args.productId).to.equal(1n);
      expect(p1Events[0].args.modelName).to.equal("Item 1");

      expect(p2Events.length).to.equal(1);
      expect(p2Events[0].args.productId).to.equal(2n);
      expect(p2Events[0].args.modelName).to.equal("Item 2");
    });
  });
});
