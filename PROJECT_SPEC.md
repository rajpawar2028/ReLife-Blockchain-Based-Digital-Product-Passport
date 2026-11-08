# ReLife: Blockchain-Based Digital Product Passport (DPP) System Specification

## 1. Project Overview & Vision
ReLife is an end-to-end decentralized Digital Product Passport (DPP) platform built on Ethereum (Sepolia testnet). It provides transparent, tamper-proof tracking of physical products throughout their lifecycle:
- **Manufacturing**: Registered by verified manufacturers with metadata (materials, origin, environmental footprint) anchored on IPFS.
- **Retail & Ownership**: Auditable ownership tracking and warranty management without exposing customer PII.
- **Maintenance & Repair**: Verifiable repair and servicing logs created by certified repair centers.
- **End-of-Life & Recycling**: Irreversible recycling status recorded by authorized recyclers, locking the passport against fraudulent reuse.
- **Consumer Verification**: Anyone can scan a physical QR code linking to `/product.html?id=N` to verify authenticity, lifecycle history, and repair pedigree directly against the smart contract.

---

## 2. Technology Stack (Fixed)
- **Smart Contract Language**: Solidity `0.8.x`
- **Smart Contract Development Framework**: Hardhat
- **Blockchain Libraries**: OpenZeppelin Contracts (AccessControl), Ethers.js v6
- **Target Network**: Sepolia Testnet (and local Hardhat network for testing)
- **Wallet Provider**: MetaMask
- **Backend Service**: Node.js + Express
- **Decentralized Storage**: IPFS via Pinata API (JWT/API Keys handled strictly server-side)
- **Frontend Architecture**: Pure HTML5, CSS3, vanilla JavaScript (ES6+), no React
- **QR Code Tooling**: Standard client-side JS QR code generation (`qrcode.js` / `qr-code-styling`) and HTML5 camera scanner (`html5-qrcode`)

---

## 3. System Architecture & Access Control Roles
The smart contract implements OpenZeppelin's role-based access control (`AccessControl`):
- `DEFAULT_ADMIN_ROLE` (System Admin): Can grant and revoke participant roles (`MANUFACTURER_ROLE`, `REPAIR_CENTER_ROLE`, `RECYCLER_ROLE`).
- `MANUFACTURER_ROLE`: Authorized to register new products with auto-incrementing ID, unique serial number, and IPFS metadata URI.
- `REPAIR_CENTER_ROLE`: Authorized to append repair/service records to existing products.
- `RECYCLER_ROLE`: Authorized to mark products as recycled, permanently decommissioning them from transfers or modifications.
- **Product Owners**: Public Ethereum addresses holding ownership of specific products, authorized to transfer ownership to another address.

---

## 4. Phased Development Roadmap & Acceptance Criteria

### Phase 0: Setup
- **Goal**: Initialize repository structure, package management, Hardhat environment, and baseline configuration.
- **Folder Structure**:
  - `contracts/`: Solidity smart contracts
  - `test/`: Hardhat Mocha/Chai test suites
  - `scripts/`: Deployment and automation scripts
  - `backend/`: Node.js Express API for Pinata IPFS uploads
  - `frontend/`: Vanilla HTML, CSS, JavaScript web application
- **Config & Environment**: `.env.example`, `.gitignore` (excluding `.env`, `node_modules`, `cache`, `artifacts`).
- **Acceptance Criteria**: `npx hardhat test` runs cleanly.

### Phase 1: Core Contract (MVP Part 1)
- **Goal**: Implement `ReLife.sol` core contract.
- **Features**:
  - Roles: Admin, Manufacturer, RepairCenter, Recycler via OpenZeppelin `AccessControl`.
  - Functions: `registerManufacturer`, `registerProduct` (auto-increment `productId`, globally unique `serialNumber`, `metadataURI`), `getProduct`, `verifyProduct`.
  - State Change Events: `ProductRegistered`, `ManufacturerRegistered`, etc.
- **Acceptance Criteria**: All Hardhat tests pass for authorized callers and fail cleanly with custom reverts for unauthorized callers or duplicate serial numbers.

### Phase 2: Repair History (MVP Part 2)
- **Goal**: Appendable service and repair logs.
- **Features**:
  - `registerRepairCenter(address)` (Admin only)
  - `addRepairRecord(uint256 productId, string repairType, string description, string serviceUri)` (Repair center only)
  - `getProductHistory(uint256 productId)` returning array of repair structs in chronological order.
- **Acceptance Criteria**: Only authorized repair centers can add records; repair history is retrievable in insertion order; reverts for nonexistent products or recycled products.

### Phase 3: Deployment
- **Goal**: Deploy smart contract to Sepolia testnet.
- **Features**:
  - Hardhat deploy script supporting Sepolia testnet configuration.
  - Automated export of contract address and ABI into `frontend/` directory.
- **Acceptance Criteria**: Contract deployed and verified working on Sepolia with exported artifacts.

### Phase 4: Backend + IPFS Integration
- **Goal**: Secure server-side Pinata IPFS integration.
- **Features**:
  - Express server with endpoints for JSON metadata and document/image upload.
  - Rigorous input validation, CORS configuration, error handling.
  - Zero API secrets or credentials exposed to the frontend.
- **Acceptance Criteria**: Uploading metadata returns a valid, accessible `ipfs://` (and HTTPS gateway) CID.

### Phase 5: Frontend Core
- **Goal**: Manufacturer portal and MetaMask integration.
- **Features**:
  - MetaMask connection handler with network checking (Sepolia).
  - Role-based UI rendering.
  - Manufacturer dashboard to upload metadata via backend and submit `registerProduct` on-chain.
- **Acceptance Criteria**: Products can be registered directly from the browser and appear on Sepolia.

### Phase 6: QR Code & Public Verification (MVP Complete)
- **Goal**: Public consumer verification page and QR generation.
- **Features**:
  - QR generator creating link to `/product.html?id=N`.
  - Verification page reading directly from contract via Ethers.js (read-only provider / connected wallet).
  - Displays product authenticity status, specs, IPFS metadata, and repair pedigree.
  - In-browser camera QR scanner.
  - Prominent "Not Registered / Potential Counterfeit" state for unknown IDs.
  - Educational note: *"A physical QR code alone does not prove authenticity; verify on-chain status and packaging seals."*
- **Acceptance Criteria**: End-to-end QR scan loads live Sepolia blockchain data seamlessly.

### Phase 7: Ownership Transfer & Warranty
- **Goal**: Secondary lifecycle management.
- **Features**:
  - `transferOwnership(uint256 productId, address newOwner)` restricted to current owner.
  - `addWarranty(uint256 productId, uint256 warrantyExpiryTimestamp)` restricted to manufacturer or admin.
  - Owner dashboard showing owned items and transfer action.
- **Acceptance Criteria**: Auditable ownership history; unauthorized transfers fail.

### Phase 8: Recycling & Decommissioning
- **Goal**: Circular economy and anti-fraud decommissioning.
- **Features**:
  - `registerRecycler(address)` (Admin only)
  - `addRecyclingRecord(uint256 productId, string recyclingFacility, string notes)` (Authorized recyclers only).
  - Irreversible status: blocks subsequent transfers, repairs, or edits once recycled.
- **Acceptance Criteria**: Recycled products reject further mutations with appropriate reverts; tests pass.

### Phase 9: Admin Dashboard & UX Polish
- **Goal**: System governance and error resilience.
- **Features**:
  - Admin UI to grant and revoke roles.
  - Friendly MetaMask error decoding (e.g., user rejection, unauthorized role, wrong network).
  - Clean, responsive CSS styling and loading skeletons.
- **Acceptance Criteria**: Clean administrative control and intuitive UX across desktop and mobile viewports.

### Phase 10: Final Testing, Gas Optimization & Documentation
- **Goal**: Project production readiness and defense preparation.
- **Features**:
  - Complete Hardhat test suite run with gas reporter notes.
  - End-to-end architecture diagram.
  - Comprehensive `README.md`.
  - 5-minute viva/demo presentation script with realistic mock data.
- **Acceptance Criteria**: 100% test pass rate, clear documentation, ready for evaluation.

---

## 5. Security & Development Rules
- **Keys**: Never hardcode private keys or API keys. Always use `.env`.
- **Testnet**: Use only Sepolia test ETH.
- **Privacy**: Never store personal identifiable information (PII) on-chain or on public IPFS.
- **Code Quality**: Beginner-readable, well-commented Solidity and JavaScript.
- **Auditing**: OpenZeppelin standard contracts for core security primitives.
- **Test Integrity**: Never adjust tests to fit flawed code; fix the contract logic.

