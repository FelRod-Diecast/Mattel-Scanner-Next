const SCANNER_VERSION = "0.1.0";
const MATTEL_ORIGIN = "https://creations.mattel.com";
const CATALOG_PAGE_SIZE = 250;
const SCAN_ALARM = "mattel-scanner-scan";

function log(...args) {
  console.log(`[Mattel Next ${SCANNER_VERSION}]`, ...args);
}

async function fetchJson(url) {
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/json"
    },
    cache: "no-store"
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} for ${url}`);
  }

  return response.json();
}

async function discoverCatalog() {
  const products = [];

  for (let page = 1; ; page += 1) {
    const url = `${MATTEL_ORIGIN}/products.json?limit=${CATALOG_PAGE_SIZE}&page=${page}`;
    const data = await fetchJson(url);
    const batch = Array.isArray(data?.products) ? data.products : [];

    products.push(...batch);

    if (batch.length < CATALOG_PAGE_SIZE) {
      break;
    }
  }

  return products;
}

async function scanNow() {
  const startedAt = Date.now();

  try {
    const products = await discoverCatalog();

    await chrome.storage.local.set({
      scannerMeta: {
        version: SCANNER_VERSION,
        lastScanAt: Date.now(),
        lastScanDurationMs: Date.now() - startedAt,
        lastCatalogCount: products.length,
        lastError: null
      }
    });

    log(`Catalog discovery complete: ${products.length} products`);
    return products;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    await chrome.storage.local.set({
      scannerMeta: {
        version: SCANNER_VERSION,
        lastScanAt: Date.now(),
        lastScanDurationMs: Date.now() - startedAt,
        lastCatalogCount: null,
        lastError: message
      }
    });

    console.error(`[Mattel Next ${SCANNER_VERSION}] Scan failed:`, error);
    throw error;
  }
}

async function ensureAlarm() {
  const existing = await chrome.alarms.get(SCAN_ALARM);

  if (!existing) {
    await chrome.alarms.create(SCAN_ALARM, {
      periodInMinutes: 5
    });
    log("Created 5-minute scan alarm");
  }
}

chrome.runtime.onInstalled.addListener(async () => {
  log("Installed");
  await ensureAlarm();
  await scanNow();
});

chrome.runtime.onStartup.addListener(async () => {
  log("Browser startup");
  await ensureAlarm();
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== SCAN_ALARM) return;

  try {
    await scanNow();
  } catch {
    // scanNow records the error; keep the alarm alive for the next cycle.
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type !== "RUN_SCAN") return false;

  scanNow()
    .then((products) => sendResponse({ ok: true, count: products.length }))
    .catch((error) => {
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error)
      });
    });

  return true;
});

ensureAlarm().catch((error) => {
  console.error(`[Mattel Next ${SCANNER_VERSION}] Alarm initialization failed:`, error);
});
