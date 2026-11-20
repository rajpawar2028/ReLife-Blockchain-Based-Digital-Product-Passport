const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

describe("Repair Center Portal: logRepair & Service Tracking", function () {
  let relife;
  let admin, manufacturer, repairCenter, unauthorized, recycler;
  let REPAIR_CENTER_ROLE;
  let productId;
  const serialNumber = "SN-REPAIR-TEST-9001";

  beforeEach(async function () {
    [admin, manufacturer, repairCenter, unauthorized, recycler] = await ethers.getSigners();

    const ReLifeFactory = await ethers.getContractFactory("ReLife");
    relife = await ReLifeFactory.deploy();
    await relife.waitForDeployment();

    REPAIR_CENTER_ROLE = await relife.REPAIR_CENTER_ROLE();

    // Onboard roles
    await relife.connect(admin).registerManufacturer(manufacturer.address, "Geneva Maker");
    await relife.connect(admin).registerRepairCenter(repairCenter.address, "EcoFix Lab");
    await relife.connect(admin).registerRecycler(recycler.address, "Circular Recycling Inc");

    // Mint a product for testing
    const tx = await relife.connect(manufacturer).registerProduct(
      serialNumber,
      "EcoLaptop Pro",
      "GreenBrand",
      "ipfs://bafybeimfgmetadata"
    );
    const receipt = await tx.wait();
    productId = 1n;
  });

  describe("1. Success Path & Event Emission", function () {
    it("should allow REPAIR_CENTER_ROLE to log a repair by productId and emit RepairLogged", async function () {
      const tx = await relife.connect(repairCenter)["logRepair(uint256,string,string,uint256,string)"](
        productId,
        "Screen and hinge replacement after accidental drop",
        "OEM 14-inch OLED Panel, Titanium Hinge Bracket",
        15000n, // $150.00
        "ipfs://bafybeirepairdiagproof1"
      );

      const latestTime = await time.latest();

      await expect(tx)
        .to.emit(relife, "RepairLogged")
        .withArgs(
          productId,
          repairCenter.address,
          "Screen and hinge replacement after accidental drop",
          "OEM 14-inch OLED Panel, Titanium Hinge Bracket",
          15000n,
          "ipfs://bafybeirepairdiagproof1",
          latestTime
        );

      await expect(tx)
        .to.emit(relife, "RepairRecordAdded")
        .withArgs(
          productId,
          1n,
          repairCenter.address,
          "Maintenance",
          "Screen and hinge replacement after accidental drop",
          "ipfs://bafybeirepairdiagproof1",
          latestTime
        );

      expect(await relife.getRepairCount(productId)).to.equal(1n);

      const details = await relife.getRepairDetails(productId, 1n);
      expect(details[0]).to.equal("OEM 14-inch OLED Panel, Titanium Hinge Bracket");
      expect(details[1]).to.equal(15000n);
    });

    it("should allow REPAIR_CENTER_ROLE to log a repair with explicit repairType by serial number", async function () {
      const tx = await relife.connect(repairCenter)["logRepair(string,string,string,string,uint256,string)"](
        serialNumber,
        "Battery Upgrade",
        "Replaced degraded 50Wh battery with new 70Wh long-life pack",
        "Lithium Polymer Pack #70W",
        8500n,
        "ipfs://bafybeibatteryreceipt"
      );

      await expect(tx)
        .to.emit(relife, "RepairLogged")
        .withArgs(
          productId,
          repairCenter.address,
          "Replaced degraded 50Wh battery with new 70Wh long-life pack",
          "Lithium Polymer Pack #70W",
          8500n,
          "ipfs://bafybeibatteryreceipt",
          await time.latest()
        );

      const repairs = await relife.getRepairsBySerial(serialNumber);
      expect(repairs.length).to.equal(1);
      expect(repairs[0].repairType).to.equal("Battery Upgrade");
      expect(repairs[0].repairCenter).to.equal(repairCenter.address);
    });

    it("should track multiple sequential repair records in chronological order", async function () {
      await relife.connect(repairCenter)["logRepair(uint256,string,string,string,uint256,string)"](
        productId,
        "Diagnostic",
        "Initial thermal diagnostic check",
        "Thermal Paste",
        2000n,
        "ipfs://diag1"
      );

      await time.increase(3600);

      await relife.connect(repairCenter)["logRepair(uint256,string,string,string,uint256,string)"](
        productId,
        "Hardware Repair",
        "Fan motor replacement",
        "Cooling Fan Module",
        4500n,
        "ipfs://diag2"
      );

      expect(await relife.getRepairCount(productId)).to.equal(2n);

      const history = await relife.getRepairs(productId);
      expect(history.length).to.equal(2);
      expect(history[0].id).to.equal(1n);
      expect(history[0].repairType).to.equal("Diagnostic");
      expect(history[1].id).to.equal(2n);
      expect(history[1].repairType).to.equal("Hardware Repair");
      expect(history[1].timestamp).to.be.gt(history[0].timestamp);
    });
  });

  describe("2. Access Control Rejection", function () {
    it("should revert if caller does not possess REPAIR_CENTER_ROLE", async function () {
      await expect(
        relife.connect(unauthorized)["logRepair(uint256,string,string,uint256,string)"](
          productId,
          "Unauthorized servicing attempt",
          "None",
          0n,
          "ipfs://unauthorized"
        )
      )
        .to.be.revertedWithCustomError(relife, "AccessControlUnauthorizedAccount")
        .withArgs(unauthorized.address, REPAIR_CENTER_ROLE);
    });

    it("should revert if admin revokes REPAIR_CENTER_ROLE", async function () {
      await relife.connect(admin).revokeRole(REPAIR_CENTER_ROLE, repairCenter.address);

      await expect(
        relife.connect(repairCenter)["logRepair(uint256,string,string,uint256,string)"](
          productId,
          "Post revocation repair",
          "Parts",
          0n,
          "ipfs://revoked"
        )
      )
        .to.be.revertedWithCustomError(relife, "AccessControlUnauthorizedAccount")
        .withArgs(repairCenter.address, REPAIR_CENTER_ROLE);
    });
  });

  describe("3. Circuit Breaker (Pausable)", function () {
    it("should revert logRepair when contract is paused and resume when unpaused", async function () {
      await relife.connect(admin).pause();

      await expect(
        relife.connect(repairCenter)["logRepair(uint256,string,string,uint256,string)"](
          productId,
          "Emergency frozen repair",
          "Parts",
          0n,
          "ipfs://paused"
        )
      ).to.be.revertedWithCustomError(relife, "EnforcedPause");

      // Unpause
      await relife.connect(admin).unpause();

      await expect(
        relife.connect(repairCenter)["logRepair(uint256,string,string,uint256,string)"](
          productId,
          "Normal operation restored",
          "Parts",
          0n,
          "ipfs://unpaused"
        )
      ).to.emit(relife, "RepairLogged");
    });
  });

  describe("4. Non-Existent & Recycled Product Boundaries", function () {
    it("should revert for non-existent product ID", async function () {
      await expect(
        relife.connect(repairCenter)["logRepair(uint256,string,string,uint256,string)"](
          999n,
          "Ghost product repair",
          "None",
          0n,
          "ipfs://ghost"
        )
      )
        .to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound")
        .withArgs(999n);
    });

    it("should revert for product ID 0", async function () {
      await expect(
        relife.connect(repairCenter)["logRepair(uint256,string,string,uint256,string)"](
          0n,
          "Zero product repair",
          "None",
          0n,
          "ipfs://zero"
        )
      )
        .to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound")
        .withArgs(0n);
    });

    it("should revert for unknown serial number", async function () {
      await expect(
        relife.connect(repairCenter)["logRepair(string,string,string,string,uint256,string)"](
          "UNKNOWN-SERIAL-404",
          "Maintenance",
          "Description",
          "None",
          0n,
          "ipfs://unknown"
        )
      ).to.be.revertedWithCustomError(relife, "ReLife__ProductNotFound");
    });

    it("should revert when attempting to repair a permanently Recycled product", async function () {
      // Recycler decommissions product
      await relife.connect(recycler).addRecyclingRecord(
        productId,
        "GreenCycle Facility",
        "Disassembled chassis, shredded internal components",
        "ipfs://recyclecertificate"
      );

      await expect(
        relife.connect(repairCenter)["logRepair(uint256,string,string,uint256,string)"](
          productId,
          "Resurrection service attempt",
          "Full chassis",
          50000n,
          "ipfs://resurrection"
        )
      )
        .to.be.revertedWithCustomError(relife, "ReLife__ProductAlreadyRecycled")
        .withArgs(productId);
    });

    it("should revert if description is empty string", async function () {
      await expect(
        relife.connect(repairCenter)["logRepair(uint256,string,string,uint256,string)"](
          productId,
          "",
          "Parts",
          0n,
          "ipfs://empty"
        )
      )
        .to.be.revertedWithCustomError(relife, "ReLife__EmptyString")
        .withArgs("description");
    });
  });
});
