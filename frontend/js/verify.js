/**
 * ReLife - Public Verification Logic (verify.js)
 * Queries product verification on Sepolia without requiring a connected MetaMask wallet.
 * Renders QR codes with PNG download support.
 */

document.addEventListener("DOMContentLoaded", async () => {
  const form = document.getElementById("verifySearchForm");
  const input = document.getElementById("searchProductId");
  const spinner = document.getElementById("searchSpinner");
  const btnVerify = document.getElementById("btnVerify");
  const alertCard = document.getElementById("verifyAlert");
  const skeleton = document.getElementById("verifySkeleton");
  const resultCard = document.getElementById("passportResultCard");

  const passportIdBadge = document.getElementById("passportIdBadge");
  const passportProductName = document.getElementById("passportProductName");
  const passportStatusBadge = document.getElementById("passportStatusBadge");
  const resSerialNumber = document.getElementById("resSerialNumber");
  const resBrandModel = document.getElementById("resBrandModel");
  const resManufacturer = document.getElementById("resManufacturer");
  const resCurrentOwner = document.getElementById("resCurrentOwner");
  const resIpfsUri = document.getElementById("resIpfsUri");
  const btnIpfsGateway = document.getElementById("btnIpfsGateway");
  const btnEtherscanTx = document.getElementById("btnEtherscanTx");
  const qrcodeContainer = document.getElementById("qrcodeContainer");
  const btnDownloadQr = document.getElementById("btnDownloadQr");
  const repairRecordsList = document.getElementById("repairRecordsList");

  let qrInstance = null;
  let currentProductId = null;

  function showAlert(type, html) {
    alertCard.className = `alert alert-${type}`;
    alertCard.innerHTML = html;
    alertCard.style.display = "block";
  }

  function hideAlert() {
    alertCard.style.display = "none";
  }

  /**
   * Returns a read-only Sepolia contract instance.
   */
  function getReadOnlyContract() {
    const config = window.RELIFE_CONFIG;
    if (!config || !config.address || !config.abi) {
      throw new Error("ReLife contract configuration is missing or incomplete.");
    }

    const rpcUrls = [
      "https://ethereum-sepolia-rpc.publicnode.com",
      "https://rpc2.sepolia.org",
      "https://rpc.sepolia.org"
    ];

    const provider = new ethers.JsonRpcProvider(rpcUrls[0], {
      chainId: 11155111,
      name: "sepolia"
    });

    return new ethers.Contract(config.address, config.abi, provider);
  }

  /**
   * Fetches and verifies a product by ID.
   */
  async function verifyProduct(productId) {
    if (!productId || isNaN(productId) || Number(productId) <= 0) {
      showAlert("warning", "Please provide a valid numeric product ID.");
      return;
    }

    hideAlert();
    resultCard.style.display = "none";
    skeleton.style.display = "block";
    spinner.style.display = "inline-block";
    btnVerify.disabled = true;

    try {
      const contract = getReadOnlyContract();
      const pId = BigInt(productId);

      // Call verifyProduct or getProduct view method
      let product = null;
      try {
        product = await contract.getProduct(pId);
      } catch (err) {
        if (err.message && (err.message.includes("NotFound") || err.message.includes("revert"))) {
          skeleton.style.display = "none";
          showAlert("danger", `<strong>Product Not Found:</strong> Product Passport #${productId} does not exist on-chain.`);
          return;
        }
        throw err;
      }

      if (!product || !product.serialNumber || product.id === 0n) {
        skeleton.style.display = "none";
        showAlert("danger", `<strong>Product Not Found:</strong> No passport exists for ID #${productId}.`);
        return;
      }

      currentProductId = productId;

      // Populate UI
      passportIdBadge.innerText = `Product #${productId}`;
      passportProductName.innerText = product.modelName || product.productName || "Verified Product";
      resSerialNumber.innerText = product.serialNumber;
      resBrandModel.innerText = `${product.brand || "ReLife"} ${product.modelName || ""}`.trim();
      resManufacturer.innerText = product.manufacturer;
      resCurrentOwner.innerText = product.currentOwner;

      const ipfs = product.metadataURI || "";
      resIpfsUri.innerText = ipfs || "No off-chain metadata attached";
      if (ipfs.startsWith("ipfs://")) {
        const cid = ipfs.replace("ipfs://", "");
        btnIpfsGateway.href = `https://gateway.pinata.cloud/ipfs/${cid}`;
        btnIpfsGateway.style.display = "inline-flex";
      } else {
        btnIpfsGateway.style.display = "none";
      }

      btnEtherscanTx.href = `https://sepolia.etherscan.io/address/${window.RELIFE_CONFIG.address}`;

      // Status Badge
      if (product.isRecycled) {
        passportStatusBadge.className = "badge badge-danger";
        passportStatusBadge.innerHTML = "&#x267B; Decommissioned & Recycled";
      } else if (product.status === 2) {
        passportStatusBadge.className = "badge badge-warning";
        passportStatusBadge.innerHTML = "&#x1F527; In Repair";
      } else {
        passportStatusBadge.className = "badge badge-success";
        passportStatusBadge.innerHTML = "&#x2713; Authentic & Active On-Chain";
      }

      // Render QR Code
      const verifyUrl = `https://relife-blockchain-based-digital-pro.vercel.app/verify.html?id=${productId}`;
      qrcodeContainer.innerHTML = "";
      qrInstance = new QRCode(qrcodeContainer, {
        text: verifyUrl,
        width: 140,
        height: 140,
        colorDark: "#0b1120",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H,
      });

      // Load Repair & Custody Records
      try {
        const repairs = await contract.getRepairs(pId).catch(() => []);
        if (repairs.length === 0) {
          repairRecordsList.innerHTML = "<em>No repairs logged. Product is in pristine factory condition.</em>";
        } else {
          repairRecordsList.innerHTML = repairs.map((r, i) => `
            <div style="padding: 0.6rem 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
              <strong>Repair #${i + 1}: ${r.repairType || "Maintenance"}</strong><br>
              <span style="font-size:0.8rem; color: var(--text-muted);">${r.description || ""} (Logged by: ${r.repairCenter ? r.repairCenter.slice(0, 6) + '...' + r.repairCenter.slice(-4) : 'Center'})</span>
            </div>
          `).join("");
        }
      } catch (e) {
        repairRecordsList.innerHTML = "<em>Maintenance history recorded on-chain.</em>";
      }

      skeleton.style.display = "none";
      resultCard.style.display = "block";
    } catch (err) {
      console.error("Verification error:", err);
      skeleton.style.display = "none";
      showAlert("danger", `<strong>Verification Error:</strong> ${err.message || "Could not connect to Sepolia network."}`);
    } finally {
      spinner.style.display = "none";
      btnVerify.disabled = false;
    }
  }

  // QR PNG Download Handler
  if (btnDownloadQr) {
    btnDownloadQr.addEventListener("click", () => {
      const img = qrcodeContainer.querySelector("img");
      if (img && img.src) {
        const link = document.createElement("a");
        link.download = `ReLife-Passport-QR-#${currentProductId || "verify"}.png`;
        link.href = img.src;
        link.click();
      } else {
        const canvas = qrcodeContainer.querySelector("canvas");
        if (canvas) {
          const link = document.createElement("a");
          link.download = `ReLife-Passport-QR-#${currentProductId || "verify"}.png`;
          link.href = canvas.toDataURL("image/png");
          link.click();
        }
      }
    });
  }

  // Form submit handler
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = input.value.trim();
    if (id) {
      const url = new URL(window.location);
      url.searchParams.set("id", id);
      window.history.pushState({}, "", url);
      verifyProduct(id);
    }
  });

  // URL Query Param Parsing (?id=N)
  const urlParams = new URLSearchParams(window.location.search);
  const paramId = urlParams.get("id");
  if (paramId) {
    input.value = paramId;
    verifyProduct(paramId);
  }
});
