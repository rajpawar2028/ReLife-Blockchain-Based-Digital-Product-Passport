# Architectural & Design Decisions

## Phase 0: Setup
- **Hardhat 2 with @nomicfoundation/hardhat-toolbox (`hh2` tag)**: Selected the battle-tested, widely supported Hardhat 2 toolchain with Ethers.js v6 to provide stable CommonJS compatibility, robust Chai matchers, and maximum beginner clarity.
- **Solidity 0.8.24**: Chosen to maintain full compatibility with `@openzeppelin/contracts` v5 while enabling modern EVM optimizations and built-in overflow protection.
- **Separate backend folder**: Pinata IPFS uploads and API secrets are strictly isolated in `backend/` to prevent exposing API keys or JWT tokens to the client-side frontend.
- **Single monolithic contract architecture with modular roles**: Decided on `ReLife.sol` inheriting OpenZeppelin `AccessControl` to provide clear, single-source-of-truth passport state without complex multi-contract cross-calls.

## Phase 1: Core Contract (MVP Part 1)
- **OpenZeppelin AccessControl over Ownable**: Used role-based access control (`bytes32` constants) rather than simple ownership so distinct entities (Admin, Manufacturer, Repair Center, Recycler) have granular permissions.
- **1-based auto-incrementing Product IDs**: Initialized `_productIdCounter` so product IDs start at 1, treating ID 0 as an explicit sentinel for non-existent/unregistered products.
- **Custom Solidity Errors instead of `require(..., "string")`**: Used custom errors (e.g. `ReLife__EmptyString`) to save significant deployment and runtime execution gas while preserving precise error messages.
- **Dual-mode verification API (`getProduct` vs `verifyProduct`)**: Provided `getProduct` (reverts on non-existent IDs for strict contract callers) and `verifyProduct` (returns `isValid = false` without reverting for graceful frontend / QR camera scanning).
- **Global Serial Uniqueness**: Maintained `mapping(string => bool) private _serialNumberExists` to strictly prevent duplicate product registrations and counterfeit tagging.

## Phase 2: Repair History (MVP Part 2)
- **Per-product dynamic array storage for repairs (`mapping(uint256 => RepairRecord[])`)**: Appending via `.push()` provides natural chronological order in $O(1)$ time and allows retrieving full product pedigree with a single call to `getProductHistory`.
- **Per-product 1-based sequential repair ID**: Assigned `id = array.length + 1` so each repair on a passport has an intuitive, incremental identifier (e.g., Repair #1, Repair #2) alongside the global block timestamp.
- **Diagnostic/Proof Off-chaining via `serviceUri`**: Stored heavy repair documentation, photos, and parts diagnostic sheets off-chain on IPFS while anchoring the cryptographic URI on-chain.

## Phase 3: Deployment
- **Dual JSON and JS Artifact Export**: In addition to standard `contract-data.json`, `deploy.js` generates `frontend/contract-data.js` attaching `window.RELIFE_CONFIG`, allowing vanilla browser JavaScript to consume contract ABI and address directly via `<script src="contract-data.js">` without any bundlers (Webpack/Vite).
- **Ephemeral vs Persistent Network Safeguards in Verification**: Built network-aware detection in `verify-deployment.js` explaining the difference between ephemeral in-memory Hardhat nodes and persistent testnets to avoid student confusion.

## Phase 4: Backend + IPFS Integration
- **Server-Side Secret Isolation**: All Pinata JWT and API credentials are kept strictly in backend environment variables, shielding keys from client browser DevTools.
- **Graceful Offline/Local Mock Fallback**: `pinataService.js` detects missing API keys and produces deterministic, realistic IPFS v1 multihashes (`bafybei...`) so students can test immediately without third-party key blockers.
- **Multer In-Memory Buffers**: Used `multer.memoryStorage()` with a 10MB limit and MIME type whitelisting to stream files directly to IPFS without polluting the local server disk with temporary files.

## Phase 5: Frontend Core
- **Client-Side Role Gate with User-Friendly Address Feedback**: Queried `hasRole(MANUFACTURER_ROLE, account)` client-side via Ethers.js v6 to dynamically show/hide the registration form, displaying the exact connected address if unauthorized.
- **Two-Step Registration (Off-chain IPFS first, On-chain Tx second)**: Frontend coordinates metadata creation by first requesting a cryptographic CID from the Express backend, then immediately feeding that `ipfs://` URI into the on-chain `registerProduct` transaction.
- **Static File Serving from Express**: Configured `backend/server.js` to serve the `frontend/` directory directly, allowing full end-to-end testing from a single `http://localhost:5000` origin without CORS or file:// protocol restrictions.

## Phase 6: QR + Customer Verification (MVP Complete)
- **Zero-Friction Consumer Verification (No Wallet Requirement)**: Built `product.html` to query contract state via a public read-only JSON-RPC provider fallback if MetaMask is not detected, enabling smartphone camera scanning for ordinary non-crypto consumers.
- **Dynamic Client-Side QR Generation via QRCode.js**: Rendered live QR codes directly on the browser canvas linking to `/product.html?id=N`, eliminating backend image generation dependencies.
- **Explicit Physical QR Cloning Caution**: Integrated prominent security notice educating users that physical stickers can be cloned, directing them to cross-reference the hardware's etched serial number with on-chain records.

## Phase 7: Ownership Transfer + Warranty
- **Immutable Chain of Custody Array (`_ownershipHistory`)**: Tracked every change of hands starting from `address(0) -> manufacturer` through all subsequent secondary owners, providing cryptographically auditable pedigree without exposing PII.
- **Strict Single-Owner Transfer Restriction**: Enforced `msg.sender == _products[productId].currentOwner`, disallowing even admins or manufacturers from revoking ownership once transferred to a customer.
- **Dynamic Block-Timestamp Warranty Expiration**: `getWarranty(productId)` evaluates `block.timestamp >= expiryTimestamp` on-the-fly, eliminating costly scheduled crons or storage update transactions to mark warranties as expired.

## Phase 8: Recycling & Circular Decommissioning
- **Irreversible Terminal Lifecycle State**: The `isRecycled` flag is strictly one-way with zero reset/unfreeze methods, guaranteeing that once shredded or deconstructed, a passport can never be resurrected for counterfeit hardware.
- **Universal Mutation Guard**: Applied `if (_products[productId].isRecycled) revert ReLife__ProductAlreadyRecycled(productId)` across `transferOwnership`, `addRepairRecord`, and `addWarranty` to enforce total decommissioning.

## Phase 9: Admin Dashboard & Polish
- **Event-Driven Participant Directory over On-Chain State Arrays**: Chose to index participants using `queryFilter` across `ManufacturerRegistered`, `RepairCenterRegistered`, and `RecyclerRegistered` events instead of persisting dynamic storage arrays in the smart contract. This drastically minimizes gas deployment and write costs while maintaining a complete, verifiable audit trail.
- **Centralized Error Parsing Utility (`parseError`)**: Integrated `ReLifeWallet.parseError(err)` to map RPC rejection codes (e.g. 4001) and custom contract error strings (`AccessControlUnauthorizedAccount`, `ReLife__ProductAlreadyRecycled`, etc.) into readable, friendly guidance before displaying alerts to end users.
- **Role Verification Prior to Execution**: Admin portal checks `hasRole(DEFAULT_ADMIN_ROLE, account)` before displaying management forms, avoiding confusing EVM revert errors caused by unauthorized submissions.
- **Uniform Multi-Portal Navigation**: Standardized top-level header navigation across all 6 portals (`Home`, `Manufacturer`, `Owner Dashboard`, `Recycler Portal`, `Verify Product`, `Admin Portal`) for seamless navigation across all lifecycle roles.

## Phase 10: Final Testing, Gas Profiling & Presentation Architecture
- **In-Harness Gas Benchmarking (`test/gasReport.test.js`)**: Programmatically captured receipt `gasUsed` inside automated tests to ensure exact, reproducible cost numbers rather than manual estimates.
- **Dual Flowchart Architecture (Mermaid & ASCII)**: Provided both rich graphical Mermaid diagrams for modern markdown viewers and resilient ASCII text flowcharts in `README.md` to guarantee accessibility in any terminal or viewer.
- **5-Minute Live Viva Demo Script (`DEMO_SCRIPT.md`)**: Structured a presentation talk track around exact sample data, security trade-offs, and typical professor/evaluator viva questions to prepare the student for live defense.

## Environment & Deployment Hardening
- **Fail-Fast Sepolia Configuration Validation**: Updated `hardhat.config.js` to reject empty or public fallback RPCs when targeting `--network sepolia`, immediately halting with clear actionable feedback before Cloudflare timeouts occur.
- **Pre-Flight Bytecode Verification in Admin Portal**: Added `provider.getCode(address)` check prior to invoking contract methods in `admin.js`, preventing cryptic EVM `BAD_DATA (value="0x")` decoding errors when connected to an un-deployed network.
- **Safe Network Pre-Flight Script (`scripts/checkNetwork.js`)**: Created a zero-gas pre-flight tool to verify Sepolia connection, deployer address, and balance prior to executing contract deployments.

## Frontend Data Sanitization & Event Topic Architecture
- **Ethers Result Sanitization & Struct Formatting (`formatProduct`)**: Separated raw on-chain structs and event decodings from UI presentation logic by passing all contract query outputs through a centralized, defensive `formatProduct(raw)` helper in `wallet.js`. Handles BigInt casting to numbers/strings, timestamp conversion to formatted dates, and shields against Ethers `Indexed` proxy objects.
- **On-Chain Struct Retrieval over Indexed Event String Topics**: Because EVM events hash dynamic indexed types (`string indexed serialNumber`) into 32-byte `keccak256` topic hashes, event logs do not contain plaintext strings. The Manufacturer Portal table queries `getProduct(id)` to retrieve genuine unhashed strings from contract storage rather than relying on hashed event topics.
- **Safe DOM Assignment via `textContent` over `innerHTML` Interpolation**: Migrated table row creation away from raw template literal string concatenation with `innerHTML` to explicit DOM element creation using `textContent`, preventing Cross-Site Scripting (XSS) from untrusted metadata and eliminating accidental `[object Object]` type coercions.
