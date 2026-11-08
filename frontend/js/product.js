/**
 * ReLife - Product Passport Verification Controller
 * Direct smart contract reading, dynamic QR generation, and camera scanner
 */

document.addEventListener("DOMContentLoaded", async () => {
  const productIdInput = document.getElementById("productIdInput");
  const verifyBtn = document.getElementById("verifyBtn");
  const toggleScannerBtn = document.getElementById("toggleScannerBtn");
  const closeScannerBtn = document.getElementById("closeScannerBtn");
  const scannerWrapper = document.getElementById("scannerWrapper");
  const loadingCard = document.getElementById("loadingCard");
  const notFoundCard = document.getElementById("notFoundCard");
  const searchedIdDisplay = document.getElementById("searchedIdDisplay");
  const passportCard = document.getElementById("passportCard");

  // Passport Elements
  const viewProdTitle = document.getElementById("viewProdTitle");
  const viewProdBrand = document.getElementById("viewProdBrand");
  const viewProdId = document.getElementById("viewProdId");
  const viewProdSerial = document.getElementById("viewProdSerial");
  const viewProdManufacturer = document.getElementById("viewProdManufacturer");
  const viewProdOwner = document.getElementById("viewProdOwner");
  const viewProdDate = document.getElementById("viewProdDate");
  const viewProdIpfs = document.getElementById("viewProdIpfs");
  const recycledBadge = document.getElementById("recycledBadge");
  const qrcodeContainer = document.getElementById("qrcodeContainer");

  // IPFS Metadata Elements
  const viewProdCarbon = document.getElementById("viewProdCarbon");
  const viewProdRecyclability = document.getElementById("viewProdRecyclability");
  const viewProdOrigin = document.getElementById("viewProdOrigin");
  const viewProdMaterials = document.getElementById("viewProdMaterials");

  // Timeline
  const repairTimeline = document.getElementById("repairTimeline");
  const noRepairsNotice = document.getElementById("noRepairsNotice");

  // Wallet elements
  const connectBtn = document.getElementById("connectWalletBtn");
  const walletBadge = document.getElementById("walletBadge");

  let html5QrcodeScanner = null;

  // Initialize wallet helper
  await ReLifeWallet.init();
  updateWalletUI();

  if (connectBtn) {
    connectBtn.addEventListener("click", async () => {
      try {
        connectBtn.disabled = true;
        connectBtn.innerText = "Connecting...";
        await ReLifeWallet.connect();
        updateWalletUI();
      } catch (err) {
        alert("Wallet connection error: " + err.message);
      } finally {
        connectBtn.disabled = false;
        connectBtn.innerText = "Connect Wallet";
      }
    });
  }

  ReLifeWallet.on("accountChanged", updateWalletUI);
  ReLifeWallet.on("connected", updateWalletUI);

  function updateWalletUI() {
    if (!walletBadge) return;
    if (ReLifeWallet.account) {
      const a = ReLifeWallet.account;
      walletBadge.innerHTML = `<span class="badge badge-info">${a.slice(0, 6)}...${a.slice(-4)}</span>`;
      if (connectBtn) connectBtn.style.display = "none";
    } else {
      walletBadge.innerHTML = `<span class="badge badge-warning">Disconnected</span>`;
      if (connectBtn) connectBtn.style.display = "inline-flex";
    }
  }

  // 1. Check for URL Query Param (?id=N or ?serial=SN...)
  const urlParams = new URLSearchParams(window.location.search);
  const idFromUrl = urlParams.get("id");
  const serialFromUrl = urlParams.get("serial");

  if (idFromUrl) {
    productIdInput.value = idFromUrl;
    await verifyProductPassport(idFromUrl);
  } else if (serialFromUrl) {
    productIdInput.value = serialFromUrl;
    await verifyBySerial(serialFromUrl);
  }

  // 2. Manual Search Button Listener
  verifyBtn.addEventListener("click", async () => {
    const query = productIdInput.value.trim();
    if (!query) {
      alert("Please enter a valid Product ID or Serial Number.");
      return;
    }

    if (/^\d+$/.test(query)) {
      await verifyProductPassport(query);
    } else {
      await verifyBySerial(query);
    }
  });

  productIdInput.addEventListener("keypress", async (e) => {
    if (e.key === "Enter") {
      verifyBtn.click();
    }
  });

  // 3. Camera Scanner Controls
  toggleScannerBtn.addEventListener("click", () => {
    startCameraScanner();
  });

  closeScannerBtn.addEventListener("click", () => {
    stopCameraScanner();
  });

  function startCameraScanner() {
    scannerWrapper.style.display = "block";

    if (!html5QrcodeScanner && window.Html5QrcodeScanner) {
      html5QrcodeScanner = new Html5QrcodeScanner(
        "qr-reader",
        { fps: 10, qrbox: { width: 250, height: 250 } },
        /* verbose= */ false
      );

      html5QrcodeScanner.render(
        (decodedText) => {
          console.log("QR Code Scanned:", decodedText);
          stopCameraScanner();

          try {
            const url = new URL(decodedText);
            const scannedId = url.searchParams.get("id");
            if (scannedId) {
              productIdInput.value = scannedId;
              verifyProductPassport(scannedId);
              return;
            }
          } catch (_) {
            // Not a full URL, treat as raw ID or serial
          }

          productIdInput.value = decodedText;
          if (/^\d+$/.test(decodedText)) {
            verifyProductPassport(decodedText);
          } else {
            verifyBySerial(decodedText);
          }
        },
        (errorMessage) => {
          // Scanner scanning frame callback - ignore frame noise
        }
      );
    }
  }

  function stopCameraScanner() {
    if (html5QrcodeScanner) {
      html5QrcodeScanner.clear().catch(console.error);
      html5QrcodeScanner = null;
    }
    scannerWrapper.style.display = "none";
  }

  /**
   * Primary verification logic querying the smart contract
   */
  async function verifyProductPassport(productIdNum) {
    showLoading();

    try {
      const contract = ReLifeWallet.contract || ReLifeWallet.getReadOnlyContract();
      if (!contract) {
        throw new Error("Smart contract configuration not loaded.");
      }

      const pId = BigInt(productIdNum);
      const result = await contract.verifyProduct(pId);

      if (!result.isValid) {
        showNotFound(productIdNum);
        return;
      }

      // Populate core blockchain details
      const [
        isValid,
        manufacturer,
        modelName,
        brand,
        serialNumber,
        currentOwner,
        manufacturingTimestamp,
        metadataURI,
        isRecycled,
      ] = result;

      viewProdId.innerText = `#${pId.toString()}`;
      viewProdTitle.innerText = `${brand} ${modelName}`;
      viewProdBrand.innerText = `${brand} — Serial: ${serialNumber}`;
      viewProdSerial.innerText = serialNumber;
      viewProdManufacturer.innerText = manufacturer;
      viewProdOwner.innerText = currentOwner;
      viewProdDate.innerText = new Date(Number(manufacturingTimestamp) * 1000).toLocaleString();

      // Metadata URI display
      viewProdIpfs.innerText = metadataURI;
      const gatewayUrl = metadataURI.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/");
      viewProdIpfs.href = gatewayUrl;

      // Recycled status badge
      if (isRecycled) {
        recycledBadge.style.display = "inline-flex";
      } else {
        recycledBadge.style.display = "none";
      }

      // Render Dynamic QR Code linking directly to this passport
      renderPassportQR(pId.toString());

      // Fetch IPFS Metadata for sustainability metrics
      await loadIpfsMetadata(metadataURI);

      // Fetch Verifiable Repair History
      await loadRepairHistory(contract, pId);

      showPassport();
    } catch (err) {
      console.error("Verification error:", err);
      showNotFound(productIdNum);
    }
  }

  /**
   * Lookup passport by serial number
   */
  async function verifyBySerial(serial) {
    showLoading();
    try {
      const contract = ReLifeWallet.contract || ReLifeWallet.getReadOnlyContract();
      const product = await contract.getProductBySerial(serial);
      if (product && product.id) {
        await verifyProductPassport(product.id.toString());
      } else {
        showNotFound(serial);
      }
    } catch (err) {
      console.warn("Serial lookup error:", err);
      showNotFound(serial);
    }
  }

  /**
   * Generates dynamic QR code client-side
   */
  function renderPassportQR(productId) {
    qrcodeContainer.innerHTML = "";
    const passportUrl = `${window.location.origin}/product.html?id=${productId}`;

    if (window.QRCode) {
      new QRCode(qrcodeContainer, {
        text: passportUrl,
        width: 140,
        height: 140,
        colorDark: "#0b1120",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M,
      });
    }
  }

  /**
   * Loads off-chain metadata from IPFS
   */
  async function loadIpfsMetadata(metadataURI) {
    // Reset fields
    viewProdCarbon.innerText = "Loading...";
    viewProdRecyclability.innerText = "Loading...";
    viewProdOrigin.innerText = "Loading...";
    viewProdMaterials.innerText = "Loading...";

    if (!metadataURI) return;

    try {
      const url = metadataURI.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/");
      const response = await fetch(url, { signal: AbortSignal.timeout(5000) });

      if (response.ok) {
        const data = await response.json();
        viewProdCarbon.innerText = data.sustainability?.carbonFootprintKg
          ? `${data.sustainability.carbonFootprintKg} kg CO₂e`
          : "N/A";
        viewProdRecyclability.innerText = data.sustainability?.recyclabilityScore
          ? `${data.sustainability.recyclabilityScore}%`
          : "N/A";
        viewProdOrigin.innerText = data.sustainability?.originCountry || "Not Specified";
        viewProdMaterials.innerText = Array.isArray(data.materials)
          ? data.materials.join(", ")
          : (data.materials || "Standard materials");
      } else {
        throw new Error("IPFS Gateway timeout or unavailable");
      }
    } catch (e) {
      console.log("IPFS metadata note:", e.message);
      viewProdCarbon.innerText = "Available via IPFS";
      viewProdRecyclability.innerText = "Available via IPFS";
      viewProdOrigin.innerText = "Verified in Passport";
      viewProdMaterials.innerText = "Auditable via IPFS URI";
    }
  }

  /**
   * Loads repair history array from contract
   */
  async function loadRepairHistory(contract, productId) {
    try {
      const repairs = await contract.getProductHistory(productId);

      if (!repairs || repairs.length === 0) {
        noRepairsNotice.style.display = "block";
        repairTimeline.style.display = "none";
        return;
      }

      noRepairsNotice.style.display = "none";
      repairTimeline.style.display = "block";
      repairTimeline.innerHTML = "";

      repairs.forEach((record) => {
        const item = document.createElement("div");
        item.className = "timeline-item";

        const dateStr = new Date(Number(record.timestamp) * 1000).toLocaleString();
        const shortCenter = `${record.repairCenter.slice(0, 6)}...${record.repairCenter.slice(-4)}`;

        item.innerHTML = `
          <div class="timeline-date">${dateStr} &bull; Certified Center: <code>${shortCenter}</code></div>
          <div class="timeline-type">${record.repairType} (Service #${record.id.toString()})</div>
          <div class="timeline-desc">${record.description}</div>
          <div style="margin-top: 0.35rem;">
            <a href="${record.serviceUri.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/")}" target="_blank" style="color: var(--secondary); font-size: 0.8rem; text-decoration: underline;">
              View Diagnostic Report (IPFS) &rarr;
            </a>
          </div>
        `;

        repairTimeline.appendChild(item);
      });
    } catch (err) {
      console.warn("Could not query repair history:", err.message);
      noRepairsNotice.style.display = "block";
      repairTimeline.style.display = "none";
    }
  }

  function showLoading() {
    loadingCard.style.display = "block";
    notFoundCard.style.display = "none";
    passportCard.style.display = "none";
  }

  function showNotFound(id) {
    loadingCard.style.display = "none";
    searchedIdDisplay.innerText = id;
    notFoundCard.style.display = "block";
    passportCard.style.display = "none";
  }

  function showPassport() {
    loadingCard.style.display = "none";
    notFoundCard.style.display = "none";
    passportCard.style.display = "block";
  }
});

