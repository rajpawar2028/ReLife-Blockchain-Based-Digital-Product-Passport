/**
 * ReLife - Repair Center Dashboard Controller
 * Role-based authentication, product passport lookup, IPFS diagnostic attachment,
 * and immutable on-chain service logging.
 */

document.addEventListener("DOMContentLoaded", async () => {
  const connectBtn = document.getElementById("connectWalletBtn");
  const walletBadge = document.getElementById("walletBadge");
  const pauseBanner = document.getElementById("pauseBanner");
  const wrongNetworkAlert = document.getElementById("wrongNetworkAlert");
  const btnSwitchNetwork = document.getElementById("btnSwitchNetwork");
  const authSection = document.getElementById("authSection");
  const unauthorizedAlert = document.getElementById("unauthorizedAlert");
  const unauthorizedAddress = document.getElementById("unauthorizedAddress");
  const repairSection = document.getElementById("repairSection");
  const repairForm = document.getElementById("repairForm");
  const submitRepairBtn = document.getElementById("submitRepairBtn");
  const repairSpinner = document.getElementById("repairSpinner");
  const txStatusCard = document.getElementById("txStatusCard");
  const txStatusMessage = document.getElementById("txStatusMessage");

  const repairProductInput = document.getElementById("repairProductInput");
  const btnLookupProduct = document.getElementById("btnLookupProduct");
  const productPreviewBox = document.getElementById("productPreviewBox");
  const previewStatusBadge = document.getElementById("previewStatusBadge");
  const previewModel = document.getElementById("previewModel");
  const previewBrand = document.getElementById("previewBrand");
  const previewSerial = document.getElementById("previewSerial");
  const previewOwner = document.getElementById("previewOwner");

  const noRepairsMsg = document.getElementById("noRepairsMsg");
  const tableWrapper = document.getElementById("tableWrapper");
  const repairsTableBody = document.getElementById("repairsTableBody");
  const repairCountBadge = document.getElementById("repairCountBadge");

  const API_BASE = (typeof ReLifeWallet !== "undefined" && ReLifeWallet.getApiBase)
    ? ReLifeWallet.getApiBase()
    : (window.API_BASE_URL || window.RELIFE_CONFIG?.apiBase || "http://localhost:5000");

  let userAccount = null;
  let isRepairCenter = false;
  let activeProductId = null;
  let activeProductIsRecycled = false;

  // 1. Defensively wire up user-facing action buttons immediately
  if (connectBtn) {
    connectBtn.addEventListener("click", async () => {
      try {
        await ReLifeWallet.connect();
        await updateWalletUI();
      } catch (e) {
        showStatus("danger", "Wallet connection failed: " + e.message);
      }
    });
  }

  if (btnSwitchNetwork) {
    btnSwitchNetwork.addEventListener("click", async () => {
      try {
        btnSwitchNetwork.disabled = true;
        btnSwitchNetwork.textContent = "Switching...";
        await ReLifeWallet.switchToSepolia();
        await updateWalletUI();
      } catch (e) {
        const msg = e.code === 4001 || e.message?.includes("rejected")
          ? "Network switch request was rejected in MetaMask."
          : `Network switch failed: ${e.message}`;
        showStatus("danger", msg);
      } finally {
        btnSwitchNetwork.disabled = false;
        btnSwitchNetwork.textContent = "Switch Network";
      }
    });
  }

  if (btnLookupProduct) {
    btnLookupProduct.addEventListener("click", async () => {
      await lookupProduct(repairProductInput.value.trim());
    });
  }

  if (repairProductInput) {
    repairProductInput.addEventListener("change", async () => {
      const val = repairProductInput.value.trim();
      if (val) {
        await lookupProduct(val);
      }
    });
  }

  // 2. Initialize wallet session and register listeners
  try {
    await ReLifeWallet.init();
    await updateWalletUI();
  } catch (err) {
    console.error("Initialization error:", err);
  }

  ReLifeWallet.on("accountChanged", async () => {
    await updateWalletUI();
  });

  ReLifeWallet.on("chainChanged", async () => {
    await updateWalletUI();
  });

  // 3. UI State Management
  async function updateWalletUI() {
    userAccount = ReLifeWallet.account;

    // Handle circuit breaker
    if (pauseBanner) {
      pauseBanner.style.display = ReLifeWallet.isPaused ? "block" : "none";
    }

    // State 1: Wallet Disconnected
    if (!userAccount) {
      if (walletBadge) walletBadge.innerHTML = `<span class="badge badge-warning">Disconnected</span>`;
      if (authSection) authSection.style.display = "block";
      if (wrongNetworkAlert) wrongNetworkAlert.style.display = "none";
      if (unauthorizedAlert) unauthorizedAlert.style.display = "none";
      if (repairSection) repairSection.style.display = "none";
      return;
    }

    const shortAddr = `${userAccount.slice(0, 6)}...${userAccount.slice(-4)}`;
    if (walletBadge) walletBadge.innerHTML = `<span class="badge badge-info">${shortAddr}</span>`;

    // State 2: Wrong Network Check
    if (!ReLifeWallet.isCorrectNetwork) {
      if (authSection) authSection.style.display = "none";
      if (unauthorizedAlert) unauthorizedAlert.style.display = "none";
      if (repairSection) repairSection.style.display = "none";
      if (wrongNetworkAlert) {
        wrongNetworkAlert.style.display = "block";
        const curChain = ReLifeWallet.getNormalizedChainId();
        const displayEl = document.getElementById("currentNetworkDisplay");
        if (displayEl) {
          displayEl.textContent = `Currently connected to: ${curChain !== null ? `Chain ID ${curChain}` : "Unknown Network"}`;
        }
      }
      return;
    }

    // Network is correct -> Hide wrong network alert
    if (wrongNetworkAlert) {
      wrongNetworkAlert.style.display = "none";
    }

    // State 3: Role Authorization Check
    try {
      const contract = ReLifeWallet.contract || ReLifeWallet.getReadOnlyContract();
      if (!contract) return;

      const repairRole = await contract.REPAIR_CENTER_ROLE();
      isRepairCenter = await contract.hasRole(repairRole, userAccount);

      if (isRepairCenter) {
        if (authSection) authSection.style.display = "none";
        if (unauthorizedAlert) unauthorizedAlert.style.display = "none";
        if (repairSection) repairSection.style.display = "block";
      } else {
        if (authSection) authSection.style.display = "none";
        if (unauthorizedAddress) unauthorizedAddress.innerText = userAccount;
        if (unauthorizedAlert) unauthorizedAlert.style.display = "block";
        if (repairSection) repairSection.style.display = "none";
      }
    } catch (err) {
      console.error("Role verification failed:", err);
    }
  }

  // 4. Product Lookup & Pedigree Loader
  async function lookupProduct(inputVal) {
    if (!inputVal) {
      showStatus("warning", "Please enter a Product Serial Number or Token ID.");
      return;
    }

    const contract = ReLifeWallet.contract || ReLifeWallet.getReadOnlyContract();
    if (!contract) {
      showStatus("danger", "Smart contract is not accessible. Please connect wallet.");
      return;
    }

    showStatus("info", `Looking up product "${inputVal}" on Ethereum...`);
    activeProductId = null;
    activeProductIsRecycled = false;

    let product = null;
    let pId = null;

    // Check if input is purely numeric (Token ID) or a serial number string
    const isPureInteger = /^\d+$/.test(inputVal) && !inputVal.startsWith("0");

    if (isPureInteger) {
      try {
        pId = BigInt(inputVal);
        product = await contract.getProduct(pId);
        activeProductId = pId;
      } catch (_) {
        // Fallback to serial search if numeric lookup failed
      }
    }

    if (!product) {
      try {
        product = await contract.getProductBySerial(inputVal);
        if (product && product.id) {
          activeProductId = BigInt(product.id);
        }
      } catch (_) {
        // Both failed
      }
    }

    if (!product || !activeProductId) {
      if (productPreviewBox) productPreviewBox.style.display = "none";
      if (noRepairsMsg) {
        noRepairsMsg.style.display = "block";
        noRepairsMsg.textContent = `No active digital product passport found for identifier "${inputVal}".`;
      }
      if (tableWrapper) tableWrapper.style.display = "none";
      showStatus("danger", `Product "${inputVal}" not found on-chain.`);
      return;
    }

    // Populate preview box
    const STATUS_MAP = ["Manufactured", "Sold", "InRepair", "Recycled"];
    const statusNum = Number(product.status !== undefined ? product.status : 0);
    const statusName = STATUS_MAP[statusNum] || "Active";
    activeProductIsRecycled = Boolean(product.isRecycled || statusNum === 3);

    if (productPreviewBox) {
      productPreviewBox.style.display = "block";
      if (previewModel) previewModel.textContent = product.modelName || "N/A";
      if (previewBrand) previewBrand.textContent = product.brand || "N/A";
      if (previewSerial) previewSerial.textContent = product.serialNumber || inputVal;
      if (previewOwner) {
        const ownerAddr = product.currentOwner || "0x0000000000000000000000000000000000000000";
        previewOwner.textContent = `${ownerAddr.slice(0, 8)}...${ownerAddr.slice(-6)}`;
      }

      if (previewStatusBadge) {
        if (activeProductIsRecycled) {
          previewStatusBadge.className = "badge badge-danger";
          previewStatusBadge.textContent = "Permanently Recycled";
        } else if (statusNum === 2) {
          previewStatusBadge.className = "badge badge-warning";
          previewStatusBadge.textContent = "Under Repair";
        } else {
          previewStatusBadge.className = "badge badge-success";
          previewStatusBadge.textContent = statusName;
        }
      }
    }

    if (activeProductIsRecycled) {
      if (submitRepairBtn) submitRepairBtn.disabled = true;
      showStatus("warning", `Product #${activeProductId} is marked RECYCLED. Decommissioned passports cannot receive new repairs.`);
    } else {
      if (submitRepairBtn) submitRepairBtn.disabled = false;
      showStatus("success", `Verified Product #${activeProductId} (${product.brand} ${product.modelName}).`);
    }

    // Load repair history table
    await loadProductRepairs(contract, activeProductId);
  }

  // 5. Load and Render Repair History Table
  async function loadProductRepairs(contract, productId) {
    if (!repairsTableBody) return;
    repairsTableBody.innerHTML = "";

    try {
      let records = [];
      if (typeof contract.getProductHistory === "function") {
        records = await contract.getProductHistory(productId);
      } else if (typeof contract.getRepairs === "function") {
        records = await contract.getRepairs(productId);
      }

      if (repairCountBadge) {
        repairCountBadge.textContent = `${records.length} Record${records.length === 1 ? "" : "s"}`;
      }

      if (!records || records.length === 0) {
        if (noRepairsMsg) {
          noRepairsMsg.style.display = "block";
          noRepairsMsg.textContent = "No previous service records logged for this product. Clean maintenance history.";
        }
        if (tableWrapper) tableWrapper.style.display = "none";
        return;
      }

      if (noRepairsMsg) noRepairsMsg.style.display = "none";
      if (tableWrapper) tableWrapper.style.display = "block";

      for (let i = 0; i < records.length; i++) {
        const rec = records[i];
        const repId = rec.id ? rec.id.toString() : (i + 1).toString();
        const repType = rec.repairType || "Maintenance";
        const desc = rec.description || "";
        const centerAddr = rec.repairCenter || "";
        const timeSec = Number(rec.timestamp || 0);
        const dateStr = timeSec > 0 ? new Date(timeSec * 1000).toLocaleString() : "Confirmed";
        const serviceUri = rec.serviceUri || "";

        // Query extended details if supported
        let partsReplaced = "-";
        let costStr = "-";
        try {
          if (typeof contract.getRepairDetails === "function") {
            const [p, c] = await contract.getRepairDetails(productId, BigInt(repId));
            if (p && p.trim()) partsReplaced = p;
            if (c && c > 0n) costStr = `$${c.toString()}`;
          }
        } catch (_) {}

        const row = document.createElement("tr");

        // Cell 1: ID
        const tdId = document.createElement("td");
        tdId.innerHTML = `<span class="badge badge-info">#${repId}</span>`;
        row.appendChild(tdId);

        // Cell 2: Date
        const tdDate = document.createElement("td");
        tdDate.style.fontSize = "0.85rem";
        tdDate.textContent = dateStr;
        row.appendChild(tdDate);

        // Cell 3: Repair Center
        const tdCenter = document.createElement("td");
        const centerShort = centerAddr ? `${centerAddr.slice(0, 6)}...${centerAddr.slice(-4)}` : "Authorized";
        tdCenter.innerHTML = `<code title="${centerAddr}">${centerShort}</code>`;
        row.appendChild(tdCenter);

        // Cell 4: Type
        const tdType = document.createElement("td");
        tdType.innerHTML = `<span class="badge badge-warning" style="font-size:0.75rem;">${repType}</span>`;
        row.appendChild(tdType);

        // Cell 5: Description
        const tdDesc = document.createElement("td");
        tdDesc.style.maxWidth = "260px";
        tdDesc.style.wordBreak = "break-word";
        tdDesc.textContent = desc;
        row.appendChild(tdDesc);

        // Cell 6: Parts
        const tdParts = document.createElement("td");
        tdParts.style.fontSize = "0.85rem";
        tdParts.textContent = partsReplaced;
        row.appendChild(tdParts);

        // Cell 7: Cost
        const tdCost = document.createElement("td");
        tdCost.style.fontWeight = "600";
        tdCost.textContent = costStr;
        row.appendChild(tdCost);

        // Cell 8: Proof
        const tdProof = document.createElement("td");
        if (serviceUri && serviceUri.startsWith("ipfs://")) {
          const cid = serviceUri.replace("ipfs://", "");
          const link = document.createElement("a");
          link.href = `https://gateway.pinata.cloud/ipfs/${cid}`;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.className = "btn btn-secondary";
          link.style.padding = "0.25rem 0.6rem";
          link.style.fontSize = "0.75rem";
          link.textContent = "View Proof \u2197";
          tdProof.appendChild(link);
        } else if (serviceUri && serviceUri !== "none") {
          tdProof.textContent = serviceUri;
        } else {
          tdProof.textContent = "None";
        }
        row.appendChild(tdProof);

        repairsTableBody.appendChild(row);
      }
    } catch (err) {
      console.warn("Error loading repairs:", err);
    }
  }

  // 6. Form Submission: IPFS Upload + On-Chain Transaction
  repairForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!isRepairCenter || !ReLifeWallet.contract) {
      showStatus("danger", "Only an authorized repair center wallet can log service records.");
      return;
    }

    if (ReLifeWallet.isPaused) {
      showStatus("danger", "Smart contract is currently paused. Repair logging is blocked.");
      return;
    }

    const inputVal = repairProductInput.value.trim();
    if (!inputVal) {
      showStatus("warning", "Please specify a Product Serial Number or Token ID.");
      return;
    }

    // Ensure product is looked up
    if (!activeProductId) {
      await lookupProduct(inputVal);
      if (!activeProductId) {
        showStatus("danger", "Cannot log repair: Product could not be verified on-chain.");
        return;
      }
    }

    if (activeProductIsRecycled) {
      showStatus("danger", "Cannot log repair: Product is permanently recycled.");
      return;
    }

    const repairType = document.getElementById("repairType").value;
    const description = document.getElementById("repairDescription").value.trim();
    const partsReplaced = document.getElementById("partsReplaced").value.trim();
    const costRaw = document.getElementById("repairCost").value.trim();
    const costVal = costRaw ? BigInt(costRaw) : 0n;
    const fileInput = document.getElementById("repairFile");

    if (!description) {
      showStatus("warning", "Please provide a technical diagnostics & service description.");
      return;
    }

    submitRepairBtn.disabled = true;
    if (repairSpinner) repairSpinner.style.display = "inline-block";

    let ipfsUri = "none";

    // Step 1: Optional IPFS Upload
    if (fileInput && fileInput.files && fileInput.files.length > 0) {
      showStatus("info", "Step 1/2: Uploading diagnostic report / receipts to Pinata IPFS...");
      try {
        const formData = new FormData();
        formData.append("file", fileInput.files[0]);

        const res = await fetch(`${API_BASE}/api/ipfs/upload-file`, {
          method: "POST",
          body: formData,
        });

        const data = await res.json().catch(() => ({}));

        if (!res.ok || !data.success) {
          throw new Error(data.error || data.details || `Upload failed with HTTP status ${res.status}`);
        }

        ipfsUri = data.ipfsUri || (data.cid ? `ipfs://${data.cid}` : "none");
      } catch (uploadErr) {
        submitRepairBtn.disabled = false;
        if (repairSpinner) repairSpinner.style.display = "none";

        let errorMsg = uploadErr.message;
        if (uploadErr.name === "TypeError" && uploadErr.message.includes("fetch")) {
          errorMsg = `Backend API unreachable at ${API_BASE}. Please ensure the server is running.`;
        }
        showStatus("danger", `IPFS upload aborted: ${errorMsg}. Transaction was not sent to blockchain.`);
        return;
      }
    }

    // Step 2: Blockchain Transaction
    showStatus("info", "Step 2/2: Confirm service record transaction in MetaMask...");

    try {
      const contract = ReLifeWallet.contract;
      let tx;

      // Prefer full logRepair signature, fall back to addRepairRecord if older contract
      if (contract["logRepair(uint256,string,string,string,uint256,string)"]) {
        tx = await contract["logRepair(uint256,string,string,string,uint256,string)"](
          activeProductId,
          repairType,
          description,
          partsReplaced,
          costVal,
          ipfsUri
        );
      } else if (contract["logRepair(uint256,string,string,uint256,string)"]) {
        tx = await contract["logRepair(uint256,string,string,uint256,string)"](
          activeProductId,
          description,
          partsReplaced,
          costVal,
          ipfsUri
        );
      } else if (typeof contract.addRepairRecord === "function") {
        tx = await contract.addRepairRecord(activeProductId, repairType, description, ipfsUri);
      } else {
        throw new Error("No repair logging method available on connected contract.");
      }

      showStatus("info", `Transaction submitted (${tx.hash.slice(0, 10)}...). Waiting for block confirmation...`);
      const receipt = await tx.wait();

      const etherscanUrl = `https://sepolia.etherscan.io/tx/${receipt.hash}`;
      const successHtml = `
        <strong>\u2705 Service Record Successfully Logged On-Chain!</strong><br>
        Transaction confirmed in block #${receipt.blockNumber}.
        <a href="${etherscanUrl}" target="_blank" rel="noopener noreferrer" style="color: #60a5fa; text-decoration: underline; margin-left: 0.5rem;">
          View on Sepolia Etherscan \u2197
        </a>
      `;
      showStatus("success", successHtml, true);

      // Reset specific form fields but keep product identifier
      document.getElementById("repairDescription").value = "";
      document.getElementById("partsReplaced").value = "";
      document.getElementById("repairCost").value = "";
      if (fileInput) fileInput.value = "";

      // Refresh product repair history table
      await loadProductRepairs(contract, activeProductId);
    } catch (err) {
      console.error("Repair transaction failed:", err);
      const friendlyErr = ReLifeWallet.parseError(err);
      showStatus("danger", `Transaction failed: ${friendlyErr}`);
    } finally {
      submitRepairBtn.disabled = false;
      if (repairSpinner) repairSpinner.style.display = "none";
    }
  });

  // 7. Status Banner Helper
  function showStatus(type, msg, isHtml = false) {
    if (!txStatusCard || !txStatusMessage) return;

    txStatusCard.className = `alert alert-${type}`;
    if (isHtml) {
      txStatusMessage.innerHTML = msg;
    } else {
      txStatusMessage.textContent = msg;
    }
    txStatusCard.style.display = "block";
    txStatusCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
});
