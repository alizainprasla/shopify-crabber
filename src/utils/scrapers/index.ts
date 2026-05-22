/**
 * Product Scrapers
 * Factory function to select and run appropriate scraper
 */

import type { ScrapedProduct, ScrapeResult } from '../../types';
import { ShopifyScraper } from './shopifyScraper';
import { GenericScraper } from './genericScraper';

export { ShopifyScraper } from './shopifyScraper';
export { GenericScraper } from './genericScraper';
export { BaseScraper } from './baseScraper';

/**
 * Scrape the current page for product data
 * Automatically selects the appropriate scraper based on the page
 */
export function scrapeCurrentPage(): ScrapeResult {
  const baseUrl = window.location.href;

  try {
    // Try Shopify scraper first
    const shopifyScraper = new ShopifyScraper(document, baseUrl);
    if (shopifyScraper.canHandle()) {
      const product = shopifyScraper.scrape();
      if (product && product.title) {
        return {
          success: true,
          product,
        };
      }
    }

    // Fall back to generic scraper
    const genericScraper = new GenericScraper(document, baseUrl);
    const product = genericScraper.scrape();

    if (product && product.title) {
      return {
        success: true,
        product,
        warnings: getScrapingWarnings(product),
      };
    }

    return {
      success: false,
      error: 'No product data found on this page. Make sure you are on a product page.',
    };
  } catch (error) {
    return {
      success: false,
      error: `Scraping failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Check for potential issues with scraped data
 */
function getScrapingWarnings(product: ScrapedProduct): string[] {
  const warnings: string[] = [];

  if (!product.title) {
    warnings.push('Product title could not be found');
  }

  if (!product.description && !product.descriptionHtml) {
    warnings.push('Product description could not be found');
  }

  if (product.images.length === 0) {
    warnings.push('No product images were found');
  }

  if (product.variants.length === 0) {
    warnings.push('No variants found - a default variant will be created');
  } else {
    const hasPrice = product.variants.some(v => v.price);
    if (!hasPrice) {
      warnings.push('Product price could not be found');
    }
  }

  if (!product.vendor) {
    warnings.push('Product vendor/brand could not be found');
  }

  return warnings;
}

/**
 * Detect what platform the current page is from
 */
export function detectPlatform(): 'shopify' | 'woocommerce' | 'bigcommerce' | 'magento' | 'generic' {
  // Shopify
  if (
    (window as unknown as { Shopify?: unknown }).Shopify ||
    document.querySelector('meta[name="shopify-checkout-api-token"]') ||
    document.querySelector('[data-shopify]')
  ) {
    return 'shopify';
  }

  // WooCommerce
  if (
    document.querySelector('.woocommerce') ||
    document.querySelector('body.woocommerce') ||
    document.querySelector('[data-product_id]')
  ) {
    return 'woocommerce';
  }

  // BigCommerce
  if (
    document.querySelector('[data-product-id]') &&
    document.querySelector('.productView')
  ) {
    return 'bigcommerce';
  }

  // Magento
  if (
    document.querySelector('.catalog-product-view') ||
    document.querySelector('[data-mage-init]')
  ) {
    return 'magento';
  }

  return 'generic';
}

/**
 * Check if current page appears to be a product page
 */
export function isProductPage(): boolean {
  // Check for JSON-LD Product
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const script of scripts) {
    try {
      const data = JSON.parse(script.textContent || '');
      if (data['@type'] === 'Product' || (data['@graph'] && data['@graph'].some((item: { '@type': string }) => item['@type'] === 'Product'))) {
        return true;
      }
    } catch {
      continue;
    }
  }

  // Check for Open Graph product type
  const ogType = document.querySelector('meta[property="og:type"]');
  if (ogType?.getAttribute('content')?.includes('product')) {
    return true;
  }

  // Check for common product page indicators
  const productIndicators = [
    '[itemprop="product"]',
    '[data-product-id]',
    '.product-single',
    '.product-detail',
    '.product-page',
    '#product',
    '.ProductMeta',
    '.product__info',
  ];

  for (const selector of productIndicators) {
    if (document.querySelector(selector)) {
      return true;
    }
  }

  // Check URL patterns
  const url = window.location.href.toLowerCase();
  const productUrlPatterns = [
    '/products/',
    '/product/',
    '/p/',
    '/item/',
    '/dp/',
  ];

  return productUrlPatterns.some(pattern => url.includes(pattern));
}
