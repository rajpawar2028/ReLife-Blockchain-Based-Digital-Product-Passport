/**
 * ReLife - Manufacturer Dashboard Logic
 * Role checking, IPFS metadata upload, and on-chain product registration
 */

document.addEventListener("DOMContentLoaded", async () => {
  const connectBtn = document.getElementById("connectWalletBtn");
  const walletBadge = document.getElementById("walletBadge");
  const authSection = document.getElementById("authSection");
  const unauthorizedAlert = document.getElementById("unauthorizedAlert");
  const registrationCard = document.getElementById("registrationCard");
  const productForm = document.getElementById("productForm");
  const submitBtn = document.getElementById("submitProductBtn");
  const submitSpinner = document.getElementById("submitSpinner");
  const txStatusCard = document.getElementById("txStatusCard");
  const txStatusMessage = document.getElementById("txStatusMessage");
  const productsTableBody = document.getElementById("productsTableBody");
  const noProductsRow = document.getElementById("noProductsRow");

  const API_BASE = window.location.origin.includes("5000")
    ? window.location.origin
    : "http://localhost:5000";

  let userAccount = null;
  let isManufacturer = false;

  // Initialize Wallet
  await ReLifeWallet.init();
  updateWalletUI();

  // Connect button click
  connectBtn.addEventListener("click", async () => {
    try {
      connectBtn.disabled = true;
      connectBtn.innerText = "Connecting...";
      await ReLifeWallet.connect();
      await updateWalletUI();
    } catch (err) {
      alert("Failed to connect wallet: " + err.message);
    } finally {
      connectBtn.disabled = false;
      connectBtn.innerText = "Connect Wallet";
    }
  });

  // Re-check on account change
  ReLifeWallet.on("accountChanged", async () => {
    await updateWalletUI();
  });

  /**
   * Updates wallet connection status and role-based UI visibility.
   */
  async function updateWalletUI() {
    userAccount = ReLifeWallet.account;

    if (!userAccount) {
      walletBadge.innerHTML = `<span class="badge badge-warning">Disconnected</span>`;
      authSection.style.display = "block";
      unauthorizedAlert.style.display = "none";
      registrationCard.style.display = "none";
      return;
    }

    const shortAddr = `${userAccount.slice(0, 6)}...${userAccount.slice(-4)}`;
    walletBadge.innerHTML = `
      <span class="badge badge-info">${shortAddr}</span>
    `;

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
        authSection.style.display = "none";
        unauthorizedAlert.style.display = "none";
        registrationCard.style.display = "block";
        await loadManufacturerProducts(userAccount);
      } else {
        authSection.style.display = "none";
        unauthorizedAlert.style.display = "block";
        document.getElementById("unauthorizedAddress").innerText = userAccount;
        registrationCard.style.display = "none";
      }
    } catch (err) {
      console.error("Role verification failed:", err);
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

        const fileRes = await fetch(`${API_BASE}/api/ipfs/upload-file`, {
          method: "POST",
          body: formData,
        });

        if (!fileRes.ok) {
          const errData = await fileRes.json();
          throw new Error(errData.error || "File upload to IPFS failed.");
        }

        const fileData = await fileRes.json();
        imageUri = fileData.ipfsUri;
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
      };

      const metaRes = await fetch(`${API_BASE}/api/ipfs/upload-metadata`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metadataPayload),
      });

      if (!metaRes.ok) {
        const errData = await metaRes.json();
        throw new Error(errData.details ? errData.details.join(", ") : errData.error);
      }

      const metaResult = await metaRes.json();
      const metadataURI = metaResult.ipfsUri;
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

      // 4. Submit transaction on-chain via MetaMask
      showStatus("info", "Step 4/4: Please confirm the transaction in MetaMask...");

      const contract = ReLifeWallet.contract;
      const tx = contract.registerProductWithSecret && authenticityHash !== ethers.ZeroHash
        ? await contract.registerProductWithSecret(serialNumber, model, brand, metadataURI, authenticityHash)
        : await contract.registerProduct(serialNumber, model, brand, metadataURI);

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
   * Loads products registered by the current manufacturer
   */
  async function loadManufacturerProducts(manufacturerAddress) {
    try {
      const contract = ReLifeWallet.contract || ReLifeWallet.getReadOnlyContract();
      if (!contract) return;

      const filter = contract.filters.ProductRegistered(null, null, manufacturerAddress);
      const events = await contract.queryFilter(filter, -5000); // query recent 5000 blocks

      if (events.length === 0) {
        if (noProductsRow) noProductsRow.style.display = "table-row";
        return;
      }

      if (noProductsRow) noProductsRow.style.display = "none";
      productsTableBody.innerHTML = "";

      // Fetch on-chain Product struct for each registered ID.
      // In Solidity, dynamic indexed event parameters (string indexed serialNumber) are hashed
      // as keccak256 topics. Ethers.js decodes them as Indexed objects ({ hash, _isIndexed }),
      // NOT as the original plaintext serial string. Querying getProduct(id) retrieves the true
      // unhashed serial string from contract storage.
      const rawProducts = await Promise.all(
        events.map(async (event) => {
          try {
            const raw = await contract.getProduct(event.args.productId);
            return raw;
          } catch (err) {
            console.warn(`Could not fetch details for product #${event.args.productId}:`, err);
            return null;
          }
        })
      );

      rawProducts.reverse().forEach((raw) => {
        if (!raw) return;
        const prod = ReLifeWallet.formatProduct(raw);

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
        tr.appendChild(tdDate);
        tr.appendChild(tdAction);

        productsTableBody.appendChild(tr);
      });
    } catch (err) {
      console.warn("Could not load manufacturer product logs:", err.message);
    }
  }
});

