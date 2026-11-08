const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Phase 0 - Environment Setup Verification", function () {
  it("should initialize the Hardhat environment successfully", async function () {
    const [deployer] = await ethers.getSigners();
    expect(deployer.address).to.be.properAddress;
    expect(await ethers.provider.getBlockNumber()).to.be.a("number");
  });

  it("should have correct network chainId configured for local testing", async function () {
    const network = await ethers.provider.getNetwork();
    expect(network.chainId).to.equal(31337n);
  });
});
