const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Phase 10: Smart Contract Gas Profiling & Cost Analysis", function () {
  let relife;
  let admin, manufacturer, repairCenter, recycler, buyer;
  const gasMetrics = {};

  before(async function () {
    [admin, manufacturer, repairCenter, recycler, buyer] = await ethers.getSigners();
  });

  it("profiles contract deployment gas", async function () {
    const ReLifeFactory = await ethers.getContractFactory("ReLife");
    relife = await ReLifeFactory.deploy();
    const deploymentTx = relife.deploymentTransaction();
    const receipt = await deploymentTx.wait();
    gasMetrics["Contract Deployment"] = receipt.gasUsed;
    expect(receipt.gasUsed).to.be.gt(0);
  });

  it("profiles registerManufacturer gas", async function () {
    const tx = await relife.connect(admin).registerManufacturer(manufacturer.address, "Fairphone B.V.");
    const receipt = await tx.wait();
    gasMetrics["registerManufacturer"] = receipt.gasUsed;
    expect(receipt.gasUsed).to.be.gt(0);
  });

  it("profiles registerRepairCenter gas", async function () {
    const tx = await relife.connect(admin).registerRepairCenter(repairCenter.address, "iFixit Geneva Hub");
    const receipt = await tx.wait();
    gasMetrics["registerRepairCenter"] = receipt.gasUsed;
    expect(receipt.gasUsed).to.be.gt(0);
  });

  it("profiles registerRecycler gas", async function () {
    const tx = await relife.connect(admin).registerRecycler(recycler.address, "Swiss Circular Metallurgy");
    const receipt = await tx.wait();
    gasMetrics["registerRecycler"] = receipt.gasUsed;
    expect(receipt.gasUsed).to.be.gt(0);
  });

  it("profiles registerProduct (Passport Minting) gas", async function () {
    const tx = await relife.connect(manufacturer).registerProduct(
      "FP5-2026-CH-9812",
      "Fairphone 5 Circular Edition",
      "Fairphone",
      "ipfs://bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi"
    );
    const receipt = await tx.wait();
    gasMetrics["registerProduct"] = receipt.gasUsed;
    expect(receipt.gasUsed).to.be.gt(0);
  });

  it("profiles addWarranty gas", async function () {
    const oneYearFromNow = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
    const tx = await relife.connect(manufacturer).addWarranty(
      1,
      oneYearFromNow,
      "Fairphone 3-Year Extended Care",
      "ipfs://bafybeib7g6wexy"
    );
    const receipt = await tx.wait();
    gasMetrics["addWarranty"] = receipt.gasUsed;
    expect(receipt.gasUsed).to.be.gt(0);
  });

  it("profiles addRepairRecord gas", async function () {
    const tx = await relife.connect(repairCenter).addRepairRecord(
      1,
      "OLED Screen Module Replacement",
      "Replaced cracked front glass with genuine OEM modular display",
      "ipfs://bafybeidagnostic772"
    );
    const receipt = await tx.wait();
    gasMetrics["addRepairRecord"] = receipt.gasUsed;
    expect(receipt.gasUsed).to.be.gt(0);
  });

  it("profiles transferOwnership gas", async function () {
    const tx = await relife.connect(manufacturer).transferOwnership(1, buyer.address);
    const receipt = await tx.wait();
    gasMetrics["transferOwnership"] = receipt.gasUsed;
    expect(receipt.gasUsed).to.be.gt(0);
  });

  it("profiles addRecyclingRecord (Terminal Decommissioning) gas", async function () {
    const tx = await relife.connect(recycler).addRecyclingRecord(
      1,
      "Swiss Metallurgy Recovery Plant #2",
      "Reclaimed: 98% Recycled Aluminum, 85% Fairtrade Gold, 92% Cobalt",
      "ipfs://bafybeicertificate9981"
    );
    const receipt = await tx.wait();
    gasMetrics["addRecyclingRecord"] = receipt.gasUsed;
    expect(receipt.gasUsed).to.be.gt(0);
  });

  after(function () {
    console.log("\n=======================================================");
    console.log("       ReLife Smart Contract Gas Consumption Profile   ");
    console.log("=======================================================");
    for (const [action, gas] of Object.entries(gasMetrics)) {
      console.log(`  ${action.padEnd(25)} : ${gas.toString().padStart(9)} gas`);
    }
    console.log("=======================================================\n");
  });
});

