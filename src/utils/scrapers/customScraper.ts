/**
 * CustomScraper — uses user-defined CSS selectors (from FieldPicker) to extract
 * product data from any page. Runs before platform-specific scrapers when a
 * SelectorMap exists for the current hostname.
 */

import type { ScrapedProduct, ProductImage, ProductVariant } from '../../types';
import { BaseScraper, createBaseProduct } from './baseScraper';
import type { SelectorMap } from '../storage/selectorStore';
import { extractValue } from '../selector/cssGenerator';

export class CustomScraper extends BaseScraper {
  private map: SelectorMap;

  constructor(document: Document, baseUrl: string, map: SelectorMap) {
    super(document, baseUrl);
    this.map = map;
  }

  canHandle(): boolean {
    return this.map.fields.some(f => f.selector);
  }

  async scrape(): Promise<ScrapedProduct | null> {
    const product = createBaseProduct(this.baseUrl);
    product.platform = 'generic';

    let hasAnyData = false;

    for (const field of this.map.fields) {
      if (!field.selector) continue;

      const value = extractValue(field.selector, field.type);

      switch (field.name) {
        case 'title':
          if (typeof value === 'string' && value) {
            product.title = value;
            hasAnyData = true;
          }
          break;

        case 'price': {
          const priceStr = typeof value === 'string' ? value : '';
          if (priceStr) {
            if (!product.variants.length) {
              product.variants.push({ price: this.parsePrice(priceStr), options: [] });
            } else {
              product.variants[0].price = this.parsePrice(priceStr);
            }
            hasAnyData = true;
          }
          break;
        }

        case 'description':
          if (typeof value === 'string' && value) {
            product.descriptionHtml = value;
            product.description = this.stripHtml(value);
            hasAnyData = true;
          }
          break;

        case 'image': {
          const srcs = Array.isArray(value) ? value : (value ? [value as string] : []);
          const images: ProductImage[] = srcs
            .filter(Boolean)
            .map((src, i) => ({
              src: this.normalizeUrl(src),
              position: i + 1,
            }));
          if (images.length) {
            product.images = this.dedupeImages(images);
            hasAnyData = true;
          }
          break;
        }

        case 'vendor':
          if (typeof value === 'string' && value) {
            product.vendor = value;
            hasAnyData = true;
          }
          break;

        default: {
          // Custom field — store as a tag for now
          const v = typeof value === 'string' ? value : (value as string[]).join(', ');
          if (v) {
            product.tags = [...(product.tags || []), `${field.label}:${v}`];
            hasAnyData = true;
          }
        }
      }
    }

    if (!hasAnyData || !product.title) return null;

    if (!product.variants.length) {
      product.variants.push({ price: '', options: [] as ProductVariant['options'] });
    }

    product.seoTitle = this.getMeta('title') || this.getOgMeta('title') || product.title;
    product.seoDescription = this.getMeta('description') || this.getOgMeta('description') || '';

    return product;
  }

  private stripHtml(html: string): string {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || '';
  }
}
