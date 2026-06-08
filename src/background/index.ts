/**
 * Background Service Worker
 * Handles communication between popup and content scripts
 * Manages downloads and storage
 */

import type { ExtensionMessage, StorageData, ScrapedProduct, ScrapeResult } from '../types';

// Default settings
const DEFAULT_SETTINGS: StorageData['settings'] = {
  includeImages: true,
  downloadImages: false,
  generateHandle: true,
  defaultStatus: 'active',
};

/**
 * Initialize extension on install
 */
chrome.runtime.onInstalled.addListener(async () => {
  console.log('Shopify Crabber installed');

  // Initialize storage with defaults
  const existing = await chrome.storage.local.get(['settings', 'recentProducts']);

  if (!existing.settings) {
    await chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  }

  if (!existing.recentProducts) {
    await chrome.storage.local.set({ recentProducts: [] });
  }
});

/**
 * Handle messages from popup and content scripts
 */
chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
  handleMessage(message)
    .then(sendResponse)
    .catch(error => {
      console.error('Message handling error:', error);
      sendResponse({ success: false, error: error.message });
    });

  // Return true to indicate async response
  return true;
});

/**
 * Process incoming messages
 */
async function handleMessage(message: ExtensionMessage): Promise<unknown> {
  switch (message.type) {
    case 'PING':
      return { success: true, pong: true };

    case 'SCRAPE_PRODUCT':
      return await scrapeCurrentTab();

    case 'GET_PRODUCT_DATA':
      return await getProductFromStorage(message.payload as string);

    case 'DOWNLOAD_CSV':
      return await downloadCSV(message.payload as { csv: string; filename: string });

    case 'DOWNLOAD_IMAGES':
      return await initiateImageDownload();

    case 'PUSH_TO_SHOPIFY': {
      const { product, storeConfig } = message.payload as {
        product: ScrapedProduct;
        storeConfig: { storeUrl: string; accessToken: string };
      };
      return await pushProductToShopify(product, storeConfig);
    }

    default:
      return { success: false, error: 'Unknown message type' };
  }
}

/**
 * Execute scraping in the current active tab
 */
async function scrapeCurrentTab(): Promise<ScrapeResult> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.id) {
      return { success: false, error: 'No active tab found' };
    }

    if (!tab.url || tab.url.startsWith('chrome://')) {
      return { success: false, error: 'Cannot scrape Chrome internal pages' };
    }

    // Delegate to the content script so custom selectors and all platform
    // scrapers are honoured (the content script runs scrapeCurrentPage()).
    const result: ScrapeResult = await chrome.tabs.sendMessage(tab.id, {
      type: 'SCRAPE_PRODUCT',
    });

    if (result.success && result.product) {
      await saveRecentProduct(result.product);
    }

    return result;
  } catch (error) {
    console.error('Scrape error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Scraping failed — try reloading the page',
    };
  }
}

/**
 * Save product to recent products list
 */
async function saveRecentProduct(product: ScrapedProduct): Promise<void> {
  try {
    const { recentProducts = [] } = await chrome.storage.local.get('recentProducts');

    // Add to beginning, limit to 20 recent products
    const updated = [product, ...recentProducts.filter(
      (p: ScrapedProduct) => p.sourceUrl !== product.sourceUrl
    )].slice(0, 20);

    await chrome.storage.local.set({ recentProducts: updated });
  } catch (error) {
    console.error('Error saving recent product:', error);
  }
}

/**
 * Get product from storage by URL
 */
async function getProductFromStorage(url: string): Promise<ScrapedProduct | null> {
  const { recentProducts = [] } = await chrome.storage.local.get('recentProducts');
  return recentProducts.find((p: ScrapedProduct) => p.sourceUrl === url) || null;
}

/**
 * Download CSV file
 */
async function downloadCSV(payload: { csv: string; filename: string }): Promise<{ success: boolean }> {
  try {
    const blob = new Blob([payload.csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    await chrome.downloads.download({
      url,
      filename: payload.filename,
      saveAs: true,
    });

    // Clean up blob URL after a delay
    setTimeout(() => URL.revokeObjectURL(url), 60000);

    return { success: true };
  } catch (error) {
    console.error('Download error:', error);
    return { success: false };
  }
}

/**
 * Initiate image download (will be handled by popup)
 */
async function initiateImageDownload(): Promise<{ success: boolean }> {
  // Image downloading is handled in the popup with JSZip
  // This just confirms the request was received
  return { success: true };
}

/**
 * Push a scraped product to a Shopify store via the Admin REST API
 */
async function pushProductToShopify(
  product: ScrapedProduct,
  config: { storeUrl: string; accessToken: string }
): Promise<{ success: boolean; productId?: string; adminUrl?: string; error?: string }> {
  try {
    const domain = config.storeUrl
      .replace(/^https?:\/\//, '')
      .replace(/\/$/, '');

    // Collect unique option names in order
    const optionNames: string[] = [];
    for (const v of product.variants) {
      for (const opt of v.options) {
        if (!optionNames.includes(opt.name)) optionNames.push(opt.name);
      }
    }

    const shopifyOptions = optionNames.map(name => ({
      name,
      values: [...new Set(
        product.variants.map(v => v.options.find(o => o.name === name)?.value || '').filter(Boolean)
      )],
    }));

    const shopifyVariants = product.variants.map((v, i) => {
      const variant: Record<string, unknown> = {
        price: v.price || '0.00',
        sku: v.sku || '',
        barcode: v.barcode || '',
        requires_shipping: v.requiresShipping !== false,
        taxable: v.taxable !== false,
        position: i + 1,
      };
      if (v.compareAtPrice) variant.compare_at_price = v.compareAtPrice;
      if (v.weight) { variant.weight = v.weight; variant.weight_unit = v.weightUnit || 'g'; }
      if (v.options[0]) variant.option1 = v.options[0].value;
      if (v.options[1]) variant.option2 = v.options[1].value;
      if (v.options[2]) variant.option3 = v.options[2].value;
      return variant;
    });

    // Default variant if none
    if (shopifyVariants.length === 0) {
      shopifyVariants.push({ price: '0.00', option1: 'Default Title' });
    }

    const shopifyImages = product.images.map((img, i) => ({
      src: img.src,
      alt: img.alt || product.title,
      position: i + 1,
    }));

    const payload = {
      product: {
        title: product.title,
        body_html: product.descriptionHtml || product.description || '',
        vendor: product.vendor || '',
        product_type: product.productType || '',
        tags: (product.tags || []).join(', '),
        status: product.status || 'active',
        ...(shopifyOptions.length > 0 && { options: shopifyOptions }),
        variants: shopifyVariants,
        images: shopifyImages,
      },
    };

    const response = await fetch(
      `https://${domain}/admin/api/2024-01/products.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': config.accessToken,
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      const msg = body.errors
        ? (typeof body.errors === 'string' ? body.errors : JSON.stringify(body.errors))
        : `HTTP ${response.status}`;
      return { success: false, error: msg };
    }

    const data = await response.json();
    const id = data.product?.id?.toString();
    return {
      success: true,
      productId: id,
      adminUrl: `https://${domain}/admin/products/${id}`,
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Network error',
    };
  }
}

/**
 * Listen for tab updates to detect product pages
 */
chrome.tabs.onUpdated.addListener(async (_tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // Could implement auto-detection here
    // For now, we just let the user click the extension icon
  }
});
