# ReLife: 5-Minute Live Demo & Viva Presentation Script

This script is your exact, step-by-step guide for presenting **ReLife** to evaluators, professors, viva panels, or hackathon judges. It includes exact sample data, talking points, and answers to challenging questions.

---

## 1. High-Level Summary (30 Seconds)

> *"Good morning/afternoon. Today I am presenting **ReLife**, a decentralized Digital Product Passport (DPP) platform built on Ethereum and IPFS. In traditional supply chains, product origin is opaque, paper warranties get lost, counterfeit goods proliferate, and end-of-life recycling is unaccounted for.*
> 
> *ReLife solves this by creating an immutable digital twin for physical products. From manufacturing and repair to secondary market transfers and circular recycling, every lifecycle transition is cryptographically verified on-chain, while heavy documents and carbon metrics are stored decentralized on Pinata IPFS without exposing API secrets."*

---

## 2. System Architecture at a Glance (45 Seconds)

Point to the architecture diagram:
- **Smart Contract (`ReLife.sol`)**: Deployed on Sepolia testnet at [`0x61B941B43ba4C39bDA4d6138DA50977EB43D3734`](https://sepolia.etherscan.io/address/0x61B941B43ba4C39bDA4d6138DA50977EB43D3734) using Solidity `0.8.24` and OpenZeppelin `AccessControl`. Employs custom gas errors, formal state machines, and cryptographic secret commitments.
- **Backend API (`server.js` + `pinataService.js` + `scans.js`)**: Express server acting as a secure intermediary for IPFS pinning, ephemeral secret generation, and privacy-preserving scan velocity anomaly detection.
- **Frontend Layer**: Pure HTML5, modern CSS3, and vanilla JavaScript powered by **Ethers.js v6** and `html5-qrcode`. Zero bundlers required.
- **Consumer Verification**: Anyone can verify product authenticity by scanning a QR code with their mobile phone **without installing MetaMask or paying any gas**.

---

## 3. Step-by-Step Live Walkthrough (3.5 Minutes)

### Preparation
1. Start the backend server:
   ```bash
   node backend/server.js
   # Server running at http://localhost:5000
   ```
2. Open your browser to `http://localhost:5000`.

---

### Step 1: Register a Product (with Status & Authenticity Secret)
- **Action**: Switch MetaMask to your authorized Manufacturer wallet and navigate to `http://localhost:5000/manufacturer.html`.
- **Show Evaluator**:
  - Point out the active status: initial state is `Manufactured`.
  - Enter sample product data:
    - **Serial Number**: `SN-CIRCULAR-2026-001`
    - **Model Name**: `EcoBook Pro 14`
    - **Brand**: `CircuTech`
    - **Category**: `Laptops & Computers`
    - **Materials**: `70% Recycled Aluminum, Conflict-Free Tin, Modular Battery`
    - **Carbon Footprint**: `42.5 kg CO2e`
    - **Origin / Factory**: `Circular Manufacturing Hub, Stuttgart, Germany`
  - Click **"Register Product Passport"**.
- **Talking Point**:
  > *"When registering, the backend generates an ephemeral 256-bit cryptographic randomness. Only the `keccak256(secret)` hash is committed to the blockchain, while the plaintext secret goes onto the physical packaging QR label. The backend strictly never stores or logs the plaintext secret."*

---

### Step 2: Show Authentic on the Verification Page
- **Action**: Open the Verify page with the secret parameter:
  `http://localhost:5000/product.html?id=1&secret=<secret>` (or enter the secret in the manual secret box).
- **Show Evaluator**:
  - The green **"✓ Authentic"** badge lights up instantly.
  - Show what happens if you tamper with even one character in the secret input:
    - It flips immediately to red **"⚠ Not matching"**.
- **Talking Point**:
  > *"Verification calls `verifySecret(productId, secret)` on-chain. Because it's an EVM `view` function, it executes locally via `eth_call` at zero gas cost without requiring a crypto wallet."*

---

### Step 3: Scan Repeatedly to Trigger the Counterfeit Alert Banner
- **Action**: Refresh the page or click **"Verify Passport"** 5-6 times consecutively.
- **Show Evaluator**:
  - The scan counter increments: `1 scan`, `2 scans`...
  - Upon reaching the 6th scan (> 5 threshold), a prominent red warning banner flashes:
    > **"COUNTERFEIT / CLONED QR ALERT (Suspicious Scan Activity)"**
  - Point out the scan badge: `⚠ 6 scan(s) - SUSPICIOUS`.
- **Talking Point**:
  > *"In supply chain security, an authentic physical laptop is rarely scanned dozens of times. High scan counts or scans originating from multiple distinct networks indicate a photocopied QR tag pasted onto fake hardware. Our backend tracks this using salted HMAC-SHA256 IP anonymization—guaranteeing 100% GDPR privacy with zero personal data storage."*

---

### Step 4: Transfer Ownership with 2-Step Accept
- **Action**:
  1. Open `http://localhost:5000/owner.html` as the Manufacturer (initial owner).
  2. In the "Transfer Asset Ownership" section, enter the Buyer's wallet address and click **"Initiate Transfer"**.
  3. Show the badge: `Status: Transfer Pending to 0x...`.
  4. Switch MetaMask to the Buyer's wallet.
  5. The Buyer's dashboard displays the **"Incoming Transfers Awaiting Acceptance"** inbox!
  6. Click **"Accept Transfer"**.
- **Talking Point**:
  > *"Traditional 1-step transfers risk irreversible loss if an address is mistyped. Our 2-step `Ownable2Step` pattern guarantees that ownership only transfers when the recipient proves control of the designated private key by signing the transaction. Notice the lifecycle status automatically advances from `Manufactured` to `Sold`!"*

---

### Step 5: Add a Certified Repair Record
- **Action**: Switch MetaMask to an authorized Repair Center wallet.
  1. Update product status to `InRepair` (demonstrating that transfers are automatically locked during servicing).
  2. In the repair form, log:
     - **Repair Type**: `Modular Battery & Display Replacement`
     - **Description**: `Replaced lithium pack with 100% recyclable LFP cell. Recalibrated OLED touch sensor.`
     - **Diagnostic File**: Upload any sample diagnostic report.
  3. Submit transaction and transition status back to `Sold`.
- **Talking Point**:
  > *"Only authorized repair centers can log maintenance. The diagnostic report is pinned to IPFS, and the on-chain status locks prevent secondary sales while a product is physically disassembled."*

---

### Step 6: Show Active Verifiable Warranty
- **Action**: In `owner.html` or `manufacturer.html`, attach a warranty:
  - Valid from today through 365 days in the future.
- **Show Evaluator**:
  - Return to `product.html?id=1`.
  - Point out the **Warranty Status Badge**:
    `✓ Valid (365 days left)`.
- **Talking Point**:
  > *"Unlike paper warranties, the smart contract checks `block.timestamp >= warrantyStart && block.timestamp < warrantyEnd` dynamically on-the-fly. Once the expiry passes, it automatically marks as Expired without needing any scheduled cron jobs or gas transactions."*

---

### Step 7: Circular Decommissioning & Anti-Fraud Recycling
- **Action**: Switch to an authorized Recycler wallet and open `http://localhost:5000/recycler.html`.
  1. Enter Product ID `1`.
  2. Enter facility name: `EcoShred European Circular Facility #3`.
  3. Notes: `Disassembled: aluminum chassis melted into ingot, battery sent to hydrometallurgy.`
  4. Upload destruction certificate and click **"Decommission Product"**.
- **Show Evaluator the Anti-Fraud Freeze**:
  - Return to `product.html?id=1`: A red **"RECYCLED & DECOMMISSIONED"** badge appears.
  - Attempting to initiate a transfer or add a repair reverts with custom error `ReLife__ProductAlreadyRecycled`.
- **Talking Point**:
  > *"This completely eliminates the 'zombie passport' exploit, where counterfeiters purchase decommissioned legitimate packaging to authenticate illicit hardware."*

---

### Step 8: Show the Comprehensive Lifecycle Timeline
- **Action**: Scroll down on `product.html?id=1` to the **Verifiable Product Lifecycle & Event Timeline** section.
- **Show Evaluator**:
  - The complete vertical timeline displays every event in exact chronological sequence:
    1. 🏭 **Product Manufactured & Registered** (Manufacturer address + IPFS metadata link)
    2. 🔄 **Status Changed**: `Manufactured ➔ Sold`
    3. 🛡️ **Warranty Issued** (Active coverage dates + policy link)
    4. 📤 **Ownership Transfer Proposed** (Initiated to Buyer)
    5. 🤝 **Ownership Transfer Accepted** (Finalized by Buyer)
    6. 🔄 **Status Changed**: `Sold ➔ InRepair`
    7. 🔧 **Service Record**: `Modular Battery & Display Replacement` (Diagnostic sheet link)
    8. 🔄 **Status Changed**: `InRepair ➔ Sold`
    9. ♻️ **Product Recycled & Decommissioned** (Destruction certificate link)
  - Point out that every actor address links directly to **Sepolia Etherscan**, and all dynamic strings are sanitized using safe DOM `textContent` (zero XSS risk).

---

## 4. Viva Defense & Rapid-Fire Questions

### Q1: What makes your architecture decentralized if you use an Express backend?
> **Answer**: The backend does **not** hold custody of user funds, private keys, or smart contract state. Its sole purpose is to serve as a secure API gateway for IPFS pinning, ephemeral secret generation, and privacy-preserving scan velocity anomaly detection. Even if the backend went down, the smart contract on Ethereum remains 100% operational and accessible through public RPC nodes.

### Q2: How did you optimize gas consumption?
> **Answer**: We implemented four major gas optimizations:
> 1. **Custom Solidity Errors** (`error ReLife__ProductAlreadyRecycled()`) instead of string reverts, saving deployment bytecode and runtime gas.
> 2. **Indexed Events for Histories & Directories** (`queryFilter`) rather than storing unbounded dynamic arrays in state storage.
> 3. **Dynamic View Functions for Warranty Expiration**: Checking `block.timestamp` on-the-fly rather than executing scheduled state transactions.
> 4. **One-Way Cryptographic Commitments**: Storing 32-byte `keccak256(secret)` hashes on-chain rather than heavy strings.

### Q3: How does ReLife protect user privacy while detecting counterfeit QR clones?
> **Answer**: Under GDPR and data privacy laws, IP addresses are Personally Identifiable Information (PII). ReLife implements Privacy by Design: all client IPs are immediately passed through an HMAC-SHA256 hashing function with a secret salt. The raw IP address is never stored, logged, or exposed. The resulting hash allows our anomaly engine to track velocity across distinct networks without storing any personal user data.

---

## 5. Summary Metrics to Highlight

- **Total Unit & Integration Tests**: **204 passing tests** across 17 test suites (100% pass rate).
- **Contract Language**: Solidity `0.8.24` (OpenZeppelin 5.6.1).
- **Target Network**: Ethereum Sepolia (`chainId: 11155111`).
- **Live Contract Address**: [`0x61B941B43ba4C39bDA4d6138DA50977EB43D3734`](https://sepolia.etherscan.io/address/0x61B941B43ba4C39bDA4d6138DA50977EB43D3734).
- **Frontends**: 6 integrated portals with uniform navigation, mobile camera QR scanner (`html5-qrcode`), and safe DOM `textContent` rendering.
- **Storage**: Ethereum Sepolia (State & Ownership) + Pinata IPFS (Decentralized Media & Documents).
