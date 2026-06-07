/**
 * Generic Ecommerce Scraper
 * Extracts product data from any ecommerce site using:
 * - Schema.org Product markup (JSON-LD and microdata)
 * - Open Graph tags
 * - Meta tags
 * - Common DOM patterns
 */

import type { ScrapedProduct, ProductVariant, ProductImage } from '../../types';
import { BaseScraper, JsonLdProduct, extractJsonLdImages, createBaseProduct, JsonLdOffer } from './baseScraper';

export class GenericScraper extends BaseScraper {
  /**
   * Generic scraper can handle any page
   */
  canHandle(): boolean {
    return true;
  }

  /**
   * Main scrape method
   */
  async scrape(): Promise<ScrapedProduct | null> {
    const product = createBaseProduct(this.baseUrl);
    product.platform = 'generic';

    // Try JSON-LD first (most reliable structured data)
    const jsonLd = this.getJsonLd<JsonLdProduct>('Product');
    if (jsonLd) {
      this.scrapeFromJsonLd(product, jsonLd);
    }

    // Enhance with Open Graph data
    this.scrapeFromOpenGraph(product);

    // Enhance with meta tags
    this.scrapeFromMeta(product);

    // Fall back to DOM scraping for missing data
    this.scrapeFromDom(product);

    // Validate we have minimum required data
    if (!product.title) {
      return null;
    }

    // Ensure at least one variant
    if (product.variants.length === 0) {
      product.variants.push(this.createDefaultVariant(product));
    }

    return product;
  }

  /**
   * Scrape from JSON-LD Product data
   */
  private scrapeFromJsonLd(product: ScrapedProduct, jsonLd: JsonLdProduct): void {
    // Title
    if (jsonLd.name && !product.title) {
      product.title = jsonLd.name;
    }

    // Description
    if (jsonLd.description) {
      const rawDesc = this.decodeIfUrlEncoded(jsonLd.description);
      if (!product.description) {
        product.description = this.stripHtml(rawDesc);
      }
      if (!product.descriptionHtml) {
        product.descriptionHtml = rawDesc;
      }
    }

    // Brand/Vendor
    if (jsonLd.brand && !product.vendor) {
      product.vendor = typeof jsonLd.brand === 'string'
        ? jsonLd.brand
        : jsonLd.brand.name || '';
    }

    // Images
    if (jsonLd.image && product.images.length === 0) {
      const imageUrls = extractJsonLdImages(jsonLd.image);
      product.images = imageUrls.map((src, index) => ({
        src: this.normalizeUrl(src),
        position: index + 1,
      }));
    }

    // Offers/Variants
    if (jsonLd.offers) {
      const offers = Array.isArray(jsonLd.offers) ? jsonLd.offers : [jsonLd.offers];

      for (const offer of offers) {
        if (offer['@type'] === 'AggregateOffer') {
          // AggregateOffer - use price range
          const variant: ProductVariant = {
            sku: jsonLd.sku || '',
            barcode: jsonLd.gtin13 || jsonLd.gtin12 || '',
            price: this.extractPriceFromOffer(offer),
            options: [],
          };
          product.variants.push(variant);
        } else {
          // Individual offer
          const variant: ProductVariant = {
            sku: offer.sku || jsonLd.sku || '',
            barcode: jsonLd.gtin13 || jsonLd.gtin12 || '',
            price: this.extractPriceFromOffer(offer),
            options: [],
          };
          product.variants.push(variant);
        }
      }
    }

    // SKU fallback
    if (jsonLd.sku && product.variants.length > 0 && !product.variants[0].sku) {
      product.variants[0].sku = jsonLd.sku;
    }
  }

  /**
   * Scrape from Open Graph tags
   */
  private scrapeFromOpenGraph(product: ScrapedProduct): void {
    // Title
    if (!product.title) {
      product.title = this.getOgMeta('title');
    }

    // Description
    if (!product.description) {
      product.description = this.getOgMeta('description');
    }

    // Image
    if (product.images.length === 0) {
      const ogImage = this.getOgMeta('image');
      if (ogImage) {
        product.images.push({
          src: this.normalizeUrl(ogImage),
          position: 1,
        });
      }
    }

    // Price from product meta
    const ogPrice = this.getAttr('meta[property="product:price:amount"]', 'content');
    if (ogPrice && product.variants.length > 0 && !product.variants[0].price) {
      product.variants[0].price = this.parsePrice(ogPrice);
    }
  }

  /**
   * Scrape from standard meta tags
   */
  private scrapeFromMeta(product: ScrapedProduct): void {
    // Description
    if (!product.description) {
      product.description = this.getMeta('description');
    }

    // Keywords as tags
    const keywords = this.getMeta('keywords');
    if (keywords && (!product.tags || product.tags.length === 0)) {
      product.tags = keywords.split(',').map(k => k.trim()).filter(Boolean);
    }

    // SEO
    if (!product.seoTitle) {
      product.seoTitle = this.getMeta('title') || this.getOgMeta('title') || product.title;
    }
    if (!product.seoDescription) {
      product.seoDescription = this.getMeta('description') || '';
    }
  }

  /**
   * Scrape from DOM elements
   */
  private scrapeFromDom(product: ScrapedProduct): void {
    // Title
    if (!product.title) {
      product.title = this.extractTitle();
    }

    // Description
    if (!product.description) {
      this.extractDescription(product);
    }

    // Price
    if (product.variants.length === 0 || !product.variants[0].price) {
      const priceInfo = this.extractPriceFromDom();
      if (priceInfo.price) {
        if (product.variants.length === 0) {
          product.variants.push({
            price: priceInfo.price,
            compareAtPrice: priceInfo.compareAtPrice,
            options: [],
          });
        } else {
          product.variants[0].price = priceInfo.price;
          product.variants[0].compareAtPrice = priceInfo.compareAtPrice;
        }
      }
    }

    // Images
    if (product.images.length === 0) {
      product.images = this.extractImages();
    }

    // Vendor/Brand
    if (!product.vendor) {
      product.vendor = this.extractBrand();
    }

    // SKU
    if (product.variants.length > 0 && !product.variants[0].sku) {
      product.variants[0].sku = this.extractSku();
    }

    // Category/Type
    if (!product.productType) {
      product.productType = this.extractCategory();
    }

    // Variants from option selectors
    this.extractVariants(product);
  }

  /**
   * Extract product title
   */
  private extractTitle(): string {
    const selectors = [
      'h1[itemprop="name"]',
      'h1.product-title',
      'h1.product-name',
      'h1.product_title',
      '[data-testid="product-title"]',
      '.product-title h1',
      '.product-name h1',
      '#product-title',
      'h1',
    ];

    for (const selector of selectors) {
      const title = this.getText(selector);
      if (title && title.length > 2 && title.length < 500) {
        return title;
      }
    }

    return document.title.split('|')[0].split('-')[0].trim();
  }

  /**
   * Extract product description
   */
  private extractDescription(product: ScrapedProduct): void {
    const selectors = [
      '[itemprop="description"]',
      '.product-description',
      '.product-desc',
      '#product-description',
      '.description',
      '[data-testid="product-description"]',
      '.product-details',
    ];

    for (const selector of selectors) {
      const element = this.document.querySelector(selector);
      if (element) {
        const html = element.innerHTML;
        if (html && html.length > 10) {
          product.descriptionHtml = this.cleanHtml(html);
          product.description = this.stripHtml(html);
          return;
        }
      }
    }
  }

  /**
   * Extract price information from DOM
   */
  private extractPriceFromDom(): { price: string; compareAtPrice?: string } {
    const priceSelectors = [
      '[itemprop="price"]',
      '.product-price',
      '.price',
      '[data-price]',
      '.current-price',
      '.sale-price',
      '#product-price',
      '.price-current',
    ];

    const compareSelectors = [
      '.compare-price',
      '.original-price',
      '.was-price',
      '.price-was',
      's.price',
      'del.price',
      '.price-compare',
    ];

    let price = '';
    let compareAtPrice = '';

    // Get main price
    for (const selector of priceSelectors) {
      const element = this.document.querySelector(selector);
      if (element) {
        // Check for price attribute first
        const priceAttr = element.getAttribute('content') || element.getAttribute('data-price');
        if (priceAttr) {
          price = this.parsePrice(priceAttr);
          break;
        }

        const text = element.textContent || '';
        if (text && /\d/.test(text)) {
          price = this.parsePrice(text);
          break;
        }
      }
    }

    // Get compare price
    for (const selector of compareSelectors) {
      const text = this.getText(selector);
      if (text && /\d/.test(text)) {
        compareAtPrice = this.parsePrice(text);
        break;
      }
    }

    return { price, compareAtPrice };
  }

  /**
   * Extract product images
   */
  private extractImages(): ProductImage[] {
    const images: ProductImage[] = [];
    const seenUrls = new Set<string>();

    // Image gallery selectors
    const gallerySelectors = [
      '.product-gallery img',
      '.product-images img',
      '.product-photos img',
      '[data-gallery] img',
      '.gallery img',
      '.product-media img',
      '.product-image img',
      '.product__images img',
    ];

    for (const selector of gallerySelectors) {
      const imgElements = this.getAll(selector);
      if (imgElements.length > 0) {
        imgElements.forEach((img) => {
          const src = this.getImageSrc(img as HTMLImageElement);
          const normalizedSrc = this.normalizeUrl(src);

          if (normalizedSrc && !seenUrls.has(normalizedSrc)) {
            seenUrls.add(normalizedSrc);
            images.push({
              src: normalizedSrc,
              alt: img.getAttribute('alt') || '',
              position: images.length + 1,
            });
          }
        });

        if (images.length > 0) break;
      }
    }

    // Single main image fallback
    if (images.length === 0) {
      const mainImageSelectors = [
        '.product-image',
        '#product-image',
        '.main-image img',
        '[itemprop="image"]',
      ];

      for (const selector of mainImageSelectors) {
        const img = this.document.querySelector(selector);
        if (img) {
          const src = this.getImageSrc(img as HTMLImageElement);
          const normalizedSrc = this.normalizeUrl(src);

          if (normalizedSrc) {
            images.push({
              src: normalizedSrc,
              alt: img.getAttribute('alt') || '',
              position: 1,
            });
            break;
          }
        }
      }
    }

    return images;
  }

  /**
   * Get image source from various attributes
   */
  private getImageSrc(img: HTMLImageElement): string {
    return img.getAttribute('data-src') ||
      img.getAttribute('data-lazy-src') ||
      img.getAttribute('data-zoom-image') ||
      img.getAttribute('data-large') ||
      img.src ||
      '';
  }

  /**
   * Extract brand/vendor
   */
  private extractBrand(): string {
    const selectors = [
      '[itemprop="brand"]',
      '.product-brand',
      '.brand',
      '.vendor',
      '[data-brand]',
      '.manufacturer',
    ];

    for (const selector of selectors) {
      const text = this.getText(selector);
      if (text && text.length < 100) {
        return text;
      }
    }

    return '';
  }

  /**
   * Extract SKU
   */
  private extractSku(): string {
    const selectors = [
      '[itemprop="sku"]',
      '.sku',
      '.product-sku',
      '[data-sku]',
      '#product-sku',
    ];

    for (const selector of selectors) {
      const element = this.document.querySelector(selector);
      if (element) {
        const sku = element.getAttribute('content') ||
          element.getAttribute('data-sku') ||
          element.textContent?.replace(/SKU:?/i, '').trim();

        if (sku) return sku;
      }
    }

    return '';
  }

  /**
   * Extract product category
   */
  private extractCategory(): string {
    // Breadcrumbs
    const breadcrumbs = this.getAll('.breadcrumb a, .breadcrumbs a, nav[aria-label="breadcrumb"] a');
    if (breadcrumbs.length > 1) {
      // Get second-to-last breadcrumb (usually the category)
      const category = breadcrumbs[breadcrumbs.length - 2];
      return category.textContent?.trim() || '';
    }

    // Category selectors
    const selectors = [
      '[itemprop="category"]',
      '.product-category',
      '.category',
    ];

    for (const selector of selectors) {
      const text = this.getText(selector);
      if (text) return text;
    }

    return '';
  }

  /**
   * Extract variants from option selectors
   */
  private extractVariants(product: ScrapedProduct): void {
    // Look for variant/option selectors
    const optionContainers = this.getAll('[data-option], .product-option, .variant-selector, .swatch-container');

    if (optionContainers.length === 0) return;

    for (const container of optionContainers) {
      const label = this.getText('label', container) ||
        container.getAttribute('data-option-name') ||
        container.getAttribute('aria-label') ||
        '';

      if (!label) continue;

      // Get option values
      const values: string[] = [];

      // From select
      const select = container.querySelector('select');
      if (select) {
        Array.from(select.options).forEach(opt => {
          if (opt.value && opt.value !== '') {
            values.push(opt.text || opt.value);
          }
        });
      }

      // From radio/buttons
      const inputs = container.querySelectorAll('input[type="radio"], button[data-value]');
      inputs.forEach(input => {
        const value = input.getAttribute('value') ||
          input.getAttribute('data-value') ||
          input.textContent?.trim();
        if (value) values.push(value);
      });

      // Add to first variant's options
      if (values.length > 0 && product.variants[0]) {
        product.variants[0].options.push({
          name: label.replace(/:$/, '').trim(),
          value: values[0],
        });
      }
    }
  }

  /**
   * Create a default variant
   */
  private createDefaultVariant(_product: ScrapedProduct): ProductVariant {
    return {
      price: '',
      options: [],
    };
  }

  /**
   * Extract price from JSON-LD offer
   */
  private extractPriceFromOffer(offer: JsonLdOffer): string {
    if (offer.price !== undefined) {
      return offer.price.toString();
    }
    return '';
  }

  /**
   * Strip HTML tags
   */
  private stripHtml(html: string): string {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    return temp.textContent || '';
  }
}
