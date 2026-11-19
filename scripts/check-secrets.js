#!/usr/bin/env node

/**
 * ReLife - Pre-Commit Secret Scanner
 * Inspects staged git files to prevent accidental commits of:
 * 1. .env or environment secret files
 * 2. 64-hex Ethereum private keys
 * 3. Pinata / OAuth JWT tokens
 * 4. Alchemy / Infura / Etherscan API keys in URLs
 */

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const JWT_REGEX = /ey[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/;
const PRIVATE_KEY_ASSIGN_REGEX = /(?:private_key|secret_key|deployer_key|pinata_jwt)\s*[:=]\s*['\"]?(?:0x)?([a-fA-F0-9]{64})['\"]?/i;
const RPC_KEY_URL_REGEX = /https?:\/\/[a-z0-9.-]+\/(?:v2|v3)\/([a-zA-Z0-9_-]{20,})/;

function getStagedFiles() {
  try {
    const stdout = execSync("git diff --cached --name-only --diff-filter=ACM", { encoding: "utf8" });
    return stdout.trim().split("\n").filter(Boolean);
  } catch (err) {
    // If not in a git repo or git fails, return empty
    return [];
  }
}

function scanFileContent(filePath, content) {
  const violations = [];
  const lines = content.split("\n");

  // Immediate block if .env is being staged
  const baseName = path.basename(filePath);
  if (baseName === ".env" || (baseName.startsWith(".env.") && baseName !== ".env.example")) {
    violations.push({
      line: 1,
      rule: "Blocked Environment File",
      detail: `Attempted to commit an environment file (${filePath}). Only .env.example with placeholders is permitted.`,
    });
    return violations;
  }

  // Skip known non-secret files and test files with mocked hashes
  if (
    filePath === ".env.example" ||
    filePath === "package-lock.json" ||
    filePath.startsWith("test/") ||
    filePath.includes("contract-data") ||
    filePath.endsWith(".png") ||
    filePath.endsWith(".jpg") ||
    filePath.endsWith(".jpeg") ||
    filePath.endsWith(".ico")
  ) {
    return violations;
  }

  lines.forEach((line, index) => {
    // 1. JWT detection
    if (JWT_REGEX.test(line)) {
      violations.push({
        line: index + 1,
        rule: "JWT Token Pattern",
        detail: "Found string matching JWT token format (ey...).",
      });
    }

    // 2. Private Key assignment detection
    if (PRIVATE_KEY_ASSIGN_REGEX.test(line)) {
      violations.push({
        line: index + 1,
        rule: "Private Key Assignment",
        detail: "Found variable assignment containing 64-character hexadecimal key.",
      });
    }

    // 3. RPC URL with API key
    if (RPC_KEY_URL_REGEX.test(line)) {
      const match = line.match(RPC_KEY_URL_REGEX);
      const token = match ? match[1].toLowerCase() : "";
      if (
        !token.includes("your_") &&
        !token.includes("api_key") &&
        !token.includes("placeholder") &&
        !token.includes("dummy")
      ) {
        violations.push({
          line: index + 1,
          rule: "RPC Provider API Key",
          detail: "Found active RPC endpoint containing embedded API key in URL.",
        });
      }
    }
  });

  return violations;
}

function runSecretScan() {
  const stagedFiles = getStagedFiles();

  if (stagedFiles.length === 0) {
    console.log("Pre-commit check: No staged files to scan.");
    return 0;
  }

  let totalViolations = 0;

  for (const file of stagedFiles) {
    if (!fs.existsSync(file)) continue;

    // Get staged file contents
    let content = "";
    try {
      content = execSync(`git show :${file}`, { encoding: "utf8" });
    } catch (_) {
      content = fs.readFileSync(file, "utf8");
    }

    const violations = scanFileContent(file, content);
    if (violations.length > 0) {
      totalViolations += violations.length;
      console.error(`\n❌ [SECURITY ALERT] Secret detected in staged file: ${file}`);
      violations.forEach((v) => {
        console.error(`   Line ${v.line}: [${v.rule}] ${v.detail}`);
      });
    }
  }

  if (totalViolations > 0) {
    console.error(`\n🚨 COMMIT BLOCKED: Found ${totalViolations} potential secret(s) in staged files.`);
    console.error("   Please remove sensitive keys, JWTs, or .env files, and stage again.\n");
    return 1;
  }

  console.log("✅ Pre-commit secrets scan passed: Staged files are clean.");
  return 0;
}

if (require.main === module) {
  const exitCode = runSecretScan();
  process.exit(exitCode);
}

module.exports = {
  scanFileContent,
  runSecretScan,
  JWT_REGEX,
  PRIVATE_KEY_ASSIGN_REGEX,
};
