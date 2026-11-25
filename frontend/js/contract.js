/**
 * ReLife - Contract Interaction Module (Ethers.js v6)
 * Encapsulates smart contract bindings, ABI parsing, and transaction dispatching.
 */

const ReLifeContract = {
  contractAddress: null,
  abi: null,

  /**
   * Initializes contract configuration from window.RELIFE_CONFIG or contract-address.json.
   */
  async init() {
    if (window.RELIFE_CONFIG && window.RELIFE_CONFIG.address && window.RELIFE_CONFIG.abi) {
      this.contractAddress = window.RELIFE_CONFIG.address;
      this.abi = window.RELIFE_CONFIG.abi;
      return;
    }

    try {
      const res = await fetch("contract-data.json");
      if (res.ok) {
        const data = await res.json();
        this.contractAddress = data.address;
        this.abi = data.abi;
      }
    } catch (e) {
      console.warn("[ReLifeContract] Could not fetch contract-data.json:", e);
    }
  },

  /**
   * Returns a connected contract instance with a signer for transactions.
   */
  getContract(signer) {
    if (!this.contractAddress || !this.abi) {
      if (window.RELIFE_CONFIG) {
        this.contractAddress = window.RELIFE_CONFIG.address;
        this.abi = window.RELIFE_CONFIG.abi;
      }
    }
    if (!this.contractAddress || !this.abi) {
      throw new Error("Contract configuration not loaded.");
    }
    return new ethers.Contract(this.contractAddress, this.abi, signer);
  },

  /**
   * Returns a read-only contract instance connected via Sepolia public RPC or provider.
   */
  getReadOnlyContract(customProvider) {
    if (!this.contractAddress || !this.abi) {
      if (window.RELIFE_CONFIG) {
        this.contractAddress = window.RELIFE_CONFIG.address;
        this.abi = window.RELIFE_CONFIG.abi;
      }
    }
    const provider = customProvider || new ethers.JsonRpcProvider("https://rpc.sepolia.org");
    return new ethers.Contract(this.contractAddress, this.abi, provider);
  },

  /**
   * Decodes custom Solidity revert errors.
   */
  parseError(error) {
    if (typeof ReLifeWallet !== "undefined" && ReLifeWallet.parseError) {
      return ReLifeWallet.parseError(error);
    }
    return error.reason || error.message || "Transaction reverted";
  }
};

if (typeof window !== "undefined") {
  window.ReLifeContract = ReLifeContract;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = ReLifeContract;
}
