/**
 * ReLife - Web3 Wallet Management Module (Ethers.js v6)
 * Handles MetaMask connection, network verification, account switching, contract binding & friendly error decoding.
 */

const SEPOLIA_CHAIN_ID = 11155111;
const SEPOLIA_CHAIN_HEX = "0xaa36a7";
const HARDHAT_CHAIN_ID = 31337;
const HARDHAT_CHAIN_HEX = "0x7a69";

const ReLifeWallet = {
  provider: null,
  rawProvider: null,
  signer: null,
  account: null,
  chainId: null,
  contract: null,
  listeners: [],

  SEPOLIA_CHAIN_ID: 11155111,
  SEPOLIA_CHAIN_HEX: "0xaa36a7",
  HARDHAT_CHAIN_ID: 31337,
  HARDHAT_CHAIN_HEX: "0x7a69",

  /**
   * Safely normalizes any chainId (hex string "0xaa36a7", BigInt 11155111n, or Number 11155111) to a standard Number.
   * @param {string|bigint|number|null} [id] - Optional chainId to normalize, defaults to this.chainId.
   * @returns {number|null}
   */
  getNormalizedChainId(id) {
    const raw = id !== undefined ? id : this.chainId;
    if (raw === null || raw === undefined) return null;
    try {
      if (typeof raw === "string" && raw.startsWith("0x")) {
        return parseInt(raw, 16);
      }
      return Number(raw);
    } catch (_) {
      return null;
    }
  },

  /**
   * Returns whether the connected wallet is on a supported network (Sepolia or Hardhat testnet).
   */
  get isCorrectNetwork() {
    const id = this.getNormalizedChainId();
    if (!id) return false;
    const targetChainId = window.RELIFE_CONFIG?.chainId
      ? Number(window.RELIFE_CONFIG.chainId)
      : this.SEPOLIA_CHAIN_ID;
    return id === targetChainId || id === this.HARDHAT_CHAIN_ID;
  },

  /**
   * Returns whether the connected wallet is strictly on Sepolia (11155111).
   */
  get isSepolia() {
    return this.getNormalizedChainId() === this.SEPOLIA_CHAIN_ID;
  },

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
            this.updateHeaderRoleBadge(this.account);
          } catch (err) {
            console.warn("Signer update error:", err.message);
          }
        } else {
          this.signer = null;
          this.contract = null;
          this.updateHeaderRoleBadge(null);
        }
        this._notifyListeners("accountChanged", this.account);
      });

      // Listen for chain/network changes live
      rawProvider.on("chainChanged", async (chainIdHex) => {
        console.log("Chain changed:", chainIdHex);
        this.chainId = chainIdHex;
        if (this.rawProvider) {
          try {
            this.provider = new ethers.BrowserProvider(this.rawProvider);
            if (this.account) {
              this.signer = await this.provider.getSigner();
              await this._attachContract();
            }
          } catch (_) {}
        }
        this._notifyListeners("chainChanged", this.chainId);
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
        this.updateHeaderRoleBadge(this.account);
        this._notifyListeners("connected", { account: this.account, chainId: this.chainId });
      } else {
        // Query current network even if no accounts are connected yet
        try {
          const rawChain = await rawProvider.request({ method: "eth_chainId" });
          if (rawChain) {
            this.chainId = rawChain;
          }
        } catch (_) {}
      }
    } catch (err) {
      console.warn("Session check notice:", err.message);
    }

    // Check pause status and render global banner if paused
    try {
      await this.checkAndRenderPauseBanner();
    } catch (_) {}

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
      this.updateHeaderRoleBadge(this.account);
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

  _readProvider: null,

  /**
   * Returns a resilient read-only provider for fast blockchain reads without waiting on MetaMask.
   */
  getReadOnlyProvider() {
    if (this._readProvider) return this._readProvider;

    const endpoints = [
      window.RELIFE_CONFIG?.readRpcUrl,
      "https://ethereum-sepolia-rpc.publicnode.com",
      "https://rpc2.sepolia.org",
      "https://gateway.tenderly.co/public/sepolia",
      "https://rpc.sepolia.org"
    ].filter(Boolean);

    const primaryUrl = endpoints[0];
    try {
      this._readProvider = new ethers.JsonRpcProvider(primaryUrl, 11155111, {
        staticNetwork: ethers.Network.from(11155111)
      });
      return this._readProvider;
    } catch (_) {
      this._readProvider = new ethers.JsonRpcProvider("https://rpc2.sepolia.org", 11155111);
      return this._readProvider;
    }
  },

  /**
   * Gets a read-only instance of the contract (works even if wallet is disconnected or MetaMask RPC is slow).
   */
  getReadOnlyContract() {
    if (!window.RELIFE_CONFIG) return null;
    const readProvider = this.getReadOnlyProvider();
    return new ethers.Contract(
      window.RELIFE_CONFIG.address,
      window.RELIFE_CONFIG.abi,
      readProvider
    );
  },

  /**
   * Queries on-chain roles for a target address using the resilient read provider.
   * @param {string} [account] - Address to query (defaults to connected account)
   */
  async getUserRoles(account) {
    const target = account || this.account;
    if (!target) {
      return { isAdmin: false, isManufacturer: false, isRepairCenter: false, isRecycler: false, roles: [], primaryRole: "Public User" };
    }

    try {
      const contract = this.getReadOnlyContract();
      if (!contract) {
        return { isAdmin: false, isManufacturer: false, isRepairCenter: false, isRecycler: false, roles: [], primaryRole: "Public User" };
      }

      const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
      const MANUFACTURER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("MANUFACTURER_ROLE"));
      const REPAIR_CENTER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("REPAIR_CENTER_ROLE"));
      const RECYCLER_ROLE = ethers.keccak256(ethers.toUtf8Bytes("RECYCLER_ROLE"));

      // 4-second timeout per role query so UI never blocks
      const queryRole = async (hash) => {
        try {
          const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 4000));
          return await Promise.race([contract.hasRole(hash, target), timeout]);
        } catch (_) {
          return false;
        }
      };

      const [isAdmin, isManufacturer, isRepairCenter, isRecycler] = await Promise.all([
        queryRole(DEFAULT_ADMIN_ROLE),
        queryRole(MANUFACTURER_ROLE),
        queryRole(REPAIR_CENTER_ROLE),
        queryRole(RECYCLER_ROLE)
      ]);

      const roles = [];
      if (isAdmin) roles.push("Admin");
      if (isManufacturer) roles.push("Manufacturer");
      if (isRepairCenter) roles.push("Repair Center");
      if (isRecycler) roles.push("Recycler");

      const primaryRole = roles.length > 0 ? roles.join(" / ") : "Public User";
      return { isAdmin, isManufacturer, isRepairCenter, isRecycler, roles, primaryRole };
    } catch (_) {
      return { isAdmin: false, isManufacturer: false, isRepairCenter: false, isRecycler: false, roles: [], primaryRole: "Public User" };
    }
  },

  /**
   * Updates the role badge in the navigation header across all portals.
   */
  async updateHeaderRoleBadge(account) {
    const target = account || this.account;
    const badgeEl = document.getElementById("headerRoleBadge") || document.getElementById("userRoleBadge");
    if (!badgeEl) return;

    if (!target) {
      badgeEl.style.display = "none";
      return;
    }

    badgeEl.style.display = "inline-flex";
    badgeEl.style.alignItems = "center";
    badgeEl.className = "badge";
    badgeEl.style.fontSize = "0.78rem";
    badgeEl.style.padding = "0.3rem 0.65rem";
    badgeEl.style.fontWeight = "600";
    badgeEl.style.borderRadius = "9999px";

    const { isAdmin, isManufacturer, isRepairCenter, isRecycler } = await this.getUserRoles(target);

    if (isAdmin) {
      badgeEl.style.background = "linear-gradient(135deg, #f59e0b, #d97706)";
      badgeEl.style.color = "#ffffff";
      badgeEl.innerHTML = "👑 Admin";
    } else if (isManufacturer) {
      badgeEl.style.background = "linear-gradient(135deg, #0284c7, #0369a1)";
      badgeEl.style.color = "#ffffff";
      badgeEl.innerHTML = "🏭 Manufacturer";
    } else if (isRepairCenter) {
      badgeEl.style.background = "linear-gradient(135deg, #ea580c, #c2410c)";
      badgeEl.style.color = "#ffffff";
      badgeEl.innerHTML = "🔧 Repair Center";
    } else if (isRecycler) {
      badgeEl.style.background = "linear-gradient(135deg, #10b981, #059669)";
      badgeEl.style.color = "#ffffff";
      badgeEl.innerHTML = "♻️ Recycler";
    } else {
      badgeEl.style.background = "rgba(148, 163, 184, 0.18)";
      badgeEl.style.color = "#cbd5e1";
      badgeEl.style.border = "1px solid rgba(148, 163, 184, 0.3)";
      badgeEl.innerHTML = "👤 Public User";
    }
  },

  /**
   * Standardized component rendering an informative "Access Denied" state.
   * Displays the connected address (short), required role, real admin address, clear steps, and copy button.
   */
  renderAccessDeniedCard(containerOrId, { requiredRoleName, requiredRoleCode, userAddress, adminAddress }) {
    const el = typeof containerOrId === "string" ? document.getElementById(containerOrId) : containerOrId;
    if (!el) return;

    const user = userAddress || this.account || "0x0000...0000";
    const shortUser = user.length > 10 ? `${user.slice(0, 6)}...${user.slice(-4)}` : user;
    const admin = adminAddress || window.RELIFE_CONFIG?.deployer || "0xd75dC45aEDDa24Bc3d3e92B03D75b828f473530E";
    const shortAdmin = admin.length > 10 ? `${admin.slice(0, 6)}...${admin.slice(-4)}` : admin;

    el.innerHTML = `
      <div class="card access-denied-box" style="border: 1px solid var(--danger); background: rgba(239, 68, 68, 0.06); padding: 2rem 1.5rem; text-align: center; border-radius: var(--radius-lg); margin-bottom: 2rem;">
        <div style="font-size: 2.5rem; margin-bottom: 0.5rem;">🚫</div>
        <h2 style="color: var(--danger); font-size: 1.35rem; margin-bottom: 0.5rem; font-weight: 700;">
          Access Denied: ${requiredRoleName || "Authorized Role Required"}
        </h2>
        <p style="color: var(--text-muted); max-width: 640px; margin: 0 auto 1.25rem auto; font-size: 0.95rem; line-height: 1.5;">
          Connected wallet <code style="color: #f1f5f9; background: rgba(15, 23, 42, 0.8); padding: 0.25rem 0.55rem; border-radius: 4px; font-weight: 600; font-size: 0.88rem;">${shortUser}</code> does not hold the <strong>${requiredRoleCode || requiredRoleName}</strong> on the ReLife Sepolia contract.
        </p>

        <div style="display: flex; justify-content: center; gap: 0.75rem; margin-bottom: 1.5rem; flex-wrap: wrap;">
          <button type="button" class="btn btn-outline btn-copy-my-address" style="padding: 0.45rem 1.1rem; font-size: 0.85rem; display: inline-flex; align-items: center; gap: 0.35rem;">
            📋 Copy My Address
          </button>
        </div>

        <div style="background: rgba(15, 23, 42, 0.75); border: 1px solid var(--dark-border); border-radius: var(--radius-md); max-width: 640px; margin: 0 auto; padding: 1.25rem; text-align: left; font-size: 0.875rem;">
          <div style="font-weight: 600; color: #f8fafc; margin-bottom: 0.65rem; display: flex; align-items: center; gap: 0.4rem;">
            <span>💡 How to Get Access (Onboarding Steps):</span>
          </div>
          <ol style="margin: 0; padding-left: 1.25rem; color: #cbd5e1; line-height: 1.7;">
            <li>Click <strong>Copy My Address</strong> above to copy your full address to your clipboard.</li>
            <li>Send your address to the contract administrator:
              <div style="margin: 0.35rem 0; display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
                <code style="color: #38bdf8; background: rgba(2, 132, 199, 0.15); padding: 0.2rem 0.45rem; border-radius: 4px; font-size: 0.82rem; word-break: break-all;">${shortAdmin}</code>
                <button type="button" class="btn btn-secondary btn-copy-admin-address" style="padding: 0.2rem 0.6rem; font-size: 0.75rem;">Copy Admin</button>
                <a href="https://sepolia.etherscan.io/address/${admin}" target="_blank" style="color: #94a3b8; font-size: 0.75rem; text-decoration: underline;">View on Etherscan &nearr;</a>
              </div>
            </li>
            <li>Ask the administrator to grant your wallet the <strong>${requiredRoleCode || requiredRoleName}</strong> via the <a href="admin.html" style="color: var(--primary); text-decoration: underline;">Admin Portal</a> or the <code>grantRoles.js</code> CLI script.</li>
            <li>Once granted on Sepolia, simply refresh this page or re-select your account in MetaMask!</li>
          </ol>
        </div>
      </div>
    `;

    el.style.display = "block";

    const copyUserBtn = el.querySelector(".btn-copy-my-address");
    if (copyUserBtn) {
      copyUserBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(user).then(() => {
          copyUserBtn.textContent = "✅ Address Copied!";
          setTimeout(() => {
            copyUserBtn.textContent = "📋 Copy My Address";
          }, 2500);
        });
      });
    }

    const copyAdminBtn = el.querySelector(".btn-copy-admin-address");
    if (copyAdminBtn) {
      copyAdminBtn.addEventListener("click", () => {
        navigator.clipboard.writeText(admin).then(() => {
          copyAdminBtn.textContent = "✅ Copied!";
          setTimeout(() => {
            copyAdminBtn.textContent = "Copy Admin";
          }, 2000);
        });
      });
    }
  },

  /**
   * Resolves the single centralized API base URL for backend communication.
   * - When running on localhost / 127.0.0.1, routes to http://localhost:5000.
   * - In production (Vercel), routes to window.API_BASE_URL or window.RELIFE_CONFIG.apiBase (Render).
   */
  getApiBase() {
    if (typeof window !== "undefined" && window.location) {
      const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
      if (isLocalhost) {
        return window.location.origin.includes("5000")
          ? window.location.origin
          : "http://localhost:5000";
      }
      if (window.API_BASE_URL) {
        return window.API_BASE_URL.replace(/\/+$/, "");
      }
      if (window.RELIFE_CONFIG && window.RELIFE_CONFIG.apiBase) {
        return window.RELIFE_CONFIG.apiBase.replace(/\/+$/, "");
      }
    }
    return "http://localhost:5000";
  },

  /**
   * Requests network switch to Sepolia or Localhost if needed.
   */
  async switchToSepolia() {
    const rawProvider = this.rawProvider || this.getEthereumProvider();
    if (!rawProvider || !rawProvider.request) {
      throw new Error("No Ethereum provider available to switch networks.");
    }
    try {
      await rawProvider.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: "0xaa36a7" }], // 11155111 in hex
      });
    } catch (switchError) {
      // 4902 indicates chain has not been added to MetaMask
      if (
        switchError.code === 4902 ||
        switchError.data?.originalError?.code === 4902 ||
        switchError.message?.includes("Unrecognized chain ID")
      ) {
        await rawProvider.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: "0xaa36a7",
              chainName: "Sepolia Testnet",
              rpcUrls: [
                "https://ethereum-sepolia-rpc.publicnode.com",
                "https://rpc2.sepolia.org",
                "https://rpc.sepolia.org"
              ],
              nativeCurrency: { name: "Sepolia ETH", symbol: "SEP", decimals: 18 },
              blockExplorerUrls: ["https://sepolia.etherscan.io"],
            },
          ],
        });
      } else {
        throw switchError;
      }
    }

    // Refresh state after successful switch
    try {
      const updatedHex = await rawProvider.request({ method: "eth_chainId" });
      this.chainId = updatedHex;
      if (this.rawProvider) {
        this.provider = new ethers.BrowserProvider(this.rawProvider);
        if (this.account) {
          this.signer = await this.provider.getSigner();
          await this._attachContract();
        }
      }
      this._notifyListeners("chainChanged", this.chainId);
    } catch (_) {}
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
    if (errorString.includes("EnforcedPause")) {
      return "Contract is Paused: All state-changing operations are temporarily halted by contract administrators.";
    }
    if (errorString.includes("ReLife__CannotRevokeLastAdmin")) {
      return "Action Blocked: Cannot revoke or renounce the last remaining administrator role. Appoint another admin first.";
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
   * Converts an on-chain Warranty struct and expiry flag into a clean, safe JavaScript object.
   * Safely parses BigInt values to primitive numbers.
   * Strictly prevents "[object Object]", "undefined", and "NaN".
   * @param {Object|Array} warranty - The warranty struct from getWarranty(productId)
   * @param {boolean} isExpired - The isExpired boolean returned by getWarranty(productId)
   * @returns {Object} Safe JS object with formatted strings and status badges
   */
  formatWarranty(warranty, isExpired = false) {
    if (!warranty) {
      return {
        hasWarranty: false,
        isValid: false,
        isExpired: false,
        daysLeft: 0,
        badgeHtml: '<span class="badge badge-secondary" style="background:rgba(255,255,255,0.08);">No Warranty</span>',
        statusText: "No Warranty",
        badgeClass: "badge-secondary",
        coverage: "None",
        startDateFormatted: "N/A",
        endDateFormatted: "N/A",
        termsUri: "",
      };
    }

    const toNumber = (val) => {
      if (val === undefined || val === null) return 0;
      if (typeof val === "bigint") return Number(val);
      if (typeof val === "number") return val;
      const parsed = Number(val);
      return isNaN(parsed) ? 0 : parsed;
    };

    const toStringSafe = (val) => {
      if (val === undefined || val === null) return "";
      if (typeof val === "string") return val;
      return String(val);
    };

    // Support both named properties and positional indices
    const startTs = toNumber(warranty.warrantyStart !== undefined ? warranty.warrantyStart : warranty[0]);
    const endTs = toNumber(warranty.warrantyEnd !== undefined ? warranty.warrantyEnd : (warranty.expiryTimestamp !== undefined ? warranty.expiryTimestamp : warranty[1]));
    const coverage = toStringSafe(warranty.warrantyType !== undefined ? warranty.warrantyType : warranty[3]) || "Standard Warranty";
    const termsUri = toStringSafe(warranty.termsUri !== undefined ? warranty.termsUri : warranty[4]);
    const isActive = Boolean(warranty.isActive !== undefined ? warranty.isActive : warranty[5]);

    if (!isActive || endTs === 0) {
      return {
        hasWarranty: false,
        isValid: false,
        isExpired: false,
        daysLeft: 0,
        badgeHtml: '<span class="badge badge-secondary" style="background:rgba(255,255,255,0.08);">No Warranty</span>',
        statusText: "No Warranty",
        badgeClass: "badge-secondary",
        coverage: "None",
        startDateFormatted: "N/A",
        endDateFormatted: "N/A",
        termsUri: "",
      };
    }

    const nowTs = Math.floor(Date.now() / 1000);
    const expired = Boolean(isExpired || (nowTs >= endTs));
    const secondsRemaining = Math.max(0, endTs - nowTs);
    const daysLeft = Math.ceil(secondsRemaining / 86400);

    const startDateFormatted = startTs > 0 ? new Date(startTs * 1000).toLocaleDateString() : "Registration Date";
    const endDateFormatted = endTs > 0 ? new Date(endTs * 1000).toLocaleDateString() : "N/A";

    let statusText = "";
    let badgeClass = "";

    if (expired) {
      statusText = "Expired";
      badgeClass = "badge-danger";
    } else {
      statusText = `Valid (${daysLeft} day${daysLeft === 1 ? "" : "s"} left)`;
      badgeClass = "badge-success";
    }

    const badgeHtml = `<span class="badge ${badgeClass}">${statusText}</span>`;

    return {
      hasWarranty: true,
      isValid: !expired,
      isExpired: expired,
      daysLeft,
      badgeHtml,
      statusText,
      badgeClass,
      coverage,
      startDateFormatted,
      endDateFormatted,
      termsUri,
    };
  },

  /**
   * Internal cache for block timestamps to minimize redundant RPC roundtrips.
   */
  _blockTimestampCache: new Map(),

  /**
   * Resolves the timestamp for a given block number using in-memory caching.
   * @param {number} blockNumber Block number.
   * @param {Object} [provider] Provider instance.
   * @returns {Promise<number>} UNIX timestamp in seconds.
   */
  async getBlockTimestamp(blockNumber, provider) {
    if (!blockNumber || blockNumber <= 0) return 0;
    if (this._blockTimestampCache.has(blockNumber)) {
      return this._blockTimestampCache.get(blockNumber);
    }
    const resolvedProvider = provider || this.provider || this.getReadOnlyProvider();
    if (!resolvedProvider) return 0;
    try {
      const block = await resolvedProvider.getBlock(blockNumber);
      const ts = block ? Number(block.timestamp) : 0;
      this._blockTimestampCache.set(blockNumber, ts);
      return ts;
    } catch (_) {
      return 0;
    }
  },

  /**
   * Queries contract event logs in batches of block ranges to respect RPC rate limits.
   * Automatically starts from RELIFE_CONFIG.deploymentBlock by default rather than block 0.
   * @param {Object} contract Ethers Contract instance.
   * @param {Object} filter Ethers event filter.
   * @param {number} [fromBlock] Starting block number.
   * @param {number|string} [toBlock] Ending block number.
   * @param {number} [batchSize=5000] Maximum block range per eth_getLogs RPC call.
   * @returns {Promise<Array>} Array of merged event logs.
   */
  async queryFilterBatched(contract, filter, fromBlock, toBlock, batchSize = 5000) {
    if (!contract || typeof contract.queryFilter !== "function") {
      return [];
    }

    const provider = contract.runner?.provider || this.provider || this.getReadOnlyProvider();

    // 1. Resolve fromBlock starting at deploymentBlock if available
    let startBlock = fromBlock !== undefined && fromBlock !== null
      ? Number(fromBlock)
      : Number(window.RELIFE_CONFIG?.deploymentBlock || 0);

    // 2. Resolve toBlock
    let endBlock = toBlock;
    if (endBlock === undefined || endBlock === null || endBlock === "latest") {
      try {
        endBlock = provider ? Number(await provider.getBlockNumber()) : startBlock + 10000;
      } catch (_) {
        endBlock = startBlock + 10000;
      }
    } else {
      endBlock = Number(endBlock);
    }

    if (startBlock > endBlock) {
      return [];
    }

    // 3. If range is small or batchSize covers the whole range, execute single queryFilter
    if ((endBlock - startBlock) <= batchSize) {
      try {
        return await contract.queryFilter(filter, startBlock, endBlock);
      } catch (err) {
        console.warn("Direct queryFilter note:", err.message);
        return await contract.queryFilter(filter);
      }
    }

    // 4. Chunked iteration
    const allEvents = [];
    for (let currentFrom = startBlock; currentFrom <= endBlock; currentFrom += batchSize) {
      const currentTo = Math.min(currentFrom + batchSize - 1, endBlock);
      try {
        const events = await contract.queryFilter(filter, currentFrom, currentTo);
        if (Array.isArray(events) && events.length > 0) {
          allEvents.push(...events);
        }
      } catch (err) {
        console.warn(`Query range [${currentFrom}, ${currentTo}] failed:`, err.message);
      }
    }

    return allEvents;
  },

  /**
   * Checks whether the contract is currently paused, and displays/removes a global sticky banner.
   * Can be invoked from any page with or without an active wallet connection.
   * @returns {Promise<boolean>} True if paused, false otherwise.
   */
  async checkAndRenderPauseBanner() {
    try {
      const contract = this.contract || this.getReadOnlyContract();
      if (!contract || typeof contract.paused !== "function") {
        return false;
      }

      const isPaused = await contract.paused();
      let banner = document.getElementById("globalPauseBanner");

      if (isPaused) {
        if (!banner) {
          banner = document.createElement("div");
          banner.id = "globalPauseBanner";
          banner.style.cssText = "background: linear-gradient(90deg, #b91c1c, #dc2626); color: #ffffff; padding: 0.75rem 1rem; text-align: center; font-weight: 600; font-size: 0.9rem; position: sticky; top: 0; z-index: 10000; box-shadow: 0 4px 12px rgba(220, 38, 38, 0.4); display: flex; align-items: center; justify-content: center; gap: 0.5rem;";
          banner.innerHTML = `<span>⚠️ <strong>EMERGENCY PAUSE ACTIVE:</strong> Smart contract operations are temporarily suspended by administrators. Passport verification and view functions remain accessible.</span>`;
          document.body.prepend(banner);
        } else {
          banner.style.display = "flex";
        }
      } else {
        if (banner) {
          banner.style.display = "none";
        }
      }
      return Boolean(isPaused);
    } catch (err) {
      console.warn("Pause banner check error:", err.message);
      return false;
    }
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
window.formatWarranty = ReLifeWallet.formatWarranty;
window.queryFilterBatched = ReLifeWallet.queryFilterBatched.bind(ReLifeWallet);
window.checkAndRenderPauseBanner = ReLifeWallet.checkAndRenderPauseBanner.bind(ReLifeWallet);
