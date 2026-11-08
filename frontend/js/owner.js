/**
 * ReLife - Product Owner Dashboard Controller
 * Ownership auditing, warranty verification, and on-chain ownership transfer
 */

document.addEventListener("DOMContentLoaded", async () => {
  const connectBtn = document.getElementById("connectWalletBtn");
  const walletBadge = document.getElementById("walletBadge");
  const authSection = document.getElementById("authSection");
  const dashboardSection = document.getElementById("dashboardSection");
  const ownedCount = document.getElementById("ownedCount");
  const emptyNotice = document.getElementById("emptyNotice");
  const productsGrid = document.getElementById("productsGrid");
  const refreshBtn = document.getElementById("refreshBtn");
  const txStatusCard = document.getElementById("txStatusCard");
  const txStatusMessage = document.getElementById("txStatusMessage");

  let userAccount = null;

  // Initialize wallet
  await ReLifeWallet.init();
  updateWalletUI();

  connectBtn.addEventListener("click", async () => {
    try {
      await ReLifeWallet.connect();
      await updateWalletUI();
    } catch (e) {
      alert("Wallet connection failed: " + e.message);
    }
  });

  ReLifeWallet.on("accountChanged", async () => {
    await updateWalletUI();
  });

  if (refreshBtn) {
    refreshBtn.addEventListener("click", async () => {
      await loadOwnedProducts();
    });
  }

  async function updateWalletUI() {
    userAccount = ReLifeWallet.account;

    if (!userAccount) {
      walletBadge.innerHTML = `<span class="badge badge-warning">Disconnected</span>`;
      authSection.style.display = "block";
      dashboardSection.style.display = "none";
      return;
    }

    const shortAddr = `${userAccount.slice(0, 6)}...${userAccount.slice(-4)}`;
    walletBadge.innerHTML = `<span class="badge badge-info">${shortAddr}</span>`;
    authSection.style.display = "none";
    dashboardSection.style.display = "block";

    await loadOwnedProducts();
  }

  /**
   * Scans the contract for products owned by the active wallet
   */
  async function loadOwnedProducts() {
    productsGrid.innerHTML = "<p style='color: var(--text-muted);'>Querying your product passports...</p>";

    try {
      const contract = ReLifeWallet.contract || ReLifeWallet.getReadOnlyContract();
      if (!contract) return;

      const totalBn = await contract.getTotalProducts();
      const total = Number(totalBn);
      const owned = [];

      for (let i = 1; i <= total; i++) {
        try {
          const rawProd = await contract.getProduct(BigInt(i));
          if (rawProd.currentOwner.toLowerCase() === userAccount.toLowerCase()) {
            const prod = ReLifeWallet.formatProduct(rawProd);
            const [warranty, isExpired] = await contract.getWarranty(BigInt(i));
            const history = await contract.getOwnershipHistory(BigInt(i));
            owned.push({ prod, warranty, isExpired, history });
          }
        } catch (_) {}
      }

      ownedCount.innerText = owned.length.toString();
      productsGrid.innerHTML = "";

      if (owned.length === 0) {
        emptyNotice.style.display = "block";
        return;
      }

      emptyNotice.style.display = "none";

      owned.forEach(({ prod, warranty, isExpired, history }) => {
        const card = document.createElement("div");
        card.className = "owner-card";

        // Warranty badge rendering
        let warrantyBadge = `<span class="badge badge-secondary" style="background:rgba(255,255,255,0.08);">No Warranty</span>`;
        if (warranty && warranty.expiryTimestamp > 0n) {
          const expiryDate = new Date(Number(warranty.expiryTimestamp) * 1000).toLocaleDateString();
          if (isExpired) {
            warrantyBadge = `<span class="badge badge-danger">Expired (${expiryDate})</span>`;
          } else {
            warrantyBadge = `<span class="badge badge-success">Active Warranty (Until ${expiryDate})</span>`;
          }
        }

        const pId = prod.idStr;

        card.innerHTML = `
          <div>
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
              <span class="badge badge-info">#${pId}</span>
              ${warrantyBadge}
            </div>
            <h3 style="font-size: 1.25rem; font-weight: 700; margin-bottom: 0.25rem;">
              ${prod.displayName}
            </h3>
            <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 0.75rem;">
              Serial: <code>${prod.serialNumber}</code>
            </p>

            <div class="history-list">
              <strong>Ownership Pedigree:</strong> ${history.length} transfer(s) recorded.
            </div>
          </div>

          <div style="margin-top: 1.25rem;">
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
              <a href="/product.html?id=${pId}" class="btn btn-outline" style="flex:1; font-size:0.85rem;" target="_blank">
                View Passport & QR
              </a>
              <button class="btn btn-primary" style="flex:1; font-size:0.85rem;" onclick="toggleTransferForm('${pId}')">
                Transfer Ownership
              </button>
            </div>

            <!-- Transfer Input Form -->
            <div id="transferForm_${pId}" class="transfer-form">
              <label style="font-size:0.8rem;">Recipient Ethereum Address:</label>
              <input type="text" id="recipient_${pId}" placeholder="0x..." style="margin: 0.4rem 0; font-size:0.85rem;">
              <div style="display:flex; gap:0.5rem; margin-top:0.4rem;">
                <button class="btn btn-primary" style="padding:0.4rem 0.8rem; font-size:0.8rem;" onclick="executeTransfer('${pId}')">
                  Confirm Transfer
                </button>
                <button class="btn btn-secondary" style="padding:0.4rem 0.8rem; font-size:0.8rem;" onclick="toggleTransferForm('${pId}')">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        `;

        productsGrid.appendChild(card);
      });
    } catch (err) {
      console.error("Error loading owned products:", err);
      productsGrid.innerHTML = `<p style="color: var(--danger);">Failed to load assets: ${err.message}</p>`;
    }
  }

  // Window helper for toggling form
  window.toggleTransferForm = (pId) => {
    const form = document.getElementById(`transferForm_${pId}`);
    if (form) {
      form.style.display = form.style.display === "block" ? "none" : "block";
    }
  };

  // Window helper for executing transfer
  window.executeTransfer = async (pId) => {
    const recipientInput = document.getElementById(`recipient_${pId}`);
    const recipient = recipientInput.value.trim();

    if (!recipient || !ethers.isAddress(recipient)) {
      alert("Please enter a valid recipient Ethereum address (0x...).");
      return;
    }

    if (recipient.toLowerCase() === userAccount.toLowerCase()) {
      alert("You cannot transfer ownership to your own address.");
      return;
    }

    try {
      showStatus("info", `Initiating ownership transfer for Product #${pId}... Please approve in MetaMask.`);

      const contract = ReLifeWallet.contract;
      if (!contract) throw new Error("Wallet not connected.");

      const tx = await contract.transferOwnership(BigInt(pId), recipient);
      showStatus("info", `Transaction broadcasted! Mining block: ${tx.hash}`);

      await tx.wait(1);

      showStatus("success", `Ownership of Product #${pId} successfully transferred to ${recipient}!`);
      await loadOwnedProducts();
    } catch (err) {
      console.error("Transfer error:", err);
      showStatus("danger", `Ownership transfer failed: ${err.reason || err.message}`);
    }
  };

  function showStatus(type, html) {
    txStatusCard.style.display = "block";
    txStatusCard.className = `alert alert-${type}`;
    txStatusMessage.innerHTML = html;
  }
});

