# ReLife Learning Log: Concepts, Architecture & Viva Prep

Welcome to your learning companion for the **ReLife Digital Product Passport** project! As we build each phase, this document explains the *why* and *how* in simple terms, breaks down new developer concepts, and prepares you for university vivas, project presentations, and technical interviews.

---

## Phase 0: Setup & Development Environment

### 1. What Did We Build?
In Phase 0, we laid the solid foundation for our decentralized application (dApp). We set up:
1. **The Project Workspace**: Organized into `contracts/` (Solidity smart contracts), `test/` (automated tests), `scripts/` (deployment scripts), `backend/` (Express API for secure IPFS uploads), and `frontend/` (the client-facing web application).
2. **Hardhat Development Environment**: A powerful local Ethereum developer environment that compiles Solidity code, runs an in-memory blockchain for rapid testing, and handles network deployments.
3. **Environment Security**: Configured `.gitignore` and `.env.example` to ensure private keys and API tokens are never accidentally leaked to public version control like GitHub.
4. **Harness Verification**: A baseline automated test in `test/setup.test.js` to prove that Hardhat and Ethers.js v6 can spin up local test accounts and communicate with the local Ethereum virtual machine (EVM).

---

### 2. New Concepts Explained in Plain English

#### What is Hardhat?
Think of **Hardhat** like a local flight simulator for smart contract developers. Deploying a contract directly to the real Ethereum mainnet costs real money and is permanent (immutable). Hardhat creates a fake, temporary Ethereum blockchain right on your computer. It gives you 20 test accounts preloaded with 10,000 fake ETH each, compiles your Solidity code, and allows you to test everything in seconds before risking any funds.

#### What is Ethers.js (v6)?
Solidity contracts run on the EVM in bytecode. JavaScript runs in your browser or Node.js. How do they talk to each other? **Ethers.js** is a translator bridge library. It allows JavaScript code to:
- Connect to an Ethereum node (via a `Provider`).
- Sign and submit transactions (via a `Signer`).
- Call smart contract functions as if they were ordinary JavaScript functions.

#### What is OpenZeppelin?
In web development, you wouldn't write your own encryption algorithm from scratch; you use trusted libraries. **OpenZeppelin** is the gold standard for secure, battle-tested smart contract libraries. Instead of inventing our own role-checking logic, we use OpenZeppelin's `AccessControl` to make sure only authorized participants (like certified manufacturers or recyclers) can perform privileged actions.

#### Why Do We Keep `.env` Out of Git?
In blockchain, your **Private Key IS your identity and your money**. If you push a private key to GitHub, automated bots scrape it within seconds and drain all funds. By putting `.env` inside `.gitignore` and only committing `.env.example` (with dummy placeholders), your secret keys remain safe on your local computer.

---

### 3. Three Viva / Demo Questions You Should Be Able to Answer (Phase 0)

#### Q1: Why do we use a local framework like Hardhat instead of deploying directly to Sepolia or Mainnet during development?
> **Model Answer**: Deploying directly to a public network is slow (waiting for block confirmations) and requires testnet or real ETH. Hardhat runs a fast, in-memory local blockchain on our machine. It provides instant transaction execution, detailed stack traces, and `console.log` inside Solidity, making testing and debugging significantly faster, repeatable, and completely free.

#### Q2: What is the purpose of `chainId` (e.g., 31337 for Hardhat vs. 11155111 for Sepolia)?
> **Model Answer**: The `chainId` is a unique numeric identifier for each EVM-compatible blockchain. It was introduced in EIP-155 to prevent **replay attacks** — ensuring a transaction signed for a local testnet cannot be intercepted and broadcast onto Sepolia or the Ethereum mainnet.

#### Q3: Why is our project split into separate `contracts/`, `backend/`, and `frontend/` folders instead of keeping everything in the frontend?
> **Model Answer**: Separation of concerns and security. Smart contracts hold decentralized, verifiable state on the blockchain. The frontend provides the user interface for consumers and MetaMask wallets. The backend is required because third-party services like Pinata IPFS require private API keys or JWT tokens; if we made Pinata API calls directly from the browser frontend, our API secrets would be exposed in the client's network tab.

---

## Phase 1: Core Smart Contract & Role-Based Access Control (MVP Part 1)

### 1. What Did We Build?
In Phase 1, we implemented the core passport engine in `contracts/ReLife.sol`:
1. **Multi-Role Access Control**: Using OpenZeppelin's `AccessControl`, we defined distinct roles (`DEFAULT_ADMIN_ROLE`, `MANUFACTURER_ROLE`, `REPAIR_CENTER_ROLE`, `RECYCLER_ROLE`). The deployer is assigned as the system admin.
2. **Manufacturer Onboarding**: The admin can call `registerManufacturer(address, name)` to authorize specific business wallets to issue passports.
3. **Product Registration Engine**: Authorized manufacturers call `registerProduct(...)` to mint a digital product passport on-chain with an auto-incrementing ID (1, 2, 3...), a physical serial number, product brand/model, and an IPFS metadata URI.
4. **Counterfeit Prevention**: Enforced global uniqueness on product serial numbers using an on-chain mapping — preventing duplicate registration attempts.
5. **Public Verification APIs**: Implemented both `getProduct(...)` (strict lookup) and `verifyProduct(...)` (safe lookup returning `isValid = false` without reverting for smooth frontend and QR code scanning).
6. **Gas-Efficient Custom Errors**: Replaced legacy revert strings with custom errors (`error ReLife__EmptyString`, `error ReLife__SerialAlreadyExists`).
7. **Comprehensive Automated Tests**: Added 22 new unit tests in `test/ReLife.test.js` validating both positive outcomes and negative edge cases (unauthorized callers, empty inputs, duplicate serials, zero addresses).

---

### 2. New Concepts Explained in Plain English

#### Why `AccessControl` Instead of Simple `Ownable`?
In standard Solidity tutorials, you often see `Ownable`, which has a single `onlyOwner` modifier. But in a real-world supply chain or Digital Product Passport system, **one account should not do everything**.
- A government regulator or system admin should approve manufacturers, but shouldn't forge products.
- A manufacturer should mint new product passports, but shouldn't certify repair records.
- A repair center should log maintenance, but shouldn't mint new products.
OpenZeppelin's `AccessControl` lets us create granular roles represented as `bytes32` hashes (`keccak256("MANUFACTURER_ROLE")`), making permissions secure, scalable, and auditable.

#### Custom Errors vs `require("reason")`
Before Solidity 0.8.4, developers wrote:
```solidity
require(bytes(name).length > 0, "Name cannot be empty");
```
Storing and returning error strings costs extra deployment gas (storing ASCII characters in bytecode) and runtime gas.
Solidity custom errors:
```solidity
error ReLife__EmptyString(string parameterName);
revert ReLife__EmptyString("name");
```
encode the error using a 4-byte selector (like function selectors), saving substantial gas while still allowing client libraries like Ethers.js to decode the exact error name and parameters!

#### Why Do Product IDs Start at 1 Instead of 0?
In Solidity, uninitialized storage values default to `0` (or `false` or `0x0`). If your first product has ID `0`, it is easy to confuse an uninitialized variable with product number 0. Starting counter IDs at `1` makes `0` a natural, clear indicator for *"not found"* or *"invalid"*.

#### Why Do We Need Events (`emit ProductRegistered`)?
Smart contract storage is expensive to read historically from outside the blockchain. **Events** write log data to the transaction receipt on the EVM. Frontends and indexers (like The Graph or Etherscan) can listen to these events in real time or search historical logs cheaply using `indexed` topics without paying for expensive smart contract state reads.

---

### 3. Three Viva / Demo Questions You Should Be Able to Answer (Phase 1)

#### Q1: How does `AccessControl` protect the `registerProduct` function from unauthorized callers?
> **Model Answer**: We applied the `onlyRole(MANUFACTURER_ROLE)` modifier to `registerProduct`. When a transaction is submitted, OpenZeppelin's modifier queries the internal mapping `hasRole(MANUFACTURER_ROLE, msg.sender)`. If the caller's address lacks the role, EVM execution halts immediately and reverts with `AccessControlUnauthorizedAccount(caller, role)`.

#### Q2: Why is the `metadataURI` stored as a string on-chain instead of storing all product documents and images directly in the contract?
> **Model Answer**: On-chain storage is the most expensive resource on Ethereum because every validator node across the world must permanently store that data in its state. Storing images or full PDFs on-chain would cost thousands of dollars in gas. Instead, we follow decentralized architecture best practices: we upload heavy metadata to IPFS (InterPlanetary File System) and store only the immutable cryptographic content identifier (CID / URI) on-chain.

#### Q3: What is the difference between `getProduct` and `verifyProduct` in our contract, and why are both useful?
> **Model Answer**: `getProduct` is a strict getter that reverts with `ReLife__ProductNotFound` if an ID does not exist; this is ideal for smart contract interactions that expect valid data. `verifyProduct` is designed for public verification interfaces and QR code scanners — if a user scans a fake QR code or non-existent ID, it returns `(isValid = false, ...)` instead of reverting, allowing the frontend UI to display a user-friendly "Counterfeit / Not Found" warning cleanly.

---

## Phase 2: Repair History & Service Tracking (MVP Part 2)

### 1. What Did We Build?
In Phase 2, we added the maintenance and repair pedigree system:
1. **`RepairRecord` Data Structure**: Contains a sequential `repairId`, `productId`, certified `repairCenter` address, `repairType`, detailed `description`, IPFS `serviceUri`, and the block `timestamp`.
2. **`registerRepairCenter(address, name)`**: Authorized only for `DEFAULT_ADMIN_ROLE`, granting the `REPAIR_CENTER_ROLE` and emitting `RepairCenterRegistered`.
3. **`addRepairRecord(...)`**: Callable only by authorized repair centers. Validates that the product exists, has not been recycled, and appends the new record.
4. **Chronological History Query (`getProductHistory`)**: Returns the full array of repair records in guaranteed chronological order.
5. **Testing Time Travel**: Used `@nomicfoundation/hardhat-network-helpers` (`time.increase`) to simulate realistic servicing over days and months, proving history is returned in order across distinct repair centers.
6. **Total Tests**: Grew the test suite to **39 passing automated tests**.

---

### 2. New Concepts Explained in Plain English

#### How Dynamic Struct Arrays in Solidity Work
We declared:
```solidity
mapping(uint256 => RepairRecord[]) private _productRepairs;
```
This is a mapping where each key is a `productId`, and the value is a dynamic array of `RepairRecord` structs. When a repair happens, we call `_productRepairs[productId].push(...)`. Because arrays in Solidity append new elements to the end, the records are naturally stored in exact chronological order ($T_1 < T_2 < T_3$).

#### Time Manipulation in Hardhat Tests (`time.increase`)
In real life, a phone might get repaired 6 months after purchase. In an automated test that runs in 1 second, how do we test that?
Hardhat provides `hardhat-network-helpers`:
```javascript
await time.increase(86400 * 30); // Advance blockchain clock by 30 days
```
This sends an `evm_increaseTime` command to the local node, allowing us to accurately test time-dependent smart contract logic instantly.

#### Anti-Fraud Recycled Check
Notice this check in `addRepairRecord`:
```solidity
if (_products[productId].isRecycled) {
    revert ReLife__ProductAlreadyRecycled(productId);
}
```
If a product has reached end-of-life and was recycled (e.g. shredded for e-waste), bad actors could try to forge repair records to resurrect the passport and sell a counterfeit device. By checking `isRecycled`, we protect consumers from fraudulent zombie passports.

---

### 3. Three Viva / Demo Questions You Should Be Able to Answer (Phase 2)

#### Q1: Why do we store an array of `RepairRecord` structs inside a mapping (`mapping(uint256 => RepairRecord[])`) instead of a single flat array?
> **Model Answer**: A single flat array would mix repairs from all products together, requiring expensive on-chain looping or off-chain filtering to find repairs for a specific product. Mapping `productId` directly to an array isolates each product passport's history, allowing $O(1)$ appends and instant retrieval of a specific product's full pedigree without iterating through unrelated records.

#### Q2: What is the purpose of `serviceUri` in the `RepairRecord` struct?
> **Model Answer**: `serviceUri` points to an off-chain IPFS document containing proof of service — such as diagnostic printouts, technician checklists, replacement parts receipts, and before/after photos. This provides verifiable evidence of maintenance without bloating on-chain storage.

#### Q3: How do we guarantee that repair history is returned in chronological order?
> **Model Answer**: In Solidity, `.push()` appends elements to the end of the array. Because transactions are mined into sequential blocks with monotonically increasing timestamps, each appended repair record has a timestamp greater than or equal to the previous one. When `getProductHistory` returns the array, it reflects this exact chronological insertion order.

---

## Phase 3: Deployment Pipeline & Artifact Export

### 1. What Did We Build?
In Phase 3, we constructed the bridge connecting our smart contract codebase with our frontend and backend:
1. **Universal Deployment Script (`scripts/deploy.js`)**: Deploys `ReLife.sol` across networks (Hardhat, local node, or Sepolia testnet), checks account balances, and executes Etherscan verification on testnets.
2. **Automated Cross-Layer Artifact Export**:
   - `frontend/contract-data.json`: Standard JSON holding contract address, deployment timestamp, network, and full ABI.
   - `frontend/contract-data.js`: Vanilla browser JavaScript file attaching `window.RELIFE_CONFIG` — eliminating the need for bundlers like Webpack or Vite.
   - `backend/contract-data.json`: Ready for our Express server to perform server-side contract operations or checks.
3. **Live Deployment Verification (`scripts/verify-deployment.js`)**: Probes live contract bytecode at the deployed address and verifies that the recorded deployer holds `DEFAULT_ADMIN_ROLE`.
4. **Continuous Integration Test (`test/Deployment.test.js`)**: Automated tests verifying that the exported ABI contains all required functions and is directly instantiable by Ethers.js. Total test suite expanded to **43 passing tests**.

---

### 2. New Concepts Explained in Plain English

#### What is an ABI (Application Binary Interface)?
A compiled Solidity contract lives on the blockchain as hexadecimal bytecode (e.g., `0x6080604052348015...`). Your browser cannot read raw machine bytecode directly. The **ABI** is a JSON dictionary that translates the bytecode into human-readable functions, listing their names, input parameter types, and return types. Ethers.js uses the ABI to encode function calls into bytecode and decode transaction receipts back into JavaScript objects.

#### Ephemeral vs. Persistent Networks
- **Default Hardhat Network (`--network hardhat`)**: An **ephemeral** (short-lived) in-memory blockchain. It spins up when you type a command and terminates the second the command completes. That means if you deploy to `hardhat`, the contract disappears when the command exits!
- **Persistent Networks (`--network sepolia` or `npx hardhat node`)**: Persistent blockchains that never reset between commands. A contract deployed to Sepolia remains permanently on the network.

#### Why Do We Generate `contract-data.js` for Vanilla JS?
Modern frontend frameworks like React use bundlers to `import data from './contract-data.json'`. But pure vanilla HTML/CSS/JS applications running in the browser cannot easily import raw JSON without making asynchronous `fetch()` requests or encountering CORS blocks when testing via local files (`file:///`). By generating `contract-data.js` that assigns `window.RELIFE_CONFIG`, our plain HTML files can simply load `<script src="contract-data.js"></script>` synchronously before our application scripts run!

---

### 3. Three Viva / Demo Questions You Should Be Able to Answer (Phase 3)

#### Q1: What is the purpose of the ABI in Ethereum application architecture?
> **Model Answer**: The ABI (Application Binary Interface) serves as the contract's API specification for client applications. It defines function names, parameter data types, and event signatures. Without the ABI, libraries like Ethers.js cannot encode transaction calldata for the EVM or decode raw hex responses into readable JavaScript values.

#### Q2: What steps occur when deploying a contract to a testnet like Sepolia?
> **Model Answer**: The deployment script compiles the Solidity code, connects to a Sepolia RPC node using credentials from `.env`, creates a transaction with the contract creation bytecode signed by the deployer's private key, broadcasts the transaction to the Sepolia mempool, and waits for miners/validators to include it in a confirmed block and assign it an immutable contract address.

#### Q3: Why is source code verification on Etherscan important for a Digital Product Passport system?
> **Model Answer**: By default, Etherscan displays only raw compiled bytecode. Verifying the source code matches the bytecode against the Solidity compiler version and settings, making the contract logic completely transparent and publicly readable. For a product passport system, this allows consumers and auditors to independently verify that the contract has legitimate access control and cannot be maliciously altered.

---

## Phase 4: Backend Express API & IPFS Pinata Service

### 1. What Did We Build?
In Phase 4, we built the secure off-chain storage engine:
1. **Node.js Express Server (`backend/server.js`)**: Fast, lightweight API gateway configured with CORS, JSON body parser, and centralized error handling.
2. **Pinata IPFS Service (`backend/pinataService.js`)**: Supports both Pinata JWT and API Key/Secret pinning (`pinJSONToIPFS` and `pinFileToIPFS`). Includes a local cryptographic mock fallback so development proceeds seamlessly even if API keys are not yet configured.
3. **Passport Metadata Route (`POST /api/ipfs/upload-metadata`)**: Strict input validation checking for required fields (`name`, `description`, `brand`, `serialNumber`). Structures standardized DPP JSON schemas and uploads directly to IPFS, returning the immutable `ipfs://` CID and HTTPS gateway URL.
4. **Binary Document Upload Route (`POST /api/ipfs/upload-file`)**: Uses Multer in-memory buffers (with a 10MB limit and MIME type whitelisting) to upload warranty certificates, diagnostic PDFs, and product photos to IPFS.
5. **Secret Isolation & Test Suite (`test/backend.test.js`)**: Added 8 automated tests checking health endpoints, metadata validation, file upload limits, and verifying that the frontend contains zero secrets. Test suite expanded to **51 passing tests**.

---

### 2. New Concepts Explained in Plain English

#### What is IPFS and Content Addressing (CID)?
Traditional web URLs (like `https://example.com/photo.png`) are **location-addressed**: they tell your browser *where* the file is hosted. If the server owner deletes the file or changes the image, the link breaks or displays altered content.
**IPFS** (InterPlanetary File System) is **content-addressed**: every file is hashed using cryptographic hashing to produce a unique Content Identifier (**CID**), like `bafybei...`.
- If a single pixel in an image or a single letter in a PDF changes, the CID completely changes.
- Storing `ipfs://<CID>` on Ethereum guarantees that nobody (not even the manufacturer) can alter the product's origin, materials, or carbon footprint after the passport is registered!

#### Why Do We Need a Pinning Service Like Pinata?
IPFS is a peer-to-peer network. If you add a file to IPFS on your laptop, that file is only available to the world as long as your laptop stays online. A **pinning service** like Pinata runs persistent, globally distributed IPFS nodes that keep your files permanently "pinned" in cache so users can access them 24/7.

#### Why Can't We Call Pinata Directly from the Frontend?
Pinata requires an API Secret or JWT token for authentication. In web browsers, anything sent over HTTP or written in client-side JavaScript is visible to anyone who opens Chrome Developer Tools (`F12` -> Network tab or Source code).
If we placed Pinata API keys in the frontend:
- Any malicious user could steal the key.
- They could pin unauthorized files using our account quota.
By creating an Express backend proxy, our keys stay hidden in backend `.env` files. The frontend only talks to our trusted `/api/ipfs/upload-metadata` endpoint.

---

### 3. Three Viva / Demo Questions You Should Be Able to Answer (Phase 4)

#### Q1: What is a Content Identifier (CID) in IPFS, and why is it superior to traditional HTTP URLs for product passports?
> **Model Answer**: A CID is a cryptographic hash of the content itself rather than a server location address. In a Digital Product Passport, storing a traditional HTTP URL creates a single point of failure and allows the server owner to secretly modify product specs or carbon footprint claims. An IPFS CID provides cryptographic immutability: if the metadata is altered in any way, the hash changes, immediately exposing the tampering.

#### Q2: Why is Multer configured with memory storage (`multer.memoryStorage()`) instead of disk storage in our Express server?
> **Model Answer**: Memory storage keeps uploaded files in RAM buffers just long enough to stream them directly to Pinata's API, and then releases the memory upon garbage collection. This avoids writing unverified user files to the server's hard disk, preventing disk-filling denial-of-service (DoS) attacks and eliminating the need for periodic disk cleanup routines.

#### Q3: How does our architecture enforce secret isolation between the frontend and Pinata?
> **Model Answer**: The Pinata API credentials and JWT are stored exclusively in the server-side `.env` file, accessible only by `backend/pinataService.js`. The browser frontend never communicates directly with Pinata. Instead, the frontend sends metadata to our Express endpoint `/api/ipfs/upload-metadata`, which validates the input, attaches the server's secret credentials, uploads to Pinata, and returns only the public `ipfs://` CID to the client.

---

## Phase 5: Frontend Core & Role-Based Web3 Portal

### 1. What Did We Build?
In Phase 5, we connected the blockchain and IPFS backend to an interactive web interface:
1. **Design System & Responsive CSS (`frontend/css/styles.css`)**: Built an accessible, responsive stylesheet with dark slate styling, eco-green highlights, accessible forms, status alerts, and mobile-friendly layouts.
2. **Web3 Wallet Module (`frontend/js/wallet.js`)**: Encapsulates MetaMask `window.ethereum` via Ethers.js v6 `BrowserProvider`. Handles account switching, network change reloads, and Sepolia testnet switching prompts.
3. **Manufacturer Portal (`frontend/manufacturer.html` & `frontend/js/manufacturer.js`)**:
   - Conditional UI rendering: automatically evaluates `hasRole(MANUFACTURER_ROLE, account)` on-chain.
   - Shows unauthorized warnings to non-manufacturers.
   - Form handling: Coordinates two-stage submission (first uploads metadata/photos to Express IPFS backend, then submits on-chain `registerProduct` transaction via MetaMask).
   - Real-time transaction feedback: Displays transaction hash, mining spinner, and newly minted product ID upon block confirmation.
   - Product list: Queries on-chain `ProductRegistered` events to display all passports minted by the active manufacturer.
4. **Platform Hub (`frontend/index.html`)**: Landing page querying total registered products directly from the smart contract.
5. **Testing & Integration Suite (`test/frontend.test.js`)**: 4 new tests validating form elements, wallet exports, and Express static file serving. Total test suite expanded to **55 passing tests**.

---

### 2. New Concepts Explained in Plain English

#### What is `window.ethereum` and `BrowserProvider`?
When a user installs MetaMask, the extension injects a JavaScript object called `window.ethereum` into every webpage.
In Ethers.js v6:
```javascript
const provider = new ethers.BrowserProvider(window.ethereum);
const signer = await provider.getSigner();
```
- `provider`: A read-only connection to the Ethereum node configured in MetaMask.
- `signer`: An object representing the user's private key inside MetaMask. When you call a state-changing contract function through a signer, MetaMask intercepts the call and pops open a window asking the user to approve gas fees and sign.

#### How Does Role-Based UI (RBAC) Work in Web3?
In traditional Web2 applications, your backend server checks session cookies or JWTs in a database to decide which HTML buttons to show.
In Web3:
1. The frontend asks MetaMask for the active address (`0x...`).
2. The frontend calls the smart contract: `await relifeContract.hasRole(MANUFACTURER_ROLE, address)`.
3. If true, the browser unhides the registration form.
4. **Crucial Mentorship Rule**: Client-side UI hiding is for **user experience only**, NOT security. Real security is enforced inside the smart contract by the `onlyRole(MANUFACTURER_ROLE)` modifier. If an attacker manually unhides the form in HTML DevTools, the Ethereum transaction will still revert on-chain!

#### What is Event Filtering (`contract.filters.ProductRegistered`)?
In Solidity, indexing an event argument (`indexed address manufacturer`) creates a searchable bloom filter topic on Ethereum. In Ethers.js:
```javascript
const filter = contract.filters.ProductRegistered(null, null, manufacturerAddress);
const events = await contract.queryFilter(filter);
```
This queries the blockchain node specifically for transactions where `event.args.manufacturer === manufacturerAddress` without scanning every single block or saving a duplicate SQL database!

---

### 3. Three Viva / Demo Questions You Should Be Able to Answer (Phase 5)

#### Q1: What is the difference between a `Provider` and a `Signer` in Ethers.js v6?
> **Model Answer**: A `Provider` is a read-only abstraction of a connection to the Ethereum blockchain; it can query balances, read contract variables, and fetch event logs without costing any gas. A `Signer` is an abstraction of an Ethereum account that possesses private keys; it can sign messages and submit state-changing transactions to the network, which requires gas.

#### Q2: If a malicious user inspects the browser element and deletes `style="display: none;"` to show the manufacturer registration form, can they successfully register a product?
> **Model Answer**: No. Hiding the form in HTML/CSS is only a convenience for UX. True security is enforced on-chain in `ReLife.sol` by the `onlyRole(MANUFACTURER_ROLE)` modifier. When the attacker submits the transaction, the EVM checks `msg.sender` against the AccessControl mapping and immediately reverts the transaction with `AccessControlUnauthorizedAccount`.

#### Q3: Why do we upload metadata to the Express IPFS backend *before* submitting the MetaMask transaction?
> **Model Answer**: The smart contract's `registerProduct` function requires `metadataURI` as an input parameter. By sending the product specs and photos to our backend first, Pinata generates the cryptographic IPFS CID. We then pass that immutable `ipfs://<CID>` into the smart contract transaction so the passport is minted with its permanent metadata already anchored on-chain.

---

## Phase 6: Dynamic QR Generation & Public Consumer Verification (MVP Complete)

### 1. What Did We Build?
In Phase 6, we completed the **Minimum Viable Product (MVP)** of ReLife by delivering the consumer-facing verification interface:
1. **Universal Consumer Verification (`frontend/product.html` & `frontend/js/product.js`)**:
   - Zero-barrier verification: Uses a fallback read-only JSON-RPC provider so anyone on any smartphone can verify a product without having MetaMask installed!
   - Directly calls `verifyProduct(productId)` on the smart contract.
2. **Authentic vs Counterfeit State Management**:
   - **Authentic State**: Displays green verification badge, model, brand, manufacturer address, owner, and manufacturing timestamp.
   - **Not Registered / Counterfeit State**: Prominently highlights unknown IDs with a red alert badge explaining that no cryptographic record exists in the ReLife registry.
3. **Dynamic Client-Side QR Generation**:
   - Uses `QRCode.js` to dynamically generate a QR code linking directly to `/product.html?id=N` for scanning or physical tag printing.
4. **In-Browser Camera Scanner**:
   - Integrates `Html5Qrcode` allowing users to click "Scan QR Code", open their device camera, and scan physical packaging directly.
5. **Decentralized Metadata & Chronological Servicing Pedigree**:
   - Fetches and displays IPFS environmental sustainability metrics (carbon footprint kg, recyclability %, origin, materials).
   - Queries `getProductHistory(productId)` and renders a chronological service timeline with direct links to diagnostic reports.
6. **Mandatory Physical-to-Digital Caveat Notice**:
   - Educates consumers that a physical QR sticker can be copied, reminding them to verify etched hardware serial numbers against the blockchain record.
7. **Test Suite Expansion (`test/verification.test.js`)**: Total test suite expanded to **59 passing tests**.

---

### 2. New Concepts Explained in Plain English

#### The "Physical-to-Digital Bridge" Problem in Blockchain
Blockchain provides **data immutability**: once data is written to Ethereum, no one can change it. But blockchain cannot physically look at a real-world object.
- If a fraudster copies a legitimate QR code sticker and pastes it onto 1,000 counterfeit handbags or fake phones, scanning the QR code will still point to a legitimate blockchain entry!
- **How ReLife Solves This**:
  1. We enforce global uniqueness on the physical serial number (`_serialNumberExists`).
  2. The verification screen prominently shows the authorized serial number so consumers can physically check the etched serial number on the hardware itself.
  3. We include the prominent security caveat warning consumers to inspect tamper-evident seals.

#### Read-Only Public DApps (No Wallet Friction)
Most consumers scanning a product QR code in a retail store do not own MetaMask or crypto. If your dApp forces them to connect a wallet just to view a product passport, 99% will abandon it.
By using `ReLifeWallet.getReadOnlyContract()` with a public RPC node (or local node), the verification portal performs read-only `view` function calls completely free of charge and without requiring any wallet login.

---

### 3. Three Viva / Demo Questions You Should Be Able to Answer (Phase 6)

#### Q1: Why doesn't a consumer need to pay gas or connect a wallet to verify a product passport on `product.html`?
> **Model Answer**: The `verifyProduct` and `getProductHistory` functions in `ReLife.sol` are declared as `view` functions. View functions only read data from the Ethereum virtual machine storage without modifying state. Because no state transitions occur, no transaction needs to be mined into a block, meaning read queries are completely free and can be executed through any public RPC provider without a crypto wallet or gas fee.

#### Q2: What is the "oracle / physical-to-digital link" vulnerability in supply chain blockchains, and how does ReLife address it?
> **Model Answer**: A blockchain guarantees that digital records cannot be altered, but cannot guarantee that a physical QR sticker was not cloned or stuck onto a fake item. ReLife mitigates this by enforcing globally unique serial numbers, displaying the hardware serial number prominently on the verification screen for manual comparison, tracking ownership changes on-chain, and placing a mandatory anti-fraud warning on the verification page.

#### Q3: How does the application generate dynamic QR codes without relying on external third-party image generation APIs?
> **Model Answer**: We use `QRCode.js`, a client-side JavaScript library that computes the QR matrix algorithm directly inside the user's browser and renders the matrix onto an HTML `<canvas>` element. This ensures privacy, works offline, avoids external API rate limits, and prevents third-party tracking of consumer verification scans.

---

## Phase 7: Ownership Transfer & Warranty Management

### 1. What Did We Build?
In Phase 7, we built the secondary lifecycle, warranty, and customer asset ownership architecture:
1. **Auditable Chain of Custody (`struct OwnershipRecord`)**: Records every change of hands starting from `address(0) -> manufacturer` through all subsequent secondary owners, providing an immutable audit trail without storing private personal data.
2. **`transferOwnership(uint256 productId, address newOwner)`**:
   - Strictly restricted to `msg.sender == currentOwner`.
   - Reverts if non-owner calls it (`ReLife__NotProductOwner`).
   - Reverts if transferring to zero address or self.
   - Emits `OwnershipTransferred` and appends to `_ownershipHistory`.
3. **`Warranty` Management (`addWarranty` & `getWarranty`)**:
   - Restricted to the product manufacturer or system admin.
   - Requires future expiration timestamp (`expiryTimestamp > block.timestamp`).
   - Dynamic expiration check: `getWarranty(productId)` computes `block.timestamp >= expiryTimestamp` on-the-fly without requiring expensive background cron transactions.
4. **Owner Dashboard (`frontend/owner.html` & `frontend/js/owner.js`)**:
   - Wallet connection displaying all products authentically owned by the connected wallet address.
   - Shows active or expired warranty status badges.
   - Interactive in-browser ownership transfer modal directly executing transactions via MetaMask.
5. **Testing Suite Expansion**: 18 new automated tests in `test/ReLife.test.js` and `test/owner.test.js`. Total test suite expanded to **77 passing tests**.

---

### 2. New Concepts Explained in Plain English

#### Digital Ownership vs Physical Possession
On Ethereum, ownership of a product passport is represented by an address (`address currentOwner`).
- When a product is sold in secondary markets (e.g. eBay or a refurbished electronics store), the seller signs a `transferOwnership` transaction to transfer the passport to the buyer's wallet.
- This creates an auditable chain of custody proving that the item was purchased legitimately and is not stolen or counterfeit.
- Crucially, even the smart contract admin cannot take the passport away from the owner, guaranteeing genuine digital property rights.

#### Dynamic On-Chain Time Computations
How do you check if a 2-year warranty has expired on the blockchain?
- **Bad Design**: Writing a cron job or bot that calls a transaction every day to flip `isActive = false` on thousands of expired products. This wastes enormous gas fees.
- **Good Design (Our Approach)**: Store the expiration UNIX timestamp once (`expiryTimestamp`). When queried, the EVM compares `block.timestamp >= expiryTimestamp` dynamically in a free `view` function!

---

### 3. Three Viva / Demo Questions You Should Be Able to Answer (Phase 7)

#### Q1: Why can only the `currentOwner` transfer ownership of a product passport? Can the system admin transfer it on their behalf?
> **Model Answer**: The `transferOwnership` function strictly requires `msg.sender == _products[productId].currentOwner`. The admin cannot transfer products on behalf of users because that would introduce a centralized backdoor and vulnerability, violating true Web3 ownership principles.

#### Q2: How does ReLife maintain an auditable chain of custody for a product without violating customer privacy or GDPR?
> **Model Answer**: We only store pseudonymous Ethereum wallet addresses (`previousOwner`, `newOwner`) and block timestamps on-chain in the `OwnershipRecord` struct. No personally identifiable information (PII) such as real names, phone numbers, home addresses, or credit cards are stored on the blockchain or IPFS.

#### Q3: How is warranty expiration determined in `getWarranty` without running a daily transaction?
> **Model Answer**: In Solidity, `block.timestamp` provides the current block time. `getWarranty` performs an on-the-fly comparison `bool expired = (w.expiryTimestamp > 0 && block.timestamp >= w.expiryTimestamp)` inside a read-only `view` function. This evaluates expiration dynamically in real time without executing any state-modifying transactions or spending gas.

---

## Phase 8: Circular Recycling & Terminal Decommissioning

### 1. What Did We Build?
In Phase 8, we completed the circular economy loop by handling product end-of-life:
1. **Recycler Participant Onboarding (`registerRecycler`)**: Restricted to `DEFAULT_ADMIN_ROLE`, granting `RECYCLER_ROLE` to verified dismantling facilities and emitting `RecyclerRegistered`.
2. **On-Chain Decommissioning (`addRecyclingRecord`)**: Callable exclusively by authorized recyclers. Sets `isRecycled = true`, emits `ProductRecycled`, and attaches deconstruction metrics (facility name, materials reclaimed, IPFS destruction certificate).
3. **Permanent Post-Recycling Freeze Enforcement**:
   - Blocks subsequent `transferOwnership` (`ReLife__ProductAlreadyRecycled`).
   - Blocks subsequent `addRepairRecord` (`ReLife__ProductAlreadyRecycled`).
   - Blocks subsequent `addWarranty` (`ReLife__ProductAlreadyRecycled`).
   - Blocks duplicate recycling attempts (`ReLife__ProductAlreadyRecycled`).
4. **Authorized Recycler Portal (`frontend/recycler.html` & `frontend/js/recycler.js`)**:
   - Role-gated portal where verified recycling plants upload destruction manifests to Pinata IPFS and execute the decommissioning transaction via MetaMask.
5. **Testing Suite Expansion**: 16 new automated tests in `test/ReLife.test.js` and `test/recycler.test.js`. Total test suite expanded to **93 passing tests**.

---

### 2. New Concepts Explained in Plain English

#### Circular Economy & End-of-Life in Digital Product Passports
In the circular economy, products don't just get thrown into landfills; their raw components (lithium, copper, gold, aluminum) are recovered and reused in new manufacturing runs.
- The Digital Product Passport must document this final stage: what was reclaimed and by which certified plant.
- Once a physical product is shredded or disassembled, its digital identity must be permanently retired.

#### Preventing "Zombie Passport" Fraud
Imagine a scammer who gets a genuine discarded packaging box or QR code from a recycled laptop. If the passport remained active, the scammer could clone the QR code onto a cheap knockoff device and sell it as "genuine used".
By setting `isRecycled = true` irreversibly on-chain:
- The passport displays a permanent warning badge: `RECYCLED / DECOMMISSIONED`.
- Any attempt to transfer ownership, add a fake repair record, or extend a warranty reverts immediately on the EVM.
- The passport can never be resurrected, completely extinguishing resale fraud.

---

### 3. Three Viva / Demo Questions You Should Be Able to Answer (Phase 8)

#### Q1: Why is the `isRecycled` status strictly irreversible in `ReLife.sol`?
> **Model Answer**: Irreversibility is a foundational anti-counterfeit guarantee. Once a physical product has been shredded or recycled, its lifecycle has permanently ended. If there were a function to un-recycle a product, malicious actors could resurrect dead passports and attach them to counterfeit hardware.

#### Q2: What functions in `ReLife.sol` are blocked once a product is recycled, and what error is returned?
> **Model Answer**: Once `_products[productId].isRecycled` is set to `true`, the contract reverts any call to `transferOwnership`, `addRepairRecord`, `addWarranty`, or `addRecyclingRecord` using the custom error `ReLife__ProductAlreadyRecycled(productId)`.

#### Q3: What is the purpose of storing `certificateUri` in the `RecyclingRecord` struct?
> **Model Answer**: The `certificateUri` points to an immutable IPFS document containing official proof of certified destruction, hazardous material handling compliance, and circular metal recovery manifests issued by the accredited recycling plant.

---

## Phase 9: Admin Dashboard, Role Governance & UI Polish

### 1. What Did We Build?
In Phase 9, we completed the administrative governance layer and polished the user experience across all portals:
1. **Admin Portal (`frontend/admin.html` & `frontend/js/admin.js`)**:
   - Cryptographic role-gate: verifies `hasRole(DEFAULT_ADMIN_ROLE, account)` upon wallet connection. If an unauthorized wallet connects, an informative warning alert is presented.
   - Live admin and contract network statistics (admin address, contract address, chain ID).
2. **Participant Onboarding Subsystems**:
   - **Register Manufacturer**: Calls `registerManufacturer(account, name)` to grant `MANUFACTURER_ROLE` and record commercial brand identity.
   - **Register Repair Center**: Calls `registerRepairCenter(account, name)` to grant `REPAIR_CENTER_ROLE` and record certified maintenance hub details.
   - **Register Recycler**: Calls `registerRecycler(account, name)` to grant `RECYCLER_ROLE` and authorize circular reclamation.
3. **Direct Role Governance & Revocation**:
   - Direct execution of `grantRole` and `revokeRole` across all contract roles (`MANUFACTURER_ROLE`, `REPAIR_CENTER_ROLE`, `RECYCLER_ROLE`, and `DEFAULT_ADMIN_ROLE`).
   - "Check Role Status" utility allowing administrators to verify any address's role state in real time.
4. **On-Chain Event-Driven Participant Directory**:
   - Queries historical contract events (`ManufacturerRegistered`, `RepairCenterRegistered`, `RecyclerRegistered`) using Ethers.js `queryFilter`.
   - Cross-references each participant's address with `hasRole` to render an active vs. revoked audit table in real time.
5. **Friendly Web3 Error Decoding (`ReLifeWallet.parseError`)**:
   - Translates cryptic MetaMask numeric codes (e.g. `4001`) and custom Solidity revert selectors (`AccessControlUnauthorizedAccount`, `ReLife__ProductAlreadyRecycled`, `ReLife__SerialAlreadyExists`) into clear plain-English actionable messages.
6. **Unified Navigation Bar**:
   - Synchronized navigation across all 6 frontend portals: Home (`index.html`), Manufacturer (`manufacturer.html`), Owner Dashboard (`owner.html`), Recycler Portal (`recycler.html`), Verify Product (`product.html`), and Admin Portal (`admin.html`).
7. **Automated Testing Suite Expansion**: 11 new tests in `test/admin.test.js`. Entire test suite expanded to **104 passing tests**.

---

### 2. New Concepts Explained in Plain English

#### Role-Based Access Control (RBAC) vs Single Owner Pattern
In simple Solidity tutorials, you often see `Ownable` (a single `owner` variable with `onlyOwner`). While simple, `Ownable` has major limitations:
- A single owner key must do everything: mint products, register repair centers, manage warranties, and recycle items.
- If that single private key is compromised, the entire platform is lost.
In contrast, **Role-Based Access Control (RBAC)** via OpenZeppelin's `AccessControl` creates fine-grained separation of privileges:
- Only administrators hold `DEFAULT_ADMIN_ROLE`.
- Manufacturers hold `MANUFACTURER_ROLE` (they can mint passports, but cannot approve repair centers).
- Service centers hold `REPAIR_CENTER_ROLE` (they can record repairs, but cannot mint new products).
- Recyclers hold `RECYCLER_ROLE` (they can decommission products, but cannot modify manufacturing data).
- Any compromised role can be revoked instantly by the admin without redeploying the contract!

#### Event Querying vs Unbounded On-Chain Arrays
Why didn't we store an array like `address[] public registeredManufacturers` directly in the smart contract?
- **The Gas Problem**: Writing to contract storage (`SSTORE`) is the most expensive operation in Ethereum (20,000 gas per new slot). Furthermore, looping over an array on-chain consumes gas proportional to the length of the array, eventually hitting the block gas limit!
- **The Event Solution**: Emitting an indexed event like `emit ManufacturerRegistered(account, name, msg.sender)` costs a fraction of the gas. The data is permanently written into Ethereum transaction logs. Ethers.js can query `contract.queryFilter()` from block 0 to the latest block for free, building a rich, scalable off-chain directory with zero gas cost!

#### Translating Cryptic Web3 Errors for Real Users
When an Ethereum transaction reverts, the EVM sends back a 4-byte selector hash (e.g., `0xe17f7b13` for `AccessControlUnauthorizedAccount`). To a regular user, seeing `execution reverted: 0xe17f7b13` is frightening and unhelpful.
In `ReLifeWallet.parseError(err)`, we inspect the error code and error signature, converting:
- `code 4001` &rarr; *"Transaction was cancelled in MetaMask."*
- `INSUFFICIENT_FUNDS` &rarr; *"Insufficient ETH in your wallet to cover gas fees. Please acquire Sepolia test ETH from a faucet."*
- `AccessControlUnauthorizedAccount` &rarr; *"Unauthorized Action: Your wallet does not hold the required role on-chain for this function."*
- `ReLife__ProductAlreadyRecycled` &rarr; *"Lifecycle Frozen: This product passport has been decommissioned & recycled."*

---

### 3. Three Viva / Demo Questions You Should Be Able to Answer (Phase 9)

#### Q1: What is the relationship between `DEFAULT_ADMIN_ROLE` and specific application roles like `MANUFACTURER_ROLE`?
> **Model Answer**: In OpenZeppelin's `AccessControl`, `DEFAULT_ADMIN_ROLE` serves as the default administrative role for all other roles. An account possessing `DEFAULT_ADMIN_ROLE` has the cryptographic authority to call `grantRole` and `revokeRole` on `MANUFACTURER_ROLE`, `REPAIR_CENTER_ROLE`, and `RECYCLER_ROLE`. This enforces a clear governance hierarchy where designated administrators onboard or offboard supply chain participants.

#### Q2: Why is using `queryFilter` on contract events preferable to maintaining an on-chain array of all registered participants?
> **Model Answer**: Storing unbounded arrays in contract storage consumes significant gas for write operations and introduces denial-of-service risks if the array grows too large to iterate within a block gas limit. Emitting events (`LOG` opcodes) is much cheaper, and allows off-chain applications and frontend dashboards to query past events via RPC nodes without paying any gas, providing a scalable and transparent audit trail.

#### Q3: What happens if an authorized repair center loses its private key or acts maliciously? How does ReLife handle this?
> **Model Answer**: The contract administrator can immediately invoke `revokeRole(REPAIR_CENTER_ROLE, compromisedAddress)` from the Admin Portal. Once the revocation transaction is mined on Ethereum, any further attempt by that compromised address to call `addRepairRecord` will immediately revert with `AccessControlUnauthorizedAccount`. The historical repairs already committed remain immutable on-chain, but the compromised key is permanently disabled from making further entries.

---

## Phase 10: Final Testing, Gas Profiling, Architecture & Project Defense

### 1. What Did We Build?
In Phase 10, we conducted full-spectrum testing, EVM gas profiling, and prepared comprehensive documentation and presentation materials:
1. **Automated Gas Profiling (`test/gasReport.test.js`)**:
   - Programmatically measured exact gas consumed by every state mutation in `ReLife.sol`.
   - Contract deployment: `2,947,616 gas`.
   - Minting product passport (`registerProduct`): `418,353 gas`.
   - Logging repair record (`addRepairRecord`): `260,854 gas`.
   - Ownership transfer (`transferOwnership`): `105,608 gas`.
   - Decommissioning (`addRecyclingRecord`): `280,925 gas`.
   - Role registrations (`registerManufacturer`, `registerRepairCenter`, `registerRecycler`): ~`54,800 gas` each.
   - Read-only queries (`getProduct`, `verifyProduct`, `getProductHistory`, etc.): `0 gas` (free).
2. **Comprehensive Test Suite**:
   - Expanded from 104 to **113 passing tests** across 10 specialized test files covering the entire lifecycle from genesis to recycling.
3. **5-Minute Viva & Presentation Script (`DEMO_SCRIPT.md`)**:
   - A complete live demonstration guide equipped with exact sample data (serial numbers, organization names, bill of materials, repair logs, reclamation metrics).
   - Structured elevator pitch, architecture walkthrough, live demo steps, and defense answers.
4. **End-to-End System Architecture Documentation (`README.md`)**:
   - Integrated Mermaid flowchart and ASCII diagram capturing the multi-portal frontend, MetaMask wallet layer, Express Pinata proxy backend, and Ethereum smart contract.
   - Gas optimization summary table and security/anti-fraud analysis.

---

### 2. New Concepts Explained in Plain English

#### How Gas Works on the EVM
Every operation executed by the Ethereum Virtual Machine (EVM) consumes a predefined number of gas units:
- Reading from memory (`MLOAD`): 3 gas.
- Writing to a brand new storage slot (`SSTORE` from 0 to non-zero): 20,000 gas!
- Emitting a 3-topic event (`LOG3`): ~1,500 gas.
- Hashing with Keccak-256: 30 gas + 6 gas per word.

Gas is priced in Gwei (1 Gwei = $10^{-9}$ ETH). The final transaction fee paid by a user is:
$$\text{Transaction Fee} = \text{Gas Used} \times \text{Base Fee} + \text{Priority Fee (Tip)}$$

Because storage writes are the single most expensive operation on Ethereum, our architecture is specifically designed to minimize storage writes by off-chaining heavy files to IPFS and anchoring only compact cryptographic 46-character CIDs on-chain.

#### The Physical-to-Digital "Oracle Problem" & QR Cloning
In blockchain theory, the **Oracle Problem** describes the challenge of verifying that real-world physical facts match digital blockchain records.
- In Digital Product Passports, a common misconception is: *"If a physical product has a QR code linking to a valid blockchain contract, the physical item must be genuine."*
- **The Reality**: Anyone can take a photo of a genuine QR code sticker and print it onto a counterfeit clone!
- **Our Defense Strategy**:
  1. We inform the consumer directly on the verification portal to inspect physical tamper-evident seals and compare the etched hardware serial number with the on-chain serial.
  2. We permanently freeze recycled passports so counterfeiters cannot harvest discarded genuine QR codes and attach them to fake items ("zombie passports").

#### Scaling ReLife: Layer 1 vs Layer 2 Rollups
While ReLife is deployed on Ethereum Sepolia, in an enterprise production environment producing millions of consumer items daily, minting directly on Ethereum Layer 1 would incur high gas fees during congestion.
- **The Production Solution**: Deploy the same `ReLife.sol` Solidity contract onto an **Ethereum Layer 2 Rollup** (such as Arbitrum, Optimism, Base, or Polygon zkEVM).
- Because Layer 2 rollups bundle thousands of transactions off-chain and post compressed cryptographic proofs to Ethereum, transaction fees are reduced by 95% to 99% while inheriting the full decentralization and security of Ethereum!

---

### 3. Three Viva / Demo Questions You Should Be Able to Answer (Phase 10)

#### Q1: Walk me through the end-to-end data flow when a manufacturer registers a new product in ReLife.
> **Model Answer**:
> 1. The manufacturer enters technical specifications (model, serial, materials, carbon footprint) and selects an image/invoice file in the Manufacturer Portal.
> 2. The browser submits a `multipart/form-data` request to the Express backend endpoint `/api/ipfs/upload-metadata`.
> 3. The backend validates the inputs, shields Pinata API secrets from the client, pins the payload to IPFS, and returns a cryptographic URI (e.g. `ipfs://bafy...`).
> 4. The frontend receives the CID and prompts the manufacturer's MetaMask wallet to sign an on-chain transaction calling `registerProduct(serialNumber, modelName, brand, metadataURI)`.
> 5. The smart contract validates that the caller has `MANUFACTURER_ROLE`, verifies the serial is globally unique, increments `productIdCounter`, records the manufacturer as initial owner, emits `ProductRegistered`, and permanently commits the state on Ethereum.

#### Q2: What are the three biggest gas optimizations implemented in `ReLife.sol`?
> **Model Answer**:
> 1. **Custom Solidity Errors**: Utilizing custom errors (e.g. `error ReLife__ProductAlreadyRecycled()`) instead of descriptive require strings saves deployment bytecode and approximately 2,000 gas per error check.
> 2. **Decentralized IPFS Off-Chaining**: Heavy documents, images, and technical manuals are pinned to IPFS, storing only lightweight cryptographic string references on-chain.
> 3. **Dynamic View Evaluation**: Checking warranty status via `block.timestamp >= expiryTimestamp` dynamically inside a read-only `view` function eliminates the need for expensive scheduled transactions or daily maintenance bots.

#### Q3: If a company wanted to scale ReLife from 1,000 products to 10 million products per year, what architectural evolution would you recommend?
> **Model Answer**: I would recommend migrating the smart contract layer to an Ethereum Layer 2 Rollup (e.g., Arbitrum, Optimism, or Base) or a dedicated app-chain. Layer 2 networks use rollup technology to compress and batch transaction execution off-chain while maintaining Ethereum's settlement security, dropping transaction costs from dollars to fractions of a cent. Additionally, we could introduce batch-minting (`registerProductBatch`) to mint hundreds of sequential serial numbers in a single transaction.

---

## Appendix: Web3 Networking, RPCs & Error Diagnostics

### 1. What is an RPC Provider?
A **JSON-RPC Provider** is your dApp's internet service provider for the blockchain. Blockchains don't speak standard HTTP REST APIs; they communicate over JSON-RPC (Remote Procedure Call). Services like Alchemy, Infura, and QuickNode run full Ethereum nodes and give developers dedicated HTTPS endpoints (`https://eth-sepolia.g.alchemy.com/v2/...`). When you ask for account balances or send a signed transaction, your request goes directly through this RPC endpoint.

### 2. What Does "Injected env (0)" & Error 522 Mean?
* **"Injected env (0)"**: Hardhat uses the `dotenv` library to read `.env`. If `.env` is missing, empty, or misspelled (e.g. `.env.txt`), `dotenv` injects 0 environment variables into `process.env`.
* **Error 522 (Cloudflare Connection Timed Out)**: When `.env` is missing, Hardhat scripts often fall back to public endpoints like `https://rpc.sepolia.org`. Because millions of developers hammer public endpoints, they are heavily rate-limited or offline. Cloudflare sits in front of them and returns an HTTP 522 timeout error when the origin server fails to respond.

### 3. What Does `code=BAD_DATA` / `value="0x"` Mean?
In Ethereum:
- An Externally Owned Account (EOA, user wallet) or an address where no contract is deployed has **0 bytes of bytecode** (`getCode(address) === "0x"`).
- When a library like Ethers.js makes a read call (`eth_call`) to an address with no code, the EVM returns empty data (`"0x"`).
- Ethers expects a specific data type (like a 32-byte hash for `DEFAULT_ADMIN_ROLE`). When it attempts to decode empty bytes, it throws `code=BAD_DATA`.

---

### 4. Three Viva / Interview Questions You Should Be Able to Answer (Networking & RPCs)

#### Q1: What is the difference between an Externally Owned Account (EOA) and a Smart Contract address at the EVM bytecode level?
> **Model Answer**: An EOA is controlled by a private key and has empty bytecode (`eth_getCode` returns `"0x"`). A Smart Contract address is created during a deployment transaction and contains executable EVM runtime bytecode (`eth_getCode` returns the compiled hexadecimal contract code).

#### Q2: Why does an `eth_call` return `0x` without throwing a revert error if you call a method on an address with no bytecode?
> **Model Answer**: In the EVM specification, calling an address with no code does not execute any instructions and simply returns success with empty return data (`0x`). The client library (like Ethers.js) is what throws an error (`BAD_DATA`) because it attempts to ABI-decode the expected return types out of zero bytes.

#### Q3: Why should production dApps use a private dedicated RPC provider (like Alchemy or Infura) instead of public RPC endpoints?
> **Model Answer**: Public endpoints (like `rpc.sepolia.org`) have no Service Level Agreements (SLAs), suffer from severe rate-limiting, and frequently timeout (HTTP 522/429) under heavy traffic. Dedicated RPC providers offer reliable uptime, dedicated node clusters, WebSocket event streams, and detailed request telemetry.

---

## Appendix: Ethers.js Results, Event Topics & Safe DOM Rendering

### 1. Why Did JavaScript Print `"[object Object]"`?
In JavaScript, when an object is embedded inside a template literal (e.g. `<td><code>${serialNumber}</code></td>`), JavaScript implicitly calls `.toString()` or converts it via `String(serialNumber)`. For regular JavaScript objects or classes that do not provide a custom `.toString()` implementation, `Object.prototype.toString.call(val)` evaluates to the string `"[object Object]"`.

In our application:
In `ReLife.sol`, the event was defined as:
```solidity
event ProductRegistered(
    uint256 indexed productId,
    string indexed serialNumber,
    address indexed manufacturer,
    string modelName,
    string brand,
    string metadataURI,
    uint256 timestamp
);
```
Under the EVM specification, when dynamic types (`string`, `bytes`, dynamic arrays) are marked `indexed`, the EVM does not log the original string in the event topic. Instead, it hashes the string with `keccak256` and places the 32-byte hash in the topic (`topics[2]`).
When Ethers.js v6 decodes this event log, it recognizes that `serialNumber` was an indexed string topic whose preimage cannot be recovered from the log alone. Rather than returning a raw string or throwing, Ethers v6 creates an `Indexed` object:
```javascript
Indexed {
  hash: '0x5d31b9100fdb25492b0dd548a9d823f5592c421e9f2886714c8bdac4f925805c',
  _isIndexed: true
}
```
When `manufacturer.js` read `const { serialNumber } = event.args;` and placed it inside a template string `${serialNumber}`, JavaScript stringified the `Indexed` object to `"[object Object]"`!

### 2. How Does Ethers v6 Represent Solidity Structs and Why Does That Confuse Template Literals?
When a contract call returns a Solidity struct or multiple values, Ethers v6 wraps the returned data in an instance of `Result`. A `Result` object is a hybrid proxy that acts like both an Array (indexed numerically `[0, 1, 2, ...]`) and an Object (with named properties `.id`, `.serialNumber`, etc.).
- Because `Result` inherits from Array, calling `JSON.stringify(result)` only serializes the numeric elements and omits named keys unless you call `result.toObject()`.
- Furthermore, numerical values in Solidity structs are typed as native JavaScript `BigInt` (e.g. `1n`). `JSON.stringify` throws a `TypeError: Do not know how to serialize a BigInt` if invoked directly on objects containing BigInt values.
- If a developer mistakenly prints the whole struct or a complex property, JavaScript coerces it into `"[object Object]"`.

### 3. What Does `formatProduct(raw)` Do Step by Step?
The helper `formatProduct(raw)` in `frontend/js/wallet.js` takes any raw struct or Result from the blockchain and normalizes it into a predictable JavaScript dictionary:
1. **Defensive Null Check**: Returns `null` if the input is falsy.
2. **Safe BigInt to Number Conversion (`toNumber`)**: Inspects fields (`id`, `manufacturingTimestamp`) and safely converts `BigInt` or string numerals to JavaScript `Number` primitives (or 0 if invalid).
3. **Safe String Extraction (`toStringSafe`)**: Inspects fields (`serialNumber`, `modelName`, `brand`, etc.). If an Ethers `Indexed` topic object is detected (`_isIndexed: true`), it falls back to the topic hash instead of printing `[object Object]`.
4. **Positional and Named Fallbacks**: Reads both named keys (e.g. `raw.serialNumber`) and numeric indices (e.g. `raw[1]`), making it compatible with both struct returns and event tuples.
5. **Formatted Presentation Fields**: Computes `idStr` (string ID for URL queries), `displayName` (`"Brand Model"`), and `formattedDate` (`toLocaleDateString()`), separating data transformation from UI rendering.

---

### 4. Three Viva / Interview Questions You Should Be Able to Answer (Ethers Result, Structs & XSS)

#### Q1: What is an Ethers.js Result object, how does it differ from a plain JS object, and why does Object.keys() or JSON.stringify() behave strangely on it?
> **Model Answer**: An Ethers.js `Result` is a specialized subclass of `Array` designed to represent ABI-decoded tuples and structs. It allows dual access: by numeric index (`result[0]`) and by named property (`result.serialNumber`). Because its underlying prototype is an Array, `JSON.stringify()` only serializes the numeric index elements and completely ignores named properties. Additionally, `Object.keys(result)` only lists the numeric indices (`["0", "1", ...]`). Furthermore, Solidity `uint256` values are returned as JavaScript `BigInt` primitives (`1n`), which causes `JSON.stringify()` to throw a `TypeError` unless converted to Numbers or Strings first.

#### Q2: In Solidity, how does string storage work inside a struct compared to a fixed-size type like uint256 or address?
> **Model Answer**: Fixed-size types like `uint256` (32 bytes) and `address` (20 bytes) occupy a fixed, contiguous position within the contract storage slot layout (or are packed into a single 32-byte slot if types fit together). In contrast, `string` is a dynamically sized byte array. Inside a struct in storage, the designated slot stores the string length and the data if the string is short (<= 31 bytes, UTF-8 inline in the slot with the lowest byte storing `length * 2`). If the string exceeds 31 bytes, the slot stores `length * 2 + 1`, and the actual character bytes are stored contiguously starting at storage slot `keccak256(p)`, where `p` is the slot number of the string variable.

#### Q3: What is the difference between innerHTML and textContent, and why should user/chain-supplied strings use textContent (XSS)?
> **Model Answer**: `innerHTML` parses the assigned string as HTML markup and evaluates any embedded tags (such as `<img src=x onerror=...>` or `<script>`), exposing the application to Stored Cross-Site Scripting (XSS) if user-supplied or on-chain data contains malicious payloads. In contrast, `textContent` treats all input strictly as raw, unparsed text and automatically escapes special characters (like `<`, `>`, and `&`), rendering them harmlessly on the page. Therefore, strings originating from smart contracts, events, or IPFS metadata should always be inserted using `textContent` or `innerText` to prevent XSS attacks.

---

## Appendix: Feature 1 — Product Status State Machine

### 1. What is a State Machine in Smart Contracts?
A **Finite State Machine (FSM)** is a mathematical model of computation where an entity (like a product passport) can only exist in **exactly one state at any given moment** (e.g. `Manufactured`, `Sold`, `InRepair`, `Recycled`). Transitions between states are governed by strict, verifiable transition rules.

In ReLife, we enforce:
* **Initial State**: Newly minted passports start in `Status.Manufactured`.
* **Forward Progress**: A product cannot go backwards to `Manufactured` once sold or repaired.
* **Controlled Servicing**: Products move `Sold -> InRepair -> Sold`. While `InRepair`, ownership transfers are locked.
* **Terminal Sink State**: `Status.Recycled` is permanent. Once recycled, no transfers, repairs, or warranties can ever be modified again.

---

### 2. Three Viva / Interview Questions You Should Be Able to Answer (State Machines & Enums)

#### Q1: How does Solidity represent an `enum` internally in bytecode and storage, and how does that compare to `uint8`?
> **Model Answer**: In Solidity, an `enum` is user-defined syntactic sugar that the compiler translates directly into an unsigned integer type (`uint8` if there are 256 or fewer members). The first declared member has an ordinal integer value of `0`, the second `1`, and so on. In storage, an enum variable occupies a single byte within a 32-byte slot, allowing tight packing with other small data types (such as `bool` or `address`). If an out-of-range integer is cast to an enum, the EVM reverts with a Panic error.

#### Q2: What is a "sink state" (or terminal state) in a blockchain state machine, and why is it crucial for a Digital Product Passport?
> **Model Answer**: A sink state is a state in an FSM that has no outgoing transitions—once an entity enters this state, it can never leave it. In ReLife, `Status.Recycled` is an explicit sink state. It is crucial because when physical hardware is shredded or deconstructed for raw materials, its digital identity must be permanently frozen. If a decommissioned passport could be reverted back to `Sold` or transferred, counterfeiters could clone the serial number and attach it to fake hardware.

#### Q3: Why should state transitions emit an event with both the old and new state (`StatusChanged`), and how does this benefit off-chain indexers?
> **Model Answer**: Emitting `event StatusChanged(uint256 indexed productId, Status oldStatus, Status newStatus, address indexed actor, uint256 timestamp)` provides an auditable cryptographic log of every lifecycle transition. Because events cost substantially less gas than modifying multiple storage arrays, off-chain clients (The Graph, subgraphs, or backend databases) can reconstruct the full historical timeline of a product by querying logs via `eth_getLogs` without requiring the smart contract to store expensive historical state on-chain.

---

## Appendix: Feature 2 — Warranty with Automatic Expiry Evaluation

### 1. New Concepts Explained in Plain English

#### Dynamic Expiry Evaluation vs. Web2 Cron Jobs
In traditional Web2 architectures (Node.js, Python, PostgreSQL), developers run a background cron job (e.g. `node-cron` or Celery) that queries the database every midnight and flips a flag: `UPDATE warranties SET is_expired = true WHERE expiry_date <= NOW()`.
In Ethereum and smart contracts, **this is impossible and unnecessary**:
1. **Smart Contracts are Reactive**: A smart contract cannot execute code spontaneously; it only executes when an external account (EOA) initiates a transaction by paying gas.
2. **Dynamic Evaluation**: Instead of paying gas every day to mark thousands of warranties as expired, we use a `view` function: `isWarrantyValid(productId)`. When queried, the EVM compares `block.timestamp` against `warrantyEnd`. If the timestamp has passed, it returns `false` dynamically. This is **100% free** for consumers and requires zero automated maintenance transactions!

#### Time on the Blockchain: `block.timestamp` & Miner Manipulation
- In Solidity, `block.timestamp` (an alias for `now` in older compiler versions) returns the UNIX epoch timestamp (seconds elapsed since January 1, 1970) of the block currently being created.
- **Can validators manipulate time?** Yes, slightly. Under Ethereum Proof-of-Stake (PoS), slots are produced every 12 seconds. A block's timestamp must be strictly greater than the parent block's timestamp and cannot be in the future relative to the validator's local clock (within a strict drift limit, typically 15 seconds).
- **Security Rule of Thumb**: Never rely on `block.timestamp` for sub-minute or high-precision randomness. For warranties, subscriptions, and product lifecycles measured in days, months, or years, `block.timestamp` is safe, reliable, and industry standard.

#### Hardhat Time Helpers (`@nomicfoundation/hardhat-network-helpers`)
How do you write an automated test that checks if a 2-year warranty expires, without waiting 2 years?
Hardhat's local JSON-RPC node allows EVM time travel via special debug RPC methods:
- `evm_increaseTime`: Tells the local node to fast-forward its virtual clock by $N$ seconds.
- `evm_mine`: Mines a new block to advance state.
Hardhat encapsulates this cleanly with `@nomicfoundation/hardhat-network-helpers`:
```javascript
const { time } = require("@nomicfoundation/hardhat-network-helpers");

// Fast-forward local blockchain clock by 31 days
await time.increase(86400 * 31);
```

---

### 2. Three Viva / Interview Questions You Should Be Able to Answer (Feature 2)

#### Q1: Why can't Ethereum smart contracts run automated "cron jobs" to flip a warranty status from Active to Expired at midnight?
> **Model Answer**: The Ethereum Virtual Machine (EVM) is a passive, deterministic state machine. It has no continuous background operating system or daemon process; smart contracts only execute when an external account (EOA) or smart account broadcasts a signed transaction and pays gas. Running a daily cron job to update expired records would incur ongoing gas costs and hit transaction gas limits. Instead, Web3 applications use read-only `view` functions (like `isWarrantyValid`) to dynamically compare `block.timestamp` against the expiration timestamp on demand at zero gas cost.

#### Q2: What is validator timestamp manipulation, and why is `block.timestamp` acceptable for warranty tracking but not for high-stakes randomness?
> **Model Answer**: In Ethereum Proof-of-Stake, the block proposer (validator) assigns the block timestamp. The consensus rules require the timestamp to be greater than the parent block's timestamp and reasonably close to real-world time (consensus nodes reject blocks timestamped too far into the future). Because a validator has slight leeway (a few seconds) to tweak the timestamp, `block.timestamp` must never be used as a pseudo-random seed in lotteries or front-running-sensitive financial conditions. However, for real-world warranty tracking spanning months or years, a variance of a few seconds is completely negligible, making `block.timestamp` entirely secure and standard.

#### Q3: How do Hardhat network helpers (`time.increase`, `time.latest`) work under the hood when testing time-dependent Solidity logic?
> **Model Answer**: Under the hood, Hardhat runs an in-memory Ethereum node implementing custom non-standard JSON-RPC methods. When `time.increase(seconds)` is called, Hardhat dispatches the `evm_increaseTime` RPC call with the requested number of seconds, followed by `evm_mine`. This adjusts the internal block clock offset of the virtual node and creates a new block whose `block.timestamp` reflects the future time. When our test queries `isWarrantyValid(id)`, the EVM executes against this advanced timestamp, allowing instantaneous verification of multi-year lifecycles in milliseconds.

---

## Appendix: Feature 3 — Ownership Transfer with 2-Step Accept Flow

### 1. New Concepts Explained in Plain English

#### The 2-Step Transfer Pattern (`Ownable2Step`)
In standard Web3 contracts (like OpenZeppelin's basic `Ownable`), ownership transfer is a **1-step push operation**: the current owner specifies a new address, and the asset transfers instantly.
- **The Catastrophic Problem**: If the owner makes a single typo in the 42-character hexadecimal address (e.g. sending to an address where no one holds the private key), **the asset is lost forever**—no one can ever transfer it or access it again.
- **The 2-Step Solution**:
  1. **Initiate (`initiateTransfer`)**: The current owner proposes a recipient by setting `pendingOwner`. Crucially, ownership does **NOT** transfer yet.
  2. **Accept (`acceptTransfer`)**: The proposed recipient must connect their wallet and sign a transaction calling `acceptTransfer`. This proves beyond all cryptographic doubt that the recipient actually controls the private key for that address!

#### Cancellation Safeguards & Transit Windows
What happens if the current owner enters the wrong address or the intended buyer changes their mind?
- With 1-step transfer, the owner is helpless.
- With 2-step transfer, as long as the transfer has not been accepted, the current owner can call `cancelTransfer(productId)` at any time to revoke the offer, resetting `pendingOwner` back to `address(0)`.

#### Supply Chain Integrity During Servicing & Decommissioning
A Digital Product Passport must reflect physical reality:
- If a laptop is currently disassembled in a repair shop (`Status.InRepair`), the owner cannot sell or transfer it to someone else until servicing is complete.
- If a product has been shredded or recycled (`Status.Recycled`), it has permanently reached end-of-life. Allowing transfers on recycled items would enable black-market counterfeiters to trade "zombie passports". ReLife enforces strict lifecycle guards on both `initiateTransfer` and `acceptTransfer`.

---

### 2. Three Viva / Interview Questions You Should Be Able to Answer (Feature 3)

#### Q1: What is the 2-step transfer pattern (often called `Ownable2Step` in OpenZeppelin), and what catastrophic problem does it prevent?
> **Model Answer**: In a traditional 1-step transfer, ownership updates immediately upon the sender's transaction. If the sender makes a single typo or provides an un-owned address, the asset is permanently burnt/stranded because no private key exists to control that address. The 2-step pattern separates transfer into `initiateTransfer` (proposing a `pendingOwner`) and `acceptTransfer` (executed by the recipient). This guarantees that ownership only transfers when the recipient proves control of the designated private key by broadcasting a valid signed transaction from that address.

#### Q2: What should happen to the `pendingOwner` variable when a transfer is either accepted or cancelled?
> **Model Answer**: In both cases, `pendingOwner` must be explicitly reset to `address(0)`. On acceptance, setting `_pendingOwners[productId] = address(0)` ensures the pending state is cleared before updating `currentOwner`. On cancellation, resetting it to `address(0)` prevents the previously designated recipient from front-running or late-accepting the transfer. Resetting storage variables to zero also helps optimize EVM gas usage by qualifying for storage refund mechanisms.

#### Q3: Why does ReLife block ownership transfers when a product's status is `InRepair` or `Recycled`?
> **Model Answer**: A Digital Product Passport must guarantee digital-physical correspondence. If a physical device is disassembled inside a certified service center (`Status.InRepair`), secondary sales must be halted to prevent disputes over incomplete repairs or missing hardware components. Furthermore, once an item is shredded at end-of-life (`Status.Recycled`), permitting transfers would allow counterfeiters to purchase "empty" legitimate passports and re-assign them to illicit duplicate hardware. Blocking transfers at the smart contract level enforces physical supply chain reality cryptographically.

---

## Appendix: Feature 4 — Authenticity Secret (Hash On-Chain Verification)

### 1. New Concepts Explained in Plain English

#### Cryptographic Commitments with `keccak256`
In blockchain engineering, you frequently need to prove you know a secret **without revealing the secret itself**. This is known as a **cryptographic commitment**:
1. The manufacturer generates a 256-bit cryptographically random secret string off-chain (e.g. `c7f93a4e...`).
2. The manufacturer computes `hash = keccak256(bytes(secret))`.
3. The smart contract stores only the 32-byte hash (`_authenticityHashes[productId]`).
4. **Why is this secure?** `keccak256` is a one-way mathematical function. An attacker inspecting Ethereum storage can see the 32-byte hash, but it is mathematically impossible to reverse-engineer the original secret from the hash.
5. When a consumer checks the item, they provide the secret from the physical packaging or tamper-seal label. The smart contract hashes what the user typed and checks if it matches the stored commitment.

#### Ephemeral Zero-Storage Rule
Why did we strictly prohibit storing the plaintext secret in the database or logging it?
- In Web2, if you store passwords or secrets in a database, a database leak compromises all products.
- In ReLife, the backend generates the secret and immediately hands it to the authorized manufacturer to print onto the tamper-evident label. The backend **never** logs it, **never** commits it to git, and **never** writes it to SQLite/PostgreSQL. It exists strictly on the physical label.

#### Honest Engineering: The Physical Label Cloning Limitation
In engineering viva defenses, honesty about security boundaries earns the highest marks.
* **What does the Authenticity Secret achieve?**
  A counterfeiter cannot simply mint fake passports or fabricate QR codes pointing to authentic passports, because they do not know the 256-bit secret stored under the scratch-off seal or encrypted tag.
* **What can it NOT prevent?**
  If a malicious actor physically gets their hands on the authentic product packaging, takes a high-resolution photograph of the printed QR code and scratch-off secret, and prints an identical sticker onto 100 counterfeit knockoff boxes, **the secret will match for all 100 boxes!**
* **The Layered Defense**:
  This is why a QR secret raises the security bar substantially, but is not magic. True anti-counterfeiting requires **defense in depth**:
  1. Permanent laser-etching of serial numbers into chassis hardware (not paper stickers).
  2. Factory tamper-evident holographic seals over the secret.
  3. Scan counter anomaly detection (Feature 5) to alert consumers when a single serial number is being scanned suspiciously across multiple locations!

---

### 2. Three Viva / Interview Questions You Should Be Able to Answer (Feature 4)

#### Q1: Why do we store `keccak256(secret)` on the blockchain instead of storing the plaintext `secret`?
> **Model Answer**: The Ethereum blockchain is a public, fully transparent ledger. Every storage slot and transaction payload is readable by anyone in the world via tools like Etherscan or `eth_getStorageAt`. If we stored the plaintext secret in contract storage, any counterfeiter could query the contract, copy the secret, and print authentic-looking QR codes. By storing only the one-way `keccak256` hash, the secret remains completely hidden from observers until physically revealed by the authentic packaging label.

#### Q2: Can a counterfeiter photocopy a genuine physical DPP QR code containing an authenticity secret, and how should a Digital Product Passport defend against this?
> **Model Answer**: Yes. A purely static QR code, even one containing an authenticity secret, can be physically photographed or photocopied. An authenticity secret proves that the QR link matches the manufacturer's cryptographic commitment, but cannot independently verify whether the physical paper label was duplicated. ReLife addresses this through layered security: (1) requiring physical hardware serial etching cross-checks, (2) tamper-evident scratch seals hiding the secret until retail sale, and (3) backend scan anomaly monitoring (Feature 5) that flags suspicious counterfeit duplicates when a secret is scanned repeatedly from different IPs.

#### Q3: How does `verifySecret(productId, secret)` operate as a free view call without spending gas or sending a transaction?
> **Model Answer**: In Solidity, `verifySecret` is marked `external view`. When a client calls a `view` function through an Ethereum JSON-RPC provider (like Alchemy, Infura, or a local node) using `eth_call`, the EVM executes the function locally in read-only memory on the connected node. Because no new transaction is mined into a block and no contract storage is modified, no validator consensus is required and the call executes instantaneously at zero gas cost.

---

## Appendix: Feature 5 — Scan Counter & Counterfeit Anomaly Alert

### 1. New Concepts Explained in Plain English

#### Why Can't a Smart Contract `view` Function Count Scans?
In Solidity, functions marked `view` or `pure` are executed via local `eth_call`. They are read-only:
- A `view` function **cannot modify blockchain storage**. If you try to write `scanCount++` inside a `view` function, the Solidity compiler will throw a compile error.
- Could we make `logScan` a regular state-mutating transaction? Yes, but then **every single consumer who scans a QR code would need a crypto wallet, Sepolia/Mainnet ETH, and would have to wait 15 seconds and pay gas fees just to look at the product passport!**
- This would completely destroy real-world usability. Therefore, scan counting and anomaly detection are naturally handled in the **off-chain Express backend**.

#### Privacy by Design: HMAC-SHA256 IP Hashing
In Europe and worldwide (GDPR, CCPA), an IP address is considered **Personally Identifiable Information (PII)**.
- If our backend logged `192.168.1.50`, an attacker who breaches the server could correlate which individual scanned which product at what time.
- **The Solution**: We never store, log, or return the raw IP address. Instead, we hash the client IP using HMAC-SHA256 with a secret salt:
  $$\text{hashedIP} = \text{HMAC-SHA256}(\text{rawIP}, \text{salt})$$
- Because HMAC is one-way, no one can recover the original IP address. But identical IPs always produce the identical hash, allowing our anomaly engine to track distinct devices without compromising user privacy!

#### Cloned QR Detection: Volume vs. Velocity Anomalies
Imagine a counterfeiter buys 1 genuine laptop, takes a high-res photo of the QR code and authenticity secret, and prints that exact sticker onto 50 fake laptops sold across different cities:
1. **Velocity Anomaly**: If consumers scan that same product ID from 3 distinct network IPs within a 10-minute window, it is physically impossible for the genuine single product to teleport across cities. ReLife instantly flags the passport as `SUSPICIOUS`.
2. **Cumulative Volume Anomaly**: A legitimate consumer scans a product passport once or twice when purchasing and registering it. If a single product ID accumulates more than 5 scans, the likelihood of a photocopied/cloned label skyrockets.

#### Serverless Filesystems vs. Cloud Databases
In local development, our backend writes to `backend/data/scans.json`.
- When deploying to serverless platforms like **Vercel** or **AWS Lambda**, the filesystem is **read-only and ephemeral** (it resets on every execution).
- For cloud production deployments, the scan storage logic is designed to be easily pointed to hosted key-value databases such as **Redis**, **Vercel KV**, or **PostgreSQL**.

---

### 2. Three Viva / Interview Questions You Should Be Able to Answer (Feature 5)

#### Q1: Why is scan counting handled in the off-chain Express backend rather than directly inside a Solidity smart contract?
> **Model Answer**: Smart contract `view` functions are strictly read-only and cannot alter storage state on the EVM. If we made scan counting an on-chain transaction, every consumer scanning a QR code in a retail store would be forced to connect a Web3 wallet (like MetaMask), sign a transaction, and pay gas fees, which would create unacceptable friction for ordinary non-crypto users. Handling scan telemetry in the backend provides instant, zero-cost verification while maintaining fraud detection capability.

#### Q2: How does ReLife comply with data privacy regulations (like GDPR) when tracking client scan locations for anomaly detection?
> **Model Answer**: Under GDPR and data privacy frameworks, raw IP addresses are classified as Personally Identifiable Information (PII). ReLife implements Privacy by Design by passing all client IP addresses through an HMAC-SHA256 hashing function with a server-side salt before any processing or storage. The raw IP address is never stored in memory, never written to disk, and never logged. The resulting cryptographic hash allows the anomaly engine to identify repeat scans and distinct network counts without storing any personal user data.

#### Q3: What specific heuristics does ReLife use to detect photocopied or cloned QR codes, and how are false alarms prevented?
> **Model Answer**: ReLife uses a dual-heuristic anomaly detection model: (1) **Volume threshold**: Flags passports scanned more than 5 cumulative times, as authentic consumer items are rarely scanned repeatedly. (2) **Velocity threshold**: Flags passports scanned from 3 or more distinct hashed IPs within a 10-minute rolling window, indicating that identical QR stickers are being scanned in different locations simultaneously. To prevent malicious bots from spamming the endpoint to trigger false counterfeit alarms, a sliding-window rate limiter restricts each client IP to a maximum of 20 requests per minute.

