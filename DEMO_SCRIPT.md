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
- **Smart Contract (`ReLife.sol`)**: Deployed on Sepolia testnet using Solidity `0.8.24` and OpenZeppelin `AccessControl`. Employs custom gas errors and strict lifecycle state machines.
- **Backend API (`server.js` + `pinataService.js`)**: Express server acting as a secure intermediary for Pinata IPFS. Protects private API keys from frontend DevTools and validates MIME types and payloads.
- **Frontend Layer**: Pure HTML5, modern CSS3, and vanilla JavaScript powered by **Ethers.js v6**. Zero bundlers required.
- **Consumer Verification**: Anyone can verify product authenticity by scanning a QR code with their mobile phone **without installing MetaMask or paying any gas**.

---

## 3. Step-by-Step Live Walkthrough (3.5 Minutes)

### Preparation
1. Ensure Hardhat node or Sepolia testnet is reachable:
   ```bash
   npm start
   # Server running at http://localhost:5000
   ```
2. Open your browser to `http://localhost:5000`.

---

### Step 1: Admin Governance & Participant Onboarding
- **Action**: Navigate to `http://localhost:5000/admin.html` and connect the **Deployer Account** (DEFAULT_ADMIN_ROLE).
- **Show Evaluator**:
  - Point out that non-admin accounts receive an automatic red *"Access Denied"* banner.
  - In the **Register Manufacturer** card, enter:
    - **Wallet Address**: `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` *(Hardhat Signer #1)*
    - **Organization Name**: `Fairphone B.V. (Amsterdam)`
  - Click **Register Manufacturer**.
- **Talking Point**:
  > *"Instead of keeping an unbounded array on-chain which would waste gas, the contract emits an indexed event (`ManufacturerRegistered`). Our frontend queries these events via `queryFilter` to dynamically populate this auditable participant directory."*

---

### Step 2: Manufacturer Minting & IPFS Metadata Pinning
- **Action**: Switch MetaMask to the Manufacturer account and go to `http://localhost:5000/manufacturer.html`.
- **Show Evaluator**:
  - The role-gate recognizes the account as an authorized manufacturer.
  - Fill in sample product data:
    - **Serial Number**: `FP5-2026-CH-9812`
    - **Model Name**: `Fairphone 5 Circular Edition`
    - **Brand**: `Fairphone`
    - **Bill of Materials**: `Recycled Aluminum 70%, Conflict-Free Tin, Modular Display`
    - **Carbon Footprint**: `32.5 kg CO2e`
    - **Origin / Factory**: `Circular Assembly Hub, Geneva, Switzerland`
    - **Upload Spec / Invoice**: Upload any sample `.jpg` or `.pdf`.
  - Click **Register Product Passport**.
- **Talking Point**:
  > *"Notice the two-stage execution: the backend first pins the metadata and image buffer to IPFS via Pinata, returning a cryptographic `ipfs://` CID. Only then does MetaMask prompt for the on-chain minting transaction. Physical serial numbers are globally unique—re-registering the same serial will instantly revert with a custom gas error."*

---

### Step 3: Consumer QR Verification (Zero-Friction Auditing)
- **Action**: Go to `http://localhost:5000/product.html?id=1` or disconnect MetaMask.
- **Show Evaluator**:
  - The verification works **without MetaMask**!
  - Point out:
    - Dynamic QR code generated on the fly linking to the product passport.
    - Verified Brand & Model badge.
    - Clickable IPFS metadata link.
    - The **Physical-to-Digital Anti-Counterfeit Notice**:
      > *"We explicitly inform consumers that physical QR stickers can be photocopied. True anti-counterfeiting requires cross-referencing the hardware's etched serial number against on-chain records."*

---

### Step 4: Maintenance & Service History
- **Action**: Register a Repair Center wallet (`0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC`) via Admin. Switch to that wallet and log a repair:
  - **Product ID**: `1`
  - **Repair Type**: `Screen & Battery Modular Replacement`
  - **Description**: `Replaced cracked front OLED module with Fairphone OEM part #FP5-SCR-01. Battery diagnostic healthy at 98%.`
  - **Service Report URI**: Upload a service diagnostic sheet.
- **Show Evaluator**:
  - Re-visit `product.html?id=1`.
  - Show the **Chronological Service Timeline** displaying exact block timestamp, servicing center address, and diagnostic notes.

---

### Step 5: Secondary Market Ownership Transfer
- **Action**: Go to `http://localhost:5000/owner.html` as the manufacturer (initial owner).
- **Show Evaluator**:
  - The dashboard automatically detects owned products.
  - Click **Transfer Ownership**:
    - **Recipient Address**: `0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65` *(Customer / Buyer)*
  - Confirm transfer.
- **Talking Point**:
  > *"Ownership is strictly decentralized: only `currentOwner` can invoke this function. Even the smart contract admin cannot confiscate a user's passport. An immutable chain-of-custody log is updated without storing private personal data (GDPR compliant)."*

---

### Step 6: Circular End-of-Life Decommissioning & Anti-Fraud Freeze
- **Action**: Switch to an authorized Recycler wallet and go to `http://localhost:5000/recycler.html`.
- **Show Evaluator**:
  - Enter:
    - **Product ID**: `1`
    - **Recycling Facility**: `Swiss Circular Metallurgy Hub #4`
    - **Materials Reclaimed**: `Reclaimed: 98% Aluminum, 85% Fairtrade Gold, 92% Cobalt`
    - **Certificate**: Upload destruction / recycling certificate.
  - Click **Decommission Product**.
- **Show Evaluator the Anti-Fraud Freeze**:
  - Go back to `product.html?id=1`: Passport now displays a prominent **RECYCLED / DECOMMISSIONED** red banner.
  - Try to transfer ownership or add a repair: The contract strictly blocks the action with custom error `ReLife__ProductAlreadyRecycled`.
- **Talking Point**:
  > *"This solves the 'zombie passport' problem in luxury goods and electronics, where genuine recycled packaging is reused to authenticate counterfeit knockoffs."*

---

## 4. Viva Defense & Rapid-Fire Questions

### Q1: What makes your architecture decentralized if you use an Express backend?
> **Answer**: The backend does **not** hold custody of user funds, private keys, or smart contract state. Its sole purpose is to serve as a secure API gateway for IPFS pinning, preventing Pinata secrets from leaking into client browser network tabs. Even if the backend went down, the smart contract on Ethereum remains 100% operational and accessible through public RPC nodes.

### Q2: How did you optimize gas consumption?
> **Answer**: We implemented three major gas optimizations:
> 1. **Custom Solidity Errors** (`error ReLife__NotProductOwner()`) instead of string reverts, saving deployment bytecode and runtime gas.
> 2. **Indexed Events for Directories** rather than storing unbounded dynamic arrays in state storage.
> 3. **Dynamic View Functions for Warranty Expiration**: Checking `block.timestamp >= expiryTimestamp` on-the-fly rather than executing scheduled state transactions.

### Q3: How do you prevent someone from uploading fake IPFS files?
> **Answer**: Our Express backend uses `multer` memory storage with a 10MB file limit and MIME type whitelisting (images, JSON, PDF). Furthermore, metadata schemas are strictly validated before pinning. On-chain, only addresses holding accredited roles can link an IPFS URI to a product passport.

---

## 5. Summary Metrics to Highlight

- **Total Unit & Integration Tests**: **113 passing tests** across 10 test suites.
- **Contract Language**: Solidity `0.8.24` (OpenZeppelin 5.6.1).
- **Frontends**: 6 integrated portals with uniform navigation.
- **Storage**: Ethereum Sepolia (State & Ownership) + Pinata IPFS (Decentralized Media & Documents).

