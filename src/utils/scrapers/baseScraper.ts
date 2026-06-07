/**
 * Base Scraper
 * Common scraping utilities and abstract base class
 */

import type { ScrapedProduct, ProductImage } from '../../types';
import { normalizeImageUrl } from '../shopify/csvFormatter';

/**
 * Abstract base class for product scrapers
 */
export abstract class BaseScraper {
  protected baseUrl: string;
  protected document: Document;

  constructor(document: Document, baseUrl: string) {
    this.document = document;
    this.baseUrl = baseUrl;
  }

  /**
   * Check if this scraper can handle the current page
   */
  abstract canHandle(): boolean;

  /**
   * Scrape product data from the page
   */
  abstract scrape(): Promise<ScrapedProduct | null>;

  /**
   * Get text content from an element, trimmed
   */
  protected getText(selector: string, parent: Element | Document = this.document): string {
    const element = parent.querySelector(selector);
    return element?.textContent?.trim() || '';
  }

  /**
   * Get attribute value from an element
   */
  protected getAttr(selector: string, attr: string, parent: Element | Document = this.document): string {
    const element = parent.querySelector(selector);
    return element?.getAttribute(attr) || '';
  }

  /**
   * Get all matching elements
   */
  protected getAll(selector: string, parent: Element | Document = this.document): Element[] {
    return Array.from(parent.querySelectorAll(selector));
  }

  /**
   * Get HTML content from an element
   */
  protected getHtml(selector: string, parent: Element | Document = this.document): string {
    const element = parent.querySelector(selector);
    return element?.innerHTML?.trim() || '';
  }

  /**
   * Normalize a URL to absolute
   */
  protected normalizeUrl(url: string): string {
    return normalizeImageUrl(url, this.baseUrl);
  }

  /**
   * Extract JSON-LD data from the page
   */
  protected getJsonLd<T = unknown>(type?: string): T | null {
    const scripts = this.getAll('script[type="application/ld+json"]');

    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent || '');

        // Handle @graph structure
        if (data['@graph']) {
          const items = data['@graph'];
          for (const item of items) {
            if (!type || item['@type'] === type) {
              return item as T;
            }
          }
        }

        // Direct object
        if (!type || data['@type'] === type) {
          return data as T;
        }
      } catch {
        continue;
      }
    }

    return null;
  }

  /**
   * Get Open Graph meta tag value
   */
  protected getOgMeta(property: string): string {
    return this.getAttr(`meta[property="og:${property}"]`, 'content');
  }

  /**
   * Get standard meta tag value
   */
  protected getMeta(name: string): string {
    return this.getAttr(`meta[name="${name}"]`, 'content');
  }

  protected decodeIfUrlEncoded(value: string): string {
    if (!value.includes('%')) return value;
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  /**
   * Deduplicate images by URL
   */
  protected dedupeImages(images: ProductImage[]): ProductImage[] {
    const seen = new Set<string>();
    const unique: ProductImage[] = [];

    for (const image of images) {
      const normalizedUrl = this.normalizeUrl(image.src);
      if (normalizedUrl && !seen.has(normalizedUrl)) {
        seen.add(normalizedUrl);
        unique.push({
          ...image,
          src: normalizedUrl,
        });
      }
    }

    return unique;
  }

  /**
   * Parse price string to clean number format
   */
  protected parsePrice(priceStr: string): string {
    if (!priceStr) return '';

    // Remove currency symbols, spaces, and non-numeric characters except decimal
    const cleaned = priceStr
      .replace(/[^0-9.,]/g, '')
      .replace(/,(?=\d{3})/g, '') // Remove thousand separators
      .replace(/,/g, '.'); // Convert remaining commas to decimals

    // Ensure proper decimal format
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      // Multiple decimals - take last as decimal
      const decimal = parts.pop();
      return parts.join('') + '.' + decimal;
    }

    return cleaned;
  }

  /**
   * Clean HTML content (remove scripts, styles, etc.)
   */
  protected cleanHtml(html: string): string {
    // Create a temporary element to parse and clean HTML
    const temp = document.createElement('div');
    temp.innerHTML = html;

    // Remove unwanted elements
    const unwanted = temp.querySelectorAll('script, style, iframe, form, input, button');
    unwanted.forEach(el => el.remove());

    return temp.innerHTML.trim();
  }
}

/**
 * JSON-LD Product schema type
 */
export interface JsonLdProduct {
  '@type': 'Product';
  name?: string;
  description?: string;
  image?: string | string[] | { url: string }[];
  brand?: { name?: string } | string;
  sku?: string;
  gtin13?: string;
  gtin12?: string;
  offers?: JsonLdOffer | JsonLdOffer[];
  aggregateRating?: {
    ratingValue?: number;
    reviewCount?: number;
  };
}

export interface JsonLdOffer {
  '@type': 'Offer' | 'AggregateOffer';
  price?: string | number;
  priceCurrency?: string;
  availability?: string;
  sku?: string;
  url?: string;
}

/**
 * Extract images from JSON-LD product data
 */
export function extractJsonLdImages(image: JsonLdProduct['image']): string[] {
  if (!image) return [];

  if (typeof image === 'string') {
    return [image];
  }

  if (Array.isArray(image)) {
    return image.map(img => {
      if (typeof img === 'string') return img;
      if (typeof img === 'object' && img.url) return img.url;
      return '';
    }).filter(Boolean);
  }

  return [];
}

/**
 * Create a base product object with defaults
 */
export function createBaseProduct(sourceUrl: string): ScrapedProduct {
  return {
    title: '',
    variants: [],
    images: [],
    sourceUrl,
    scrapedAt: new Date().toISOString(),
    published: true,
    status: 'active',
  };
}
