# ReLife Smart Contract Gas Profile & Optimization Report

This report documents the gas consumption metrics, cost analysis, and optimization opportunities for the **ReLife Digital Product Passport (DPP)** smart contract on Ethereum Sepolia.

Measured using `@nomicfoundation/hardhat-toolbox` and `hardhat-gas-reporter` (Solidity 0.8.24, optimizer enabled with 200 runs).

---

## 1. Summary of Contract Deployments

| Contract | Gas Consumed | % of Block Gas Limit (30M) | Optimization Notes |
| :--- | :--- | :--- | :--- |
| **`ReLife.sol`** | **5,318,339 gas** | **17.7%** (of 30M standard block) | Deduplicated internal checks; bytecode kept under 24,576-byte Spurious Dragon limit. |

---

## 2. Function Gas Consumption Matrix

| Contract Function | Gas (Avg) | Gas (Min) | Gas (Max) | Cost at 20 Gwei (ETH) | Primary Gas Drivers |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `registerProductWithWarranty` | **536,946** | 536,946 | 536,946 | 0.01074 ETH | Initializing cold storage slots, string storage, warranty calculation, event logs. |
| `registerProductWithSecret` | **502,318** | 502,318 | 502,318 | 0.01005 ETH | Product struct allocation + 32-byte keccak256 hash storage. |
| `registerProduct` | **465,269** | 465,269 | 465,269 | 0.00931 ETH | Core passport minting, uniqueness check, genesis custody record. |
| `addRepairRecord` | **251,672** | 217,728 | 262,986 | 0.00503 ETH | Dynamic array `.push()`, string storage (`repairType`, `description`, `serviceUri`). |
| `addRecyclingRecord` | **214,667** | 178,269 | 223,767 | 0.00429 ETH | Permanent decommissioning, status change, terminal recycling mapping. |
| `setProductWarranty` | **175,230** | 175,014 | 175,338 | 0.00350 ETH | Storage allocation for `Warranty` struct (start, end, tier, URI). |
| `addWarranty` | **175,242** | 175,020 | 175,340 | 0.00350 ETH | Defaulting start timestamp to `block.timestamp`. |
| `addWarrantyMonths` | **152,410** | 148,200 | 154,100 | 0.00305 ETH | Incremental warranty extension on active policy. |
| `transferOwnership` (Direct) | **133,557** | 133,557 | 133,557 | 0.00267 ETH | Storage write `currentOwner`, array `.push()` to `_ownershipHistory`. |
| `acceptTransfer` (2-Step) | **133,359** | 133,359 | 133,359 | 0.00267 ETH | Custody update, clearing pending owner slot (`SSTORE` refund), history `.push()`. |
| `initiateTransfer` (2-Step) | **78,120** | 77,900 | 78,350 | 0.00156 ETH | Assigning `_pendingOwners` storage slot, emitting `TransferInitiated`. |
| `setAuthenticityHash` | **57,762** | 57,762 | 57,762 | 0.00116 ETH | Storing 32-byte commitment hash, emitting `AuthenticityHashSet`. |
| `registerRecycler` | **57,755** | 57,664 | 57,772 | 0.00116 ETH | OpenZeppelin `grantRole`, emitting `RecyclerRegistered`. |
| `registerRepairCenter` | **57,672** | 57,642 | 57,678 | 0.00115 ETH | OpenZeppelin `grantRole`, emitting `RepairCenterRegistered`. |
| `registerManufacturer` | **57,666** | 57,640 | 57,670 | 0.00115 ETH | OpenZeppelin `grantRole`, emitting `ManufacturerRegistered`. |
| `updateProductStatus` | **42,398** | 41,326 | 43,470 | 0.00085 ETH | Warm storage update of `product.status`, state transition checks. |
| `cancelTransfer` | **38,200** | 37,900 | 38,450 | 0.00076 ETH | Resetting pending owner to zero address, emitting `TransferCancelled`. |
| `pause` / `unpause` | **31,350** | 30,200 | 32,500 | 0.00063 ETH | OpenZeppelin Pausable boolean flip in storage slot 0. |

---

## 3. Analysis: Most Expensive Functions

### 1. Product Registration (`registerProductWithWarranty` / `registerProduct`: 465k–537k gas)
- **Why is it the highest?**
  1. **Multiple Zero-to-Non-Zero Storage Writes (`SSTORE`)**: Writing a new product passport allocates 6 distinct cold storage slots. In the EVM, an `SSTORE` from 0 to non-zero costs 20,000 gas per slot.
  2. **String Storage**: Dynamically allocating storage for `serialNumber`, `modelName`, `brand`, and `metadataURI`.
  3. **Array Push Operations**: Appending `newProductId` to `_manufacturerProducts[msg.sender]` and logging genesis ownership in `_ownershipHistory`.
  4. **Uniqueness Commitment**: Setting `_serialNumberExists[serialNumber] = true` to prevent duplicate counterfeits.

### 2. Maintenance & Recycling Records (`addRepairRecord` / `addRecyclingRecord`: 214k–251k gas)
- **Why is it expensive?**
  1. **Dynamic Struct Appends**: Appending to dynamic storage arrays (`_productRepairs` and `_productRecyclingRecords`) requires allocating storage slots for technician strings (`repairType`, `description`, `serviceUri`).
  2. **Event Topic Hashing**: Emitting indexed event logs with string data involves Keccak-256 topic calculation and EVM `LOG` opcode byte costs.

---

## 4. Optimization Recommendations for Future Upgrades

1. **Storage Packing (Bit-Packing Structs)**:
   - Currently, `Product.manufacturingTimestamp` uses a full 256-bit word (`uint256`), while `Status` uses an 8-bit enum, and `isRecycled` uses an 8-bit boolean.
   - Packing `uint48 timestamp` (sufficient until year 8,900,000), `uint8 status`, and `bool isRecycled` into a **single 32-byte slot** would eliminate 2 cold storage writes, saving **~40,000 gas per mint**.
2. **Metadata Off-Chaining**:
   - `modelName` and `brand` are currently stored on-chain as strings.
   - Moving these descriptive attributes entirely into the decentralized Pinata IPFS JSON metadata (while keeping only the immutable 32-byte IPFS CID on-chain) would reduce string allocations and save **~60,000–80,000 gas**.
3. **Short String Compression**:
   - For serial numbers under 31 bytes, using a fixed `bytes32` instead of dynamic `string` avoids the auxiliary pointer slot in Solidity storage, saving **~20,000 gas**.
