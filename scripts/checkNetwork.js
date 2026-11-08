const hre = require("hardhat");

async function main() {
  console.log("=================================================");
  console.log("  ReLife Network & Account Pre-Flight Check");
  console.log("=================================================");

  const network = await hre.ethers.provider.getNetwork();
  console.log(`Network Name:        ${hre.network.name}`);
  console.log(`Chain ID:            ${network.chainId}`);

  if (hre.network.name === "sepolia" && network.chainId !== 11155111n) {
    console.error(`\n[Warning] Expected Sepolia chainId 11155111, but got ${network.chainId}!`);
  }

  const signers = await hre.ethers.getSigners();
  if (signers.length === 0) {
    console.error("\n[Error] No deployer signer configured for this network.");
    process.exit(1);
  }

  const deployer = signers[0];
  console.log(`Deployer Address:    ${deployer.address}`);

  const balance = await hre.ethers.provider.getBalance(deployer.address);
  const formattedBalance = hre.ethers.formatEther(balance);
  console.log(`Sepolia ETH Balance: ${formattedBalance} ETH`);

  console.log("=================================================");

  if (balance === 0n) {
    console.log("\n[Notice] This account has 0 ETH. You will need Sepolia test ETH to deploy.");
    console.log("You can get free Sepolia test ETH from:");
    console.log("  - https://cloud.google.com/application/web3/faucet/ethereum/sepolia");
    console.log("  - https://sepoliafaucet.com");
  } else {
    console.log("\n[Ready] Account has test ETH and is ready for deployment!");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("Pre-flight check failed:", err.message);
    process.exit(1);
  });

