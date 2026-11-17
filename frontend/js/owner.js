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
  const incomingTransfersSection = document.getElementById("incomingTransfersSection");
  const incomingGrid = document.getElementById("incomingGrid");

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
      const incoming = [];

      for (let i = 1; i <= total; i++) {
        try {
          const rawProd = await contract.getProduct(BigInt(i));
          const pendingOwner = await contract.getPendingOwner(BigInt(i));

          if (rawProd.currentOwner.toLowerCase() === userAccount.toLowerCase()) {
            const prod = ReLifeWallet.formatProduct(rawProd);
            const [warranty, isExpired] = await contract.getWarranty(BigInt(i));
            const history = await contract.getOwnershipHistory(BigInt(i));
            owned.push({ prod, warranty, isExpired, history, pendingOwner });
          } else if (pendingOwner.toLowerCase() === userAccount.toLowerCase()) {
            const prod = ReLifeWallet.formatProduct(rawProd);
            incoming.push({ prod, rawProd });
          }
        } catch (_) {}
      }

      // Render Incoming Transfers
      if (incomingTransfersSection && incomingGrid) {
        if (incoming.length > 0) {
          incomingTransfersSection.style.display = "block";
          incomingGrid.innerHTML = "";
          incoming.forEach(({ prod, rawProd }) => {
            const incCard = document.createElement("div");
            incCard.className = "owner-card";
            incCard.style.borderColor = "var(--primary)";
            incCard.innerHTML = `
              <div>
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.5rem;">
                  <span class="badge badge-info">#${prod.idStr}</span>
                  <span class="badge badge-warning">Action Required</span>
                </div>
                <h3 style="font-size: 1.15rem; font-weight: 700; margin-bottom: 0.25rem;">
                  ${prod.displayName}
                </h3>
                <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 0.5rem;">
                  Serial: <code>${prod.serialNumber}</code>
                </p>
                <p style="font-size: 0.8rem; color: #cbd5e1;">
                  Offered by: <code>${rawProd.currentOwner.slice(0, 6)}...${rawProd.currentOwner.slice(-4)}</code>
                </p>
              </div>
              <div style="margin-top: 1rem;">
                <button class="btn btn-primary" style="width:100%; font-size:0.85rem;" onclick="acceptTransfer('${prod.idStr}')">
                  &#10003; Accept Ownership Transfer
                </button>
              </div>
            `;
            incomingGrid.appendChild(incCard);
          });
        } else {
          incomingTransfersSection.style.display = "none";
          incomingGrid.innerHTML = "";
        }
      }

      ownedCount.innerText = owned.length.toString();
      productsGrid.innerHTML = "";

      if (owned.length === 0) {
        emptyNotice.style.display = "block";
        return;
      }

      emptyNotice.style.display = "none";

      owned.forEach(({ prod, warranty, isExpired, history, pendingOwner }) => {
        const card = document.createElement("div");
        card.className = "owner-card";

        // Warranty badge rendering
        let warrantyBadge = `<span class="badge badge-secondary" style="background:rgba(255,255,255,0.08);">No Warranty</span>`;
        const endTs = Number(warranty?.warrantyEnd || warranty?.expiryTimestamp || 0n);
        if (warranty && endTs > 0) {
          const nowTs = Math.floor(Date.now() / 1000);
          const daysLeft = Math.max(0, Math.ceil((endTs - nowTs) / 86400));
          if (isExpired || nowTs >= endTs) {
            warrantyBadge = `<span class="badge badge-danger">Expired</span>`;
          } else {
            warrantyBadge = `<span class="badge badge-success">Valid (${daysLeft} day${daysLeft === 1 ? '' : 's'} left)</span>`;
          }
        }

        const pId = prod.idStr;
        const hasPending = (pendingOwner && pendingOwner !== ethers.ZeroAddress);

        let transferActions = "";
        if (hasPending) {
          transferActions = `
            <div style="background: rgba(245, 158, 11, 0.1); border: 1px dashed rgba(245, 158, 11, 0.4); border-radius: var(--radius-sm); padding: 0.75rem; margin-top: 0.75rem;">
              <div style="font-size: 0.8rem; color: #fde68a; margin-bottom: 0.4rem;">
                &#9203; Transfer pending to: <code>${pendingOwner.slice(0, 6)}...${pendingOwner.slice(-4)}</code>
              </div>
              <button class="btn btn-secondary" style="width:100%; font-size:0.8rem; padding: 0.35rem 0.6rem;" onclick="cancelTransfer('${pId}')">
                &#10005; Cancel Pending Transfer
              </button>
            </div>
          `;
        } else {
          transferActions = `
            <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top: 1rem;">
              <a href="/product.html?id=${pId}" class="btn btn-outline" style="flex:1; font-size:0.85rem;" target="_blank">
                View Passport & QR
              </a>
              <button class="btn btn-primary" style="flex:1; font-size:0.85rem;" onclick="toggleTransferForm('${pId}')">
                Transfer Ownership
              </button>
            </div>

            <!-- Transfer Input Form -->
            <div id="transferForm_${pId}" class="transfer-form">
              <label style="font-size:0.8rem;">Recipient Ethereum Address (2-Step Transfer):</label>
              <input type="text" id="recipient_${pId}" placeholder="0x..." style="margin: 0.4rem 0; font-size:0.85rem;">
              <div style="display:flex; gap:0.5rem; margin-top:0.4rem;">
                <button class="btn btn-primary" style="padding:0.4rem 0.8rem; font-size:0.8rem;" onclick="executeTransfer('${pId}')">
                  Initiate Transfer
                </button>
                <button class="btn btn-secondary" style="padding:0.4rem 0.8rem; font-size:0.8rem;" onclick="toggleTransferForm('${pId}')">
                  Cancel
                </button>
              </div>
            </div>
          `;
        }

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

          <div style="margin-top: 0.5rem;">
            ${transferActions}
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

  // Window helper for executing transfer (2-Step Initiate)
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
      showStatus("info", `Initiating 2-step transfer for Product #${pId} to ${recipient}... Please approve in MetaMask.`);

      const contract = ReLifeWallet.contract;
      if (!contract) throw new Error("Wallet not connected.");

      // Initiate 2-step transfer (legacy fallback: contract.transferOwnership(BigInt(pId), recipient))
      const tx = contract.initiateTransfer
        ? await contract.initiateTransfer(BigInt(pId), recipient)
        : await contract.transferOwnership(BigInt(pId), recipient);

      showStatus("info", `Transfer initiated! Transaction mined: ${tx.hash}. Recipient must accept to finalize.`);
      await tx.wait(1);

      showStatus("success", `Transfer initiated for Product #${pId}! Recipient ${recipient} can now accept the asset.`);
      await loadOwnedProducts();
    } catch (err) {
      console.error("Transfer error:", err);
      showStatus("danger", `Ownership transfer failed: ${ReLifeWallet.parseError ? ReLifeWallet.parseError(err) : (err.reason || err.message)}`);
    }
  };

  // Window helper for accepting incoming transfer
  window.acceptTransfer = async (pId) => {
    try {
      showStatus("info", `Accepting ownership of Product #${pId}... Please approve in MetaMask.`);

      const contract = ReLifeWallet.contract;
      if (!contract) throw new Error("Wallet not connected.");

      const tx = await contract.acceptTransfer(BigInt(pId));
      showStatus("info", `Acceptance broadcasted! Mining block: ${tx.hash}`);

      await tx.wait(1);
      showStatus("success", `Congratulations! You are now the official on-chain owner of Product #${pId}!`);
      await loadOwnedProducts();
    } catch (err) {
      console.error("Accept transfer error:", err);
      showStatus("danger", `Failed to accept transfer: ${ReLifeWallet.parseError ? ReLifeWallet.parseError(err) : (err.reason || err.message)}`);
    }
  };

  // Window helper for cancelling pending transfer
  window.cancelTransfer = async (pId) => {
    try {
      showStatus("info", `Cancelling pending transfer for Product #${pId}... Please approve in MetaMask.`);

      const contract = ReLifeWallet.contract;
      if (!contract) throw new Error("Wallet not connected.");

      const tx = await contract.cancelTransfer(BigInt(pId));
      showStatus("info", `Cancellation broadcasted! Mining block: ${tx.hash}`);

      await tx.wait(1);
      showStatus("success", `Pending transfer for Product #${pId} successfully cancelled.`);
      await loadOwnedProducts();
    } catch (err) {
      console.error("Cancel transfer error:", err);
      showStatus("danger", `Failed to cancel transfer: ${ReLifeWallet.parseError ? ReLifeWallet.parseError(err) : (err.reason || err.message)}`);
    }
  };

  function showStatus(type, html) {
    txStatusCard.style.display = "block";
    txStatusCard.className = `alert alert-${type}`;
    txStatusMessage.innerHTML = html;
  }
});

