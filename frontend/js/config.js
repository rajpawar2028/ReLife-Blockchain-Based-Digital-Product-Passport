/**
 * ReLife - Global Application Configuration
 * Centralized environment parameters for Ethereum Sepolia and Render IPFS API
 */
const API_BASE_URL = 'https://relife-blockchain-based-digital-product.onrender.com';
const CHAIN_ID = 11155111;

// Expose globally for browser multi-page scripts
if (typeof window !== 'undefined') {
  window.API_BASE_URL = API_BASE_URL;
  window.CHAIN_ID = CHAIN_ID;
}

// Support CommonJS / Node.js environments if required by tests
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    API_BASE_URL,
    CHAIN_ID,
  };
}
