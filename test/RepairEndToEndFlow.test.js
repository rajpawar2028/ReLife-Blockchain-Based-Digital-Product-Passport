const { expect } = require("chai");
const { ethers } = require("hardhat");
const request = require("supertest");
const app = require("../backend/server");

describe("Step 3 End-to-End Flow: Admin -> Manufacturer -> Repair -> Verification", function () {
  let relife;
  let admin, manufacturer, repairWallet, customerWallet, unauthorizedWallet;
  let REPAIR_CENTER_ROLE, MANUFACTURER_ROLE;
  let productId;
  const uniqueSerial = `SN-E2E-FLOW-${Date.now()}`;

  before(async function () {
    [admin, manufacturer, repairWallet, customerWallet, unauthorizedWallet] = await ethers.getSigners();

    const ReLifeFactory = await ethers.getContractFactory("ReLife");
    relife = await ReLifeFactory.deploy();
    await relife.waitForDeployment();

    REPAIR_CENTER_ROLE = await relife.REPAIR_CENTER_ROLE();
    MANUFACTURER_ROLE = await relife.MANUFACTURER_ROLE();
  });

  it("3a. Admin grants REPAIR_CENTER_ROLE to a test wallet", async function () {
    expect(await relife.hasRole(REPAIR_CENTER_ROLE, repairWallet.address)).to.be.false;

    const tx = await relife.connect(admin).registerRepairCenter(repairWallet.address, "Geneva EcoFix Hub");
    await expect(tx)
      .to.emit(relife, "RepairCenterRegistered")
      .withArgs(repairWallet.address, "Geneva EcoFix Hub", admin.address);

    expect(await relife.hasRole(REPAIR_CENTER_ROLE, repairWallet.address)).to.be.true;
  });

  it("3b. Manufacturer mints a product with a fresh unique serial number", async function () {
    await relife.connect(admin).registerManufacturer(manufacturer.address, "Alpine Hardware");

    const tx = await relife.connect(manufacturer).registerProduct(
      uniqueSerial,
      "EcoLaptop Pro 16",
      "Alpine",
      "ipfs://bafybeimfgpassport"
    );

    await expect(tx)
      .to.emit(relife, "ProductRegistered");

    productId = 1n;
    const prod = await relife.getProduct(productId);
    expect(prod.serialNumber).to.equal(uniqueSerial);
    expect(prod.manufacturer).to.equal(manufacturer.address);
  });

  it("3c. Repair wallet logs a repair", async function () {
    const tx = await relife.connect(repairWallet)["logRepair(uint256,string,string,string,uint256,string)"](
      productId,
      "Screen Replacement",
      "Replaced shattered 16-inch display with genuine refurbished panel",
      "16-inch OLED Display Panel #A44",
      18000n, // $180.00
      "ipfs://bafybeirepairproofreceipt"
    );

    await expect(tx)
      .to.emit(relife, "RepairLogged")
      .withArgs(
        productId,
        repairWallet.address,
        "Replaced shattered 16-inch display with genuine refurbished panel",
        "16-inch OLED Display Panel #A44",
        18000n,
        "ipfs://bafybeirepairproofreceipt",
        await ethers.provider.getBlock("latest").then((b) => b.timestamp)
      );

    expect(await relife.getRepairCount(productId)).to.equal(1n);
  });

  it("3d. Verify page / view function shows the repair record", async function () {
    const history = await relife.getProductHistory(productId);
    expect(history.length).to.equal(1);
    expect(history[0].repairType).to.equal("Screen Replacement");
    expect(history[0].description).to.equal("Replaced shattered 16-inch display with genuine refurbished panel");
    expect(history[0].serviceUri).to.equal("ipfs://bafybeirepairproofreceipt");
    expect(history[0].repairCenter).to.equal(repairWallet.address);

    const repairsAlias = await relife.getRepairs(productId);
    expect(repairsAlias.length).to.equal(1);

    const [parts, cost] = await relife.getRepairDetails(productId, 1n);
    expect(parts).to.equal("16-inch OLED Display Panel #A44");
    expect(cost).to.equal(18000n);

    // Verify static pages serve over Express
    const resRepair = await request(app).get("/repair.html");
    expect(resRepair.status).to.equal(200);
    expect(resRepair.text).to.include("Repair Center Portal");
    expect(resRepair.text).to.include("repairProductInput");

    const resVerify = await request(app).get("/verify.html");
    expect(resVerify.status).to.equal(200);
  });

  it("3e. Non-role wallet attempt is rejected with a readable message", async function () {
    await expect(
      relife.connect(unauthorizedWallet)["logRepair(uint256,string,string,string,uint256,string)"](
        productId,
        "Battery Replacement",
        "Unauthorized repair",
        "Battery",
        5000n,
        "ipfs://bad"
      )
    )
      .to.be.revertedWithCustomError(relife, "AccessControlUnauthorizedAccount")
      .withArgs(unauthorizedWallet.address, REPAIR_CENTER_ROLE);
  });

  it("3f. Paused contract blocks logRepair; unpausing restores it", async function () {
    // Admin pauses contract
    await relife.connect(admin).pause();

    await expect(
      relife.connect(repairWallet)["logRepair(uint256,string,string,string,uint256,string)"](
        productId,
        "Thermal Maintenance",
        "Cleaned vents",
        "Thermal Paste",
        2000n,
        "ipfs://paused"
      )
    ).to.be.revertedWithCustomError(relife, "EnforcedPause");

    // Admin unpauses contract
    await relife.connect(admin).unpause();

    const tx = await relife.connect(repairWallet)["logRepair(uint256,string,string,string,uint256,string)"](
      productId,
      "Thermal Maintenance",
      "Cleaned vents",
      "Thermal Paste",
      2000n,
      "ipfs://unpaused"
    );

    await expect(tx).to.emit(relife, "RepairLogged");
    expect(await relife.getRepairCount(productId)).to.equal(2n);
  });
});
