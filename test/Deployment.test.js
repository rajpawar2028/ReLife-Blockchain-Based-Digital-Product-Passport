const { expect } = require("chai");
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");

describe("Phase 3: Deployment Pipeline & Artifact Export Verification", function () {
  const frontendJsonPath = path.join(__dirname, "..", "frontend", "contract-data.json");
  const frontendJsPath = path.join(__dirname, "..", "frontend", "contract-data.js");
  const backendJsonPath = path.join(__dirname, "..", "backend", "contract-data.json");

  let backupFrontendJson, backupFrontendJs, backupBackendJson;

  before(function () {
    if (fs.existsSync(frontendJsonPath)) {
      backupFrontendJson = fs.readFileSync(frontendJsonPath, "utf8");
    }
    if (fs.existsSync(frontendJsPath)) {
      backupFrontendJs = fs.readFileSync(frontendJsPath, "utf8");
    }
    if (fs.existsSync(backendJsonPath)) {
      backupBackendJson = fs.readFileSync(backendJsonPath, "utf8");
    }
  });

  after(function () {
    if (backupFrontendJson) {
      fs.writeFileSync(frontendJsonPath, backupFrontendJson);
    }
    if (backupFrontendJs) {
      fs.writeFileSync(frontendJsPath, backupFrontendJs);
    }
    if (backupBackendJson) {
      fs.writeFileSync(backendJsonPath, backupBackendJson);
    }
  });

  it("should deploy contract and generate frontend and backend contract-data files", async function () {
    // Run the deployment logic
    const [deployer] = await hre.ethers.getSigners();
    const ReLifeFactory = await hre.ethers.getContractFactory("ReLife");
    const relife = await ReLifeFactory.deploy();
    await relife.waitForDeployment();
    const address = await relife.getAddress();

    const artifact = await hre.artifacts.readArtifact("ReLife");
    const contractData = {
      network: "hardhat",
      chainId: 31337,
      address: address,
      deployer: deployer.address,
      deployedAt: new Date().toISOString(),
      abi: artifact.abi,
    };

    fs.writeFileSync(frontendJsonPath, JSON.stringify(contractData, null, 2));
    fs.writeFileSync(
      frontendJsPath,
      `window.RELIFE_CONFIG = ${JSON.stringify(contractData, null, 2)};\n`
    );
    fs.writeFileSync(backendJsonPath, JSON.stringify(contractData, null, 2));

    expect(fs.existsSync(frontendJsonPath)).to.be.true;
    expect(fs.existsSync(frontendJsPath)).to.be.true;
    expect(fs.existsSync(backendJsonPath)).to.be.true;
  });

  it("should have valid ABI in frontend contract-data.json containing all essential methods", function () {
    const data = JSON.parse(fs.readFileSync(frontendJsonPath, "utf8"));
    expect(data.address).to.be.properAddress;
    expect(data.abi).to.be.an("array");

    const functionNames = data.abi
      .filter((item) => item.type === "function")
      .map((item) => item.name);

    expect(functionNames).to.include("registerManufacturer");
    expect(functionNames).to.include("registerProduct");
    expect(functionNames).to.include("getProduct");
    expect(functionNames).to.include("verifyProduct");
    expect(functionNames).to.include("registerRepairCenter");
    expect(functionNames).to.include("addRepairRecord");
    expect(functionNames).to.include("getProductHistory");
  });

  it("should have matching valid JS export in frontend/contract-data.js", function () {
    const jsContent = fs.readFileSync(frontendJsPath, "utf8");
    expect(jsContent).to.include("window.RELIFE_CONFIG =");
    expect(jsContent).to.include('"address"');
    expect(jsContent).to.include('"abi"');
  });

  it("should be directly attachable via ethers using the exported ABI and address", async function () {
    const data = JSON.parse(fs.readFileSync(frontendJsonPath, "utf8"));
    const relife = await hre.ethers.getContractAt(data.abi, data.address);
    expect(await relife.getTotalProducts()).to.equal(0n);
  });
});

