const { ethers } = require("ethers");
require("dotenv").config();
const contractData = require("../backend/contract-data.json");

async function main() {
  const targetAddress = process.argv[2] || "0xc1cCc031673332956A07e99A14e57631587B12ff";
  const deployerAddress = contractData.deployer;
  const contractAddress = contractData.address;

  // Fallback public RPCs if SEPOLIA_RPC_URL is missing or fails
  const rpcUrls = [
    process.env.SEPOLIA_RPC_URL,
    "https://ethereum-sepolia-rpc.publicnode.com",
    "https://rpc2.sepolia.org",
    "https://rpc.sepolia.org"
  ].filter(Boolean);

  let provider;
  for (const url of rpcUrls) {
    try {
      const p = new ethers.JsonRpcProvider(url);
      await p.getBlockNumber();
      provider = p;
      break;
    } catch (_) {}
  }

  if (!provider) {
    throw new Error("Unable to connect to any Sepolia RPC provider.");
  }

  console.log("=== Sepolia Contract Verification ===");
  console.log("Contract Address:", contractAddress);
  console.log("Network Chain ID: 11155111 (Sepolia)");

  const code = await provider.getCode(contractAddress);
  console.log("Contract Bytecode Present:", code !== "0x", `(${code.length} chars)`);

  const contract = new ethers.Contract(contractAddress, contractData.abi, provider);

  // Compute role hashes
  const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
  const MANUFACTURER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MANUFACTURER_ROLE"));
  const REPAIR_CENTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("REPAIR_CENTER_ROLE"));
  const RECYCLER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("RECYCLER_ROLE"));

  console.log("\n=== Checking Target Address:", targetAddress, "===");
  const targetRoles = {
    DEFAULT_ADMIN_ROLE: await contract.hasRole(DEFAULT_ADMIN_ROLE, targetAddress),
    MANUFACTURER_ROLE: await contract.hasRole(MANUFACTURER_ROLE, targetAddress),
    REPAIR_CENTER_ROLE: await contract.hasRole(REPAIR_CENTER_ROLE, targetAddress),
    RECYCLER_ROLE: await contract.hasRole(RECYCLER_ROLE, targetAddress)
  };
  console.log("Roles for Target Wallet:", targetRoles);

  console.log("\n=== Checking Deployer Address:", deployerAddress, "===");
  const deployerRoles = {
    DEFAULT_ADMIN_ROLE: await contract.hasRole(DEFAULT_ADMIN_ROLE, deployerAddress),
    MANUFACTURER_ROLE: await contract.hasRole(MANUFACTURER_ROLE, deployerAddress),
    REPAIR_CENTER_ROLE: await contract.hasRole(REPAIR_CENTER_ROLE, deployerAddress),
    RECYCLER_ROLE: await contract.hasRole(RECYCLER_ROLE, deployerAddress)
  };
  console.log("Roles for Deployer Wallet:", deployerRoles);

  // Check if contract is paused
  try {
    const isPaused = await contract.paused();
    console.log("\nContract Paused State:", isPaused);
  } catch (_) {}

  // Check total products count
  try {
    const totalProducts = await contract.getTotalProducts();
    console.log("Total Products Registered on Sepolia:", totalProducts.toString());
  } catch (_) {}
}

main().catch((err) => {
  console.error("Verification failed:", err.message);
  process.exit(1);
});
