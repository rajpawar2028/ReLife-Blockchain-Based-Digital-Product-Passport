/**
 * ReLife - Recycler Dashboard Controller
 * Role-based authentication, IPFS certificate uploading, and on-chain decommissioning
 */

document.addEventListener("DOMContentLoaded", async () => {
  const connectBtn = document.getElementById("connectWalletBtn");
  const walletBadge = document.getElementById("walletBadge");
  const authSection = document.getElementById("authSection");
  const unauthorizedAlert = document.getElementById("unauthorizedAlert");
  const unauthorizedAddress = document.getElementById("unauthorizedAddress");
  const recyclerSection = document.getElementById("recyclerSection");
  const recycleForm = document.getElementById("recycleForm");
  const submitRecycleBtn = document.getElementById("submitRecycleBtn");
  const recycleSpinner = document.getElementById("recycleSpinner");
  const txStatusCard = document.getElementById("txStatusCard");
  const txStatusMessage = document.getElementById("txStatusMessage");

  const API_BASE = (typeof ReLifeWallet !== "undefined" && ReLifeWallet.getApiBase)
    ? ReLifeWallet.getApiBase()
    : (window.API_BASE_URL || window.RELIFE_CONFIG?.apiBase || "http://localhost:5000");

  let userAccount = null;
  let isRecycler = false;

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

  async function updateWalletUI() {
    userAccount = ReLifeWallet.account;

    if (!userAccount) {
      walletBadge.innerHTML = `<span class="badge badge-warning">Disconnected</span>`;
      authSection.style.display = "block";
      unauthorizedAlert.style.display = "none";
      recyclerSection.style.display = "none";
      return;
    }

    const shortAddr = `${userAccount.slice(0, 6)}...${userAccount.slice(-4)}`;
    walletBadge.innerHTML = `<span class="badge badge-info">${shortAddr}</span>`;

    try {
      const contract = ReLifeWallet.contract || ReLifeWallet.getReadOnlyContract();
      if (!contract) return;

      const recyclerRole = await contract.RECYCLER_ROLE();
      isRecycler = await contract.hasRole(recyclerRole, userAccount);

      if (isRecycler) {
        authSection.style.display = "none";
        unauthorizedAlert.style.display = "none";
        recyclerSection.style.display = "block";
      } else {
        authSection.style.display = "none";
        recyclerSection.style.display = "none";
        if (unauthorizedAlert) {
          ReLifeWallet.renderAccessDeniedCard(unauthorizedAlert, {
            requiredRoleName: "Certified Recycler Role",
            requiredRoleCode: "RECYCLER_ROLE",
            userAddress: userAccount
          });
        }
      }
    } catch (err) {
      console.error("Role check failed:", err);
    }
  }

  recycleForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!isRecycler || !ReLifeWallet.contract) {
      alert("Only an authorized recycler wallet can decommission products.");
      return;
    }

    const productId = document.getElementById("recycleProdId").value.trim();
    const facility = document.getElementById("recycleFacility").value.trim();
    const notes = document.getElementById("recycleNotes").value.trim();
    const fileInput = document.getElementById("recycleFile");

    submitRecycleBtn.disabled = true;
    recycleSpinner.style.display = "inline-block";
    showStatus("info", "Step 1/2: Uploading official recycling manifest/certificate to IPFS...");

    try {
      let certificateUri = "";

      if (fileInput.files.length > 0) {
        const formData = new FormData();
        formData.append("file", fileInput.files[0]);

        const res = await fetch(`${API_BASE}/api/ipfs/upload-file`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || "File upload failed.");
        }

        const data = await res.json();
        certificateUri = data.ipfsUri;
      }

      showStatus("info", "Step 2/2: Confirming permanent decommissioning in MetaMask...");

      const contract = ReLifeWallet.contract;
      const tx = await contract.addRecyclingRecord(
        BigInt(productId),
        facility,
        notes,
        certificateUri
      );

      showStatus("info", `Decommissioning transaction submitted: ${tx.hash}`);

      await tx.wait(1);

      showStatus(
        "success",
        `Product Passport #${productId} permanently decommissioned and retired from circulation! <br>
         <a href="/product.html?id=${productId}" target="_blank" style="color:#10b981; font-weight:bold; text-decoration:underline;">
           View Updated Decommissioned Status &rarr;
         </a>`
      );

      recycleForm.reset();
    } catch (err) {
      console.error("Decommission error:", err);
      showStatus("danger", `Failed to decommission: ${err.reason || err.message}`);
    } finally {
      submitRecycleBtn.disabled = false;
      recycleSpinner.style.display = "none";
    }
  });

  function showStatus(type, html) {
    txStatusCard.style.display = "block";
    txStatusCard.className = `alert alert-${type}`;
    txStatusMessage.innerHTML = html;
  }
});

