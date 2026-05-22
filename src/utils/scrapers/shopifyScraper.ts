/**
 * Shopify Store Scraper
 * Extracts product data from Shopify stores using:
 * - window.Shopify object
 * - Product JSON endpoints
 * - JSON-LD structured data
 * - DOM scraping as fallback
 */

import type { ScrapedProduct, ProductVariant, ProductImage, VariantOption } from '../../types';
import { BaseScraper, JsonLdProduct, extractJsonLdImages, createBaseProduct } from './baseScraper';

// Shopify product JSON structure
interface ShopifyProductJson {
  id: number;
  title: string;
  handle: string;
  description: string;
  vendor: string;
  type: string;
  tags: string[];
  price: number;
  price_max: number;
  price_min: number;
  compare_at_price: number | null;
  compare_at_price_max: number;
  compare_at_price_min: number;
  available: boolean;
  featured_image: string;
  images: string[];
  options: string[];
  variants: ShopifyVariant[];
  media?: ShopifyMedia[];
}

interface ShopifyVariant {
  id: number;
  title: string;
  sku: string;
  price: number;
  compare_at_price: number | null;
  available: boolean;
  option1: string | null;
  option2: string | null;
  option3: string | null;
  featured_image?: {
    src: string;
    alt?: string;
  } | null;
  barcode: string | null;
  weight: number;
  weight_unit: string;
  requires_shipping: boolean;
  taxable: boolean;
  inventory_quantity?: number;
}

interface ShopifyMedia {
  media_type: string;
  src: string;
  alt?: string;
  position?: number;
}

// Extended window interface for Shopify data
interface ShopifyWindow extends Window {
  Shopify?: {
    shop?: string;
    theme?: {
      name: string;
    };
  };
  ShopifyAnalytics?: {
    meta?: {
      product?: {
        id: number;
        type: string;
        vendor: string;
      };
    };
  };
  meta?: {
    product?: ShopifyProductJson;
  };
}

export class ShopifyScraper extends BaseScraper {
  private productJson: ShopifyProductJson | null = null;

  /**
   * Check if this is a Shopify store
   */
  canHandle(): boolean {
    const win = window as unknown as ShopifyWindow;

    // Check for Shopify global object
    if (win.Shopify && typeof win.Shopify === 'object') {
      return true;
    }

    // Check for Shopify meta tags
    if (this.document.querySelector('meta[name="shopify-checkout-api-token"]')) {
      return true;
    }

    // Check for Shopify-specific elements
    if (this.document.querySelector('[data-shopify]')) {
      return true;
    }

    // Check for Shopify in scripts
    const scripts = this.document.querySelectorAll('script[src*="shopify"]');
    if (scripts.length > 0) {
      return true;
    }

    return false;
  }

  /**
   * Main scrape method
   */
  scrape(): ScrapedProduct | null {
    const product = createBaseProduct(this.baseUrl);
    product.platform = 'shopify';

    // Try to get product JSON first (most reliable)
    this.productJson = this.getProductJson();

    if (this.productJson) {
      return this.scrapeFromJson(product);
    }

    // Fall back to JSON-LD
    const jsonLd = this.getJsonLd<JsonLdProduct>('Product');
    if (jsonLd) {
      return this.scrapeFromJsonLd(product, jsonLd);
    }

    // Fall back to DOM scraping
    return this.scrapeFromDom(product);
  }

  /**
   * Get product JSON from various Shopify sources
   */
  private getProductJson(): ShopifyProductJson | null {
    const win = window as unknown as ShopifyWindow;

    // Check window.meta.product
    if (win.meta?.product) {
      return win.meta.product;
    }

    // Try to find product JSON in script tags
    const scripts = this.getAll('script:not([src])');
    for (const script of scripts) {
      const content = script.textContent || '';

      // Look for product JSON patterns
      const patterns = [
        /var\s+meta\s*=\s*(\{[\s\S]*?"product"[\s\S]*?\});/,
        /product:\s*(\{[\s\S]*?"id"[\s\S]*?"variants"[\s\S]*?\})/,
        /"product":\s*(\{[\s\S]*?"variants"[\s\S]*?\})/,
      ];

      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match) {
          try {
            const parsed = JSON.parse(match[1]);
            if (parsed.product) return parsed.product;
            if (parsed.variants) return parsed;
          } catch {
            continue;
          }
        }
      }
    }

    // Try to fetch from .json endpoint
    // Note: This is async but we'll handle it in the content script
    return null;
  }

  /**
   * Scrape from Shopify product JSON
   */
  private scrapeFromJson(product: ScrapedProduct): ScrapedProduct {
    const json = this.productJson!;

    // Basic info
    product.title = json.title || '';
    product.handle = json.handle || '';
    product.description = this.stripHtml(json.description || '');
    product.descriptionHtml = json.description || '';
    product.vendor = json.vendor || '';
    product.productType = json.type || '';
    product.tags = json.tags || [];

    // Get option names
    const optionNames = json.options || [];

    // Variants
    product.variants = (json.variants || []).map((v): ProductVariant => {
      const options: VariantOption[] = [];

      if (v.option1 && optionNames[0]) {
        options.push({ name: optionNames[0], value: v.option1 });
      }
      if (v.option2 && optionNames[1]) {
        options.push({ name: optionNames[1], value: v.option2 });
      }
      if (v.option3 && optionNames[2]) {
        options.push({ name: optionNames[2], value: v.option3 });
      }

      return {
        id: v.id.toString(),
        sku: v.sku || '',
        barcode: v.barcode || '',
        price: this.formatPrice(v.price),
        compareAtPrice: v.compare_at_price ? this.formatPrice(v.compare_at_price) : '',
        inventoryQuantity: v.inventory_quantity,
        weight: v.weight || undefined,
        weightUnit: (v.weight_unit as ProductVariant['weightUnit']) || 'g',
        requiresShipping: v.requires_shipping,
        taxable: v.taxable,
        options,
        imageUrl: v.featured_image?.src ? this.normalizeUrl(v.featured_image.src) : undefined,
      };
    });

    // Images
    const images: ProductImage[] = [];

    // Add main images
    if (json.images && json.images.length > 0) {
      json.images.forEach((src, index) => {
        images.push({
          src: this.normalizeUrl(src),
          position: index + 1,
        });
      });
    } else if (json.featured_image) {
      images.push({
        src: this.normalizeUrl(json.featured_image),
        position: 1,
      });
    }

    // Add media if available
    if (json.media) {
      json.media
        .filter(m => m.media_type === 'image')
        .forEach((m, index) => {
          if (!images.some(img => img.src === this.normalizeUrl(m.src))) {
            images.push({
              src: this.normalizeUrl(m.src),
              alt: m.alt,
              position: m.position || index + 1,
            });
          }
        });
    }

    product.images = this.dedupeImages(images);

    // SEO from meta tags
    product.seoTitle = this.getMeta('title') || this.getOgMeta('title') || product.title;
    product.seoDescription = this.getMeta('description') || this.getOgMeta('description') || '';

    return product;
  }

  /**
   * Scrape from JSON-LD data
   */
  private scrapeFromJsonLd(product: ScrapedProduct, jsonLd: JsonLdProduct): ScrapedProduct {
    product.title = jsonLd.name || '';

    if (jsonLd.description) {
      product.description = this.stripHtml(jsonLd.description);
      product.descriptionHtml = jsonLd.description;
    }

    // Brand
    if (jsonLd.brand) {
      product.vendor = typeof jsonLd.brand === 'string'
        ? jsonLd.brand
        : jsonLd.brand.name || '';
    }

    // Images
    const imageUrls = extractJsonLdImages(jsonLd.image);
    product.images = imageUrls.map((src, index) => ({
      src: this.normalizeUrl(src),
      position: index + 1,
    }));

    // Offers/Variants
    if (jsonLd.offers) {
      const offers = Array.isArray(jsonLd.offers) ? jsonLd.offers : [jsonLd.offers];

      product.variants = offers.map((offer): ProductVariant => ({
        sku: offer.sku || jsonLd.sku || '',
        barcode: jsonLd.gtin13 || jsonLd.gtin12 || '',
        price: offer.price?.toString() || '',
        options: [],
      }));
    }

    // Ensure at least one variant
    if (product.variants.length === 0) {
      product.variants.push({
        price: '',
        options: [],
      });
    }

    // SEO
    product.seoTitle = this.getMeta('title') || this.getOgMeta('title') || product.title;
    product.seoDescription = this.getMeta('description') || '';

    return product;
  }

  /**
   * Scrape from DOM elements
   */
  private scrapeFromDom(product: ScrapedProduct): ScrapedProduct {
    // Title - try multiple selectors
    product.title = this.getText('h1.product-title') ||
      this.getText('h1.product__title') ||
      this.getText('.product-single__title') ||
      this.getText('h1[itemprop="name"]') ||
      this.getText('h1') ||
      this.getOgMeta('title') ||
      '';

    // Description
    const descriptionSelectors = [
      '.product-description',
      '.product__description',
      '.product-single__description',
      '[data-product-description]',
      '[itemprop="description"]',
    ];

    for (const selector of descriptionSelectors) {
      const html = this.getHtml(selector);
      if (html) {
        product.descriptionHtml = this.cleanHtml(html);
        product.description = this.stripHtml(html);
        break;
      }
    }

    // Price
    const priceText = this.getText('.product__price') ||
      this.getText('.price__regular') ||
      this.getText('[data-product-price]') ||
      this.getText('.product-price') ||
      '';

    const compareAtPriceText = this.getText('.price__compare') ||
      this.getText('[data-compare-price]') ||
      this.getText('.product-compare-price') ||
      '';

    // Create default variant
    product.variants = [{
      price: this.parsePrice(priceText),
      compareAtPrice: this.parsePrice(compareAtPriceText),
      options: [],
    }];

    // Try to extract variants from option selectors
    this.extractVariantsFromDom(product);

    // Images
    product.images = this.extractImagesFromDom();

    // Vendor
    product.vendor = this.getText('.product__vendor') ||
      this.getText('[data-product-vendor]') ||
      '';

    // SEO
    product.seoTitle = this.getMeta('title') || this.getOgMeta('title') || product.title;
    product.seoDescription = this.getMeta('description') || '';

    return product;
  }

  /**
   * Extract variants from DOM option selectors
   */
  private extractVariantsFromDom(product: ScrapedProduct): void {
    const optionSelectors = this.getAll('[data-option], .product-option, .variant-option');

    for (const selector of optionSelectors) {
      const name = selector.getAttribute('data-option-name') ||
        this.getText('label', selector) ||
        '';

      const values = this.getAll('option, input[type="radio"]', selector)
        .map(el => el.getAttribute('value') || el.textContent || '')
        .filter(Boolean);

      if (name && values.length > 0 && product.variants[0]) {
        product.variants[0].options.push({
          name,
          value: values[0], // Default to first value
        });
      }
    }
  }

  /**
   * Extract images from DOM
   */
  private extractImagesFromDom(): ProductImage[] {
    const images: ProductImage[] = [];

    // Product gallery images
    const gallerySelectors = [
      '.product__media img',
      '.product-gallery img',
      '.product-images img',
      '[data-product-media] img',
      '.product-single__photo img',
      '.product__image',
    ];

    for (const selector of gallerySelectors) {
      const imgElements = this.getAll(selector);
      if (imgElements.length > 0) {
        imgElements.forEach((img, index) => {
          const src = img.getAttribute('src') ||
            img.getAttribute('data-src') ||
            img.getAttribute('data-lazy-src') ||
            '';

          if (src) {
            images.push({
              src: this.normalizeUrl(src),
              alt: img.getAttribute('alt') || '',
              position: index + 1,
            });
          }
        });
        break;
      }
    }

    // If no gallery images, try OG image
    if (images.length === 0) {
      const ogImage = this.getOgMeta('image');
      if (ogImage) {
        images.push({
          src: this.normalizeUrl(ogImage),
          position: 1,
        });
      }
    }

    return this.dedupeImages(images);
  }

  /**
   * Format Shopify price (cents to dollars)
   */
  private formatPrice(price: number): string {
    // Shopify stores prices in cents
    return (price / 100).toFixed(2);
  }

  /**
   * Strip HTML tags from text
   */
  private stripHtml(html: string): string {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.textContent || '';
  }
}

/**
 * Async method to fetch product JSON from Shopify endpoint
 */
export async function fetchShopifyProductJson(handle: string): Promise<ShopifyProductJson | null> {
  try {
    const url = `${window.location.origin}/products/${handle}.json`;
    const response = await fetch(url);

    if (!response.ok) return null;

    const data = await response.json();
    return data.product || null;
  } catch {
    return null;
  }
}
