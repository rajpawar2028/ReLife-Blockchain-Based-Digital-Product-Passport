# 🚀 ReLife DPP — Multi-Device Demo Setup Guide

This guide explains how to set up a seamless live demonstration of the **ReLife Digital Product Passport (DPP)** system across **multiple laptops or phones** (e.g. Laptop A = Contract Administrator, Laptop B = Supply Chain Participant / Auditor).

---

## 🔒 1. Core Security Rule

> [!CAUTION]
> **NEVER export or import the contract deployer / admin private key onto a second laptop or shared machine.**
>
> In real-world enterprise blockchain environments, administrators never share private keys. Instead, each supply chain participant (manufacturer, repair facility, recycler, consumer) creates their **own independent Ethereum wallet**, and the Admin grants permissions on-chain using OpenZeppelin `AccessControl`.

---

## 💻 2. Setup Laptop B (The Second Device / Guest Wallet)

### Step 1: Install MetaMask
1. Open Chrome, Brave, or Firefox on Laptop B.
2. Visit [metamask.io/download](https://metamask.io/download/) and install the MetaMask browser extension.
3. Create a new, fresh wallet (or use an existing personal testnet wallet). Save your secret recovery phrase safely.

### Step 2: Switch to Ethereum Sepolia Testnet
1. Open MetaMask and click the **Network Selector** in the top-left corner.
2. Toggle **"Show test networks"** to ON.
3. Select **Sepolia**.
4. Confirm:
   * **Network Name**: Sepolia
   * **Chain ID**: `11155111` (`0xaa36a7`)
   * **Currency Symbol**: `SepoliaETH`

### Step 3: Get Free Sepolia Testnet ETH
To send transactions (e.g., minting a passport or logging a repair), the wallet needs a small amount of testnet gas:
* **Google Cloud Web3 Faucet**: [cloud.google.com/application/web3/faucet/ethereum/sepolia](https://cloud.google.com/application/web3/faucet/ethereum/sepolia) (fastest, requires Google sign-in)
* **Alchemy Sepolia Faucet**: [sepoliafaucet.com](https://sepoliafaucet.com/)
* **Sepolia PoW Faucet**: [sepolia-faucet.pk910.de](https://sepolia-faucet.pk910.de/) (mines free SepoliaETH directly in your browser without login)

### Step 4: Copy the Guest Wallet Address
* In MetaMask, click on your account name (e.g., `Account 1`) to copy your Ethereum address to your clipboard (e.g. `0xc1cCc031673332956A07e99A14e57631587B12ff`).

---

## 👑 3. Onboard Laptop B from the Admin Device (Laptop A)

You can grant roles to Laptop B using **either the Web UI** or the **Automated Hardhat Script**.

### Option A: Via the Web Admin Portal (No Code)
1. On Laptop A (where the deployer wallet `0xd75dC45aEDDa24Bc3d3e92B03D75b828f473530E` is connected):
2. Open the Admin Portal: [Admin Portal](https://relife-blockchain-based-digital-pro.vercel.app/admin.html)
3. Under **Participant Onboarding**:
   * Select the role:
     * **🏭 Manufacturer**: Can mint passports and upload IPFS metadata.
     * **🔧 Repair Center**: Can log official service and maintenance records.
     * **♻️ Recycler**: Can decommission end-of-life products.
   * Paste Laptop B's wallet address.
   * Enter an organization name (e.g., `Nordic Circular Tech Ltd`).
   * Click **Register Participant** and approve the MetaMask transaction.

### Option B: Via the Hardhat CLI Script (Developer Fast Path)
Run this command from your terminal on Laptop A:

```bash
# Grant Manufacturer role:
npx hardhat run scripts/grantRoles.js --network sepolia -- --address 0xc1cCc031673332956A07e99A14e57631587B12ff --role manufacturer --name "Nordic Circular Tech"

# Or grant Repair Center role:
npx hardhat run scripts/grantRoles.js --network sepolia -- --address 0xc1cCc031673332956A07e99A14e57631587B12ff --role repair --name "Stockholm Repair Center"

# Or grant Admin role (if adding a co-administrator):
npx hardhat run scripts/grantRoles.js --network sepolia -- --address 0xc1cCc031673332956A07e99A14e57631587B12ff --role admin
```

The script automatically queries the on-chain state, submits the transaction, and outputs the confirmed Sepolia transaction hash.

---

## 🌐 4. Live Multi-Device Demo Flow

Once onboarded, open the deployed dApp on Laptop B:
👉 **[https://relife-blockchain-based-digital-pro.vercel.app](https://relife-blockchain-based-digital-pro.vercel.app)**

### 1. Header Role Badge
* Click **"Connect Wallet"**.
* Notice the navigation header immediately updates with an official cryptographic role badge:
  * 👑 **Admin** (Amber)
  * 🏭 **Manufacturer** (Blue)
  * 🔧 **Repair Center** (Orange)
  * ♻️ **Recycler** (Green)
  * 👤 **Public User** (Grey, for unprivileged visitors)

### 2. Testing Access Control (Negative Test)
* While connected as a Manufacturer on Laptop B, try visiting the **Admin Portal** (`admin.html`).
* Notice the **informative Access Denied Screen**:
  * Displays your wallet address (`0xc1cC...12ff`).
  * Provides a **📋 Copy My Address** button.
  * Shows the exact required role (`DEFAULT_ADMIN_ROLE`).
  * Shows the contract administrator address (`0xd75dC45aEDDa24Bc3d3e92B03D75b828f473530E`) with an Etherscan link.

### 3. Testing Authorized Actions (Positive Test)
* Navigate to your authorized portal (e.g. `manufacturer.html`).
* Fill in the product passport form, upload a document, and click **"Mint Product Passport"**.
* The file and metadata are uploaded to Pinata IPFS, and MetaMask prompts for transaction confirmation on Sepolia.

---

## 🔍 5. Troubleshooting & FAQ

### Q: MetaMask says "Still connecting to Sepolia..."
**A**: Public testnet RPC nodes can occasionally experience high latency. ReLife features an automated resilient read-only RPC fallback (`getReadOnlyProvider()`) that queries multiple public Sepolia endpoints (`publicnode.com`, `rpc2.sepolia.org`) with a 4-second timeout, so product verification, public timelines, and role checks load instantly.

### Q: Page shows "Wrong Network Detected"
**A**: ReLife enforces Ethereum Sepolia (`11155111`). Click the **"Switch Network"** button on the banner to prompt MetaMask to automatically switch to Sepolia.

### Q: How do I verify my transaction on Etherscan?
**A**: Visit verified contract: [https://sepolia.etherscan.io/address/0x9600044e058A7492F0121b34E0bbe4cBFD707149](https://sepolia.etherscan.io/address/0x9600044e058A7492F0121b34E0bbe4cBFD707149)
Click on the **"Events"** tab to see every role assignment and product registration in real time.
