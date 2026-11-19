/**
 * ReLife - Product Passport Verification Controller
 * Direct smart contract reading, dynamic QR generation, and camera scanner
 */

document.addEventListener("DOMContentLoaded", async () => {
  const productIdInput = document.getElementById("productIdInput");
  const secretInput = document.getElementById("secretInput");
  const verifyBtn = document.getElementById("verifyBtn");
  const toggleScannerBtn = document.getElementById("toggleScannerBtn");
  const closeScannerBtn = document.getElementById("closeScannerBtn");
  const fallbackManualBtn = document.getElementById("fallbackManualBtn");
  const scannerWrapper = document.getElementById("scannerWrapper");
  const scannerStatusMessage = document.getElementById("scannerStatusMessage");
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
  const viewProdWarranty = document.getElementById("viewProdWarranty");
  const viewProdScanCount = document.getElementById("viewProdScanCount");
  const counterfeitWarningBanner = document.getElementById("counterfeitWarningBanner");
  const counterfeitWarningDetails = document.getElementById("counterfeitWarningDetails");
  const authenticityBadge = document.getElementById("authenticityBadge");
  const secretBadge = document.getElementById("secretBadge");
  const recycledBadge = document.getElementById("recycledBadge");
  const qrcodeContainer = document.getElementById("qrcodeContainer");

  const API_BASE = window.location.origin.includes("5000")
    ? window.location.origin
    : "http://localhost:5000";

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

  // 1. Check for URL Query Param (?id=N or ?serial=SN... and optional &secret=...)
  const urlParams = new URLSearchParams(window.location.search);
  const idFromUrl = urlParams.get("id");
  const serialFromUrl = urlParams.get("serial");
  const secretFromUrl = urlParams.get("secret");

  if (secretFromUrl && secretInput) {
    secretInput.value = secretFromUrl;
  }

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

  if (secretInput) {
    secretInput.addEventListener("keypress", async (e) => {
      if (e.key === "Enter") {
        verifyBtn.click();
      }
    });
  }

  // 3. Camera Scanner Controls & Mobile QR Decoding
  if (toggleScannerBtn) {
    toggleScannerBtn.addEventListener("click", () => {
      startCameraScanner();
    });
  }

  if (closeScannerBtn) {
    closeScannerBtn.addEventListener("click", () => {
      stopCameraScanner();
    });
  }

  if (fallbackManualBtn) {
    fallbackManualBtn.addEventListener("click", () => {
      stopCameraScanner();
      if (productIdInput) {
        productIdInput.focus();
        productIdInput.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    });
  }

  function showScannerAlert(type, message) {
    if (!scannerStatusMessage) return;
    scannerStatusMessage.style.display = "block";
    scannerStatusMessage.className = `alert alert-${type === "error" ? "danger" : type === "warning" ? "warning" : "info"}`;
    scannerStatusMessage.style.background = type === "error" ? "rgba(239, 68, 68, 0.2)" : "rgba(245, 158, 11, 0.2)";
    scannerStatusMessage.style.border = `1px solid ${type === "error" ? "#ef4444" : "#f59e0b"}`;
    scannerStatusMessage.textContent = message;
  }

  function hideScannerAlert() {
    if (scannerStatusMessage) {
      scannerStatusMessage.style.display = "none";
      scannerStatusMessage.textContent = "";
    }
  }

  /**
   * Pure function parsing a decoded QR string into passport identifiers
   */
  function parseQrPayload(raw) {
    if (!raw || typeof raw !== "string") {
      return { invalid: true, reason: "Empty or invalid QR content" };
    }
    const text = raw.trim();

    // 1. JSON payload support: {"id": 1, "secret": "..."}
    if (text.startsWith("{") && text.endsWith("}")) {
      try {
        const parsed = JSON.parse(text);
        const id = parsed.id || parsed.productId;
        const serial = parsed.serial || parsed.serialNumber;
        const secret = parsed.secret || null;
        if (id) {
          return { productId: id.toString(), secret, isUrl: false };
        }
        if (serial) {
          return { serial: serial.toString(), secret, isUrl: false };
        }
      } catch (_) {}
    }

    // 2. URL parsing (absolute or relative)
    try {
      let urlObj = null;
      if (text.startsWith("http://") || text.startsWith("https://")) {
        urlObj = new URL(text);
      } else if (text.includes("product.html") || text.startsWith("/") || text.startsWith("?")) {
        urlObj = new URL(text, "https://relife.local");
      }

      if (urlObj) {
        const id = urlObj.searchParams.get("id") || urlObj.searchParams.get("productId");
        const secret = urlObj.searchParams.get("secret");
        const serial = urlObj.searchParams.get("serial") || urlObj.searchParams.get("serialNumber");

        if (id) {
          return { productId: id.toString(), secret: secret || null, isUrl: true, host: urlObj.host };
        }
        if (serial) {
          return { serial: serial.toString(), secret: secret || null, isUrl: true };
        }
        return { invalid: true, reason: "URL does not contain a product ID or serial number", raw: text };
      }
    } catch (_) {}

    // 3. Query string only (e.g. "id=12&secret=xyz")
    if (text.includes("id=") || text.includes("serial=")) {
      try {
        const params = new URLSearchParams(text.startsWith("?") ? text.slice(1) : text);
        const id = params.get("id") || params.get("productId");
        const secret = params.get("secret");
        const serial = params.get("serial") || params.get("serialNumber");
        if (id) {
          return { productId: id.toString(), secret: secret || null, isUrl: false };
        }
        if (serial) {
          return { serial: serial.toString(), secret: secret || null, isUrl: false };
        }
      } catch (_) {}
    }

    // 4. Raw numeric ID (e.g. "42")
    if (/^\d+$/.test(text)) {
      return { productId: text, secret: null, isUrl: false };
    }

    // 5. Serial number format (e.g. "SN-...", alphanumeric with hyphens)
    if (/^[A-Za-z0-9\-_]{4,}$/.test(text)) {
      return { serial: text, secret: null, isUrl: false };
    }

    return { invalid: true, reason: "Unrecognized QR format", raw: text };
  }

  // Expose parser globally for testability and verification
  window.ReLifeScanner = {
    parseQrPayload,
    startCameraScanner,
    stopCameraScanner,
  };

  async function startCameraScanner() {
    if (!scannerWrapper) return;
    scannerWrapper.style.display = "block";
    hideScannerAlert();

    // Check secure context for mobile devices
    const isLocalhost = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    const isSecure = window.isSecureContext || window.location.protocol === "https:" || isLocalhost;

    if (!isSecure) {
      showScannerAlert(
        "warning",
        "Camera blocked: Mobile browsers require HTTPS. Please connect via HTTPS tunnel (ngrok / cloudflared) or use manual entry below."
      );
      if (productIdInput) productIdInput.focus();
    }

    if (!window.Html5QrcodeScanner && !window.Html5Qrcode) {
      showScannerAlert(
        "error",
        "QR Scanner library could not be loaded. Please enter Product ID manually below."
      );
      if (productIdInput) productIdInput.focus();
      return;
    }

    if (html5QrcodeScanner) {
      return; // Already initialized
    }

    try {
      html5QrcodeScanner = new Html5QrcodeScanner(
        "qr-reader",
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          rememberLastUsedCamera: true,
        },
        /* verbose= */ false
      );

      html5QrcodeScanner.render(
        (decodedText) => {
          console.log("[QR Scanner] Decoded:", decodedText);
          handleScannedPayload(decodedText);
        },
        (errorMessage) => {
          // Frame callback - ignore frame noise
        }
      );
    } catch (err) {
      console.warn("Failed to initialize Html5QrcodeScanner:", err);
      handleCameraError(err);
    }
  }

  function handleCameraError(err) {
    const errName = err?.name || "";
    const errMsg = err?.message || err?.toString() || "";

    if (errName === "NotAllowedError" || errName === "PermissionDeniedError" || errMsg.includes("Permission denied")) {
      showScannerAlert(
        "error",
        "Camera permission was denied. Please allow camera access in your browser site permissions or use manual entry below."
      );
    } else if (errName === "NotFoundError" || errName === "DevicesNotFoundError" || errMsg.includes("NotFound")) {
      showScannerAlert(
        "error",
        "No camera device detected on this hardware. Please enter your Product ID or Serial manually below."
      );
    } else {
      showScannerAlert(
        "error",
        `Unable to access camera (${errName || "Notice"}). Please enter your Product ID or Serial manually below.`
      );
    }

    if (productIdInput) productIdInput.focus();
  }

  function handleScannedPayload(decodedText) {
    const result = parseQrPayload(decodedText);

    if (result.invalid) {
      showScannerAlert(
        "warning",
        `Invalid QR code: ${result.reason || "Unrecognized content"}. Please scan an official ReLife passport QR or enter ID manually.`
      );
      if (productIdInput) {
        productIdInput.value = decodedText.slice(0, 50);
        productIdInput.focus();
      }
      return;
    }

    // Valid scan: Stop camera
    stopCameraScanner();

    if (result.secret && secretInput) {
      secretInput.value = result.secret;
    }

    if (result.productId) {
      productIdInput.value = result.productId;
      verifyProductPassport(result.productId);
    } else if (result.serial) {
      productIdInput.value = result.serial;
      verifyBySerial(result.serial);
    }
  }

  function stopCameraScanner() {
    if (html5QrcodeScanner) {
      try {
        html5QrcodeScanner.clear().catch((e) => console.warn("Scanner clear:", e));
      } catch (_) {}
      html5QrcodeScanner = null;
    }
    if (scannerWrapper) {
      scannerWrapper.style.display = "none";
    }
    hideScannerAlert();
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

      // Fetch Verifiable Warranty Status
      await loadWarrantyStatus(contract, pId);

      // Verify Authenticity Secret if provided
      await loadAuthenticitySecret(contract, pId);

      // Log scan in backend and check counterfeit alert thresholds
      await logAndCheckScanCounter(pId);

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
   * Loads full lifecycle history and events from contract, rendering a chronological timeline
   */
  async function loadRepairHistory(contract, productId) {
    if (!repairTimeline || !noRepairsNotice) return;

    const STATUS_NAMES = ["Manufactured", "Sold", "InRepair", "Recycled"];
    const timelineEvents = [];

    // 1. Query on-chain events via filters if queryFilter is supported
    if (contract && typeof contract.queryFilter === "function") {
      try {
        // ProductRegistered
        if (contract.filters?.ProductRegistered) {
          const events = await contract.queryFilter(contract.filters.ProductRegistered(productId));
          events.forEach((ev) => {
            timelineEvents.push({
              blockNumber: Number(ev.blockNumber || 0),
              logIndex: Number(ev.index !== undefined ? ev.index : (ev.transactionIndex || 0)),
              timestamp: Number(ev.args?.timestamp || 0),
              icon: "🏭",
              title: "Product Manufactured & Registered",
              actor: ev.args?.manufacturer || "",
              description: `Model: ${ev.args?.modelName || ""} | Brand: ${ev.args?.brand || ""} | Serial: ${ev.args?.serialNumber || ""}`,
              linkUri: ev.args?.metadataURI || "",
              linkLabel: "View Passport Metadata (IPFS)",
            });
          });
        }
      } catch (e) {
        console.warn("ProductRegistered query:", e.message);
      }

      try {
        // StatusChanged
        if (contract.filters?.StatusChanged) {
          const events = await contract.queryFilter(contract.filters.StatusChanged(productId));
          events.forEach((ev) => {
            const oldStatus = STATUS_NAMES[Number(ev.args?.oldStatus)] || "Unknown";
            const newStatus = STATUS_NAMES[Number(ev.args?.newStatus)] || "Unknown";
            timelineEvents.push({
              blockNumber: Number(ev.blockNumber || 0),
              logIndex: Number(ev.index !== undefined ? ev.index : (ev.transactionIndex || 0)),
              timestamp: Number(ev.args?.timestamp || 0),
              icon: "🔄",
              title: `Status Changed: ${oldStatus} ➔ ${newStatus}`,
              actor: ev.args?.actor || "",
              description: `Lifecycle state updated from ${oldStatus} to ${newStatus}.`,
            });
          });
        }
      } catch (e) {
        console.warn("StatusChanged query:", e.message);
      }

      try {
        // WarrantyAdded
        if (contract.filters?.WarrantyAdded) {
          const events = await contract.queryFilter(contract.filters.WarrantyAdded(productId));
          events.forEach((ev) => {
            const expiryStr = ev.args?.expiryTimestamp
              ? new Date(Number(ev.args.expiryTimestamp) * 1000).toLocaleDateString()
              : "N/A";
            timelineEvents.push({
              blockNumber: Number(ev.blockNumber || 0),
              logIndex: Number(ev.index !== undefined ? ev.index : (ev.transactionIndex || 0)),
              timestamp: Number(ev.args?.expiryTimestamp || 0),
              icon: "🛡️",
              title: `Warranty Issued: ${ev.args?.warrantyType || "Standard Warranty"}`,
              actor: ev.args?.issuer || "",
              description: `Coverage active through ${expiryStr}`,
              linkUri: ev.args?.termsUri || "",
              linkLabel: "View Warranty Policy (IPFS)",
            });
          });
        }
      } catch (e) {
        console.warn("WarrantyAdded query:", e.message);
      }

      try {
        // TransferInitiated
        if (contract.filters?.TransferInitiated) {
          const events = await contract.queryFilter(contract.filters.TransferInitiated(productId));
          events.forEach((ev) => {
            const toShort = ev.args?.to ? `${ev.args.to.slice(0, 6)}...${ev.args.to.slice(-4)}` : "";
            timelineEvents.push({
              blockNumber: Number(ev.blockNumber || 0),
              logIndex: Number(ev.index !== undefined ? ev.index : (ev.transactionIndex || 0)),
              timestamp: Number(ev.args?.timestamp || 0),
              icon: "📤",
              title: "Ownership Transfer Proposed",
              actor: ev.args?.from || "",
              description: `Transfer initiated to pending recipient: ${toShort}`,
            });
          });
        }
      } catch (e) {
        console.warn("TransferInitiated query:", e.message);
      }

      try {
        // TransferAccepted
        if (contract.filters?.TransferAccepted) {
          const events = await contract.queryFilter(contract.filters.TransferAccepted(productId));
          events.forEach((ev) => {
            const prevShort = ev.args?.previousOwner ? `${ev.args.previousOwner.slice(0, 6)}...${ev.args.previousOwner.slice(-4)}` : "";
            const newShort = ev.args?.newOwner ? `${ev.args.newOwner.slice(0, 6)}...${ev.args.newOwner.slice(-4)}` : "";
            timelineEvents.push({
              blockNumber: Number(ev.blockNumber || 0),
              logIndex: Number(ev.index !== undefined ? ev.index : (ev.transactionIndex || 0)),
              timestamp: Number(ev.args?.timestamp || 0),
              icon: "🤝",
              title: "Ownership Transfer Accepted & Finalized",
              actor: ev.args?.newOwner || "",
              description: `Ownership transfer completed from ${prevShort} to ${newShort}.`,
            });
          });
        }
      } catch (e) {
        console.warn("TransferAccepted query:", e.message);
      }

      try {
        // TransferCancelled
        if (contract.filters?.TransferCancelled) {
          const events = await contract.queryFilter(contract.filters.TransferCancelled(productId));
          events.forEach((ev) => {
            const pendingShort = ev.args?.pendingOwner ? `${ev.args.pendingOwner.slice(0, 6)}...${ev.args.pendingOwner.slice(-4)}` : "";
            timelineEvents.push({
              blockNumber: Number(ev.blockNumber || 0),
              logIndex: Number(ev.index !== undefined ? ev.index : (ev.transactionIndex || 0)),
              timestamp: Number(ev.args?.timestamp || 0),
              icon: "❌",
              title: "Ownership Transfer Cancelled",
              actor: ev.args?.owner || "",
              description: `Pending transfer to ${pendingShort} was cancelled by owner.`,
            });
          });
        }
      } catch (e) {
        console.warn("TransferCancelled query:", e.message);
      }

      try {
        // RepairRecordAdded
        if (contract.filters?.RepairRecordAdded) {
          const events = await contract.queryFilter(contract.filters.RepairRecordAdded(productId));
          events.forEach((ev) => {
            timelineEvents.push({
              blockNumber: Number(ev.blockNumber || 0),
              logIndex: Number(ev.index !== undefined ? ev.index : (ev.transactionIndex || 0)),
              timestamp: Number(ev.args?.timestamp || 0),
              icon: "🔧",
              title: `Service Record: ${ev.args?.repairType || "Maintenance"} (#${ev.args?.repairId?.toString() || ""})`,
              actor: ev.args?.repairCenter || "",
              description: ev.args?.description || "Maintenance completed.",
              linkUri: ev.args?.serviceUri || "",
              linkLabel: "View Diagnostic Report (IPFS)",
            });
          });
        }
      } catch (e) {
        console.warn("RepairRecordAdded query:", e.message);
      }

      try {
        // ProductRecycled
        if (contract.filters?.ProductRecycled) {
          const events = await contract.queryFilter(contract.filters.ProductRecycled(productId));
          events.forEach((ev) => {
            timelineEvents.push({
              blockNumber: Number(ev.blockNumber || 0),
              logIndex: Number(ev.index !== undefined ? ev.index : (ev.transactionIndex || 0)),
              timestamp: Number(ev.args?.timestamp || 0),
              icon: "♻️",
              title: "Product Recycled & Decommissioned",
              actor: ev.args?.recycler || "",
              description: `Facility: ${ev.args?.recyclingFacility || "Certified Recycler"} | Notes: ${ev.args?.notes || "End-of-life processed"}`,
              linkUri: ev.args?.certificateUri || "",
              linkLabel: "View Destruction Certificate (IPFS)",
            });
          });
        }
      } catch (e) {
        console.warn("ProductRecycled query:", e.message);
      }
    }

    // 2. Query getProductHistory as reliable backup for repair records
    try {
      const repairs = await contract.getProductHistory(productId);
      const hasRepairsInEvents = timelineEvents.some((e) => e.icon === "🔧");
      if (repairs && repairs.length > 0 && !hasRepairsInEvents) {
        repairs.forEach((record) => {
          timelineEvents.push({
            blockNumber: 0,
            logIndex: 0,
            timestamp: Number(record.timestamp || 0),
            icon: "🔧",
            title: `Service Record: ${record.repairType || "Maintenance"} (#${record.id?.toString() || ""})`,
            actor: record.repairCenter || "",
            description: record.description || "Diagnostics report filed.",
            linkUri: record.serviceUri || "",
            linkLabel: "View Diagnostic Report (IPFS)",
          });
        });
      }
    } catch (e) {
      console.warn("getProductHistory lookup:", e.message);
    }

    if (timelineEvents.length === 0) {
      noRepairsNotice.style.display = "block";
      repairTimeline.style.display = "none";
      return;
    }

    // 3. Chronological sorting (ascending by blockNumber, then logIndex, then timestamp)
    timelineEvents.sort((a, b) => {
      if (a.blockNumber && b.blockNumber && a.blockNumber !== b.blockNumber) {
        return a.blockNumber - b.blockNumber;
      }
      if (a.logIndex !== undefined && b.logIndex !== undefined && a.blockNumber === b.blockNumber && a.logIndex !== b.logIndex) {
        return a.logIndex - b.logIndex;
      }
      return a.timestamp - b.timestamp;
    });

    noRepairsNotice.style.display = "none";
    repairTimeline.style.display = "block";
    repairTimeline.innerHTML = "";

    // 4. Render timeline entries safely using DOM APIs and textContent
    timelineEvents.forEach((ev) => {
      const item = document.createElement("div");
      item.className = "timeline-item";

      // Date & Actor Row
      const dateRow = document.createElement("div");
      dateRow.className = "timeline-date";

      const dateSpan = document.createElement("span");
      dateSpan.textContent = ev.timestamp > 0
        ? new Date(ev.timestamp * 1000).toLocaleString()
        : "On-Chain Verified Record";
      dateRow.appendChild(dateSpan);

      const zeroAddr = "0x0000000000000000000000000000000000000000";
      if (ev.actor && ev.actor.toLowerCase() !== zeroAddr) {
        const actorSpan = document.createElement("span");
        actorSpan.style.marginLeft = "0.5rem";
        actorSpan.style.color = "var(--text-muted)";
        actorSpan.textContent = " • Actor: ";

        const actorLink = document.createElement("a");
        const shortAddr = `${ev.actor.slice(0, 6)}...${ev.actor.slice(-4)}`;
        actorLink.href = `https://sepolia.etherscan.io/address/${encodeURIComponent(ev.actor)}`;
        actorLink.target = "_blank";
        actorLink.rel = "noopener noreferrer";
        actorLink.style.color = "var(--secondary)";
        actorLink.style.textDecoration = "underline";
        actorLink.style.fontFamily = "monospace";
        actorLink.textContent = shortAddr; // Safe textContent

        actorSpan.appendChild(actorLink);
        dateRow.appendChild(actorSpan);
      }

      // Title & Icon Row
      const typeRow = document.createElement("div");
      typeRow.className = "timeline-type";

      const iconSpan = document.createElement("span");
      iconSpan.style.marginRight = "0.4rem";
      iconSpan.textContent = ev.icon || "•";
      typeRow.appendChild(iconSpan);

      const titleSpan = document.createElement("span");
      titleSpan.textContent = ev.title || "Passport Event"; // Safe textContent
      typeRow.appendChild(titleSpan);

      // Description Row
      const descRow = document.createElement("div");
      descRow.className = "timeline-desc";
      descRow.textContent = ev.description || ""; // Safe textContent

      item.appendChild(dateRow);
      item.appendChild(typeRow);
      item.appendChild(descRow);

      // IPFS Document Link if present
      if (ev.linkUri && typeof ev.linkUri === "string" && ev.linkUri.trim().length > 0) {
        const linkDiv = document.createElement("div");
        linkDiv.style.marginTop = "0.35rem";

        const link = document.createElement("a");
        const gatewayUrl = ev.linkUri.replace("ipfs://", "https://gateway.pinata.cloud/ipfs/");
        link.href = gatewayUrl;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.style.color = "var(--secondary)";
        link.style.fontSize = "0.82rem";
        link.style.textDecoration = "underline";
        link.textContent = `${ev.linkLabel || "View On-Chain Document (IPFS)"} →`; // Safe textContent

        linkDiv.appendChild(link);
        item.appendChild(linkDiv);
      }

      repairTimeline.appendChild(item);
    });
  }

  /**
   * Loads and displays warranty status from contract
   */
  async function loadWarrantyStatus(contract, productId) {
    if (!viewProdWarranty) return;
    try {
      const [warranty, isExpired] = await contract.getWarranty(productId);
      const endTs = Number(warranty?.warrantyEnd || warranty?.expiryTimestamp || 0n);
      if (warranty && endTs > 0) {
        const nowTs = Math.floor(Date.now() / 1000);
        const daysLeft = Math.max(0, Math.ceil((endTs - nowTs) / 86400));
        if (isExpired || nowTs >= endTs) {
          viewProdWarranty.innerHTML = `<span class="badge badge-danger">Expired</span>`;
        } else {
          viewProdWarranty.innerHTML = `<span class="badge badge-success">Valid (${daysLeft} day${daysLeft === 1 ? '' : 's'} left)</span>`;
        }
      } else {
        viewProdWarranty.innerHTML = `<span class="badge badge-secondary" style="background:rgba(255,255,255,0.08);">No Warranty</span>`;
      }
    } catch (err) {
      console.warn("Could not query warranty status:", err.message);
      viewProdWarranty.innerHTML = `<span class="badge badge-secondary" style="background:rgba(255,255,255,0.08);">No Warranty</span>`;
    }
  }

  /**
   * Verifies off-chain authenticity secret against on-chain hash
   */
  async function loadAuthenticitySecret(contract, productId) {
    if (!secretBadge) return;
    const secret = (secretInput ? secretInput.value.trim() : "") || urlParams.get("secret");

    if (!secret) {
      secretBadge.style.display = "none";
      return;
    }

    try {
      const isAuthentic = await contract.verifySecret(productId, secret);
      secretBadge.style.display = "inline-flex";

      if (isAuthentic) {
        secretBadge.className = "badge badge-success";
        secretBadge.innerHTML = "&#10003; Authentic";
      } else {
        secretBadge.className = "badge badge-danger";
        secretBadge.innerHTML = "&#9888; Not matching";
      }
    } catch (err) {
      console.warn("Secret verification error:", err);
      secretBadge.style.display = "inline-flex";
      secretBadge.className = "badge badge-danger";
      secretBadge.innerHTML = "&#9888; Not matching";
    }
  }

  /**
   * Logs passport scan with backend and displays counterfeit anomaly alert if thresholds are exceeded
   */
  async function logAndCheckScanCounter(productId) {
    if (!viewProdScanCount) return;
    try {
      const res = await fetch(`${API_BASE}/api/scans/${productId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (!res.ok) {
        if (res.status === 429) {
          viewProdScanCount.innerHTML = `<span class="badge badge-warning" style="background:#f59e0b; color:#000;">Scan Rate Limit Reached</span>`;
        }
        return;
      }

      const data = await res.json();
      if (!data.success) return;

      if (data.isSuspicious) {
        if (counterfeitWarningBanner) {
          counterfeitWarningBanner.style.display = "block";
        }
        if (counterfeitWarningDetails && data.warning) {
          counterfeitWarningDetails.innerText = data.warning;
        }
        viewProdScanCount.innerHTML = `<span class="badge badge-danger">&#9888; ${data.totalScans} scan(s) (${data.allTimeDistinctIps} distinct networks) &mdash; SUSPICIOUS</span>`;
      } else {
        if (counterfeitWarningBanner) {
          counterfeitWarningBanner.style.display = "none";
        }
        viewProdScanCount.innerHTML = `<span class="badge badge-info" style="background:rgba(59,130,246,0.2); color:#60a5fa;">&#10003; ${data.totalScans} scan(s) (Normal Activity)</span>`;
      }
    } catch (err) {
      console.warn("Scan counter service unreachable:", err.message);
      viewProdScanCount.innerHTML = `<span class="badge badge-secondary" style="background:rgba(255,255,255,0.08);">&mdash;</span>`;
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

