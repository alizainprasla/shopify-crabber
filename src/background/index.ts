/**
 * Background Service Worker
 * Handles communication between popup and content scripts
 * Manages downloads and storage
 */

import type { ExtensionMessage, StorageData } from '../types';

// Local type definitions for the injected script context
interface LocalScrapedProduct {
  title: string;
  handle?: string;
  description?: string;
  descriptionHtml?: string;
  vendor?: string;
  productType?: string;
  productCategory?: string;
  tags?: string[];
  seoTitle?: string;
  seoDescription?: string;
  published?: boolean;
  status?: 'active' | 'draft' | 'archived';
  variants: Array<{
    sku?: string;
    barcode?: string;
    price: string;
    compareAtPrice?: string;
    inventoryQuantity?: number;
    weight?: number;
    weightUnit?: 'g' | 'kg' | 'oz' | 'lb';
    requiresShipping?: boolean;
    taxable?: boolean;
    options: Array<{ name: string; value: string }>;
    imageUrl?: string;
  }>;
  images: Array<{
    src: string;
    alt?: string;
    position?: number;
  }>;
  sourceUrl: string;
  scrapedAt: string;
  platform?: 'shopify' | 'woocommerce' | 'bigcommerce' | 'magento' | 'generic';
}

interface LocalScrapeResult {
  success: boolean;
  product?: LocalScrapedProduct;
  error?: string;
}

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
        product: LocalScrapedProduct;
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
async function scrapeCurrentTab(): Promise<LocalScrapeResult> {
  try {
    // Get the active tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab.id) {
      return { success: false, error: 'No active tab found' };
    }

    if (!tab.url || tab.url.startsWith('chrome://')) {
      return { success: false, error: 'Cannot scrape Chrome internal pages' };
    }

    // Inject and execute the scraper
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: executeScraperInPage,
    });

    if (!results || results.length === 0) {
      return { success: false, error: 'Scraping failed - no results returned' };
    }

    const result = results[0].result as LocalScrapeResult;

    // Save to recent products if successful
    if (result.success && result.product) {
      await saveRecentProduct(result.product);
    }

    return result;
  } catch (error) {
    console.error('Scrape error:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown scraping error',
    };
  }
}

/**
 * This function runs in the context of the page
 * It's injected via chrome.scripting.executeScript
 */
function executeScraperInPage(): LocalScrapeResult {
  // Type definitions for this injected context
  interface InjectedProduct {
    title: string;
    handle?: string;
    description?: string;
    descriptionHtml?: string;
    vendor?: string;
    productType?: string;
    tags?: string[];
    seoTitle?: string;
    seoDescription?: string;
    variants: Array<{
      sku?: string;
      barcode?: string;
      price: string;
      compareAtPrice?: string;
      options: Array<{ name: string; value: string }>;
    }>;
    images: Array<{
      src: string;
      alt?: string;
      position?: number;
    }>;
    sourceUrl: string;
    scrapedAt: string;
    platform?: 'shopify' | 'generic';
  }

  interface InjectedResult {
    success: boolean;
    product?: InjectedProduct;
    error?: string;
  }

  const baseUrl = window.location.href;

  try {
    // Check if it's a Shopify store
    const isShopify = Boolean(
      (window as unknown as { Shopify?: unknown }).Shopify ||
      document.querySelector('meta[name="shopify-checkout-api-token"]')
    );

    // Try to get product JSON from Shopify
    let productData: unknown = null;

    if (isShopify) {
      // Look for product JSON in meta
      const win = window as unknown as { meta?: { product?: unknown } };
      if (win.meta?.product) {
        productData = win.meta.product;
      }

      // Look in script tags
      if (!productData) {
        const scripts = document.querySelectorAll('script:not([src])');
        for (const script of scripts) {
          const content = script.textContent || '';
          const match = content.match(/var\s+meta\s*=\s*(\{[\s\S]*?"product"[\s\S]*?\});/);
          if (match) {
            try {
              const parsed = JSON.parse(match[1]);
              if (parsed.product) {
                productData = parsed.product;
                break;
              }
            } catch {
              continue;
            }
          }
        }
      }
    }

    // Try JSON-LD
    let jsonLdProduct: unknown = null;
    const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of jsonLdScripts) {
      try {
        const data = JSON.parse(script.textContent || '');
        if (data['@type'] === 'Product') {
          jsonLdProduct = data;
          break;
        }
        if (data['@graph']) {
          for (const item of data['@graph']) {
            if (item['@type'] === 'Product') {
              jsonLdProduct = item;
              break;
            }
          }
        }
      } catch {
        continue;
      }
    }

    // Build product from available data
    const product: InjectedProduct = {
      title: '',
      variants: [],
      images: [],
      sourceUrl: baseUrl,
      scrapedAt: new Date().toISOString(),
      platform: isShopify ? 'shopify' : 'generic',
    };

    // Extract from Shopify product JSON
    if (productData && typeof productData === 'object') {
      const pd = productData as {
        title?: string;
        handle?: string;
        description?: string;
        vendor?: string;
        type?: string;
        tags?: string[];
        images?: string[];
        variants?: Array<{
          sku?: string;
          price?: number;
          compare_at_price?: number;
          option1?: string;
          option2?: string;
          option3?: string;
          barcode?: string;
        }>;
        options?: string[];
      };

      product.title = pd.title || '';
      product.handle = pd.handle || '';
      product.descriptionHtml = pd.description || '';
      product.vendor = pd.vendor || '';
      product.productType = pd.type || '';
      product.tags = pd.tags || [];

      // Images
      if (pd.images && Array.isArray(pd.images)) {
        product.images = pd.images.map((src, i) => ({
          src: src.startsWith('//') ? 'https:' + src : src,
          position: i + 1,
        }));
      }

      // Variants
      if (pd.variants && Array.isArray(pd.variants)) {
        const optionNames = pd.options || [];
        product.variants = pd.variants.map(v => ({
          sku: v.sku || '',
          price: v.price ? (v.price / 100).toFixed(2) : '',
          compareAtPrice: v.compare_at_price ? (v.compare_at_price / 100).toFixed(2) : '',
          barcode: v.barcode || '',
          options: [
            v.option1 ? { name: optionNames[0] || 'Option1', value: v.option1 } : null,
            v.option2 ? { name: optionNames[1] || 'Option2', value: v.option2 } : null,
            v.option3 ? { name: optionNames[2] || 'Option3', value: v.option3 } : null,
          ].filter((opt): opt is { name: string; value: string } => opt !== null),
        }));
      }
    }

    // Fallback to JSON-LD
    if (!product.title && jsonLdProduct && typeof jsonLdProduct === 'object') {
      const jld = jsonLdProduct as {
        name?: string;
        description?: string;
        brand?: { name?: string } | string;
        image?: string | string[];
        offers?: { price?: string | number; sku?: string } | Array<{ price?: string | number; sku?: string }>;
        sku?: string;
      };

      product.title = jld.name || '';
      product.description = jld.description || '';

      if (jld.brand) {
        product.vendor = typeof jld.brand === 'string' ? jld.brand : jld.brand.name || '';
      }

      if (jld.image) {
        const images = Array.isArray(jld.image) ? jld.image : [jld.image];
        product.images = images.map((src, i) => ({
          src: typeof src === 'string' ? src : '',
          position: i + 1,
        })).filter(img => img.src);
      }

      if (jld.offers) {
        const offers = Array.isArray(jld.offers) ? jld.offers : [jld.offers];
        product.variants = offers.map(o => ({
          price: o.price?.toString() || '',
          sku: o.sku || jld.sku || '',
          options: [],
        }));
      }
    }

    // DOM fallback for title
    if (!product.title) {
      const titleSelectors = [
        'h1[itemprop="name"]',
        'h1.product-title',
        'h1.product__title',
        'h1',
      ];
      for (const selector of titleSelectors) {
        const el = document.querySelector(selector);
        if (el?.textContent?.trim()) {
          product.title = el.textContent.trim();
          break;
        }
      }
    }

    // DOM fallback for images
    if (product.images.length === 0) {
      const ogImage = document.querySelector('meta[property="og:image"]')?.getAttribute('content');
      if (ogImage) {
        product.images.push({ src: ogImage, position: 1 });
      }
    }

    // Ensure at least one variant
    if (product.variants.length === 0) {
      product.variants.push({
        price: '',
        options: [{ name: 'Title', value: 'Default Title' }],
      });
    }

    // SEO
    product.seoTitle = document.querySelector('meta[name="title"]')?.getAttribute('content') ||
      document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
      product.title;

    if (!product.title) {
      return { success: false, error: 'No product data found on this page' };
    }

    return { success: true, product } as InjectedResult;
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Save product to recent products list
 */
async function saveRecentProduct(product: LocalScrapedProduct): Promise<void> {
  try {
    const { recentProducts = [] } = await chrome.storage.local.get('recentProducts');

    // Add to beginning, limit to 20 recent products
    const updated = [product, ...recentProducts.filter(
      (p: LocalScrapedProduct) => p.sourceUrl !== product.sourceUrl
    )].slice(0, 20);

    await chrome.storage.local.set({ recentProducts: updated });
  } catch (error) {
    console.error('Error saving recent product:', error);
  }
}

/**
 * Get product from storage by URL
 */
async function getProductFromStorage(url: string): Promise<LocalScrapedProduct | null> {
  const { recentProducts = [] } = await chrome.storage.local.get('recentProducts');
  return recentProducts.find((p: LocalScrapedProduct) => p.sourceUrl === url) || null;
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
  product: LocalScrapedProduct,
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
