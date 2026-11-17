// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "@openzeppelin/contracts/access/AccessControl.sol";

/**
 * @title ReLife - Digital Product Passport (DPP) Core Smart Contract
 * @notice Manages product passports, role-based lifecycle participants, repair records,
 *         ownership transfers, warranty tracking, and circular decommissioning.
 * @dev Inherits OpenZeppelin AccessControl for enterprise-grade role management.
 */
contract ReLife is AccessControl {
    // -------------------------------------------------------------
    // ROLES
    // -------------------------------------------------------------
    bytes32 public constant MANUFACTURER_ROLE = keccak256("MANUFACTURER_ROLE");
    bytes32 public constant REPAIR_CENTER_ROLE = keccak256("REPAIR_CENTER_ROLE");
    bytes32 public constant RECYCLER_ROLE = keccak256("RECYCLER_ROLE");

    // -------------------------------------------------------------
    // CUSTOM ERRORS (Gas-efficient and descriptive)
    // -------------------------------------------------------------
    error ReLife__ZeroAddress();
    error ReLife__EmptyString(string parameterName);
    error ReLife__SerialAlreadyExists(string serialNumber);
    error ReLife__ProductNotFound(uint256 productId);
    error ReLife__ProductAlreadyRecycled(uint256 productId);
    error ReLife__NotProductOwner(uint256 productId, address caller);
    error ReLife__CannotTransferToSelf();
    error ReLife__InvalidWarrantyExpiry(uint256 expiryTimestamp);
    error ReLife__UnauthorizedWarrantyIssuer(uint256 productId, address caller);
    error ReLife__InvalidStatusTransition(Status currentStatus, Status attemptedStatus);
    error ReLife__UnauthorizedStatusUpdater(uint256 productId, address caller);
    error ReLife__ProductInRepair(uint256 productId);
    error ReLife__TransferAlreadyPending(uint256 productId, address pendingOwner);
    error ReLife__NoTransferPending(uint256 productId);
    error ReLife__NotPendingOwner(uint256 productId, address caller);
    error ReLife__UnauthorizedManufacturer(uint256 productId, address caller);

    // -------------------------------------------------------------
    // DATA STRUCTURES
    // -------------------------------------------------------------
    enum Status {
        Manufactured,
        Sold,
        InRepair,
        Recycled
    }

    struct Product {
        uint256 id;
        string serialNumber;
        string modelName;
        string brand;
        address manufacturer;
        address currentOwner;
        uint256 manufacturingTimestamp;
        string metadataURI; // IPFS URI (e.g. ipfs://bafy...)
        bool isRecycled;
        Status status;
    }

    struct RepairRecord {
        uint256 id;             // 1-based sequential repair ID for this product
        uint256 productId;
        address repairCenter;   // Certified repair center address
        string repairType;      // e.g., "Screen Replacement", "Battery Service", "Firmware Fix"
        string description;     // Detailed report of service performed
        string serviceUri;      // IPFS URI with diagnostics report, receipts, or component proofs
        uint256 timestamp;      // Block timestamp when repair was logged
    }

    struct OwnershipRecord {
        address previousOwner;
        address newOwner;
        uint256 timestamp;
    }

    struct Warranty {
        uint256 warrantyStart;
        uint256 warrantyEnd;
        uint256 expiryTimestamp; // Preserved for backward compatibility (= warrantyEnd)
        string warrantyType;    // e.g., "Standard 2-Year", "Extended Protection"
        string termsUri;        // IPFS URI to policy terms & coverage document
        bool isActive;
    }

    struct RecyclingRecord {
        uint256 productId;
        address recycler;           // Authorized recycler address
        string recyclingFacility;   // e.g. "Circular Recovery Plant #4"
        string notes;               // e.g. "Materials reclaimed: 98% Aluminum, 85% Cobalt"
        string certificateUri;      // IPFS URI to official destruction/recycling certificate
        uint256 timestamp;          // Block timestamp when decommissioned
    }

    // -------------------------------------------------------------
    // STATE VARIABLES
    // -------------------------------------------------------------
    uint256 private _productIdCounter;

    // Mapping from product ID to Product struct
    mapping(uint256 => Product) internal _products;

    // Mapping from serial number string to existence flag (enforces global uniqueness)
    mapping(string => bool) private _serialNumberExists;

    // Mapping from serial number to product ID
    mapping(string => uint256) private _serialToProductId;

    // Mapping from product ID to array of RepairRecords (maintained in chronological order)
    mapping(uint256 => RepairRecord[]) private _productRepairs;

    // Mapping from product ID to array of OwnershipRecords (auditable chain of custody)
    mapping(uint256 => OwnershipRecord[]) private _ownershipHistory;

    // Mapping from product ID to designated pending owner (for 2-step ownership transfer)
    mapping(uint256 => address) private _pendingOwners;

    // Mapping from product ID to Warranty
    mapping(uint256 => Warranty) private _productWarranties;

    // Mapping from product ID to RecyclingRecord (end-of-life deconstruction record)
    mapping(uint256 => RecyclingRecord) private _productRecyclingRecords;

    // Mapping from product ID to keccak256 hash of the off-chain authenticity secret
    mapping(uint256 => bytes32) private _authenticityHashes;

    // -------------------------------------------------------------
    // EVENTS
    // -------------------------------------------------------------
    event ManufacturerRegistered(
        address indexed account,
        string name,
        address indexed registeredBy
    );

    event RepairCenterRegistered(
        address indexed account,
        string name,
        address indexed registeredBy
    );

    event RecyclerRegistered(
        address indexed account,
        string name,
        address indexed registeredBy
    );

    event ProductRegistered(
        uint256 indexed productId,
        string indexed serialNumber,
        address indexed manufacturer,
        string modelName,
        string brand,
        string metadataURI,
        uint256 timestamp
    );

    event RepairRecordAdded(
        uint256 indexed productId,
        uint256 indexed repairId,
        address indexed repairCenter,
        string repairType,
        string description,
        string serviceUri,
        uint256 timestamp
    );

    event OwnershipTransferred(
        uint256 indexed productId,
        address indexed previousOwner,
        address indexed newOwner,
        uint256 timestamp
    );

    event TransferInitiated(
        uint256 indexed productId,
        address indexed from,
        address indexed to,
        uint256 timestamp
    );

    event TransferAccepted(
        uint256 indexed productId,
        address indexed previousOwner,
        address indexed newOwner,
        uint256 timestamp
    );

    event TransferCancelled(
        uint256 indexed productId,
        address indexed owner,
        address indexed pendingOwner,
        uint256 timestamp
    );

    event WarrantyAdded(
        uint256 indexed productId,
        uint256 expiryTimestamp,
        string warrantyType,
        string termsUri,
        address indexed issuer
    );

    event ProductRecycled(
        uint256 indexed productId,
        address indexed recycler,
        string recyclingFacility,
        string notes,
        string certificateUri,
        uint256 timestamp
    );

    event StatusChanged(
        uint256 indexed productId,
        Status oldStatus,
        Status newStatus,
        address indexed actor,
        uint256 timestamp
    );

    // -------------------------------------------------------------
    // CONSTRUCTOR
    // -------------------------------------------------------------
    /**
     * @notice Initializes the ReLife contract, granting DEFAULT_ADMIN_ROLE to the deployer.
     */
    constructor() {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    // -------------------------------------------------------------
    // PARTICIPANT REGISTRATION (ADMIN ONLY)
    // -------------------------------------------------------------
    /**
     * @notice Authorizes a manufacturer wallet to mint and register product passports.
     * @param account The address of the manufacturer.
     * @param name The legal or commercial business name of the manufacturer.
     */
    function registerManufacturer(
        address account,
        string calldata name
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (account == address(0)) {
            revert ReLife__ZeroAddress();
        }
        if (bytes(name).length == 0) {
            revert ReLife__EmptyString("name");
        }

        grantRole(MANUFACTURER_ROLE, account);
        emit ManufacturerRegistered(account, name, msg.sender);
    }

    /**
     * @notice Authorizes a certified repair center wallet to append repair records.
     * @param account The address of the repair center.
     * @param name The legal or trade name of the repair center.
     */
    function registerRepairCenter(
        address account,
        string calldata name
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (account == address(0)) {
            revert ReLife__ZeroAddress();
        }
        if (bytes(name).length == 0) {
            revert ReLife__EmptyString("name");
        }

        grantRole(REPAIR_CENTER_ROLE, account);
        emit RepairCenterRegistered(account, name, msg.sender);
    }

    /**
     * @notice Authorizes a certified recycler wallet to decommission products at end-of-life.
     * @param account The address of the recycling facility.
     * @param name The legal facility or business name.
     */
    function registerRecycler(
        address account,
        string calldata name
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (account == address(0)) {
            revert ReLife__ZeroAddress();
        }
        if (bytes(name).length == 0) {
            revert ReLife__EmptyString("name");
        }

        grantRole(RECYCLER_ROLE, account);
        emit RecyclerRegistered(account, name, msg.sender);
    }

    // -------------------------------------------------------------
    // PRODUCT PASSPORT REGISTRATION (MANUFACTURER ONLY)
    // -------------------------------------------------------------
    /**
     * @notice Registers a new physical product on-chain with its digital passport.
     * @dev Only accounts with MANUFACTURER_ROLE can call this function.
     * @param serialNumber Globally unique serial number printed on the physical product / tag.
     * @param modelName Model name or identifier (e.g., "EcoBook Pro 14").
     * @param brand Brand name (e.g., "CircuTech").
     * @param metadataURI IPFS URI containing comprehensive metadata, bill of materials, carbon footprint.
     * @return productId The unique auto-incremented ID assigned to the new product.
     */
    function _registerProduct(
        string calldata serialNumber,
        string calldata modelName,
        string calldata brand,
        string calldata metadataURI
    ) internal returns (uint256) {
        if (bytes(serialNumber).length == 0) {
            revert ReLife__EmptyString("serialNumber");
        }
        if (bytes(modelName).length == 0) {
            revert ReLife__EmptyString("modelName");
        }
        if (bytes(brand).length == 0) {
            revert ReLife__EmptyString("brand");
        }
        if (bytes(metadataURI).length == 0) {
            revert ReLife__EmptyString("metadataURI");
        }
        if (_serialNumberExists[serialNumber]) {
            revert ReLife__SerialAlreadyExists(serialNumber);
        }

        // Increment counter so IDs start at 1
        _productIdCounter++;
        uint256 newProductId = _productIdCounter;

        _products[newProductId] = Product({
            id: newProductId,
            serialNumber: serialNumber,
            modelName: modelName,
            brand: brand,
            manufacturer: msg.sender,
            currentOwner: msg.sender, // Initially owned by the manufacturer until transferred
            manufacturingTimestamp: block.timestamp,
            metadataURI: metadataURI,
            isRecycled: false,
            status: Status.Manufactured
        });

        _serialNumberExists[serialNumber] = true;
        _serialToProductId[serialNumber] = newProductId;

        // Record initial origin ownership in audit trail
        _ownershipHistory[newProductId].push(
            OwnershipRecord({
                previousOwner: address(0),
                newOwner: msg.sender,
                timestamp: block.timestamp
            })
        );

        emit ProductRegistered(
            newProductId,
            serialNumber,
            msg.sender,
            modelName,
            brand,
            metadataURI,
            block.timestamp
        );

        return newProductId;
    }

    /**
     * @notice Registers a new physical product on-chain with its digital passport.
     * @dev Only accounts with MANUFACTURER_ROLE can call this function.
     * @param serialNumber Globally unique serial number printed on the physical product / tag.
     * @param modelName Model name or identifier (e.g., "EcoBook Pro 14").
     * @param brand Brand name (e.g., "CircuTech").
     * @param metadataURI IPFS URI containing comprehensive metadata, bill of materials, carbon footprint.
     * @return productId The unique auto-incremented ID assigned to the new product.
     */
    function registerProduct(
        string calldata serialNumber,
        string calldata modelName,
        string calldata brand,
        string calldata metadataURI
    ) external onlyRole(MANUFACTURER_ROLE) returns (uint256) {
        return _registerProduct(serialNumber, modelName, brand, metadataURI);
    }

    /**
     * @notice Registers a product passport along with its keccak256 authenticity hash.
     * @dev Restricted to MANUFACTURER_ROLE. Stores only the hash on-chain, never the raw secret.
     * @param serialNumber Globally unique physical serial number.
     * @param modelName Model name or identifier.
     * @param brand Brand name.
     * @param metadataURI IPFS metadata URI.
     * @param authenticityHash keccak256 hash of the off-chain secret (keccak256(secret)).
     * @return productId The unique ID assigned to the new product.
     */
    function registerProductWithSecret(
        string calldata serialNumber,
        string calldata modelName,
        string calldata brand,
        string calldata metadataURI,
        bytes32 authenticityHash
    ) external onlyRole(MANUFACTURER_ROLE) returns (uint256) {
        uint256 newProductId = _registerProduct(serialNumber, modelName, brand, metadataURI);
        if (authenticityHash != bytes32(0)) {
            _authenticityHashes[newProductId] = authenticityHash;
        }
        return newProductId;
    }

    /**
     * @notice Sets or updates the authenticity hash for a product passport.
     * @dev Restricted to the original manufacturer or contract admin before recycling.
     *      Stores only the hash; the raw secret is never sent to the contract.
     * @param productId The ID of the product.
     * @param authenticityHash The keccak256 hash of the off-chain secret.
     */
    function setAuthenticityHash(
        uint256 productId,
        bytes32 authenticityHash
    ) external {
        if (productId == 0 || productId > _productIdCounter) {
            revert ReLife__ProductNotFound(productId);
        }
        if (_products[productId].isRecycled || _products[productId].status == Status.Recycled) {
            revert ReLife__ProductAlreadyRecycled(productId);
        }
        bool isManufacturer = (msg.sender == _products[productId].manufacturer);
        bool isAdmin = hasRole(DEFAULT_ADMIN_ROLE, msg.sender);
        if (!isManufacturer && !isAdmin) {
            revert ReLife__UnauthorizedManufacturer(productId, msg.sender);
        }
        _authenticityHashes[productId] = authenticityHash;
    }

    // -------------------------------------------------------------
    // OWNERSHIP & WARRANTY MANAGEMENT
    // -------------------------------------------------------------
    /**
     * @notice Initiates a 2-step ownership transfer to a designated pending owner.
     * @dev Restricted strictly to the current owner of the product.
     *      Blocks if the product is Recycled, InRepair, or if a transfer is already pending.
     * @param productId The ID of the product.
     * @param to The recipient address being offered ownership.
     */
    function initiateTransfer(
        uint256 productId,
        address to
    ) external {
        if (productId == 0 || productId > _productIdCounter) {
            revert ReLife__ProductNotFound(productId);
        }
        if (_products[productId].isRecycled || _products[productId].status == Status.Recycled) {
            revert ReLife__ProductAlreadyRecycled(productId);
        }
        if (_products[productId].status == Status.InRepair) {
            revert ReLife__ProductInRepair(productId);
        }
        if (msg.sender != _products[productId].currentOwner) {
            revert ReLife__NotProductOwner(productId, msg.sender);
        }
        if (to == address(0)) {
            revert ReLife__ZeroAddress();
        }
        if (to == msg.sender) {
            revert ReLife__CannotTransferToSelf();
        }
        if (_pendingOwners[productId] != address(0)) {
            revert ReLife__TransferAlreadyPending(productId, _pendingOwners[productId]);
        }

        _pendingOwners[productId] = to;

        emit TransferInitiated(productId, msg.sender, to, block.timestamp);
    }

    /**
     * @notice Accepts a pending ownership transfer, finalizing the change of custody.
     * @dev Restricted strictly to the pendingOwner designated by initiateTransfer.
     *      Blocks if the product is Recycled, InRepair, or if no transfer is pending.
     * @param productId The ID of the product.
     */
    function acceptTransfer(uint256 productId) external {
        if (productId == 0 || productId > _productIdCounter) {
            revert ReLife__ProductNotFound(productId);
        }
        if (_products[productId].isRecycled || _products[productId].status == Status.Recycled) {
            revert ReLife__ProductAlreadyRecycled(productId);
        }
        if (_products[productId].status == Status.InRepair) {
            revert ReLife__ProductInRepair(productId);
        }
        address pending = _pendingOwners[productId];
        if (pending == address(0)) {
            revert ReLife__NoTransferPending(productId);
        }
        if (msg.sender != pending) {
            revert ReLife__NotPendingOwner(productId, msg.sender);
        }

        address previousOwner = _products[productId].currentOwner;
        _products[productId].currentOwner = msg.sender;
        _pendingOwners[productId] = address(0);

        // Auto-transition Manufactured -> Sold on initial sale/transfer
        if (_products[productId].status == Status.Manufactured) {
            _products[productId].status = Status.Sold;
            emit StatusChanged(
                productId,
                Status.Manufactured,
                Status.Sold,
                msg.sender,
                block.timestamp
            );
        }

        // Append to auditable ownership history
        _ownershipHistory[productId].push(
            OwnershipRecord({
                previousOwner: previousOwner,
                newOwner: msg.sender,
                timestamp: block.timestamp
            })
        );

        emit TransferAccepted(productId, previousOwner, msg.sender, block.timestamp);
        emit OwnershipTransferred(productId, previousOwner, msg.sender, block.timestamp);
    }

    /**
     * @notice Cancels an active pending transfer, keeping ownership with current owner.
     * @dev Restricted strictly to the current owner of the product.
     *      Blocks if no transfer is pending.
     * @param productId The ID of the product.
     */
    function cancelTransfer(uint256 productId) external {
        if (productId == 0 || productId > _productIdCounter) {
            revert ReLife__ProductNotFound(productId);
        }
        if (msg.sender != _products[productId].currentOwner) {
            revert ReLife__NotProductOwner(productId, msg.sender);
        }
        address pending = _pendingOwners[productId];
        if (pending == address(0)) {
            revert ReLife__NoTransferPending(productId);
        }

        _pendingOwners[productId] = address(0);

        emit TransferCancelled(productId, msg.sender, pending, block.timestamp);
    }

    /**
     * @notice Retrieves the designated pending owner address for a product passport.
     * @param productId The ID of the product.
     * @return Address of the pending owner, or address(0) if no transfer is pending.
     */
    function getPendingOwner(uint256 productId) external view returns (address) {
        if (productId == 0 || productId > _productIdCounter) {
            revert ReLife__ProductNotFound(productId);
        }
        return _pendingOwners[productId];
    }

    /**
     * @notice Transfers ownership of a product passport to a new wallet address.
     * @dev Restricted strictly to the current owner of the product.
     * @param productId The ID of the product.
     * @param newOwner The destination address receiving ownership.
     */
    function transferOwnership(
        uint256 productId,
        address newOwner
    ) external {
        if (productId == 0 || productId > _productIdCounter) {
            revert ReLife__ProductNotFound(productId);
        }
        if (_products[productId].isRecycled || _products[productId].status == Status.Recycled) {
            revert ReLife__ProductAlreadyRecycled(productId);
        }
        if (_products[productId].status == Status.InRepair) {
            revert ReLife__ProductInRepair(productId);
        }
        if (msg.sender != _products[productId].currentOwner) {
            revert ReLife__NotProductOwner(productId, msg.sender);
        }
        if (newOwner == address(0)) {
            revert ReLife__ZeroAddress();
        }
        if (newOwner == msg.sender) {
            revert ReLife__CannotTransferToSelf();
        }
        if (_pendingOwners[productId] != address(0)) {
            revert ReLife__TransferAlreadyPending(productId, _pendingOwners[productId]);
        }

        address previousOwner = msg.sender;
        _products[productId].currentOwner = newOwner;

        // Auto-transition Manufactured -> Sold on initial sale/transfer
        if (_products[productId].status == Status.Manufactured) {
            _products[productId].status = Status.Sold;
            emit StatusChanged(
                productId,
                Status.Manufactured,
                Status.Sold,
                msg.sender,
                block.timestamp
            );
        }

        // Append to auditable ownership history
        _ownershipHistory[productId].push(
            OwnershipRecord({
                previousOwner: previousOwner,
                newOwner: newOwner,
                timestamp: block.timestamp
            })
        );

        emit OwnershipTransferred(
            productId,
            previousOwner,
            newOwner,
            block.timestamp
        );
    }

    /**
     * @notice Internal helper to attach or update warranty records.
     * @param productId The ID of the product.
     * @param warrantyStart UNIX timestamp when coverage begins.
     * @param warrantyEnd UNIX timestamp when coverage expires.
     * @param warrantyType Title/tier (e.g. "Standard 2-Year Limited", "Care+").
     * @param termsUri IPFS URI containing policy documents and terms.
     */
    function _setWarranty(
        uint256 productId,
        uint256 warrantyStart,
        uint256 warrantyEnd,
        string calldata warrantyType,
        string calldata termsUri
    ) internal {
        if (productId == 0 || productId > _productIdCounter) {
            revert ReLife__ProductNotFound(productId);
        }
        if (_products[productId].isRecycled || _products[productId].status == Status.Recycled) {
            revert ReLife__ProductAlreadyRecycled(productId);
        }

        bool isManufacturer = (msg.sender == _products[productId].manufacturer);
        bool isAdmin = hasRole(DEFAULT_ADMIN_ROLE, msg.sender);
        bool isOwner = (msg.sender == _products[productId].currentOwner);
        if (!isManufacturer && !isAdmin && !isOwner) {
            revert ReLife__UnauthorizedWarrantyIssuer(productId, msg.sender);
        }

        if (warrantyEnd <= block.timestamp || warrantyEnd <= warrantyStart) {
            revert ReLife__InvalidWarrantyExpiry(warrantyEnd);
        }
        if (bytes(warrantyType).length == 0) {
            revert ReLife__EmptyString("warrantyType");
        }

        _productWarranties[productId] = Warranty({
            warrantyStart: warrantyStart,
            warrantyEnd: warrantyEnd,
            expiryTimestamp: warrantyEnd,
            warrantyType: warrantyType,
            termsUri: termsUri,
            isActive: true
        });

        emit WarrantyAdded(
            productId,
            warrantyEnd,
            warrantyType,
            termsUri,
            msg.sender
        );
    }

    /**
     * @notice Attaches or updates product warranty details with explicit start and end timestamps.
     * @dev Restricted to the original manufacturer, authorized seller (current owner), or contract admin.
     * @param productId The ID of the product.
     * @param warrantyStart Timestamp when coverage begins.
     * @param warrantyEnd Future UNIX timestamp when warranty expires.
     * @param warrantyType Title/tier (e.g. "Standard 2-Year Limited", "Care+").
     * @param termsUri IPFS URI containing policy documents and terms.
     */
    function setProductWarranty(
        uint256 productId,
        uint256 warrantyStart,
        uint256 warrantyEnd,
        string calldata warrantyType,
        string calldata termsUri
    ) external {
        _setWarranty(productId, warrantyStart, warrantyEnd, warrantyType, termsUri);
    }

    /**
     * @notice Attaches or updates product warranty details defaulting start to current block timestamp.
     * @dev Restricted to the original manufacturer, authorized seller (current owner), or contract admin.
     * @param productId The ID of the product.
     * @param expiryTimestamp Future UNIX timestamp when warranty expires.
     * @param warrantyType Title/tier (e.g. "Standard 2-Year Limited", "Care+").
     * @param termsUri IPFS URI containing policy documents and terms.
     */
    function addWarranty(
        uint256 productId,
        uint256 expiryTimestamp,
        string calldata warrantyType,
        string calldata termsUri
    ) external {
        _setWarranty(productId, block.timestamp, expiryTimestamp, warrantyType, termsUri);
    }

    // -------------------------------------------------------------
    // REPAIR & MAINTENANCE MANAGEMENT (REPAIR CENTER ONLY)
    // -------------------------------------------------------------
    /**
     * @notice Appends an immutable maintenance or repair record to a product passport.
     * @dev Only accounts with REPAIR_CENTER_ROLE can call this function.
     * @param productId The ID of the product receiving service.
     * @param repairType Short category/title (e.g. "Screen Replacement", "Battery Upgrade").
     * @param description Detailed technical breakdown of parts replaced or diagnostics performed.
     * @param serviceUri IPFS URI pointing to technician notes, parts receipts, or diagnostic logs.
     * @return repairId Sequential repair record index for this product passport.
     */
    function addRepairRecord(
        uint256 productId,
        string calldata repairType,
        string calldata description,
        string calldata serviceUri
    ) external onlyRole(REPAIR_CENTER_ROLE) returns (uint256) {
        if (productId == 0 || productId > _productIdCounter) {
            revert ReLife__ProductNotFound(productId);
        }
        if (_products[productId].isRecycled || _products[productId].status == Status.Recycled) {
            revert ReLife__ProductAlreadyRecycled(productId);
        }
        if (bytes(repairType).length == 0) {
            revert ReLife__EmptyString("repairType");
        }
        if (bytes(description).length == 0) {
            revert ReLife__EmptyString("description");
        }
        if (bytes(serviceUri).length == 0) {
            revert ReLife__EmptyString("serviceUri");
        }

        uint256 repairId = _productRepairs[productId].length + 1;

        _productRepairs[productId].push(
            RepairRecord({
                id: repairId,
                productId: productId,
                repairCenter: msg.sender,
                repairType: repairType,
                description: description,
                serviceUri: serviceUri,
                timestamp: block.timestamp
            })
        );

        emit RepairRecordAdded(
            productId,
            repairId,
            msg.sender,
            repairType,
            description,
            serviceUri,
            block.timestamp
        );

        return repairId;
    }

    // -------------------------------------------------------------
    // CIRCULAR RECYCLING & DECOMMISSIONING (RECYCLER ONLY)
    // -------------------------------------------------------------
    /**
     * @notice Permanently decommissions a product at its end-of-life and logs circular recycling metrics.
     * @dev Callable exclusively by accounts holding RECYCLER_ROLE.
     *      Irreversible: permanently locks the passport against any further transfers, repairs, or warranty edits.
     * @param productId The product passport ID to decommission.
     * @param recyclingFacility Official certified facility or plant name.
     * @param notes Summary of materials recovered, e-waste handling, or disassembly metrics.
     * @param certificateUri IPFS URI pointing to certified destruction or material reclamation manifest.
     */
    function addRecyclingRecord(
        uint256 productId,
        string calldata recyclingFacility,
        string calldata notes,
        string calldata certificateUri
    ) external onlyRole(RECYCLER_ROLE) {
        if (productId == 0 || productId > _productIdCounter) {
            revert ReLife__ProductNotFound(productId);
        }
        if (_products[productId].isRecycled || _products[productId].status == Status.Recycled) {
            revert ReLife__ProductAlreadyRecycled(productId);
        }
        if (bytes(recyclingFacility).length == 0) {
            revert ReLife__EmptyString("recyclingFacility");
        }
        if (bytes(notes).length == 0) {
            revert ReLife__EmptyString("notes");
        }

        // Permanently set isRecycled flag and terminal status
        _products[productId].isRecycled = true;
        Status oldStatus = _products[productId].status;
        _products[productId].status = Status.Recycled;

        _productRecyclingRecords[productId] = RecyclingRecord({
            productId: productId,
            recycler: msg.sender,
            recyclingFacility: recyclingFacility,
            notes: notes,
            certificateUri: certificateUri,
            timestamp: block.timestamp
        });

        emit ProductRecycled(
            productId,
            msg.sender,
            recyclingFacility,
            notes,
            certificateUri,
            block.timestamp
        );

        if (oldStatus != Status.Recycled) {
            emit StatusChanged(
                productId,
                oldStatus,
                Status.Recycled,
                msg.sender,
                block.timestamp
            );
        }
    }

    // -------------------------------------------------------------
    // PRODUCT STATUS STATE MACHINE (LIFECYCLE MANAGEMENT)
    // -------------------------------------------------------------
    /**
     * @notice Transitions the lifecycle status of a product passport.
     * @dev Enforces valid state machine moves:
     *      - Manufactured -> Sold
     *      - Sold -> InRepair -> Sold
     *      - Any non-Recycled -> Recycled
     *      Recycled is permanent/terminal: no transitions out of Recycled.
     * @param productId The ID of the product.
     * @param newStatus The target Status to transition into.
     */
    function updateProductStatus(
        uint256 productId,
        Status newStatus
    ) external {
        if (productId == 0 || productId > _productIdCounter) {
            revert ReLife__ProductNotFound(productId);
        }
        Product storage product = _products[productId];
        Status currentStatus = product.status;

        // Recycled is terminal - no transitions allowed after Recycled
        if (currentStatus == Status.Recycled || product.isRecycled) {
            revert ReLife__ProductAlreadyRecycled(productId);
        }

        // Validate allowed state machine transitions
        bool isValidTransition = false;

        if (currentStatus == Status.Manufactured) {
            if (newStatus == Status.Sold || newStatus == Status.Recycled) {
                isValidTransition = true;
            }
        } else if (currentStatus == Status.Sold) {
            if (newStatus == Status.InRepair || newStatus == Status.Recycled) {
                isValidTransition = true;
            }
        } else if (currentStatus == Status.InRepair) {
            if (newStatus == Status.Sold || newStatus == Status.Recycled) {
                isValidTransition = true;
            }
        }

        if (!isValidTransition) {
            revert ReLife__InvalidStatusTransition(currentStatus, newStatus);
        }

        // Validate role authorization for the target status
        if (newStatus == Status.Sold) {
            bool isOwner = (msg.sender == product.currentOwner);
            bool isManufacturer = (msg.sender == product.manufacturer);
            bool isRepairCenter = hasRole(REPAIR_CENTER_ROLE, msg.sender);
            bool isAdmin = hasRole(DEFAULT_ADMIN_ROLE, msg.sender);

            if (!isOwner && !isManufacturer && !isRepairCenter && !isAdmin) {
                revert ReLife__UnauthorizedStatusUpdater(productId, msg.sender);
            }
        } else if (newStatus == Status.InRepair) {
            bool isRepairCenter = hasRole(REPAIR_CENTER_ROLE, msg.sender);
            bool isOwner = (msg.sender == product.currentOwner);
            bool isAdmin = hasRole(DEFAULT_ADMIN_ROLE, msg.sender);

            if (!isRepairCenter && !isOwner && !isAdmin) {
                revert ReLife__UnauthorizedStatusUpdater(productId, msg.sender);
            }
        } else if (newStatus == Status.Recycled) {
            bool isRecycler = hasRole(RECYCLER_ROLE, msg.sender);
            bool isAdmin = hasRole(DEFAULT_ADMIN_ROLE, msg.sender);

            if (!isRecycler && !isAdmin) {
                revert ReLife__UnauthorizedStatusUpdater(productId, msg.sender);
            }
            product.isRecycled = true;
        }

        product.status = newStatus;

        emit StatusChanged(
            productId,
            currentStatus,
            newStatus,
            msg.sender,
            block.timestamp
        );
    }

    // -------------------------------------------------------------
    // VIEW / VERIFICATION FUNCTIONS (PUBLIC)
    // -------------------------------------------------------------
    /**
     * @notice Retrieves full details for a product passport by ID.
     * @dev Reverts if product does not exist.
     * @param productId The ID of the product.
     */
    function getProduct(uint256 productId) external view returns (Product memory) {
        if (productId == 0 || productId > _productIdCounter) {
            revert ReLife__ProductNotFound(productId);
        }
        return _products[productId];
    }

    /**
     * @notice Returns current lifecycle status of a product passport.
     * @param productId The product ID to query.
     */
    function getProductStatus(uint256 productId) external view returns (Status) {
        if (productId == 0 || productId > _productIdCounter) {
            revert ReLife__ProductNotFound(productId);
        }
        return _products[productId].status;
    }

    /**
     * @notice Looks up a product passport by its unique serial number.
     * @dev Reverts if serial number is not registered.
     * @param serialNumber The physical serial number.
     */
    function getProductBySerial(
        string calldata serialNumber
    ) external view returns (Product memory) {
        if (!_serialNumberExists[serialNumber]) {
            revert ReLife__ProductNotFound(0);
        }
        uint256 productId = _serialToProductId[serialNumber];
        return _products[productId];
    }

    /**
     * @notice Returns complete repair history for a product passport in chronological order.
     * @param productId The product ID to query.
     */
    function getProductHistory(
        uint256 productId
    ) external view returns (RepairRecord[] memory) {
        if (productId == 0 || productId > _productIdCounter) {
            revert ReLife__ProductNotFound(productId);
        }
        return _productRepairs[productId];
    }

    /**
     * @notice Returns complete auditable chain of custody / ownership history for a product.
     * @param productId The product ID to query.
     */
    function getOwnershipHistory(
        uint256 productId
    ) external view returns (OwnershipRecord[] memory) {
        if (productId == 0 || productId > _productIdCounter) {
            revert ReLife__ProductNotFound(productId);
        }
        return _ownershipHistory[productId];
    }

    /**
     * @notice Returns whether the product currently has a valid, unexpired warranty.
     * @dev Uses block.timestamp to check if current time is within [warrantyStart, warrantyEnd).
     * @param productId The product ID to query.
     */
    function isWarrantyValid(uint256 productId) public view returns (bool) {
        if (productId == 0 || productId > _productIdCounter) {
            revert ReLife__ProductNotFound(productId);
        }
        Product memory p = _products[productId];
        if (p.isRecycled || p.status == Status.Recycled) {
            return false;
        }
        Warranty memory w = _productWarranties[productId];
        if (!w.isActive || w.warrantyEnd == 0) {
            return false;
        }
        return (block.timestamp >= w.warrantyStart && block.timestamp < w.warrantyEnd);
    }

    /**
     * @notice Returns warranty information and calculates if expired based on current block timestamp.
     * @param productId The product ID to query.
     */
    function getWarranty(
        uint256 productId
    ) external view returns (Warranty memory warranty, bool isExpired) {
        if (productId == 0 || productId > _productIdCounter) {
            revert ReLife__ProductNotFound(productId);
        }
        Warranty memory w = _productWarranties[productId];
        bool expired = (w.warrantyEnd > 0 && block.timestamp >= w.warrantyEnd);
        return (w, expired);
    }

    /**
     * @notice Retrieves end-of-life recycling record for a decommissioned product.
     * @param productId The product ID to query.
     */
    function getRecyclingRecord(
        uint256 productId
    ) external view returns (RecyclingRecord memory) {
        if (productId == 0 || productId > _productIdCounter) {
            revert ReLife__ProductNotFound(productId);
        }
        return _productRecyclingRecords[productId];
    }

    /**
     * @notice Returns total number of repair records logged for a product.
     * @param productId The product ID to query.
     */
    function getRepairCount(uint256 productId) external view returns (uint256) {
        if (productId == 0 || productId > _productIdCounter) {
            revert ReLife__ProductNotFound(productId);
        }
        return _productRepairs[productId].length;
    }

    /**
     * @notice Safe verification method designed for QR code scanning & frontend display.
     * @dev Returns isValid = false instead of reverting when an unknown ID is queried.
     * @param productId The ID of the product to verify.
     */
    function verifyProduct(
        uint256 productId
    )
        external
        view
        returns (
            bool isValid,
            address manufacturer,
            string memory modelName,
            string memory brand,
            string memory serialNumber,
            address currentOwner,
            uint256 manufacturingTimestamp,
            string memory metadataURI,
            bool isRecycled
        )
    {
        if (productId == 0 || productId > _productIdCounter) {
            return (
                false,
                address(0),
                "",
                "",
                "",
                address(0),
                0,
                "",
                false
            );
        }

        Product memory p = _products[productId];
        return (
            true,
            p.manufacturer,
            p.modelName,
            p.brand,
            p.serialNumber,
            p.currentOwner,
            p.manufacturingTimestamp,
            p.metadataURI,
            p.isRecycled
        );
    }

    /**
     * @notice Returns total number of registered products.
     */
    function getTotalProducts() external view returns (uint256) {
        return _productIdCounter;
    }

    /**
     * @notice Checks if a serial number has already been registered.
     * @param serialNumber The serial number to check.
     */
    function isSerialRegistered(
        string calldata serialNumber
    ) external view returns (bool) {
        return _serialNumberExists[serialNumber];
    }

    /**
     * @notice Verifies an off-chain physical authenticity secret against the on-chain keccak256 hash.
     * @dev Free view call (zero gas). Compares keccak256(bytes(secret)) with the stored hash.
     *      The raw secret is never stored on-chain or emitted in events.
     * @param productId The ID of the product to verify.
     * @param secret The plaintext secret from the physical QR / tag.
     * @return isAuthentic True if keccak256(bytes(secret)) matches stored hash, false otherwise.
     */
    function verifySecret(
        uint256 productId,
        string calldata secret
    ) external view returns (bool isAuthentic) {
        if (productId == 0 || productId > _productIdCounter) {
            return false;
        }
        bytes32 storedHash = _authenticityHashes[productId];
        if (storedHash == bytes32(0) || bytes(secret).length == 0) {
            return false;
        }
        return (keccak256(bytes(secret)) == storedHash);
    }

    /**
     * @notice Returns the keccak256 authenticity hash stored on-chain for a product passport.
     * @param productId The ID of the product.
     * @return The 32-byte keccak256 hash (or bytes32(0) if not set).
     */
    function getAuthenticityHash(uint256 productId) external view returns (bytes32) {
        if (productId == 0 || productId > _productIdCounter) {
            revert ReLife__ProductNotFound(productId);
        }
        return _authenticityHashes[productId];
    }
}
