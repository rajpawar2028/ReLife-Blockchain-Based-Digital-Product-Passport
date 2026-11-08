const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("=================================================");
  console.log("  ReLife Deployment Verification Check");
  console.log("=================================================");

  const configPath = path.join(__dirname, "..", "frontend", "contract-data.json");
  if (!fs.existsSync(configPath)) {
    throw new Error("No deployment configuration found at frontend/contract-data.json. Please deploy first.");
  }

  const contractData = JSON.parse(fs.readFileSync(configPath, "utf8"));
  console.log(`Configured Address:  ${contractData.address}`);
  console.log(`Recorded Network:    ${contractData.network} (chainId: ${contractData.chainId})`);

  const currentNetwork = await hre.ethers.provider.getNetwork();
  console.log(`Current Network:     ${hre.network.name} (chainId: ${currentNetwork.chainId})`);

  // Check if bytecode exists at address
  const code = await hre.ethers.provider.getCode(contractData.address);
  if (code === "0x") {
    if (hre.network.name === "hardhat") {
      console.log("\n[Note] You ran verification against the default ephemeral 'hardhat' network.");
      console.log("The in-memory Hardhat network resets its state between separate CLI commands.");
      console.log("To verify state across commands, either:");
      console.log("  1. Run a persistent local node: `npx hardhat node` and pass `--network localhost`");
      console.log("  2. Or deploy & verify on Sepolia: `--network sepolia`");
      return;
    }
    throw new Error(`No contract bytecode found at address ${contractData.address} on ${hre.network.name}.`);
  }

  // Connect to deployed contract
  const relife = await hre.ethers.getContractAt("ReLife", contractData.address);

  // Perform live read calls
  const totalProducts = await relife.getTotalProducts();
  const adminRole = await relife.DEFAULT_ADMIN_ROLE();
  const hasAdmin = await relife.hasRole(adminRole, contractData.deployer);

  console.log(`Live total products: ${totalProducts.toString()}`);
  console.log(`Deployer is Admin:   ${hasAdmin}`);

  if (!hasAdmin) {
    throw new Error("Deployment verification failed: Recorded deployer does not have DEFAULT_ADMIN_ROLE.");
  }

  console.log("\n>>> Verification SUCCESS: Contract is alive, accessible, and correctly configured!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Verification check failed:", error.message);
    process.exit(1);
  });
