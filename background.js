import {
  loadState,
  mergeCatalog,
  saveState
} from "./scanner/state.js";

const SCANNER_VERSION = "0.2.0";
const MATTEL_ORIGIN = "https://creations.mattel.com";
const CATALOG_PAGE_SIZE = 250;
const MAX_CATALOG_PAGES = 100;
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
  const seenKeys = new Set();

  for (let page = 1; page <= MAX_CATALOG_PAGES; page += 1) {
    const url = `${MATTEL_ORIGIN}/products.json?limit=${CATALOG_PAGE_SIZE}&page=${page}`;
    const data = await fetchJson(url);
    const batch = Array.isArray(data?.products) ? data.products : [];

    for (const product of batch) {
      const key = product?.id ?? product?.handle;
      if (key === undefined || key === null || seenKeys.has(key)) continue;

      seenKeys.add(key);
      products.push(product);
    }

    if (batch.length < CATALOG_PAGE_SIZE) {
      break;
    }

    if (page === MAX_CATALOG_PAGES) {
      throw new Error(`Catalog exceeded ${MAX_CATALOG_PAGES} pages`);
    }
  }

  return products;
}

async function scanNow() {
  const startedAt = Date.now();

  try {
    const products = await discoverCatalog();
    const previousState = await loadState();
    const { state, changes } = mergeCatalog(previousState, products, Date.now());

    await saveState(state);

    const scanMeta = {
      version: SCANNER_VERSION,
      lastScanAt: Date.now(),
      lastScanDurationMs: Date.now() - startedAt,
      lastCatalogCount: products.length,
      newProductCount: changes.newProducts.length,
      restockCount: changes.restocks.length,
      selloutCount: changes.sellouts.length,
      availableCount: state.stats.availableProducts,
      unavailableCount: state.stats.unavailableProducts,
      lastError: null
    };

    await chrome.storage.local.set({ scannerMeta: scanMeta });

    log(
      `Catalog complete: ${products.length} products | ` +
      `new ${changes.newProducts.length} | ` +
      `restock ${changes.restocks.length} | ` +
      `sellout ${changes.sellouts.length}`
    );

    return { products, state, changes, scanMeta };
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
    .then(({ products, changes, scanMeta }) => {
      sendResponse({
        ok: true,
        count: products.length,
        newCount: changes.newProducts.length,
        restockCount: changes.restocks.length,
        selloutCount: changes.sellouts.length,
        scanMeta
      });
    })
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
