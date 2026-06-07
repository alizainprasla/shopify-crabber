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

// Shopify Storefront API product (used by shop.app / Next.js)
interface StorefrontProduct {
  id?: string;
  title?: string;
  handle?: string;
  description?: string;
  descriptionHtml?: string;
  vendor?: string;
  productType?: string;
  tags?: string[];
  featuredImage?: { url?: string; src?: string; altText?: string };
  images?: { nodes?: Array<{ url?: string; src?: string; altText?: string }> } | Array<{ url?: string; src?: string; altText?: string }>;
  media?: { nodes?: Array<{ mediaContentType?: string; image?: { url?: string; src?: string; altText?: string } }> };
  variants?: {
    nodes?: Array<{
      id?: string;
      title?: string;
      sku?: string;
      price?: { amount?: string } | string | number;
      compareAtPrice?: { amount?: string } | string | number | null;
      image?: { url?: string; src?: string; altText?: string } | null;
      selectedOptions?: Array<{ name: string; value: string }>;
    }>;
  };
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

    // shop.app is Shopify's consumer platform
    if (window.location.hostname === 'shop.app') {
      return true;
    }

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
  async scrape(): Promise<ScrapedProduct | null> {
    const product = createBaseProduct(this.baseUrl);
    product.platform = 'shopify';

    // Try to get product JSON first (most reliable — standard Shopify stores)
    this.productJson = this.getProductJson();

    if (this.productJson) {
      return this.scrapeFromJson(product);
    }

    // React Router / Remix (shop.app and similar Storefront API SPAs)
    const reactRouterProduct = await this.scrapeFromReactRouter(product);
    if (reactRouterProduct?.title) {
      return reactRouterProduct;
    }

    // Next.js __NEXT_DATA__ (other Storefront API SPAs)
    const nextDataProduct = this.scrapeFromNextData(product);
    if (nextDataProduct?.title) {
      return nextDataProduct;
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
   * Scrape from React Router / Remix __reactRouterContext (shop.app)
   *
   * shop.app uses React Router v7 with streaming. The full product details
   * (including all images) live behind an async productDetailsPromise inside
   * window.__reactRouterContext.state.loaderData. We await that promise here
   * so the scraper sees the complete gallery rather than just the 2 pre-loaded
   * "critical" images.
   */
  private async scrapeFromReactRouter(product: ScrapedProduct): Promise<ScrapedProduct | null> {
    const ctx = (window as unknown as Record<string, unknown>)['__reactRouterContext'] as {
      state?: {
        loaderData?: Record<string, {
          criticalData?: { title?: string; numberOfVariants?: number; images?: Array<{ url?: string; altText?: string }> };
          productDetailsPromise?: Promise<{ storefrontProduct?: StorefrontProduct }> | { storefrontProduct?: StorefrontProduct };
        }>;
      };
    } | undefined;

    if (!ctx?.state?.loaderData) return null;

    // Find the product route's loader data — key ends with $slug on shop.app
    const loaderData = ctx.state.loaderData;
    const routeEntry = Object.values(loaderData).find(v => v?.productDetailsPromise !== undefined);
    if (!routeEntry) return null;

    let storefrontProduct: StorefrontProduct | undefined;
    try {
      const resolved = await Promise.resolve(routeEntry.productDetailsPromise);
      storefrontProduct = (resolved as { storefrontProduct?: StorefrontProduct } | undefined)?.storefrontProduct;
    } catch {
      return null;
    }

    if (!storefrontProduct?.title) return null;

    product.title = storefrontProduct.title;
    product.handle = storefrontProduct.handle || '';
    const rawDesc = this.decodeIfUrlEncoded(storefrontProduct.descriptionHtml || storefrontProduct.description || '');
    product.description = this.stripHtml(rawDesc);
    product.descriptionHtml = rawDesc;
    product.vendor = storefrontProduct.vendor || '';
    product.productType = storefrontProduct.productType || '';
    product.tags = storefrontProduct.tags || [];

    product.images = this.extractStorefrontImages(storefrontProduct);

    // Variants — build from options if nodes list is empty (shop.app loads
    // only the selected variant individually, but exposes all option values)
    const variantNodes = storefrontProduct.variants?.nodes || [];
    if (variantNodes.length > 0) {
      product.variants = variantNodes.map((v): ProductVariant => {
        const price = typeof v.price === 'object' && v.price !== null
          ? (v.price as { amount?: string }).amount || ''
          : String(v.price || '');
        const compareAtPrice = v.compareAtPrice && typeof v.compareAtPrice === 'object'
          ? (v.compareAtPrice as { amount?: string }).amount || ''
          : v.compareAtPrice ? String(v.compareAtPrice) : '';
        const imgSrc = v.image?.url || v.image?.src;
        return {
          id: v.id?.replace(/.*\//, '') || '',
          sku: v.sku || '',
          price,
          compareAtPrice,
          options: (v.selectedOptions || []).map(o => ({ name: o.name, value: o.value })),
          imageUrl: imgSrc ? this.normalizeUrl(imgSrc) : undefined,
        };
      });
    }

    if (product.variants.length === 0) {
      product.variants.push({ price: '', options: [] });
    }

    product.seoTitle = this.getMeta('title') || this.getOgMeta('title') || product.title;
    product.seoDescription = this.getMeta('description') || this.getOgMeta('description') || '';

    return product;
  }

  /**
   * Scrape from Next.js __NEXT_DATA__ (shop.app / Storefront API SPAs)
   */
  private scrapeFromNextData(product: ScrapedProduct): ScrapedProduct | null {
    const script = this.document.querySelector('#__NEXT_DATA__');
    if (!script?.textContent) return null;

    let data: unknown;
    try {
      data = JSON.parse(script.textContent);
    } catch {
      return null;
    }

    const storefrontProduct = this.findStorefrontProduct(data);
    if (!storefrontProduct?.title) return null;

    product.title = storefrontProduct.title;
    product.handle = storefrontProduct.handle || '';
    const rawDesc = this.decodeIfUrlEncoded(storefrontProduct.descriptionHtml || storefrontProduct.description || '');
    product.description = this.stripHtml(rawDesc);
    product.descriptionHtml = rawDesc;
    product.vendor = storefrontProduct.vendor || '';
    product.productType = storefrontProduct.productType || '';
    product.tags = storefrontProduct.tags || [];

    product.images = this.extractStorefrontImages(storefrontProduct);

    // Variants
    const variantNodes = storefrontProduct.variants?.nodes || [];
    if (variantNodes.length > 0) {
      product.variants = variantNodes.map((v): ProductVariant => {
        const price = typeof v.price === 'object' && v.price !== null
          ? (v.price as { amount?: string }).amount || ''
          : String(v.price || '');
        const compareAtPrice = v.compareAtPrice && typeof v.compareAtPrice === 'object'
          ? (v.compareAtPrice as { amount?: string }).amount || ''
          : v.compareAtPrice ? String(v.compareAtPrice) : '';
        const imgSrc = v.image?.url || v.image?.src;
        return {
          id: v.id?.replace(/.*\//, '') || '',
          sku: v.sku || '',
          price,
          compareAtPrice,
          options: (v.selectedOptions || []).map(o => ({ name: o.name, value: o.value })),
          imageUrl: imgSrc ? this.normalizeUrl(imgSrc) : undefined,
        };
      });
    }

    if (product.variants.length === 0) {
      product.variants.push({ price: '', options: [] });
    }

    product.seoTitle = this.getMeta('title') || this.getOgMeta('title') || product.title;
    product.seoDescription = this.getMeta('description') || this.getOgMeta('description') || '';

    return product;
  }

  /**
   * Recursively find a Storefront API product object in Next.js page props
   */
  private findStorefrontProduct(data: unknown, depth = 0): StorefrontProduct | null {
    if (depth > 6 || !data || typeof data !== 'object') return null;

    const obj = data as Record<string, unknown>;

    // If this object looks like a Storefront product, return it
    if (
      typeof obj['title'] === 'string' &&
      obj['title'].length > 0 &&
      (obj['images'] || obj['variants'] || obj['media'] || obj['featuredImage'])
    ) {
      return obj as unknown as StorefrontProduct;
    }

    // Recurse into object values (skip arrays at top level to avoid false matches)
    for (const value of Object.values(obj)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const found = this.findStorefrontProduct(value, depth + 1);
        if (found) return found;
      }
    }

    return null;
  }

  /**
   * Extract all images from a Storefront API product object
   */
  private extractStorefrontImages(p: StorefrontProduct): ProductImage[] {
    const images: ProductImage[] = [];
    const seen = new Set<string>();

    const addImage = (url: string | undefined, alt?: string | null) => {
      if (!url) return;
      const normalized = this.normalizeUrl(url);
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        images.push({ src: normalized, alt: alt || '', position: images.length + 1 });
      }
    };

    // images.nodes[]
    if (p.images) {
      if (Array.isArray(p.images)) {
        for (const img of p.images) {
          addImage(img.url || img.src, img.altText);
        }
      } else if (p.images.nodes) {
        for (const img of p.images.nodes) {
          addImage(img.url || img.src, img.altText);
        }
      }
    }

    // media.nodes[] (IMAGE type)
    if (p.media?.nodes) {
      for (const m of p.media.nodes) {
        if (m.mediaContentType === 'IMAGE' || !m.mediaContentType) {
          addImage(m.image?.url || m.image?.src, m.image?.altText);
        }
      }
    }

    // Variant images
    if (p.variants?.nodes) {
      for (const v of p.variants.nodes) {
        addImage(v.image?.url || v.image?.src, v.image?.altText);
      }
    }

    // featuredImage fallback
    if (images.length === 0) {
      addImage(p.featuredImage?.url || p.featuredImage?.src, p.featuredImage?.altText);
    }

    return images;
  }

  /**
   * Scrape from Shopify product JSON
   */
  private scrapeFromJson(product: ScrapedProduct): ScrapedProduct {
    const json = this.productJson!;

    // Basic info
    product.title = json.title || '';
    product.handle = json.handle || '';
    const rawDesc = this.decodeIfUrlEncoded(json.description || '');
    product.description = this.stripHtml(rawDesc);
    product.descriptionHtml = rawDesc;
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
      const rawDesc = this.decodeIfUrlEncoded(jsonLd.description);
      product.description = this.stripHtml(rawDesc);
      product.descriptionHtml = rawDesc;
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
        const decodedHtml = this.decodeIfUrlEncoded(html);
        product.descriptionHtml = this.cleanHtml(decodedHtml);
        product.description = this.stripHtml(decodedHtml);
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
