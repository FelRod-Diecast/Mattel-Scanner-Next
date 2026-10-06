export const STATE_VERSION = 1;
export const STORAGE_KEY = "scannerState";

export function createEmptyState() {
  return {
    version: STATE_VERSION,
    products: {},
    events: {},
    notifications: {},
    stats: {
      totalProducts: 0,
      firstSeenProducts: 0,
      availableProducts: 0,
      unavailableProducts: 0,
      lastMergedAt: null
    }
  };
}

export function getProductKey(product) {
  if (product?.id !== undefined && product?.id !== null) {
    return `id:${product.id}`;
  }

  if (product?.handle) {
    return `handle:${product.handle}`;
  }

  return null;
}

export function getProductUrl(product) {
  const handle = product?.handle;
  return handle ? `https://creations.mattel.com/products/${handle}` : null;
}

export function getCatalogAvailability(product) {
  if (!Array.isArray(product?.variants)) return false;
  return product.variants.some((variant) => variant?.available === true);
}

export function normalizeProduct(product, now = Date.now()) {
  const key = getProductKey(product);
  if (!key) return null;

  const available = getCatalogAvailability(product);
  const variants = Array.isArray(product.variants) ? product.variants : [];

  return {
    key,
    id: product.id ?? null,
    handle: product.handle ?? null,
    title: product.title ?? "Untitled Product",
    vendor: product.vendor ?? null,
    productType: product.product_type ?? null,
    tags: Array.isArray(product.tags) ? product.tags : [],
    url: getProductUrl(product),
    image: product.images?.[0]?.src ?? product.image?.src ?? null,
    price: product.variants?.[0]?.price ?? null,
    available,
    variantCount: variants.length,
    variants: variants.map((variant) => ({
      id: variant?.id ?? null,
      title: variant?.title ?? null,
      price: variant?.price ?? null,
      available: variant?.available === true,
      sku: variant?.sku ?? null
    })),
    firstSeenAt: now,
    lastSeenAt: now,
    lastAvailableAt: available ? now : null,
    lastUnavailableAt: available ? null : now
  };
}

export function mergeCatalog(state, catalog, now = Date.now()) {
  const next = state?.version === STATE_VERSION ? structuredClone(state) : createEmptyState();
  const changes = {
    newProducts: [],
    restocks: [],
    sellouts: [],
    unchanged: 0
  };

  for (const rawProduct of catalog) {
    const normalized = normalizeProduct(rawProduct, now);
    if (!normalized) continue;

    const previous = next.products[normalized.key];

    if (!previous) {
      next.products[normalized.key] = normalized;
      changes.newProducts.push(normalized);
      continue;
    }

    const wasAvailable = previous.available === true;
    const isAvailable = normalized.available === true;

    next.products[normalized.key] = {
      ...previous,
      ...normalized,
      firstSeenAt: previous.firstSeenAt ?? normalized.firstSeenAt,
      lastSeenAt: now,
      lastAvailableAt: isAvailable ? now : previous.lastAvailableAt,
      lastUnavailableAt: isAvailable ? previous.lastUnavailableAt : now
    };

    if (!wasAvailable && isAvailable) {
      changes.restocks.push(next.products[normalized.key]);
    } else if (wasAvailable && !isAvailable) {
      changes.sellouts.push(next.products[normalized.key]);
    } else {
      changes.unchanged += 1;
    }
  }

  const products = Object.values(next.products);
  next.stats = {
    ...next.stats,
    totalProducts: products.length,
    firstSeenProducts: changes.newProducts.length,
    availableProducts: products.filter((product) => product.available === true).length,
    unavailableProducts: products.filter((product) => product.available !== true).length,
    lastMergedAt: now
  };

  return { state: next, changes };
}

export async function loadState() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const stored = result?.[STORAGE_KEY];

  if (!stored || stored.version !== STATE_VERSION || typeof stored.products !== "object") {
    return createEmptyState();
  }

  return stored;
}

export async function saveState(state) {
  await chrome.storage.local.set({
    [STORAGE_KEY]: state
  });
}
