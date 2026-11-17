/**
 * ReLife - Web3 Wallet Management Module (Ethers.js v6)
 * Handles MetaMask connection, network verification, account switching, contract binding & friendly error decoding.
 */

const SEPOLIA_CHAIN_ID = 11155111n;
const HARDHAT_CHAIN_ID = 31337n;

const ReLifeWallet = {
  provider: null,
  rawProvider: null,
  signer: null,
  account: null,
  chainId: null,
  contract: null,
  listeners: [],

  /**
   * Resolves the genuine Ethereum provider (handling file:// protocol and multi-wallet collisions).
   * @returns {Object|null} The resolved provider or null if none detected.
   */
  getEthereumProvider() {
    // 1. Detect if opened directly from local disk (file://)
    if (typeof window !== "undefined" && window.location && window.location.protocol === "file:") {
      return { isFileProtocol: true };
    }

    if (typeof window === "undefined" || !window.ethereum) {
      return null;
    }

    // 2. Handle multiple injected wallet extensions (EIP-5749 / window.ethereum.providers)
    if (window.ethereum.providers?.length) {
      // Find the genuine MetaMask provider among multiple extensions (e.g. Phantom, Coinbase, Brave)
      const metamask = window.ethereum.providers.find((p) => p.isMetaMask && !p.isPhantom);
      return metamask || window.ethereum.providers.find((p) => p.isMetaMask) || window.ethereum.providers[0];
    }

    return window.ethereum;
  },

  /**
   * Initializes the wallet provider and checks for an active session.
   */
  async init() {
    const rawProvider = this.getEthereumProvider();

    if (!rawProvider) {
      console.warn("MetaMask is not installed.");
      return false;
    }

    if (rawProvider.isFileProtocol) {
      console.warn("ReLife is currently loaded via file://. Browser wallet extensions cannot inject into local files. Please access the application at http://localhost:5000");
      return false;
    }

    this.rawProvider = rawProvider;
    this.provider = new ethers.BrowserProvider(rawProvider);

    // Listen for account changes
    if (rawProvider.on) {
      rawProvider.on("accountsChanged", async (accounts) => {
        console.log("Account changed:", accounts[0] || null);
        this.account = accounts[0] || null;
        if (this.account) {
          try {
            this.signer = await this.provider.getSigner();
            await this._attachContract();
          } catch (err) {
            console.warn("Signer update error:", err.message);
          }
        } else {
          this.signer = null;
          this.contract = null;
        }
        this._notifyListeners("accountChanged", this.account);
      });

      // Listen for chain/network changes
      rawProvider.on("chainChanged", (chainIdHex) => {
        console.log("Chain changed:", chainIdHex);
        window.location.reload();
      });
    }

    // Check if user is already connected without popping up the MetaMask prompt
    try {
      const accounts = await this.provider.listAccounts();
      if (accounts && accounts.length > 0) {
        this.signer = await this.provider.getSigner();
        this.account = await this.signer.getAddress();
        const network = await this.provider.getNetwork();
        this.chainId = network.chainId;
        await this._attachContract();
        this._notifyListeners("connected", { account: this.account, chainId: this.chainId });
      }
    } catch (err) {
      console.warn("Session check notice:", err.message);
    }

    return true;
  },

  /**
   * Prompts user to connect MetaMask wallet with robust error handling and multi-provider support.
   */
  async connect() {
    const rawProvider = this.getEthereumProvider();

    if (rawProvider?.isFileProtocol) {
      const fileErrMsg = "Cannot connect MetaMask from a local file (file:// protocol). For security reasons, browser wallet extensions only inject into web servers. Please run 'npm start' and open http://localhost:5000 in your browser.";
      alert(fileErrMsg);
      throw new Error(fileErrMsg);
    }

    if (!rawProvider) {
      const noProviderMsg = "MetaMask was not detected in your browser. Please install the MetaMask extension from https://metamask.io/download/ to interact with the ReLife platform.";
      alert(noProviderMsg);
      if (typeof window !== "undefined") {
        window.open("https://metamask.io/download/", "_blank");
      }
      throw new Error(noProviderMsg);
    }

    this.rawProvider = rawProvider;
    this.provider = new ethers.BrowserProvider(rawProvider);

    try {
      const accounts = await rawProvider.request({ method: "eth_requestAccounts" });
      if (!accounts || accounts.length === 0) {
        throw new Error("No accounts returned from MetaMask.");
      }
      this.account = accounts[0];
      this.signer = await this.provider.getSigner();

      const network = await this.provider.getNetwork();
      this.chainId = network.chainId;

      await this._attachContract();
      this._notifyListeners("connected", { account: this.account, chainId: this.chainId });

      return { account: this.account, chainId: this.chainId };
    } catch (err) {
      const friendlyMsg = this.parseError(err);
      console.error("Wallet connection failed:", err);
      throw new Error(friendlyMsg);
    }
  },

  /**
   * Connects to the deployed ReLife contract using contract-data.js configuration.
   */
  async _attachContract() {
    if (!window.RELIFE_CONFIG || !window.RELIFE_CONFIG.address || !window.RELIFE_CONFIG.abi) {
      console.error("RELIFE_CONFIG missing. Make sure contract-data.js is loaded.");
      return;
    }

    if (this.signer) {
      this.contract = new ethers.Contract(
        window.RELIFE_CONFIG.address,
        window.RELIFE_CONFIG.abi,
        this.signer
      );
    } else if (this.provider) {
      this.contract = new ethers.Contract(
        window.RELIFE_CONFIG.address,
        window.RELIFE_CONFIG.abi,
        this.provider
      );
    }
  },

  /**
   * Gets a read-only instance of the contract (works even if wallet is disconnected).
   */
  getReadOnlyContract() {
    if (!window.RELIFE_CONFIG) return null;
    const readProvider = this.provider || new ethers.JsonRpcProvider("https://rpc.sepolia.org");
    return new ethers.Contract(
      window.RELIFE_CONFIG.address,
      window.RELIFE_CONFIG.abi,
      readProvider
    );
  },

  /**
   * Requests network switch to Sepolia or Localhost if needed.
   */
  async switchToSepolia() {
    const rawProvider = this.rawProvider || this.getEthereumProvider();
    if (!rawProvider || !rawProvider.request) return;
    try {
      await rawProvider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0xaa36a7" }], // 11155111 in hex
      });
    } catch (switchError) {
      // 4902 indicates chain has not been added to MetaMask
      if (switchError.code === 4902) {
        await rawProvider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: "0xaa36a7",
              chainName: "Sepolia Testnet",
              rpcUrls: ["https://rpc.sepolia.org"],
              nativeCurrency: { name: "Sepolia ETH", symbol: "SEP", decimals: 18 },
              blockExplorerUrls: ["https://sepolia.etherscan.io"],
            },
          ],
        });
      } else {
        throw switchError;
      }
    }
  },

  /**
   * Decodes confusing Web3/MetaMask/RPC errors into friendly plain-English messages.
   * @param {Error|Object} err - The error caught from an ethers call or transaction.
   * @returns {string} Human-readable friendly error message.
   */
  parseError(err) {
    if (!err) return "An unknown error occurred.";

    // User cancelled in MetaMask
    if (err.code === 4001 || err.code === "ACTION_REJECTED" || err.message?.includes("rejected")) {
      return "Connection was cancelled in MetaMask. Please click 'Connect Wallet' and approve the prompt.";
    }

    // MetaMask request already pending (-32002)
    if (err.code === -32002 || err.message?.includes("already pending")) {
      return "A connection request is already pending in MetaMask. Please click on the MetaMask extension icon in your browser toolbar to approve it.";
    }

    // Insufficient gas or funds
    if (err.code === "INSUFFICIENT_FUNDS" || err.message?.includes("insufficient funds")) {
      return "Insufficient ETH in your wallet to cover gas fees. Please acquire Sepolia test ETH from a faucet.";
    }

    // Custom contract revert decoding
    const errorString = err.reason || err.data?.message || err.message || "";

    if (errorString.includes("AccessControlUnauthorizedAccount")) {
      return "Unauthorized Action: Your wallet does not hold the required role on-chain for this function.";
    }
    if (errorString.includes("ReLife__SerialAlreadyExists")) {
      return "Duplicate Serial Number: A product passport with this physical serial number already exists.";
    }
    if (errorString.includes("ReLife__ProductNotFound")) {
      return "Product Not Found: The queried Product ID does not exist in the blockchain registry.";
    }
    if (errorString.includes("ReLife__NotProductOwner")) {
      return "Ownership Permission Denied: Only the current registered owner can transfer this passport.";
    }
    if (errorString.includes("ReLife__ProductAlreadyRecycled")) {
      return "Lifecycle Frozen: This product passport has been decommissioned & recycled. No further changes are permitted.";
    }
    if (errorString.includes("ReLife__ZeroAddress")) {
      return "Invalid Address: Cannot execute operation with the zero address (0x000...).";
    }
    if (errorString.includes("ReLife__CannotTransferToSelf")) {
      return "Invalid Transfer: You cannot transfer product ownership to your own wallet address.";
    }
    if (errorString.includes("ReLife__InvalidWarrantyExpiry")) {
      return "Invalid Warranty Date: Warranty expiration timestamp must be in the future.";
    }
    if (errorString.includes("ReLife__EmptyString")) {
      return "Missing Input: One or more required text fields were left empty.";
    }
    if (errorString.includes("ReLife__InvalidStatusTransition")) {
      return "Invalid Status Move: The requested lifecycle status transition is not permitted by the state machine.";
    }
    if (errorString.includes("ReLife__UnauthorizedStatusUpdater")) {
      return "Unauthorized Status Update: Your connected wallet does not have permission to update this product status.";
    }
    if (errorString.includes("ReLife__ProductInRepair")) {
      return "Product In Repair: Ownership cannot be transferred while the device is actively undergoing certified repair.";
    }

    return err.reason || err.message || "Blockchain transaction failed. Please check your connection and parameters.";
  },

  /**
   * Converts an Ethers v6 Result or raw product struct into a clean, safe JavaScript object.
   * Converts BigInts to Number/String, formats dates, and safely handles strings.
   * @param {Object|Array} raw - The raw product returned by getProduct, getProductBySerial, or an event.
   * @returns {Object} Clean JS object with safe primitive types.
   */
  formatProduct(raw) {
    if (!raw) return null;

    // Helper to safely extract BigInt or Number to primitive Number
    const toNumber = (val) => {
      if (val === undefined || val === null) return 0;
      if (typeof val === "bigint") return Number(val);
      if (typeof val === "number") return val;
      const parsed = Number(val);
      return isNaN(parsed) ? 0 : parsed;
    };

    // Helper to safely resolve a string, guarding against Ethers Indexed objects, Proxies, and undefined
    const toStringSafe = (val) => {
      if (val === undefined || val === null) return "";
      if (typeof val === "string") return val;
      if (val && typeof val === "object") {
        // Guard against Ethers Indexed topic objects from event logs
        if (val._isIndexed && val.hash) return String(val.hash);
        if (typeof val.toString === "function" && val.toString !== Object.prototype.toString) {
          return val.toString();
        }
      }
      return String(val);
    };

    // Support both named struct keys and numeric positional indices
    const idNum = toNumber(raw.id !== undefined ? raw.id : raw[0]);
    const serialStr = toStringSafe(raw.serialNumber !== undefined ? raw.serialNumber : raw[1]);
    const modelStr = toStringSafe(raw.modelName !== undefined ? raw.modelName : raw[2]);
    const brandStr = toStringSafe(raw.brand !== undefined ? raw.brand : raw[3]);
    const mfgAddr = toStringSafe(raw.manufacturer !== undefined ? raw.manufacturer : raw[4]);
    const ownerAddr = toStringSafe(raw.currentOwner !== undefined ? raw.currentOwner : raw[5]);
    const mfgTime = toNumber(raw.manufacturingTimestamp !== undefined ? raw.manufacturingTimestamp : raw[6]);
    const metaUri = toStringSafe(raw.metadataURI !== undefined ? raw.metadataURI : raw[7]);
    const recycled = Boolean(raw.isRecycled !== undefined ? raw.isRecycled : raw[8]);

    const STATUS_MAP = ["Manufactured", "Sold", "InRepair", "Recycled"];
    const statusVal = toNumber(raw.status !== undefined ? raw.status : raw[9]);
    const statusName = STATUS_MAP[statusVal] || (recycled ? "Recycled" : "Manufactured");

    return {
      id: idNum,
      idStr: idNum.toString(),
      serialNumber: serialStr,
      modelName: modelStr,
      brand: brandStr,
      displayName: brandStr ? `${brandStr} ${modelStr}`.trim() : modelStr,
      manufacturer: mfgAddr,
      currentOwner: ownerAddr,
      manufacturingTimestamp: mfgTime,
      date: mfgTime > 0 ? new Date(mfgTime * 1000) : null,
      formattedDate: mfgTime > 0 ? new Date(mfgTime * 1000).toLocaleDateString() : "N/A",
      formattedDateTime: mfgTime > 0 ? new Date(mfgTime * 1000).toLocaleString() : "N/A",
      metadataURI: metaUri,
      isRecycled: recycled,
      status: statusVal,
      statusName: statusName,
    };
  },

  /**
   * Subscribes to wallet events (e.g., account changed, connected).
   */
  on(event, callback) {
    this.listeners.push({ event, callback });
  },

  _notifyListeners(event, data) {
    this.listeners
      .filter((l) => l.event === event)
      .forEach((l) => l.callback(data));
  },
};

window.ReLifeWallet = ReLifeWallet;
window.formatProduct = ReLifeWallet.formatProduct;
