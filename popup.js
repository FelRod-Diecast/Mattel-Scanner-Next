async function loadStatus() {
  const { scannerMeta = {} } = await chrome.storage.local.get("scannerMeta");

  document.getElementById("status").textContent = scannerMeta.lastError
    ? `ERROR: ${scannerMeta.lastError}`
    : "Scanner ready";

  document.getElementById("count").textContent =
    scannerMeta.lastCatalogCount ?? "—";

  document.getElementById("lastScan").textContent = scannerMeta.lastScanAt
    ? new Date(scannerMeta.lastScanAt).toLocaleString()
    : "Never";
}

document.getElementById("scanNow").addEventListener("click", async () => {
  const button = document.getElementById("scanNow");
  button.disabled = true;
  button.textContent = "SCANNING...";

  try {
    const response = await chrome.runtime.sendMessage({ type: "RUN_SCAN" });

    if (!response?.ok) {
      throw new Error(response?.error || "Scan failed");
    }
  } catch (error) {
    document.getElementById("status").textContent =
      `ERROR: ${error instanceof Error ? error.message : String(error)}`;
  } finally {
    button.disabled = false;
    button.textContent = "SCAN NOW";
    await loadStatus();
  }
});

loadStatus();
