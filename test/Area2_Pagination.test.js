const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Area 2: Pagination for Product Lists", function () {
  let relife;
  let admin, manufacturer1, manufacturer2, unauthorized;

  beforeEach(async function () {
    [admin, manufacturer1, manufacturer2, unauthorized] = await ethers.getSigners();

    const ReLifeFactory = await ethers.getContractFactory("ReLife");
    relife = await ReLifeFactory.deploy();
    await relife.waitForDeployment();

    // Authorize manufacturers
    await relife.registerManufacturer(manufacturer1.address, "Manufacturer Alpha");
    await relife.registerManufacturer(manufacturer2.address, "Manufacturer Beta");

    // Register 12 products for Manufacturer 1
    for (let i = 1; i <= 12; i++) {
      await relife.connect(manufacturer1).registerProduct(
        `SN-M1-${i.toString().padStart(3, "0")}`,
        `Model M1-${i}`,
        "Brand Alpha",
        `ipfs://bafy-m1-${i}`
      );
    }

    // Register 3 products for Manufacturer 2
    for (let i = 1; i <= 3; i++) {
      await relife.connect(manufacturer2).registerProduct(
        `SN-M2-${i.toString().padStart(3, "0")}`,
        `Model M2-${i}`,
        "Brand Beta",
        `ipfs://bafy-m2-${i}`
      );
    }
  });

  describe("1. Total Product Counts & Manufacturer Indexing", function () {
    it("should return correct total global product count", async function () {
      const total = await relife.getTotalProducts();
      expect(total).to.equal(15n);
    });

    it("should return correct product count per manufacturer", async function () {
      const count1 = await relife.getManufacturerProductCount(manufacturer1.address);
      const count2 = await relife.getManufacturerProductCount(manufacturer2.address);
      const countZero = await relife.getManufacturerProductCount(unauthorized.address);

      expect(count1).to.equal(12n);
      expect(count2).to.equal(3n);
      expect(countZero).to.equal(0n);
    });
  });

  describe("2. Per-Manufacturer Pagination (getProductsByManufacturerPaginated)", function () {
    it("should return the first page of items and total count", async function () {
      const [items, total] = await relife.getProductsByManufacturerPaginated(
        manufacturer1.address,
        0, // offset
        5  // limit
      );

      expect(total).to.equal(12n);
      expect(items.length).to.equal(5);
      expect(items[0].serialNumber).to.equal("SN-M1-001");
      expect(items[4].serialNumber).to.equal("SN-M1-005");
      expect(items[0].manufacturer).to.equal(manufacturer1.address);
    });

    it("should return a middle page of items correctly", async function () {
      const [items, total] = await relife.getProductsByManufacturerPaginated(
        manufacturer1.address,
        5, // offset
        5  // limit
      );

      expect(total).to.equal(12n);
      expect(items.length).to.equal(5);
      expect(items[0].serialNumber).to.equal("SN-M1-006");
      expect(items[4].serialNumber).to.equal("SN-M1-010");
    });

    it("should return the last partial page of items without overflowing", async function () {
      const [items, total] = await relife.getProductsByManufacturerPaginated(
        manufacturer1.address,
        10, // offset (items 11 and 12)
        5   // limit
      );

      expect(total).to.equal(12n);
      expect(items.length).to.equal(2);
      expect(items[0].serialNumber).to.equal("SN-M1-011");
      expect(items[1].serialNumber).to.equal("SN-M1-012");
    });

    it("should return an empty array without reverting when offset is beyond total", async function () {
      const [items, total] = await relife.getProductsByManufacturerPaginated(
        manufacturer1.address,
        50, // offset way beyond total of 12
        10  // limit
      );

      expect(total).to.equal(12n);
      expect(items.length).to.equal(0);
    });

    it("should return empty array for an account with zero registered products", async function () {
      const [items, total] = await relife.getProductsByManufacturerPaginated(
        unauthorized.address,
        0,
        10
      );

      expect(total).to.equal(0n);
      expect(items.length).to.equal(0);
    });

    it("should isolate products between different manufacturers", async function () {
      const [itemsM2, totalM2] = await relife.getProductsByManufacturerPaginated(
        manufacturer2.address,
        0,
        10
      );

      expect(totalM2).to.equal(3n);
      expect(itemsM2.length).to.equal(3);
      expect(itemsM2[0].serialNumber).to.equal("SN-M2-001");
      expect(itemsM2[2].serialNumber).to.equal("SN-M2-003");
      expect(itemsM2[0].manufacturer).to.equal(manufacturer2.address);
    });
  });

  describe("3. Global Registry Pagination (getProductsPaginated)", function () {
    it("should paginate across all products in the registry", async function () {
      const [items, total] = await relife.getProductsPaginated(0, 10);

      expect(total).to.equal(15n);
      expect(items.length).to.equal(10);
      expect(items[0].id).to.equal(1n);
      expect(items[9].id).to.equal(10n);
    });

    it("should return the second partial page of all products", async function () {
      const [items, total] = await relife.getProductsPaginated(10, 10);

      expect(total).to.equal(15n);
      expect(items.length).to.equal(5);
      expect(items[0].id).to.equal(11n);
      expect(items[4].id).to.equal(15n);
    });

    it("should return empty array when offset equals or exceeds total products", async function () {
      const [items, total] = await relife.getProductsPaginated(15, 10);

      expect(total).to.equal(15n);
      expect(items.length).to.equal(0);
    });
  });

  describe("4. Safety Limits & Boundary Handling", function () {
    it("should cap requested limit at maximum 50", async function () {
      // Register enough products to test cap
      for (let i = 16; i <= 65; i++) {
        await relife.connect(manufacturer1).registerProduct(
          `SN-CAP-${i}`,
          `Model ${i}`,
          "Brand Alpha",
          `ipfs://cap-${i}`
        );
      }

      const totalAfter = await relife.getTotalProducts();
      expect(totalAfter).to.equal(65n);

      // Request limit of 100 — must be capped at 50
      const [items, total] = await relife.getProductsPaginated(0, 100);
      expect(total).to.equal(65n);
      expect(items.length).to.equal(50);
    });

    it("should default limit of 0 to 10 items", async function () {
      const [items, total] = await relife.getProductsPaginated(0, 0);
      expect(total).to.be.greaterThanOrEqual(15n);
      expect(items.length).to.equal(10);
    });
  });
});
