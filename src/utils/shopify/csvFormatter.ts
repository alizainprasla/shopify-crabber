/**
 * Shopify CSV Formatter
 * Transforms scraped product data into Shopify-compatible CSV format
 */

import type { ScrapedProduct, ShopifyCSVRow, ProductVariant, ProductImage } from '../../types';
import { generateHandle } from './handleGenerator';

// All Shopify CSV columns in order
export const SHOPIFY_CSV_HEADERS: (keyof ShopifyCSVRow)[] = [
  'Handle',
  'Title',
  'Body (HTML)',
  'Vendor',
  'Product Category',
  'Type',
  'Tags',
  'Published',
  'Option1 Name',
  'Option1 Value',
  'Option2 Name',
  'Option2 Value',
  'Option3 Name',
  'Option3 Value',
  'Variant SKU',
  'Variant Grams',
  'Variant Inventory Tracker',
  'Variant Inventory Qty',
  'Variant Inventory Policy',
  'Variant Fulfillment Service',
  'Variant Price',
  'Variant Compare At Price',
  'Variant Requires Shipping',
  'Variant Taxable',
  'Variant Barcode',
  'Image Src',
  'Image Position',
  'Image Alt Text',
  'SEO Title',
  'SEO Description',
  'Google Shopping / Google Product Category',
  'Google Shopping / Gender',
  'Google Shopping / Age Group',
  'Google Shopping / MPN',
  'Google Shopping / Condition',
  'Google Shopping / Custom Product',
  'Google Shopping / Custom Label 0',
  'Google Shopping / Custom Label 1',
  'Google Shopping / Custom Label 2',
  'Google Shopping / Custom Label 3',
  'Google Shopping / Custom Label 4',
  'Variant Image',
  'Variant Weight Unit',
  'Variant Tax Code',
  'Cost per item',
  'Included / International',
  'Price / International',
  'Compare At Price / International',
  'Included / United States',
  'Price / United States',
  'Compare At Price / United States',
  'Status',
];

/**
 * Create an empty Shopify CSV row with all columns
 */
function createEmptyRow(): ShopifyCSVRow {
  const row: Partial<ShopifyCSVRow> = {};
  for (const header of SHOPIFY_CSV_HEADERS) {
    row[header] = '';
  }
  return row as ShopifyCSVRow;
}

/**
 * Convert weight to grams based on unit
 */
function convertToGrams(weight: number | undefined, unit: string | undefined): string {
  if (weight === undefined || weight === null) return '';

  const normalizedUnit = (unit || 'g').toLowerCase();

  switch (normalizedUnit) {
    case 'kg':
      return Math.round(weight * 1000).toString();
    case 'oz':
      return Math.round(weight * 28.3495).toString();
    case 'lb':
      return Math.round(weight * 453.592).toString();
    case 'g':
    default:
      return Math.round(weight).toString();
  }
}

/**
 * Format tags array to comma-separated string
 */
function formatTags(tags: string[] | undefined): string {
  if (!tags || !Array.isArray(tags)) return '';
  return tags.map(tag => tag.trim()).filter(Boolean).join(', ');
}

/**
 * Get unique option names from all variants
 */
function getOptionNames(variants: ProductVariant[]): string[] {
  const optionNames = new Set<string>();

  for (const variant of variants) {
    for (const option of variant.options || []) {
      if (option.name) {
        optionNames.add(option.name);
      }
    }
  }

  return Array.from(optionNames).slice(0, 3); // Shopify supports max 3 options
}

/**
 * Get option value by name from a variant
 */
function getOptionValue(variant: ProductVariant, optionName: string): string {
  const option = variant.options?.find(
    opt => opt.name.toLowerCase() === optionName.toLowerCase()
  );
  return option?.value || '';
}

/**
 * Transform a scraped product into Shopify CSV rows
 *
 * Shopify CSV rules:
 * 1. First row contains all product info + first variant + first image
 * 2. Additional variants get separate rows with only variant data
 * 3. Additional images get separate rows with only image data
 * 4. All rows share the same Handle
 */
export function productToShopifyRows(product: ScrapedProduct): ShopifyCSVRow[] {
  const rows: ShopifyCSVRow[] = [];
  const handle = product.handle || generateHandle(product.title);
  const optionNames = getOptionNames(product.variants);

  // Ensure we have at least one variant
  const variants = product.variants.length > 0
    ? product.variants
    : [createDefaultVariant()];

  // Ensure we have images array
  const images = product.images || [];

  // Track images that need their own rows (beyond the first image per variant)
  const additionalImages: ProductImage[] = [];

  // Process each variant
  variants.forEach((variant, variantIndex) => {
    const row = createEmptyRow();
    const isFirstRow = variantIndex === 0;

    // Handle (required for all rows)
    row.Handle = handle;

    // Product-level fields (only on first row)
    if (isFirstRow) {
      row.Title = product.title || '';
      row['Body (HTML)'] = product.descriptionHtml || product.description || '';
      row.Vendor = product.vendor || '';
      row['Product Category'] = product.productCategory || '';
      row.Type = product.productType || '';
      row.Tags = formatTags(product.tags);
      row.Published = product.published !== false ? 'TRUE' : 'FALSE';
      row['SEO Title'] = product.seoTitle || '';
      row['SEO Description'] = product.seoDescription || '';
      row.Status = product.status || 'active';
    }

    // Option names and values
    if (optionNames[0]) {
      if (isFirstRow) row['Option1 Name'] = optionNames[0];
      row['Option1 Value'] = getOptionValue(variant, optionNames[0]) || 'Default Title';
    } else if (isFirstRow) {
      row['Option1 Name'] = 'Title';
      row['Option1 Value'] = 'Default Title';
    }

    if (optionNames[1]) {
      if (isFirstRow) row['Option2 Name'] = optionNames[1];
      row['Option2 Value'] = getOptionValue(variant, optionNames[1]);
    }

    if (optionNames[2]) {
      if (isFirstRow) row['Option3 Name'] = optionNames[2];
      row['Option3 Value'] = getOptionValue(variant, optionNames[2]);
    }

    // Variant fields
    row['Variant SKU'] = variant.sku || '';
    row['Variant Grams'] = convertToGrams(variant.weight, variant.weightUnit);
    row['Variant Inventory Tracker'] = 'shopify';
    row['Variant Inventory Qty'] = variant.inventoryQuantity?.toString() || '';
    row['Variant Inventory Policy'] = 'deny';
    row['Variant Fulfillment Service'] = 'manual';
    row['Variant Price'] = variant.price || '';
    row['Variant Compare At Price'] = variant.compareAtPrice || '';
    row['Variant Requires Shipping'] = variant.requiresShipping !== false ? 'TRUE' : 'FALSE';
    row['Variant Taxable'] = variant.taxable !== false ? 'TRUE' : 'FALSE';
    row['Variant Barcode'] = variant.barcode || '';
    row['Variant Weight Unit'] = variant.weightUnit || 'g';

    // Variant-specific image
    if (variant.imageUrl) {
      row['Variant Image'] = normalizeImageUrl(variant.imageUrl);
    }

    // Product images - first image goes on first row
    if (isFirstRow && images.length > 0) {
      row['Image Src'] = normalizeImageUrl(images[0].src);
      row['Image Position'] = '1';
      row['Image Alt Text'] = images[0].alt || product.title || '';

      // Track additional images for separate rows
      if (images.length > 1) {
        additionalImages.push(...images.slice(1));
      }
    }

    rows.push(row);
  });

  // Add rows for additional images
  additionalImages.forEach((image, index) => {
    const row = createEmptyRow();
    row.Handle = handle;
    row['Image Src'] = normalizeImageUrl(image.src);
    row['Image Position'] = (index + 2).toString(); // +2 because first image is position 1
    row['Image Alt Text'] = image.alt || '';
    rows.push(row);
  });

  return rows;
}

/**
 * Create a default variant for products without variants
 */
function createDefaultVariant(): ProductVariant {
  return {
    price: '0.00',
    options: [{ name: 'Title', value: 'Default Title' }],
  };
}

/**
 * Normalize image URL to absolute HTTPS URL
 */
export function normalizeImageUrl(url: string, baseUrl?: string): string {
  if (!url) return '';

  let absoluteUrl = url.trim();

  // Handle protocol-relative URLs
  if (absoluteUrl.startsWith('//')) {
    absoluteUrl = 'https:' + absoluteUrl;
  }

  // Handle relative URLs
  if (!absoluteUrl.startsWith('http://') && !absoluteUrl.startsWith('https://')) {
    if (baseUrl) {
      try {
        absoluteUrl = new URL(absoluteUrl, baseUrl).href;
      } catch {
        // If URL parsing fails, return as-is
        return absoluteUrl;
      }
    }
  }

  // Upgrade HTTP to HTTPS
  if (absoluteUrl.startsWith('http://')) {
    absoluteUrl = absoluteUrl.replace('http://', 'https://');
  }

  // Remove any URL parameters that might cause issues (like size params from CDNs)
  // But keep essential CDN parameters
  try {
    const urlObj = new URL(absoluteUrl);
    // Remove tracking parameters
    urlObj.searchParams.delete('utm_source');
    urlObj.searchParams.delete('utm_medium');
    urlObj.searchParams.delete('utm_campaign');
    return urlObj.href;
  } catch {
    return absoluteUrl;
  }
}

/**
 * Convert multiple products to Shopify CSV rows
 */
export function productsToShopifyRows(products: ScrapedProduct[]): ShopifyCSVRow[] {
  const allRows: ShopifyCSVRow[] = [];

  for (const product of products) {
    allRows.push(...productToShopifyRows(product));
  }

  return allRows;
}

/**
 * Get CSV headers as array
 */
export function getCSVHeaders(): string[] {
  return [...SHOPIFY_CSV_HEADERS];
}
