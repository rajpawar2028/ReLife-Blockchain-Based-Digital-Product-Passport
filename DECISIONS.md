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

## Feature 1: Product Status State Machine
- **Explicit Enum State Machine over Loose Booleans**: Replaced binary lifecycle checking with a formal `enum Status { Manufactured, Sold, InRepair, Recycled }`. This guarantees forward-only, deterministic transitions (`Manufactured -> Sold`, `Sold -> InRepair -> Sold`, `* -> Recycled`) enforced on-chain.
- **Terminal State Lockout**: `Status.Recycled` is implemented as an irreversible sink state. All write operations (`transferOwnership`, `addRepairRecord`, `addWarranty`, `updateProductStatus`) strictly revert with `ReLife__ProductAlreadyRecycled`, completely eliminating counterfeit resurrection of decommissioned passports.
- **Role-Gated State Transitions**: Integrated granular role requirements per target state: only certified repair centers can transition items into/out of `InRepair`, and only certified recyclers can transition to `Recycled`. Transfers automatically advance newly minted items from `Manufactured` to `Sold`.

## Feature 2: Warranty with Expiry & Validity Check
- **Explicit Range Struct Storage with Legacy Backward Compatibility**: Expanded `struct Warranty` to store `uint256 warrantyStart` and `uint256 warrantyEnd`, while keeping `uint256 expiryTimestamp = warrantyEnd`. This enables explicit coverage windows while maintaining 100% compatibility with all existing tests, frontend scripts, and external integrations.
- **Unified Multi-Party Issuance Authorization**: Implemented `_setWarranty` allowing issuance by the original manufacturer, contract administrator, or the current product owner (`product.currentOwner`, representing an authorized seller or distributor).
- **Dynamic On-Chain Validity Evaluation (`isWarrantyValid`)**: Created a gas-free `view` method that checks `block.timestamp >= warrantyStart && block.timestamp < warrantyEnd` and ensures the asset is not decommissioned. This replaces Web2 cron jobs with instant, zero-cost state evaluation.
- **Relative Time UI Presentation**: Calculated `daysLeft = Math.ceil((warrantyEnd - now) / 86400)` in both `owner.js` and `product.js` to render user-friendly `Valid (${daysLeft} days left)` or `Expired` badges.

## Feature 3: Ownership Transfer with 2-Step Accept Flow
- **2-Step Transfer Architecture (`Ownable2Step` Pattern)**: Replaced single-step push transfers with a resilient 2-step protocol: `initiateTransfer(id, to)` designates a `pendingOwner`, and `acceptTransfer(id)` is callable solely by the recipient. This prevents catastrophic irreversible loss of product passports due to recipient address typos.
- **Owner Cancellation Safeguard**: Added `cancelTransfer(id)` allowing the current owner to abort an unaccepted pending transfer at any time, returning `pendingOwner` to `address(0)`.
- **Concurrency & State Transition Guards**: Enforces that only one transfer can be pending at a time (`ReLife__TransferAlreadyPending`). Transfers are strictly forbidden while a product is in `InRepair` or terminal `Recycled` status.
- **Backward Compatibility & Dual Event Emission**: Maintained `transferOwnership` for legacy operations and emitted both `TransferAccepted` and `OwnershipTransferred` inside `acceptTransfer` to satisfy external indexers and event listeners without breaking changes.
- **Two-Way Owner Dashboard Inbox**: Added an "Incoming Transfers Awaiting Acceptance" inbox in `owner.html` and `owner.js` alongside outgoing pending transfer status badges, enabling seamless peer-to-peer handoffs.

## Feature 4: Authenticity Secret Hash Verification
- **One-Way Cryptographic Commitment on Public Ledger**: Stored only 32-byte `keccak256(bytes(secret))` in `_authenticityHashes[productId]`. Because public Ethereum contract storage can be read by anyone, storing the plaintext secret on-chain would destroy all anti-counterfeiting value. Storing the hash maintains collision-resistant security.
- **Ephemeral Backend Randomness with Zero Persistence**: Created `/api/authenticity/generate-secret` using Node.js `crypto.randomBytes(32).toString('hex')`. Plaintext secrets are strictly never logged (no `console.log`), never persisted to disk or databases, and never committed to git.
- **Gas-Free `view` Secret Verification (`verifySecret`)**: Implemented `verifySecret(uint256 productId, string calldata secret)` returning `true` if `keccak256(bytes(secret)) == storedHash` and `false` otherwise. Allows unlimited free verification queries for consumers.
- **Transparent Threat Modeling**: Documented that while the secret proves a QR link matches the manufacturer's cryptographic commitment, physical photographs of the label can still be duplicated; true anti-counterfeiting requires multi-layered defense (hardware serial etching, tamper-evident packaging, and scan anomaly detection).

## Feature 5: Scan Counter & Counterfeit Anomaly Alert
- **Off-Chain Scan Counting in Express Backend**: EVM `view` functions cannot mutate on-chain state, and demanding that ordinary consumers submit gas-paying blockchain transactions just to view a passport would destroy usability. Off-chain scan tracking in the Express backend preserves free, instant verification while collecting necessary fraud telemetry.
- **HMAC-SHA256 Salted IP Anonymization (Privacy by Design)**: IP addresses are classified as Personally Identifiable Information (PII) under GDPR. To eliminate privacy risks, raw IPs are immediately hashed using `crypto.createHmac("sha256", IP_HASH_SALT)` before storage or in-memory analytics. Raw IPs are strictly never persisted to disk, returned in API payloads, or logged.
- **Dual Anomaly Detection Heuristics (Volume & Velocity)**:
  - *Volume Anomaly*: Flags `isSuspicious = true` when cumulative passport scans exceed `SCAN_COUNT_THRESHOLD` (5). Legitimate consumer goods are scanned 1-3 times during retail purchase and onboarding; higher volumes indicate cloned tags.
  - *Velocity Anomaly*: Flags `isSuspicious = true` if scans originate from $\ge 3$ distinct hashed IPs within a 10-minute window (`ANOMALY_WINDOW_MS`), detecting concurrent multi-location barcode cloning.
- **Sliding-Window Rate Limiting Protection**: Implemented an in-memory sliding-window limiter restricting each client to 20 scan queries per minute (`RATE_LIMIT_MAX_REQUESTS = 20`), preventing malicious actors from spamming the endpoint to falsely trigger counterfeit warnings.
- **Local File-Based Demo Storage with Serverless Caveats**: Implemented lightweight file storage in `backend/data/scans.json` for zero-setup local demonstration, documenting that serverless environments (Vercel) have read-only filesystems and require hosted key-value databases (e.g. Upstash Redis, Vercel KV, Supabase).

## Feature 6: Lifecycle Event Timeline & On-Chain Audit Trail
- **Event-Driven History over Heavy Storage Arrays**: Rather than expanding contract storage with multi-event dynamic structs (which would increase gas costs on every state change), history is dynamically indexed from contract event logs (`ProductRegistered`, `StatusChanged`, `WarrantyAdded`, `TransferInitiated`, `TransferAccepted`, `TransferCancelled`, `RepairRecordAdded`, `ProductRecycled`). Because every event indexes `uint256 indexed productId`, event logs are indexed off-chain by nodes at zero gas overhead for users.
- **Three-Tier Deterministic Chronological Ordering**: Events are sorted primarily by `blockNumber` (ascending), secondarily by log index within the block (`index` / `transactionIndex`), and tertiarily by `timestamp`. This reconstructs the authentic physical sequence of events even when multiple operations occur in the same block.
- **Strict XSS Immunity via `textContent`**: Product metadata, descriptions, and notes can be authored by arbitrary external parties. To completely eliminate Cross-Site Scripting (XSS) risks, the timeline renderer builds DOM elements with `document.createElement()` and binds all dynamic text via `node.textContent`. No user-controlled strings are ever interpolated into `innerHTML`.
- **Fault-Tolerant Multi-Filter Querying with View Fallback**: Each event filter is queried inside individual try/catch boundaries. If an RPC provider fails on specific event topics or prunes historical logs, the `getProductHistory` view function acts as an immediate fallback, ensuring service records remain visible.

## Feature 7: Mobile-Optimized Camera QR Scanner
- **Client-Side Camera Scanning via `html5-qrcode`**: Chosen for its robust WebRTC / `getUserMedia` implementation across iOS Safari and Android Chrome, rendering directly on an HTML5 canvas without requiring native app installs or backend image processing.
- **Graceful Fallback to Manual ID Entry**: When camera access is blocked or unavailable (`NotAllowedError`, `NotFoundError`, or non-secure origin), the scanner displays an inline status banner, provides a one-click "Enter ID Manually" button, and focuses `#productIdInput` so users are never blocked.
- **Secure Context (HTTPS / Localhost) Detection**: Modern browsers restrict camera access to Secure Contexts. Pre-flight origin checking detects insecure LAN IPs (`http://192.168.x.x:5000`) and explicitly informs the user that phone camera testing requires an HTTPS tunnel (e.g. ngrok / cloudflared) or localhost.
- **Universal Multi-Format QR Payload Parser (`parseQrPayload`)**: Implemented a pure, deterministic parser that handles full URLs (`?id=X&secret=Y`), relative paths, query strings, JSON payloads, raw numeric IDs, and serial numbers, extracting `productId` and optional `secret` seamlessly.

## End-to-End Warranty at Registration
- **On-Chain Computation of Expiry at Minting**: Rather than relying purely on client-side date computations, `registerProductWithWarranty` computes `warrantyEnd = block.timestamp + (warrantyMonths * 30 days)` directly in the smart contract. This provides an immutable, verifiable warranty start and end date anchored to the transaction's block timestamp.
- **Input Validation & 120-Month Safety Bound**: Enforced a 120-month (10 years) maximum warranty period (`ReLife__WarrantyPeriodTooLong(months)`) in the contract, and mirrored this validation in `backend/routes/ipfs.js` (integer check, range 0–120) and the frontend form (`min="0" max="120"`). Period 0 represents an explicit "No warranty" state.
- **Backward-Compatible Contract Overloads**: Retained the 4-argument and 5-argument `registerProduct` / `registerProductWithSecret` functions as pass-through overloads setting warranty months to 0. This ensures 100% backward compatibility with all existing test suites and third-party callers.
- **Normalized Warranty Storage & Extensions**: Stored warranty periods in the internal `_productWarranties` mapping, while supporting active warranty extensions via `addWarrantyMonths` for authorized sellers or owners before product decommissioning.
- **Unified Frontend Formatter (`ReLifeWallet.formatWarranty`)**: Created a centralized helper in `frontend/js/wallet.js` exported globally (`window.formatWarranty`). The helper defensively handles `null`, `undefined`, raw seconds, and Ethers `BigInt` timestamps, formatting remaining days (`Valid (X days left)`), expiry, or no-warranty status identically across Manufacturer, Product, and Owner pages, preventing UI drift and `[object Object]` bugs.

## Area 1: Complete State Change Events & Batched Event-Driven History
- **`AuthenticityHashSet` Event Integration**: Added `event AuthenticityHashSet(uint256 indexed productId, bytes32 authenticityHash, address indexed actor, uint256 timestamp)` to ensure that 100% of on-chain state mutations emit an event log. The 32-byte `keccak256` commitment is emitted without exposing the underlying plaintext secret, maintaining zero-knowledge anti-counterfeiting security.
- **Batched Event Querying (`queryFilterBatched`) over Unbounded `queryFilter`**: In public networks (Sepolia, Mainnet), calling `queryFilter` with no block bounds defaults to `[0, latest]`, triggering RPC error `-32005 (query returned more than 10000 results / block range exceeds limit)`. Implemented chunked block-range slicing (e.g. 5,000 blocks) starting from `deploymentBlock`.
- **`deploymentBlock` Offset Inclusion**: Added `deploymentBlock` into deployment scripts and frontend config files (`contract-data.json`, `contract-data.js`). This eliminates millions of historical block scans, drastically speeding up event history rendering.
- **Event-Driven History over On-Chain Storage Loop**: Frontends reconstruct full product pedigrees exclusively by indexing and sorting emitted lifecycle events (`ProductRegistered`, `AuthenticityHashSet`, `StatusChanged`, `WarrantyAdded`, `TransferInitiated`, `TransferAccepted`, `TransferCancelled`, `RepairRecordAdded`, `ProductRecycled`). UI rendering no longer loops over heavy on-chain dynamic storage arrays.
- **In-Memory Block Timestamp Cache**: Created `_blockTimestampCache` in `ReLifeWallet` to resolve missing event timestamps via `provider.getBlock(ev.blockNumber)` while eliminating redundant RPC network requests when multiple events are mined in the same block.

## Area 2: On-Chain Pagination & Per-Manufacturer Indexing
- **Per-Manufacturer Index Mapping (`_manufacturerProducts`)**: Appending each `newProductId` to `_manufacturerProducts[msg.sender]` enables instant $O(\text{limit})$ retrieval of a manufacturer's inventory. This eliminates the need for expensive frontend linear scans across all registered global products or relying on volatile event log block windows.
- **Strict Limit Capping at 50 Items**: EVM `view` functions execute inside the local RPC node's memory. To prevent Denial-of-Service (DoS) and gas limit exceptions caused by unbounded memory allocations (e.g. requesting `limit = 100,000`), the contract strictly enforces `if (limit > 50) limit = 50`.
- **Fault-Tolerant Out-of-Bounds Offsets**: In traditional array slicing, querying an index beyond the length reverts with an out-of-bounds error. `getProductsPaginated` and `getProductsByManufacturerPaginated` explicitly check `if (offset >= total) return (new Product[](0), total)`. This ensures that frontend pagination components handle page boundaries and deletions gracefully without throwing uncaught exceptions.
- **Decoupled Page Fetching with Bounded Warranty Enrichment**: The frontend queries the paginated product slice in a single RPC call, and then fetches warranty details for only the items on the active page (max 5–25 calls). This maintains fast rendering and zero UI freezing regardless of whether a manufacturer has 10 or 10,000 products.






