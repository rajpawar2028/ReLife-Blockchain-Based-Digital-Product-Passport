/**
 * ReLife - Admin Dashboard & Role Governance Controller
 * Manages participant onboarding, direct role grant/revocation, and queries on-chain directory.
 */

document.addEventListener("DOMContentLoaded", async () => {
  const connectBtn = document.getElementById("connectWalletBtn");
  const walletBadge = document.getElementById("walletBadge");
  const authSection = document.getElementById("authSection");
  const unauthorizedSection = document.getElementById("unauthorizedSection");
  const unauthAccount = document.getElementById("unauthAccount");
  const adminWorkspace = document.getElementById("adminWorkspace");
  const adminAlert = document.getElementById("adminAlert");

  const statAdminAddress = document.getElementById("statAdminAddress");
  const statContractAddress = document.getElementById("statContractAddress");
  const statNetwork = document.getElementById("statNetwork");

  // Onboarding forms
  const formRegisterMfg = document.getElementById("formRegisterMfg");
  const btnRegisterMfg = document.getElementById("btnRegisterMfg");
  const formRegisterRepair = document.getElementById("formRegisterRepair");
  const btnRegisterRepair = document.getElementById("btnRegisterRepair");
  const formRegisterRecycler = document.getElementById("formRegisterRecycler");
  const btnRegisterRecycler = document.getElementById("btnRegisterRecycler");

  // Direct Role Management
  const roleSelect = document.getElementById("roleSelect");
  const targetRoleAddress = document.getElementById("targetRoleAddress");
  const btnCheckRole = document.getElementById("btnCheckRole");
  const btnGrantRole = document.getElementById("btnGrantRole");
  const btnRevokeRole = document.getElementById("btnRevokeRole");
  const roleCheckResult = document.getElementById("roleCheckResult");

  // Table
  const participantsTableBody = document.getElementById("participantsTableBody");
  const btnRefreshParticipants = document.getElementById("btnRefreshParticipants");

  let userAccount = null;
  let isAdmin = false;

  await ReLifeWallet.init();
  await updateWalletUI();

  // Connect button click
  connectBtn.addEventListener("click", async () => {
    try {
      await ReLifeWallet.connect();
      await updateWalletUI();
    } catch (e) {
      showAlert(ReLifeWallet.parseError(e), "danger");
    }
  });

  // Account change listener
  ReLifeWallet.on("accountChanged", async () => {
    await updateWalletUI();
  });

  function showAlert(message, type = "success") {
    adminAlert.className = `alert alert-${type}`;
    adminAlert.innerHTML = message;
    adminAlert.style.display = "flex";
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function hideAlert() {
    adminAlert.style.display = "none";
  }

  async function updateWalletUI() {
    hideAlert();
    userAccount = ReLifeWallet.account;

    if (!userAccount) {
      walletBadge.innerHTML = `<span class="badge badge-warning">Disconnected</span>`;
      authSection.style.display = "block";
      unauthorizedSection.style.display = "none";
      adminWorkspace.style.display = "none";
      return;
    }

    const shortAddr = `${userAccount.slice(0, 6)}...${userAccount.slice(-4)}`;
    walletBadge.innerHTML = `<span class="badge badge-info">${shortAddr}</span>`;

    try {
      const contractAddress = window.RELIFE_CONFIG?.address;
      if (!contractAddress) {
        showAlert("Contract address missing from configuration. Please ensure contract-data.js is loaded.", "danger");
        return;
      }

      // Check for wrong network or un-deployed contract code before calling contract methods
      const provider = ReLifeWallet.provider || (window.ethereum ? new ethers.BrowserProvider(window.ethereum) : null);
      if (provider) {
        const code = await provider.getCode(contractAddress);
        if (code === "0x") {
          authSection.style.display = "none";
          unauthorizedSection.style.display = "none";
          adminWorkspace.style.display = "none";

          const isSepolia = (ReLifeWallet.chainId === 11155111n);
          const networkDesc = isSepolia ? "Ethereum Sepolia" : `Network Chain ID ${ReLifeWallet.chainId || "unknown"}`;
          const switchButtonHtml = !isSepolia 
            ? `<button id="btnSwitchSepolia" class="btn btn-primary" style="margin-top: 0.75rem; padding: 0.4rem 1rem;">Switch MetaMask to Ethereum Sepolia</button>`
            : "";

          showAlert(`
            <div>
              <strong>Contract Not Found On Connected Network:</strong><br/>
              No smart contract bytecode exists at address <code>${contractAddress}</code> on ${networkDesc}.<br/>
              ${!isSepolia ? "Your wallet is on the wrong network. Please switch to Ethereum Sepolia." : "The contract has not been deployed to Sepolia yet. Run deployment to generate live Sepolia bytecode."}
              <br/>
              ${switchButtonHtml}
            </div>
          `, "warning");

          const switchBtn = document.getElementById("btnSwitchSepolia");
          if (switchBtn) {
            switchBtn.addEventListener("click", () => ReLifeWallet.switchToSepolia());
          }
          return;
        }
      }

      const contract = ReLifeWallet.contract || ReLifeWallet.getReadOnlyContract();
      if (!contract) return;

      const adminRole = await contract.DEFAULT_ADMIN_ROLE();
      isAdmin = await contract.hasRole(adminRole, userAccount);

      if (isAdmin) {
        authSection.style.display = "none";
        unauthorizedSection.style.display = "none";
        adminWorkspace.style.display = "block";

        // Fill stats
        statAdminAddress.innerText = userAccount;
        statContractAddress.innerText = window.RELIFE_CONFIG?.address || "-";
        
        let networkName = "Sepolia / Local";
        if (ReLifeWallet.chainId === 11155111n) {
          networkName = "Sepolia Testnet (11155111)";
        } else if (ReLifeWallet.chainId === 31337n) {
          networkName = "Hardhat Local (31337)";
        }
        statNetwork.innerText = networkName;

        // Load directory
        loadParticipantsDirectory();
      } else {
        authSection.style.display = "none";
        unauthAccount.innerText = userAccount;
        unauthorizedSection.style.display = "block";
        adminWorkspace.style.display = "none";
      }
    } catch (err) {
      console.error("Admin verification error:", err);
      showAlert("Failed to verify admin status: " + ReLifeWallet.parseError(err), "danger");
    }
  }

  async function resolveRoleHash(roleName) {
    const contract = ReLifeWallet.contract || ReLifeWallet.getReadOnlyContract();
    if (!contract) throw new Error("Contract not initialized");

    switch (roleName) {
      case "DEFAULT_ADMIN_ROLE":
        return await contract.DEFAULT_ADMIN_ROLE();
      case "MANUFACTURER_ROLE":
        return await contract.MANUFACTURER_ROLE();
      case "REPAIR_CENTER_ROLE":
        return await contract.REPAIR_CENTER_ROLE();
      case "RECYCLER_ROLE":
        return await contract.RECYCLER_ROLE();
      default:
        return ethers.ZeroHash;
    }
  }

  // -------------------------------------------------------------
  // FORM 1: REGISTER MANUFACTURER
  // -------------------------------------------------------------
  formRegisterMfg.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!isAdmin || !ReLifeWallet.contract) return;

    const account = document.getElementById("mfgAddress").value.trim();
    const name = document.getElementById("mfgName").value.trim();

    btnRegisterMfg.disabled = true;
    btnRegisterMfg.innerHTML = `<span class="spinner"></span> Registering on-chain...`;
    hideAlert();

    try {
      const tx = await ReLifeWallet.contract.registerManufacturer(account, name);
      showAlert(`Transaction submitted: <code>${tx.hash}</code>. Waiting for confirmation...`, "info");
      await tx.wait();

      showAlert(`Manufacturer <strong>${name}</strong> (${account}) successfully registered and granted MANUFACTURER_ROLE!`, "success");
      formRegisterMfg.reset();
      loadParticipantsDirectory();
    } catch (err) {
      showAlert(ReLifeWallet.parseError(err), "danger");
    } finally {
      btnRegisterMfg.disabled = false;
      btnRegisterMfg.innerText = "Register Manufacturer";
    }
  });

  // -------------------------------------------------------------
  // FORM 2: REGISTER REPAIR CENTER
  // -------------------------------------------------------------
  formRegisterRepair.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!isAdmin || !ReLifeWallet.contract) return;

    const account = document.getElementById("repairAddress").value.trim();
    const name = document.getElementById("repairName").value.trim();

    btnRegisterRepair.disabled = true;
    btnRegisterRepair.innerHTML = `<span class="spinner"></span> Registering on-chain...`;
    hideAlert();

    try {
      const tx = await ReLifeWallet.contract.registerRepairCenter(account, name);
      showAlert(`Transaction submitted: <code>${tx.hash}</code>. Waiting for confirmation...`, "info");
      await tx.wait();

      showAlert(`Repair Center <strong>${name}</strong> (${account}) successfully registered and granted REPAIR_CENTER_ROLE!`, "success");
      formRegisterRepair.reset();
      loadParticipantsDirectory();
    } catch (err) {
      showAlert(ReLifeWallet.parseError(err), "danger");
    } finally {
      btnRegisterRepair.disabled = false;
      btnRegisterRepair.innerText = "Register Repair Center";
    }
  });

  // -------------------------------------------------------------
  // FORM 3: REGISTER RECYCLER
  // -------------------------------------------------------------
  formRegisterRecycler.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!isAdmin || !ReLifeWallet.contract) return;

    const account = document.getElementById("recyclerAddress").value.trim();
    const name = document.getElementById("recyclerName").value.trim();

    btnRegisterRecycler.disabled = true;
    btnRegisterRecycler.innerHTML = `<span class="spinner"></span> Registering on-chain...`;
    hideAlert();

    try {
      const tx = await ReLifeWallet.contract.registerRecycler(account, name);
      showAlert(`Transaction submitted: <code>${tx.hash}</code>. Waiting for confirmation...`, "info");
      await tx.wait();

      showAlert(`Recycler <strong>${name}</strong> (${account}) successfully registered and granted RECYCLER_ROLE!`, "success");
      formRegisterRecycler.reset();
      loadParticipantsDirectory();
    } catch (err) {
      showAlert(ReLifeWallet.parseError(err), "danger");
    } finally {
      btnRegisterRecycler.disabled = false;
      btnRegisterRecycler.innerText = "Register Recycler";
    }
  });

  // -------------------------------------------------------------
  // DIRECT ROLE GOVERNANCE
  // -------------------------------------------------------------
  btnCheckRole.addEventListener("click", async () => {
    const roleName = roleSelect.value;
    const account = targetRoleAddress.value.trim();

    if (!account || !account.startsWith("0x") || account.length !== 42) {
      alert("Please provide a valid 42-character Ethereum address (0x...)");
      return;
    }

    try {
      const contract = ReLifeWallet.contract || ReLifeWallet.getReadOnlyContract();
      const roleHash = await resolveRoleHash(roleName);
      const has = await contract.hasRole(roleHash, account);

      roleCheckResult.style.display = "block";
      if (has) {
        roleCheckResult.innerHTML = `&#9989; <strong>Active:</strong> Account <code>${account}</code> holds <strong>${roleName}</strong>.`;
        roleCheckResult.style.borderColor = "var(--primary)";
        roleCheckResult.style.color = "var(--primary-light)";
      } else {
        roleCheckResult.innerHTML = `&#10060; <strong>Inactive:</strong> Account <code>${account}</code> DOES NOT hold <strong>${roleName}</strong>.`;
        roleCheckResult.style.borderColor = "var(--danger)";
        roleCheckResult.style.color = "var(--danger-light)";
      }
    } catch (err) {
      showAlert(ReLifeWallet.parseError(err), "danger");
    }
  });

  btnGrantRole.addEventListener("click", async () => {
    if (!isAdmin || !ReLifeWallet.contract) return;

    const roleName = roleSelect.value;
    const account = targetRoleAddress.value.trim();

    if (!account || !account.startsWith("0x") || account.length !== 42) {
      alert("Please provide a valid 42-character Ethereum address (0x...)");
      return;
    }

    btnGrantRole.disabled = true;
    hideAlert();

    try {
      const roleHash = await resolveRoleHash(roleName);
      const tx = await ReLifeWallet.contract.grantRole(roleHash, account);
      showAlert(`Granting role... TX: <code>${tx.hash}</code>`, "info");
      await tx.wait();

      showAlert(`Successfully granted <strong>${roleName}</strong> to <code>${account}</code>!`, "success");
      btnCheckRole.click();
      loadParticipantsDirectory();
    } catch (err) {
      showAlert(ReLifeWallet.parseError(err), "danger");
    } finally {
      btnGrantRole.disabled = false;
    }
  });

  btnRevokeRole.addEventListener("click", async () => {
    if (!isAdmin || !ReLifeWallet.contract) return;

    const roleName = roleSelect.value;
    const account = targetRoleAddress.value.trim();

    if (!account || !account.startsWith("0x") || account.length !== 42) {
      alert("Please provide a valid 42-character Ethereum address (0x...)");
      return;
    }

    if (!confirm(`Are you sure you want to revoke ${roleName} from ${account}? This will immediately prevent them from performing authorized lifecycle actions.`)) {
      return;
    }

    btnRevokeRole.disabled = true;
    hideAlert();

    try {
      const roleHash = await resolveRoleHash(roleName);
      const tx = await ReLifeWallet.contract.revokeRole(roleHash, account);
      showAlert(`Revoking role... TX: <code>${tx.hash}</code>`, "info");
      await tx.wait();

      showAlert(`Successfully revoked <strong>${roleName}</strong> from <code>${account}</code>!`, "success");
      btnCheckRole.click();
      loadParticipantsDirectory();
    } catch (err) {
      showAlert(ReLifeWallet.parseError(err), "danger");
    } finally {
      btnRevokeRole.disabled = false;
    }
  });

  // -------------------------------------------------------------
  // PARTICIPANT DIRECTORY / EVENT AUDIT LOG
  // -------------------------------------------------------------
  btnRefreshParticipants.addEventListener("click", () => {
    loadParticipantsDirectory();
  });

  async function loadParticipantsDirectory() {
    try {
      const contract = ReLifeWallet.contract || ReLifeWallet.getReadOnlyContract();
      if (!contract) return;

      participantsTableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">
            <span class="spinner"></span> Querying smart contract registration events...
          </td>
        </tr>
      `;

      const mfgRole = await contract.MANUFACTURER_ROLE();
      const repairRole = await contract.REPAIR_CENTER_ROLE();
      const recyclerRole = await contract.RECYCLER_ROLE();

      // Query recent events safely within RPC block range limits
      let fromBlock = 0;
      try {
        const currentBlock = await (ReLifeWallet.provider || provider).getBlockNumber();
        fromBlock = Math.max(0, currentBlock - 10000);
      } catch {
        fromBlock = 0;
      }

      // Query past events
      const [mfgEvents, repairEvents, recyclerEvents] = await Promise.all([
        contract.queryFilter(contract.filters.ManufacturerRegistered(), fromBlock, "latest").catch(() => []),
        contract.queryFilter(contract.filters.RepairCenterRegistered(), fromBlock, "latest").catch(() => []),
        contract.queryFilter(contract.filters.RecyclerRegistered(), fromBlock, "latest").catch(() => []),
      ]);

      const records = [];

      // Process Manufacturer registrations
      for (const ev of mfgEvents) {
        const addr = ev.args[0];
        const name = ev.args[1];
        const registeredBy = ev.args[2];
        const has = await contract.hasRole(mfgRole, addr);
        records.push({
          name,
          roleName: "MANUFACTURER",
          roleHash: mfgRole,
          account: addr,
          registeredBy,
          isActive: has,
          blockNumber: ev.blockNumber,
        });
      }

      // Process Repair Center registrations
      for (const ev of repairEvents) {
        const addr = ev.args[0];
        const name = ev.args[1];
        const registeredBy = ev.args[2];
        const has = await contract.hasRole(repairRole, addr);
        records.push({
          name,
          roleName: "REPAIR_CENTER",
          roleHash: repairRole,
          account: addr,
          registeredBy,
          isActive: has,
          blockNumber: ev.blockNumber,
        });
      }

      // Process Recycler registrations
      for (const ev of recyclerEvents) {
        const addr = ev.args[0];
        const name = ev.args[1];
        const registeredBy = ev.args[2];
        const has = await contract.hasRole(recyclerRole, addr);
        records.push({
          name,
          roleName: "RECYCLER",
          roleHash: recyclerRole,
          account: addr,
          registeredBy,
          isActive: has,
          blockNumber: ev.blockNumber,
        });
      }

      if (records.length === 0) {
        participantsTableBody.innerHTML = `
          <tr>
            <td colspan="5" style="text-align: center; color: var(--text-muted); padding: 2rem;">
              No participants registered on this network yet. Use the onboarding forms above to register partners.
            </td>
          </tr>
        `;
        return;
      }

      // Render table rows
      participantsTableBody.innerHTML = records.map((r) => {
        const statusBadge = r.isActive
          ? `<span class="badge badge-success">Active</span>`
          : `<span class="badge badge-danger">Revoked</span>`;

        const shortAddr = `${r.account.slice(0, 6)}...${r.account.slice(-4)}`;
        const shortBy = `${r.registeredBy.slice(0, 6)}...${r.registeredBy.slice(-4)}`;

        return `
          <tr>
            <td><strong>${escapeHtml(r.name)}</strong></td>
            <td><code>${r.roleName}</code></td>
            <td title="${r.account}"><code>${shortAddr}</code></td>
            <td title="${r.registeredBy}"><code>${shortBy}</code></td>
            <td>${statusBadge}</td>
          </tr>
        `;
      }).join("");

    } catch (err) {
      console.error("Directory loading error:", err);
      participantsTableBody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: var(--danger); padding: 1.5rem;">
            Failed to query participant events: ${escapeHtml(err.message)}
          </td>
        </tr>
      `;
    }
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
});

