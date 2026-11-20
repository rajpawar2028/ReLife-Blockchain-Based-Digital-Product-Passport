/**
 * ReLife - Manufacturer Dashboard Logic
 * Role checking, IPFS metadata upload, and on-chain product registration
 */

document.addEventListener("DOMContentLoaded", async () => {
  const connectBtn = document.getElementById("connectWalletBtn");
  const walletBadge = document.getElementById("walletBadge");
  const authSection = document.getElementById("authSection");
  const unauthorizedAlert = document.getElementById("unauthorizedAlert");
  const wrongNetworkAlert = document.getElementById("wrongNetworkAlert");
  const btnSwitchNetwork = document.getElementById("btnSwitchNetwork");
  const currentNetworkName = document.getElementById("currentNetworkName");
  const registrationCard = document.getElementById("registrationCard");
  const productForm = document.getElementById("productForm");
  const submitBtn = document.getElementById("submitProductBtn");
  const submitSpinner = document.getElementById("submitSpinner");
  const txStatusCard = document.getElementById("txStatusCard");
  const txStatusMessage = document.getElementById("txStatusMessage");
  const productsTableBody = document.getElementById("productsTableBody");
  const noProductsRow = document.getElementById("noProductsRow");
  const tablePagination = document.getElementById("tablePagination");
  const pageSizeSelect = document.getElementById("pageSizeSelect");
  const pageInfo = document.getElementById("pageInfo");
  const prevPageBtn = document.getElementById("prevPageBtn");
  const nextPageBtn = document.getElementById("nextPageBtn");
  const tableLoadingSpinner = document.getElementById("tableLoadingSpinner");

  let currentPage = 1;
  let pageSize = 10;
  let totalManufacturerProducts = 0;

  // Centralized API Base URL resolved from shared ReLifeWallet module
  const API_BASE = ReLifeWallet.getApiBase();

  let userAccount = null;
  let isManufacturer = false;

  // 1. Attach Connect button click handler immediately (so it is never blocked)
  if (connectBtn) {
    connectBtn.addEventListener("click", async () => {
      try {
        connectBtn.disabled = true;
        connectBtn.innerText = "Connecting...";
        await ReLifeWallet.connect();
        await updateWalletUI();
      } catch (err) {
        console.error("Wallet connection failed:", err);
        showStatus("danger", "Failed to connect wallet: " + (err.reason || err.message || err));
      } finally {
        connectBtn.disabled = false;
        connectBtn.innerText = "Connect Wallet";
      }
    });
  }

  // Network Switch Button
  if (btnSwitchNetwork) {
    btnSwitchNetwork.addEventListener("click", async () => {
      try {
        await ReLifeWallet.switchToSepolia();
        await updateWalletUI();
      } catch (err) {
        showStatus("danger", "Failed to switch network: " + (err.reason || err.message || err));
      }
    });
  }

  // 2. Re-check on account change
  ReLifeWallet.on("accountChanged", async () => {
    currentPage = 1;
    await updateWalletUI();
  });

  // Re-check on chain change
  ReLifeWallet.on("chainChanged", async () => {
    currentPage = 1;
    await updateWalletUI();
  });

  // 3. Initialize Wallet Session in try/catch (restores existing connection without popup)
  try {
    await ReLifeWallet.init();
    await updateWalletUI();
  } catch (initErr) {
    console.error("Wallet initialization failed:", initErr);
    showStatus("danger", "Wallet initialization failed: " + (initErr.message || initErr));
  }

  // Pagination controls
  if (pageSizeSelect) {
    pageSizeSelect.addEventListener("change", async (e) => {
      pageSize = parseInt(e.target.value, 10) || 10;
      currentPage = 1;
      await loadManufacturerProducts(userAccount);
    });
  }

  if (prevPageBtn) {
    prevPageBtn.addEventListener("click", async () => {
      if (currentPage > 1) {
        currentPage--;
        await loadManufacturerProducts(userAccount);
      }
    });
  }

  if (nextPageBtn) {
    nextPageBtn.addEventListener("click", async () => {
      const maxPage = Math.ceil(totalManufacturerProducts / pageSize) || 1;
      if (currentPage < maxPage) {
        currentPage++;
        await loadManufacturerProducts(userAccount);
      }
    });
  }

  /**
   * Updates wallet connection status and role-based UI visibility.
   */
  async function updateWalletUI() {
    userAccount = ReLifeWallet.account;

    // State 1: Disconnected
    if (!userAccount) {
      if (walletBadge) walletBadge.innerHTML = `<span class="badge badge-warning">Disconnected</span>`;
      if (authSection) authSection.style.display = "block";
      if (unauthorizedAlert) unauthorizedAlert.style.display = "none";
      if (wrongNetworkAlert) wrongNetworkAlert.style.display = "none";
      if (registrationCard) registrationCard.style.display = "none";
      return;
    }

    const shortAddr = `${userAccount.slice(0, 6)}...${userAccount.slice(-4)}`;
    if (walletBadge) {
      walletBadge.innerHTML = `<span class="badge badge-info">${shortAddr}</span>`;
    }

    // State 2: Wrong Network or Missing Deployed Bytecode
    const chainId = ReLifeWallet.chainId;
    const isSepolia = (chainId === 11155111n || chainId === 11155111);
    const isHardhat = (chainId === 31337n || chainId === 31337);

    let hasBytecode = true;
    const provider = ReLifeWallet.provider || (window.ethereum ? new ethers.BrowserProvider(window.ethereum) : null);
    if (provider && window.RELIFE_CONFIG?.address) {
      try {
        const code = await provider.getCode(window.RELIFE_CONFIG.address);
        if (code === "0x" || code === "0x0") hasBytecode = false;
      } catch (_) {}
    }

    if ((!isSepolia && !isHardhat) || !hasBytecode) {
      if (authSection) authSection.style.display = "none";
      if (unauthorizedAlert) unauthorizedAlert.style.display = "none";
      if (registrationCard) registrationCard.style.display = "none";
      if (wrongNetworkAlert) {
        wrongNetworkAlert.style.display = "block";
        if (currentNetworkName) {
          currentNetworkName.textContent = chainId ? `Chain ID ${chainId}` : "Unsupported Network";
        }
      }
      return;
    }
    if (wrongNetworkAlert) wrongNetworkAlert.style.display = "none";

    // Check MANUFACTURER_ROLE on-chain
    try {
      const contract = ReLifeWallet.contract || ReLifeWallet.getReadOnlyContract();
      if (!contract) {
        console.warn("Contract not attached yet.");
        return;
      }

      const roleHash = await contract.MANUFACTURER_ROLE();
      isManufacturer = await contract.hasRole(roleHash, userAccount);

      if (isManufacturer) {
        // State 4: Authorized Manufacturer
        if (authSection) authSection.style.display = "none";
        if (unauthorizedAlert) unauthorizedAlert.style.display = "none";
        if (registrationCard) registrationCard.style.display = "block";
        await loadManufacturerProducts(userAccount);
      } else {
        // State 3: Connected but Unauthorized
        if (authSection) authSection.style.display = "none";
        if (unauthorizedAlert) unauthorizedAlert.style.display = "block";
        const unauthAddrEl = document.getElementById("unauthorizedAddress");
        if (unauthAddrEl) unauthAddrEl.innerText = userAccount;
        if (registrationCard) registrationCard.style.display = "none";
      }
    } catch (err) {
      console.error("Role verification failed:", err);
      showStatus("danger", "Failed to verify manufacturer role on-chain: " + (err.reason || err.message));
    }
  }

  /**
   * Handle Product Registration Form Submit
   */
  productForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!isManufacturer || !ReLifeWallet.contract) {
      alert("Only an authorized manufacturer wallet can register products.");
      return;
    }

    const name = document.getElementById("prodName").value.trim();
    const description = document.getElementById("description").value.trim();
    const brand = document.getElementById("prodBrand").value.trim();
    const model = document.getElementById("prodModel").value.trim();
    const serialNumber = document.getElementById("prodSerial").value.trim();
    const category = document.getElementById("prodCategory").value;
    const materials = document.getElementById("prodMaterials").value.trim();
    const carbonFootprintKg = document.getElementById("prodCarbon").value;
    const originCountry = document.getElementById("prodOrigin").value.trim();
    const recyclabilityScore = document.getElementById("prodRecyclability").value;
    const fileInput = document.getElementById("prodFile");

    // Warranty Fields
    const warrantyPeriodInput = document.getElementById("warrantyPeriod");
    const warrantyUnitInput = document.getElementById("warrantyUnit");
    const warrantyCoverageInput = document.getElementById("warrantyCoverage");

    let periodVal = Number(warrantyPeriodInput ? warrantyPeriodInput.value : 12);
    if (isNaN(periodVal) || periodVal < 0) periodVal = 0;
    const unitVal = warrantyUnitInput ? warrantyUnitInput.value : "months";
    let warrantyMonths = unitVal === "years" ? periodVal * 12 : periodVal;
    if (warrantyMonths > 120) warrantyMonths = 120;
    const warrantyCoverage = warrantyCoverageInput ? warrantyCoverageInput.value.trim() : "";

    // UI Loading state
    submitBtn.disabled = true;
    submitSpinner.style.display = "inline-block";
    showStatus("info", "Step 1/3: Preparing metadata and uploading to Pinata IPFS...");

    try {
      let imageUri = "";

      // 1. Upload optional image or document file to IPFS
      if (fileInput.files.length > 0) {
        showStatus("info", "Uploading product document/photo to IPFS via backend...");
        const formData = new FormData();
        formData.append("file", fileInput.files[0]);

        let fileRes;
        try {
          fileRes = await fetch(`${API_BASE}/api/ipfs/upload-file`, {
            method: "POST",
            body: formData,
          });
        } catch (fetchErr) {
          throw new Error(
            `Backend API unreachable at ${API_BASE}. Please verify that the Express backend is running on port 5000 and CORS is permitted.`
          );
        }

        const fileData = await fileRes.json().catch(() => ({}));
        if (!fileRes.ok) {
          const errMsg = fileData.details || fileData.error || `File upload failed with status ${fileRes.status}`;
          throw new Error(errMsg);
        }

        imageUri = fileData.ipfsUri;
        if (!imageUri) {
          throw new Error("File upload succeeded but no IPFS URI was returned by the backend.");
        }
      }

      // 2. Upload structured DPP metadata JSON to IPFS
      showStatus("info", "Step 2/3: Pinning product passport JSON metadata to IPFS...");
      const metadataPayload = {
        name,
        description,
        brand,
        model,
        serialNumber,
        category,
        materials: materials ? materials.split(",").map((m) => m.trim()) : [],
        carbonFootprintKg: Number(carbonFootprintKg) || 0,
        originCountry: originCountry || "Not Specified",
        recyclabilityScore: Number(recyclabilityScore) || 0,
        imageUri,
        warrantyMonths,
        warrantyCoverage,
        warrantyUnit: unitVal,
      };

      let metaRes;
      try {
        metaRes = await fetch(`${API_BASE}/api/ipfs/upload-metadata`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(metadataPayload),
        });
      } catch (fetchErr) {
        throw new Error(
          `Backend API unreachable at ${API_BASE}. Please verify that the Express backend is running on port 5000 and CORS is permitted.`
        );
      }

      const metaResult = await metaRes.json().catch(() => ({}));
      if (!metaRes.ok) {
        const errorDetail = Array.isArray(metaResult.details)
          ? metaResult.details.join(", ")
          : (metaResult.details || metaResult.error || `Upload failed with status ${metaRes.status}`);
        throw new Error(errorDetail);
      }

      const metadataURI = metaResult.ipfsUri;
      if (!metadataURI || typeof metadataURI !== "string" || !metadataURI.startsWith("ipfs://")) {
        throw new Error("Metadata upload failed: Backend returned an invalid or missing IPFS URI.");
      }
      console.log("Metadata pinned to IPFS:", metadataURI);

      // 3. Generate off-chain cryptographic authenticity secret & on-chain hash
      showStatus("info", "Step 3/4: Generating off-chain authenticity secret...");
      let authenticitySecret = "";
      let authenticityHash = ethers.ZeroHash;

      try {
        const secRes = await fetch(`${API_BASE}/api/authenticity/generate-secret`);
        if (secRes.ok) {
          const secData = await secRes.json();
          authenticitySecret = secData.secret;
          authenticityHash = secData.hash;
        }
      } catch (secErr) {
        console.warn("Could not fetch authenticity secret from backend:", secErr);
      }

      // 4. Submit transaction on-chain via MetaMask (ONLY reached if upload succeeded!)
      showStatus("info", "Step 4/4: Please confirm the transaction in MetaMask...");

      const contract = ReLifeWallet.contract;
      let tx;
      if (contract.registerProductWithWarranty) {
        tx = await contract.registerProductWithWarranty(
          serialNumber,
          model,
          brand,
          metadataURI,
          authenticityHash,
          BigInt(warrantyMonths),
          warrantyCoverage
        );
      } else if (contract.registerProductWithSecret && authenticityHash !== ethers.ZeroHash) {
        tx = await contract.registerProductWithSecret(serialNumber, model, brand, metadataURI, authenticityHash);
      } else {
        tx = await contract.registerProduct(serialNumber, model, brand, metadataURI);
      }

      showStatus("info", `Transaction submitted! Mining block on chain: ${tx.hash}`);

      // Wait for block receipt
      const receipt = await tx.wait(1);

      // Extract new productId from ProductRegistered event
      let newProductId = null;
      for (const log of receipt.logs) {
        try {
          const parsed = contract.interface.parseLog(log);
          if (parsed && parsed.name === "ProductRegistered") {
            newProductId = parsed.args[0].toString();
            break;
          }
        } catch (_) {}
      }

      const passportUrl = authenticitySecret
        ? `/product.html?id=${newProductId}&secret=${authenticitySecret}`
        : `/product.html?id=${newProductId}`;

      showStatus(
        "success",
        `🎉 Product Passport successfully registered on-chain! Product ID: #${newProductId || "Confirmed"}. <br>
         <div style="margin-top:0.5rem; font-size:0.85rem;">
           <strong>Authenticity Secret:</strong> Embedded in QR / physical packaging link (never stored on-chain or database).<br>
           <a href="${passportUrl}" target="_blank" style="color:#10b981; font-weight:bold; text-decoration:underline;">
             View Passport & Test Authenticity Secret &rarr;
           </a>
         </div>`
      );

      // Reset form and reload products table
      productForm.reset();
      await loadManufacturerProducts(userAccount);
    } catch (err) {
      console.error("Registration error:", err);
      showStatus("danger", `Registration failed: ${err.reason || err.message}`);
    } finally {
      submitBtn.disabled = false;
      submitSpinner.style.display = "none";
    }
  });

  /**
   * Helper to display status alerts
   */
  function showStatus(type, html) {
    txStatusCard.style.display = "block";
    txStatusCard.className = `alert alert-${type}`;
    txStatusMessage.innerHTML = html;
  }

  /**
   * Loads products registered by the current manufacturer with pagination support
   */
  async function loadManufacturerProducts(manufacturerAddress) {
    if (!manufacturerAddress) return;
    try {
      const contract = ReLifeWallet.contract || ReLifeWallet.getReadOnlyContract();
      if (!contract) return;

      if (tableLoadingSpinner) tableLoadingSpinner.style.display = "inline";

      let products = [];
      let total = 0;

      // 1. Query paginated contract method
      if (typeof contract.getProductsByManufacturerPaginated === "function") {
        const offset = BigInt((currentPage - 1) * pageSize);
        const limit = BigInt(pageSize);
        const res = await contract.getProductsByManufacturerPaginated(manufacturerAddress, offset, limit);
        products = res[0] || res.items || [];
        total = Number(res[1] !== undefined ? res[1] : (res.total || 0));
      } else {
        // Fallback for older contract deployments
        const filter = contract.filters.ProductRegistered(null, null, manufacturerAddress);
        const events = await contract.queryFilter(filter, -5000);
        total = events.length;
        const pageEvents = events.slice((currentPage - 1) * pageSize, currentPage * pageSize);
        products = await Promise.all(pageEvents.map((ev) => contract.getProduct(ev.args.productId)));
      }

      totalManufacturerProducts = total;

      if (total === 0 || products.length === 0) {
        if (noProductsRow) noProductsRow.style.display = "table-row";
        if (tablePagination) tablePagination.style.display = "none";
        productsTableBody.innerHTML = "";
        productsTableBody.appendChild(noProductsRow);
        return;
      }

      if (noProductsRow) noProductsRow.style.display = "none";
      if (tablePagination) tablePagination.style.display = "flex";

      // Update Pagination controls
      const totalPages = Math.ceil(total / pageSize) || 1;
      if (pageInfo) {
        pageInfo.textContent = `Page ${currentPage} of ${totalPages} (${total} item${total === 1 ? "" : "s"})`;
      }
      if (prevPageBtn) {
        prevPageBtn.disabled = (currentPage <= 1);
      }
      if (nextPageBtn) {
        nextPageBtn.disabled = (currentPage >= totalPages);
      }

      productsTableBody.innerHTML = "";

      // Fetch warranties for the items on this page (bounded to page size: 5 to 25 items)
      const rawProducts = await Promise.all(
        products.map(async (raw) => {
          try {
            const pId = raw.id !== undefined ? raw.id : raw[0];
            let warranty = null;
            let isExpired = false;
            try {
              const res = await contract.getWarranty(pId);
              warranty = res[0];
              isExpired = res[1];
            } catch (_) {}
            return { raw, warranty, isExpired };
          } catch (err) {
            console.warn(`Could not fetch details for product:`, err);
            return { raw, warranty: null, isExpired: false };
          }
        })
      );

      rawProducts.forEach((item) => {
        if (!item || !item.raw) return;
        const prod = ReLifeWallet.formatProduct(item.raw);
        const wInfo = ReLifeWallet.formatWarranty(item.warranty, item.isExpired);

        const tr = document.createElement("tr");

        // Use safe textContent to prevent XSS and prevent object coercion bugs
        const tdId = document.createElement("td");
        const strongId = document.createElement("strong");
        strongId.textContent = `#${prod.idStr}`;
        tdId.appendChild(strongId);

        const tdSerial = document.createElement("td");
        const codeSerial = document.createElement("code");
        codeSerial.textContent = prod.serialNumber;
        tdSerial.appendChild(codeSerial);

        const tdModel = document.createElement("td");
        tdModel.textContent = prod.displayName;

        const tdWarranty = document.createElement("td");
        const spanW = document.createElement("span");
        spanW.className = `badge ${wInfo.badgeClass}`;
        spanW.textContent = wInfo.statusText;
        tdWarranty.appendChild(spanW);

        const tdDate = document.createElement("td");
        tdDate.textContent = prod.formattedDate;

        const tdAction = document.createElement("td");
        const viewLink = document.createElement("a");
        viewLink.href = `/product.html?id=${encodeURIComponent(prod.idStr)}`;
        viewLink.className = "btn btn-outline";
        viewLink.style.padding = "0.25rem 0.6rem";
        viewLink.style.fontSize = "0.8rem";
        viewLink.target = "_blank";
        viewLink.textContent = "View Passport";
        tdAction.appendChild(viewLink);

        tr.appendChild(tdId);
        tr.appendChild(tdSerial);
        tr.appendChild(tdModel);
        tr.appendChild(tdWarranty);
        tr.appendChild(tdDate);
        tr.appendChild(tdAction);

        productsTableBody.appendChild(tr);
      });
    } catch (err) {
      console.warn("Could not load manufacturer product logs:", err.message);
    } finally {
      if (tableLoadingSpinner) tableLoadingSpinner.style.display = "none";
    }
  }
});

