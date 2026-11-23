const hre = require("hardhat");
const { ethers } = hre;
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const contractData = require("../backend/contract-data.json");

// Role hash constants
const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
const MANUFACTURER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MANUFACTURER_ROLE"));
const REPAIR_CENTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("REPAIR_CENTER_ROLE"));
const RECYCLER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("RECYCLER_ROLE"));

/**
 * CLI / Automated Script to Grant Roles on Sepolia
 * Usage:
 *   npx hardhat run scripts/grantRoles.js --network sepolia -- --address 0x... --role admin
 *   npx hardhat run scripts/grantRoles.js --network sepolia -- --address 0x... --role manufacturer --name "Demo Corp"
 *   npx hardhat run scripts/grantRoles.js --network sepolia -- --file scripts/partners.json
 */
async function main() {
  const network = await ethers.provider.getNetwork();
  console.log("=================================================");
  console.log("  ReLife DPP Role Governance Tool");
  console.log("  Network:", network.name, `(Chain ID: ${network.chainId.toString()})`);
  console.log("=================================================");

  if (network.chainId !== 11155111n && network.chainId !== 31337n) {
    console.error("❌ ERROR: This script must be executed on Sepolia (Chain ID 11155111) or Hardhat Local.");
    process.exit(1);
  }

  const [deployer] = await ethers.getSigners();
  const deployerAddress = await deployer.getAddress();
  console.log(`Caller Signer: ${deployerAddress}`);

  const contractAddress = contractData.address;
  const contract = new ethers.Contract(contractAddress, contractData.abi, deployer);

  // Parse command line arguments
  const args = process.argv.slice(2);
  let targetAddress = null;
  let targetRole = null;
  let orgName = "Authorized Partner";
  let jsonFilePath = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--address" && args[i + 1]) targetAddress = args[i + 1];
    if (args[i] === "--role" && args[i + 1]) targetRole = args[i + 1].toLowerCase();
    if (args[i] === "--name" && args[i + 1]) orgName = args[i + 1];
    if (args[i] === "--file" && args[i + 1]) jsonFilePath = args[i + 1];
  }

  // Check if an untracked JSON file exists by default if no arguments were given
  const defaultJsonPath = path.join(__dirname, "partners.json");
  if (!targetAddress && !jsonFilePath && fs.existsSync(defaultJsonPath)) {
    jsonFilePath = defaultJsonPath;
  }

  let entries = [];
  if (jsonFilePath) {
    if (!fs.existsSync(jsonFilePath)) {
      console.error(`❌ JSON file not found: ${jsonFilePath}`);
      process.exit(1);
    }
    const raw = fs.readFileSync(jsonFilePath, "utf8");
    entries = JSON.parse(raw);
    console.log(`Loaded ${entries.length} role assignment(s) from: ${jsonFilePath}`);
  } else if (targetAddress && targetRole) {
    entries.push({ address: targetAddress, role: targetRole, name: orgName });
  } else {
    console.log("\n⚠️ No target address or file provided.");
    console.log("Examples:");
    console.log("  npx hardhat run scripts/grantRoles.js --network sepolia -- --address 0xc1cCc031673332956A07e99A14e57631587B12ff --role admin");
    console.log("  npx hardhat run scripts/grantRoles.js --network sepolia -- --address 0xc1cCc031673332956A07e99A14e57631587B12ff --role manufacturer --name \"EcoLabs Inc\"");
    console.log("  npx hardhat run scripts/grantRoles.js --network sepolia -- --file scripts/partners.json");
    process.exit(0);
  }

  for (const entry of entries) {
    const { address, role, name } = entry;
    if (!ethers.isAddress(address)) {
      console.error(`❌ Invalid Ethereum address: ${address}`);
      continue;
    }

    const partnerName = name || "Authorized Partner";
    console.log(`\n--- Processing: ${address} (${partnerName}) ---`);

    const roleName = (role || "").toLowerCase();

    // 1. Admin Role
    if (roleName === "admin" || roleName === "all") {
      const hasAdmin = await contract.hasRole(DEFAULT_ADMIN_ROLE, address);
      if (hasAdmin) {
        console.log(`ℹ️ [SKIP] Account already possesses DEFAULT_ADMIN_ROLE.`);
      } else {
        console.log(`⏳ Granting DEFAULT_ADMIN_ROLE...`);
        const tx = await contract.grantRole(DEFAULT_ADMIN_ROLE, address);
        console.log(`   Tx Hash: ${tx.hash}`);
        await tx.wait(1);
        console.log(`✅ DEFAULT_ADMIN_ROLE confirmed on Sepolia!`);
      }
    }

    // 2. Manufacturer Role
    if (roleName === "manufacturer" || roleName === "all") {
      const hasMfg = await contract.hasRole(MANUFACTURER_ROLE, address);
      if (hasMfg) {
        console.log(`ℹ️ [SKIP] Account already possesses MANUFACTURER_ROLE.`);
      } else {
        console.log(`⏳ Onboarding Manufacturer via registerManufacturer("${partnerName}")...`);
        const tx = await contract.registerManufacturer(address, partnerName);
        console.log(`   Tx Hash: ${tx.hash}`);
        await tx.wait(1);
        console.log(`✅ MANUFACTURER_ROLE confirmed on Sepolia!`);
      }
    }

    // 3. Repair Center Role
    if (roleName === "repair" || roleName === "repair_center" || roleName === "all") {
      const hasRepair = await contract.hasRole(REPAIR_CENTER_ROLE, address);
      if (hasRepair) {
        console.log(`ℹ️ [SKIP] Account already possesses REPAIR_CENTER_ROLE.`);
      } else {
        console.log(`⏳ Onboarding Repair Center via registerRepairCenter("${partnerName}")...`);
        const tx = await contract.registerRepairCenter(address, partnerName);
        console.log(`   Tx Hash: ${tx.hash}`);
        await tx.wait(1);
        console.log(`✅ REPAIR_CENTER_ROLE confirmed on Sepolia!`);
      }
    }

    // 4. Recycler Role
    if (roleName === "recycler" || roleName === "all") {
      const hasRecycler = await contract.hasRole(RECYCLER_ROLE, address);
      if (hasRecycler) {
        console.log(`ℹ️ [SKIP] Account already possesses RECYCLER_ROLE.`);
      } else {
        console.log(`⏳ Onboarding Recycler via registerRecycler("${partnerName}")...`);
        const tx = await contract.registerRecycler(address, partnerName);
        console.log(`   Tx Hash: ${tx.hash}`);
        await tx.wait(1);
        console.log(`✅ RECYCLER_ROLE confirmed on Sepolia!`);
      }
    }
  }

  console.log("\n=================================================");
  console.log("  Role assignment complete.");
  console.log("  Explorer: https://sepolia.etherscan.io/address/" + contractAddress);
  console.log("=================================================");
}

main().catch((err) => {
  console.error("Execution failed:", err.message);
  process.exit(1);
});
