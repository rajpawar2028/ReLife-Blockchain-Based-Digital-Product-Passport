const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("Feature 6: Lifecycle Event Timeline & On-Chain Audit Trail", function () {
  let relife;
  let admin, manufacturer, repairCenter, recycler, buyer1, buyer2;
  let productId;

  beforeEach(async function () {
    [admin, manufacturer, repairCenter, recycler, buyer1, buyer2] = await ethers.getSigners();

    const ReLifeFactory = await ethers.getContractFactory("ReLife");
    relife = await ReLifeFactory.deploy();
    await relife.waitForDeployment();

    // Authorize actors
    await relife.registerManufacturer(manufacturer.address, "CircuTech Hardware");
    await relife.registerRepairCenter(repairCenter.address, "GreenFix Service Hub");
    await relife.registerRecycler(recycler.address, "EcoShred Circular Facilities");
  });

  describe("1. Full Lifecycle Event Sequence & Chronological Order", function () {
    it("should emit and record all lifecycle events in exact chronological order", async function () {
      const serialNumber = "SN-TIMELINE-FULL-001";
      const metadataURI = "ipfs://bafybeifullproductpassport001";

      // Step 1: Product Registration (Emits ProductRegistered)
      const regTx = await relife.connect(manufacturer).registerProduct(
        serialNumber,
        "EP-Ultra",
        "CircuTech",
        metadataURI
      );
      const regReceipt = await regTx.wait();
      productId = 1n;

      // Step 2: Issue Warranty (Emits WarrantyAdded)
      const now = await time.latest();
      const oneYearLater = now + 365 * 24 * 3600;
      const warrantyTx = await relife.connect(manufacturer).setProductWarranty(
        productId,
        now,
        oneYearLater,
        "Manufacturer Premium Warranty",
        "ipfs://bafybeiwarrantyterms001"
      );
      await warrantyTx.wait();

      // Step 3: Initiate Ownership Transfer (Emits TransferInitiated)
      const initTx = await relife.connect(manufacturer).initiateTransfer(productId, buyer1.address);
      await initTx.wait();

      // Step 4: Accept Ownership Transfer (Emits TransferAccepted, StatusChanged to Sold)
      const acceptTx = await relife.connect(buyer1).acceptTransfer(productId);
      await acceptTx.wait();

      // Step 5: Transition to InRepair (Emits StatusChanged: Sold -> InRepair)
      const inRepairTx = await relife.connect(repairCenter).updateProductStatus(productId, 2); // Status.InRepair
      await inRepairTx.wait();

      // Step 6: Add Repair Record (Emits RepairRecordAdded)
      const repairTx = await relife.connect(repairCenter).addRepairRecord(
        productId,
        "Battery & Screen Replacement",
        "Replaced depleted lithium cell with LFP and replaced cracked OLED display.",
        "ipfs://bafybeidiagnosticsreport001"
      );
      await repairTx.wait();

      // Step 7: Transition back to Sold (Emits StatusChanged: InRepair -> Sold)
      const fixedTx = await relife.connect(repairCenter).updateProductStatus(productId, 1); // Status.Sold
      await fixedTx.wait();

      // Step 8: Terminal Recycling (Emits ProductRecycled and StatusChanged to Recycled)
      const recycleTx = await relife.connect(recycler).addRecyclingRecord(
        productId,
        "EcoShred Facility #4",
        "Disassembled: aluminum chassis recovered, battery sent to hydrometallurgical recycling.",
        "ipfs://bafybeidestrutioncert001"
      );
      await recycleTx.wait();

      // ==========================================
      // Query individual event filters
      // ==========================================
      const registeredEvents = await relife.queryFilter(relife.filters.ProductRegistered(productId));
      expect(registeredEvents).to.have.lengthOf(1);
      expect(registeredEvents[0].args.manufacturer).to.equal(manufacturer.address);
      expect(registeredEvents[0].args.serialNumber.hash).to.equal(ethers.keccak256(ethers.toUtf8Bytes(serialNumber)));
      expect(registeredEvents[0].args.metadataURI).to.equal(metadataURI);

      const warrantyEvents = await relife.queryFilter(relife.filters.WarrantyAdded(productId));
      expect(warrantyEvents).to.have.lengthOf(1);
      expect(warrantyEvents[0].args.warrantyType).to.equal("Manufacturer Premium Warranty");
      expect(warrantyEvents[0].args.issuer).to.equal(manufacturer.address);
      expect(warrantyEvents[0].args.termsUri).to.equal("ipfs://bafybeiwarrantyterms001");

      const initEvents = await relife.queryFilter(relife.filters.TransferInitiated(productId));
      expect(initEvents).to.have.lengthOf(1);
      expect(initEvents[0].args.from).to.equal(manufacturer.address);
      expect(initEvents[0].args.to).to.equal(buyer1.address);

      const acceptEvents = await relife.queryFilter(relife.filters.TransferAccepted(productId));
      expect(acceptEvents).to.have.lengthOf(1);
      expect(acceptEvents[0].args.previousOwner).to.equal(manufacturer.address);
      expect(acceptEvents[0].args.newOwner).to.equal(buyer1.address);

      const statusEvents = await relife.queryFilter(relife.filters.StatusChanged(productId));
      // Status changes occurred:
      // 1: Manufactured -> Sold (on transfer accept)
      // 2: Sold -> InRepair
      // 3: InRepair -> Sold
      // 4: Sold -> Recycled (on recycling)
      expect(statusEvents.length).to.be.at.least(4);

      const repairEvents = await relife.queryFilter(relife.filters.RepairRecordAdded(productId));
      expect(repairEvents).to.have.lengthOf(1);
      expect(repairEvents[0].args.repairCenter).to.equal(repairCenter.address);
      expect(repairEvents[0].args.repairType).to.equal("Battery & Screen Replacement");
      expect(repairEvents[0].args.serviceUri).to.equal("ipfs://bafybeidiagnosticsreport001");

      const recycledEvents = await relife.queryFilter(relife.filters.ProductRecycled(productId));
      expect(recycledEvents).to.have.lengthOf(1);
      expect(recycledEvents[0].args.recycler).to.equal(recycler.address);
      expect(recycledEvents[0].args.recyclingFacility).to.equal("EcoShred Facility #4");
      expect(recycledEvents[0].args.certificateUri).to.equal("ipfs://bafybeidestrutioncert001");

      // ==========================================
      // Aggregate and assert strict chronological ordering
      // ==========================================
      const allEvents = [
        ...registeredEvents,
        ...warrantyEvents,
        ...initEvents,
        ...acceptEvents,
        ...statusEvents,
        ...repairEvents,
        ...recycledEvents,
      ];

      // Sort as our frontend timeline does
      allEvents.sort((a, b) => {
        if (a.blockNumber !== b.blockNumber) {
          return a.blockNumber - b.blockNumber;
        }
        return a.index - b.index;
      });

      // Verify the first event is ProductRegistered
      expect(allEvents[0].fragment.name).to.equal("ProductRegistered");

      // Verify the last event is ProductRecycled or StatusChanged (Recycled)
      const lastEventName = allEvents[allEvents.length - 1].fragment.name;
      expect(["ProductRecycled", "StatusChanged"]).to.include(lastEventName);

      // Verify block numbers and log indexes are monotonically non-decreasing
      for (let i = 1; i < allEvents.length; i++) {
        const prev = allEvents[i - 1];
        const curr = allEvents[i];
        if (curr.blockNumber === prev.blockNumber) {
          expect(curr.index).to.be.greaterThan(prev.index);
        } else {
          expect(curr.blockNumber).to.be.greaterThan(prev.blockNumber);
        }
      }
    });
  });

  describe("2. Event Filter Product ID Scoping / Isolation", function () {
    it("should never return events belonging to other products", async function () {
      // Register Product 1
      await relife.connect(manufacturer).registerProduct(
        "SN-ISO-001",
        "Model A",
        "Brand A",
        "ipfs://bafybeiprod1"
      );

      // Register Product 2
      await relife.connect(manufacturer).registerProduct(
        "SN-ISO-002",
        "Model B",
        "Brand B",
        "ipfs://bafybeiprod2"
      );

      // Add a repair to Product 2 only
      await relife.connect(repairCenter).addRepairRecord(
        2n,
        "Diagnostic Inspection",
        "Product 2 passed optical check.",
        "ipfs://bafybeidiagprod2"
      );

      // Product 1 must have 0 repair events
      const prod1Repairs = await relife.queryFilter(relife.filters.RepairRecordAdded(1n));
      expect(prod1Repairs).to.have.lengthOf(0);

      // Product 2 must have 1 repair event
      const prod2Repairs = await relife.queryFilter(relife.filters.RepairRecordAdded(2n));
      expect(prod2Repairs).to.have.lengthOf(1);
      expect(prod2Repairs[0].args.productId).to.equal(2n);
    });
  });

  describe("3. Ownership Transfer Cancellation Event", function () {
    it("should emit TransferCancelled and appear in timeline when transfer is revoked", async function () {
      // Register product
      await relife.connect(manufacturer).registerProduct(
        "SN-CANCEL-001",
        "Model X",
        "Brand X",
        "ipfs://bafybeicancel001"
      );
      const pId = 1n;

      // Initiate transfer to buyer1
      await relife.connect(manufacturer).initiateTransfer(pId, buyer1.address);

      // Cancel transfer
      await relife.connect(manufacturer).cancelTransfer(pId);

      // Query TransferCancelled
      const cancelEvents = await relife.queryFilter(relife.filters.TransferCancelled(pId));
      expect(cancelEvents).to.have.lengthOf(1);
      expect(cancelEvents[0].args.owner).to.equal(manufacturer.address);
      expect(cancelEvents[0].args.pendingOwner).to.equal(buyer1.address);
    });
  });

  describe("4. Multiple Transfers & Repairs Sequence", function () {
    it("should track sequential secondary market custody and maintenance cycles", async function () {
      await relife.connect(manufacturer).registerProduct(
        "SN-MULTI-001",
        "SolarBook 15",
        "CircuTech",
        "ipfs://bafybeisolarbook"
      );
      const pId = 1n;

      // Mfg -> Buyer 1
      await relife.connect(manufacturer).initiateTransfer(pId, buyer1.address);
      await relife.connect(buyer1).acceptTransfer(pId);

      // Service 1
      await relife.connect(repairCenter).updateProductStatus(pId, 2); // InRepair
      await relife.connect(repairCenter).addRepairRecord(pId, "Keyboard Cleaning", "Air dusted keys", "ipfs://bafybeirep1");
      await relife.connect(repairCenter).updateProductStatus(pId, 1); // Sold

      // Buyer 1 -> Buyer 2
      await relife.connect(buyer1).initiateTransfer(pId, buyer2.address);
      await relife.connect(buyer2).acceptTransfer(pId);

      // Service 2
      await relife.connect(repairCenter).updateProductStatus(pId, 2); // InRepair
      await relife.connect(repairCenter).addRepairRecord(pId, "Thermal Paste", "Reapplied paste", "ipfs://bafybeirep2");
      await relife.connect(repairCenter).updateProductStatus(pId, 1); // Sold

      const allTransfers = await relife.queryFilter(relife.filters.TransferAccepted(pId));
      expect(allTransfers).to.have.lengthOf(2);
      expect(allTransfers[0].args.newOwner).to.equal(buyer1.address);
      expect(allTransfers[1].args.newOwner).to.equal(buyer2.address);

      const allRepairs = await relife.queryFilter(relife.filters.RepairRecordAdded(pId));
      expect(allRepairs).to.have.lengthOf(2);
      expect(allRepairs[0].args.repairType).to.equal("Keyboard Cleaning");
      expect(allRepairs[1].args.repairType).to.equal("Thermal Paste");
    });
  });

  describe("5. Frontend XSS Security & Safe DOM Audit", function () {
    it("should verify that product.js uses textContent for dynamic event properties", function () {
      const fs = require("fs");
      const path = require("path");
      const productJs = fs.readFileSync(path.join(__dirname, "..", "frontend", "js", "product.js"), "utf8");

      // Verify safe DOM methods are used in timeline rendering
      expect(productJs).to.include("titleSpan.textContent = ev.title");
      expect(productJs).to.include("descRow.textContent = ev.description");
      expect(productJs).to.include("actorLink.textContent = shortAddr");
      expect(productJs).to.include("dateSpan.textContent =");
      expect(productJs).to.include("https://sepolia.etherscan.io/address/");
      expect(productJs).to.include("https://gateway.pinata.cloud/ipfs/");
    });
  });
});
