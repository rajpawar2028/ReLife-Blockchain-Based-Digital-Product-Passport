require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

// Resolve environment variables with fallback support
const rawRpcUrl = (process.env.SEPOLIA_RPC_URL || "").trim();
const rawPrivateKey = (process.env.PRIVATE_KEY || process.env.SEPOLIA_PRIVATE_KEY || "").trim();
const ETHERSCAN_API_KEY = (process.env.ETHERSCAN_API_KEY || "").trim();

// Clean private key: ensure valid 64-hex format if provided
let formattedPrivateKey = rawPrivateKey;
if (formattedPrivateKey.startsWith("0x")) {
  formattedPrivateKey = formattedPrivateKey.slice(2);
}

// Check if running on Sepolia network
const isSepoliaTarget = process.argv.includes("sepolia");

if (isSepoliaTarget) {
  // Validate SEPOLIA_RPC_URL
  if (!rawRpcUrl || rawRpcUrl.includes("your_api_key_here") || rawRpcUrl === "https://rpc.sepolia.org") {
    console.error("\n=======================================================");
    console.error("  [ReLife Configuration Error] Missing Dedicated Sepolia RPC");
    console.error("=======================================================");
    console.error("The public 'https://rpc.sepolia.org' gateway is congested/offline (Error 522).");
    console.error("Please add a free dedicated RPC URL in your .env file:");
    console.error("  SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_ALCHEMY_KEY");
    console.error("  (Get a free key from https://www.alchemy.com or https://infura.io)");
    console.error("=======================================================\n");
    throw new Error("Missing or invalid SEPOLIA_RPC_URL in .env");
  }

  // Validate PRIVATE_KEY
  if (!formattedPrivateKey || formattedPrivateKey.length !== 64 || formattedPrivateKey === "0000000000000000000000000000000000000000000000000000000000000001") {
    console.error("\n=======================================================");
    console.error("  [ReLife Configuration Error] Missing Deployer Private Key");
    console.error("=======================================================");
    console.error("Please add your 64-character test wallet private key in .env:");
    console.error("  PRIVATE_KEY=your_private_key_here");
    console.error("  (Export from MetaMask -> Account Details -> Show Private Key)");
    console.error("=======================================================\n");
    throw new Error("Missing or invalid PRIVATE_KEY in .env");
  }

  // Safe instrumentation (never prints secrets)
  try {
    const parsedUrl = new URL(rawRpcUrl);
    console.log(`[Config Check] Target RPC Hostname: ${parsedUrl.hostname}`);
  } catch {
    console.log(`[Config Check] Target RPC: [Custom Endpoint]`);
  }
  console.log(`[Config Check] Private Key Loaded: Yes (Length: ${formattedPrivateKey.length} hex chars)`);
  console.log(`[Config Check] Target Network: Sepolia (Chain ID: 11155111)\n`);
}

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    sepolia: {
      url: rawRpcUrl || "http://127.0.0.1:8545",
      accounts: formattedPrivateKey && formattedPrivateKey.length === 64 ? [`0x${formattedPrivateKey}`] : [],
      chainId: 11155111,
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
};
