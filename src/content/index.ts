/**
 * Content Script
 * Runs in the context of web pages
 * Handles scraping requests from the popup
 */

import type { ExtensionMessage, ScrapeResult, ScrapedProduct } from '../types';
import { scrapeCurrentPage, isProductPage, detectPlatform } from '../utils/scrapers';

// Store scraped data for quick access
let cachedProduct: ScrapedProduct | null = null;
let cacheUrl: string = '';

/**
 * Listen for messages from popup/background
 */
chrome.runtime.onMessage.addListener((
  message: ExtensionMessage,
  _sender: chrome.runtime.MessageSender,
  sendResponse: (response: unknown) => void
) => {
  handleMessage(message)
    .then(sendResponse)
    .catch(error => {
      console.error('Content script error:', error);
      sendResponse({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });

  // Return true to indicate async response
  return true;
});

/**
 * Handle incoming messages
 */
async function handleMessage(message: ExtensionMessage): Promise<unknown> {
  switch (message.type) {
    case 'PING':
      return { success: true, pong: true };

    case 'SCRAPE_PRODUCT':
      return await scrapeProduct();

    case 'GET_PRODUCT_DATA':
      return getCachedProduct();

    default:
      return { success: false, error: 'Unknown message type' };
  }
}

/**
 * Scrape product data from current page
 */
async function scrapeProduct(): Promise<ScrapeResult> {
  const currentUrl = window.location.href;

  // Return cached data if URL hasn't changed
  if (cachedProduct && cacheUrl === currentUrl) {
    return {
      success: true,
      product: cachedProduct,
    };
  }

  // Check if this appears to be a product page
  if (!isProductPage()) {
    return {
      success: false,
      error: 'This does not appear to be a product page. Navigate to a product page and try again.',
    };
  }

  // Detect platform
  const platform = detectPlatform();
  console.log(`Shopify Crabber: Detected platform - ${platform}`);

  // Run the scraper
  const result = await scrapeCurrentPage();

  // Cache successful results
  if (result.success && result.product) {
    cachedProduct = result.product;
    cacheUrl = currentUrl;

    // Add platform info
    result.product.platform = platform;
  }

  return result;
}

/**
 * Get cached product data
 */
function getCachedProduct(): { success: boolean; product?: ScrapedProduct } {
  if (cachedProduct && cacheUrl === window.location.href) {
    return { success: true, product: cachedProduct };
  }
  return { success: false };
}

/**
 * Clear cache when page changes
 */
function clearCache(): void {
  cachedProduct = null;
  cacheUrl = '';
}

// Listen for page changes (SPA navigation)
let lastUrl = window.location.href;
const observer = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    clearCache();
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// Also listen for popstate events
window.addEventListener('popstate', clearCache);

// Log that content script is loaded
console.log('Shopify Crabber content script loaded');
