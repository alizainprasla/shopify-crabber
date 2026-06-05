/**
 * Core type definitions for Shopify Crabber
 */

// Product variant option (e.g., Size, Color, Material)
export interface VariantOption {
  name: string;
  value: string;
}

// Product variant with all details
export interface ProductVariant {
  id?: string;
  sku?: string;
  barcode?: string;
  price: string;
  compareAtPrice?: string;
  inventoryQuantity?: number;
  weight?: number;
  weightUnit?: 'g' | 'kg' | 'oz' | 'lb';
  requiresShipping?: boolean;
  taxable?: boolean;
  options: VariantOption[];
  imageUrl?: string;
  position?: number;
}

// Product image
export interface ProductImage {
  src: string;
  alt?: string;
  position?: number;
  variantIds?: string[];
}

// Complete scraped product data
export interface ScrapedProduct {
  // Basic info
  title: string;
  handle?: string;
  description?: string;
  descriptionHtml?: string;
  vendor?: string;
  productType?: string;
  productCategory?: string;
  tags?: string[];

  // SEO
  seoTitle?: string;
  seoDescription?: string;

  // Status
  published?: boolean;
  status?: 'active' | 'draft' | 'archived';

  // Variants
  variants: ProductVariant[];

  // Images
  images: ProductImage[];

  // Metadata
  sourceUrl: string;
  scrapedAt: string;
  platform?: 'shopify' | 'woocommerce' | 'bigcommerce' | 'magento' | 'generic';
}

// Shopify CSV row structure (all columns)
export interface ShopifyCSVRow {
  Handle: string;
  Title: string;
  'Body (HTML)': string;
  Vendor: string;
  'Product Category': string;
  Type: string;
  Tags: string;
  Published: string;
  'Option1 Name': string;
  'Option1 Value': string;
  'Option2 Name': string;
  'Option2 Value': string;
  'Option3 Name': string;
  'Option3 Value': string;
  'Variant SKU': string;
  'Variant Grams': string;
  'Variant Inventory Tracker': string;
  'Variant Inventory Qty': string;
  'Variant Inventory Policy': string;
  'Variant Fulfillment Service': string;
  'Variant Price': string;
  'Variant Compare At Price': string;
  'Variant Requires Shipping': string;
  'Variant Taxable': string;
  'Variant Barcode': string;
  'Image Src': string;
  'Image Position': string;
  'Image Alt Text': string;
  'SEO Title': string;
  'SEO Description': string;
  'Google Shopping / Google Product Category': string;
  'Google Shopping / Gender': string;
  'Google Shopping / Age Group': string;
  'Google Shopping / MPN': string;
  'Google Shopping / Condition': string;
  'Google Shopping / Custom Product': string;
  'Google Shopping / Custom Label 0': string;
  'Google Shopping / Custom Label 1': string;
  'Google Shopping / Custom Label 2': string;
  'Google Shopping / Custom Label 3': string;
  'Google Shopping / Custom Label 4': string;
  'Variant Image': string;
  'Variant Weight Unit': string;
  'Variant Tax Code': string;
  'Cost per item': string;
  'Included / International': string;
  'Price / International': string;
  'Compare At Price / International': string;
  'Included / United States': string;
  'Price / United States': string;
  'Compare At Price / United States': string;
  Status: string;
}

// Validation result
export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error';
}

export interface ValidationWarning {
  field: string;
  message: string;
  severity: 'warning';
}

// Scraping result
export interface ScrapeResult {
  success: boolean;
  product?: ScrapedProduct;
  error?: string;
  warnings?: string[];
}

// Message types for Chrome extension communication
export type MessageType =
  | 'SCRAPE_PRODUCT'
  | 'SCRAPE_RESULT'
  | 'DOWNLOAD_CSV'
  | 'DOWNLOAD_IMAGES'
  | 'GET_PRODUCT_DATA'
  | 'PUSH_TO_SHOPIFY'
  | 'PING';

export interface ExtensionMessage {
  type: MessageType;
  payload?: unknown;
}

export interface ScrapeProductMessage extends ExtensionMessage {
  type: 'SCRAPE_PRODUCT';
}

export interface ScrapeResultMessage extends ExtensionMessage {
  type: 'SCRAPE_RESULT';
  payload: ScrapeResult;
}

// Shopify store connection for direct push
export interface ShopifyStoreConfig {
  storeUrl: string;  // e.g. "mystore.myshopify.com"
  accessToken: string;
}

export interface ShopifyPushResult {
  success: boolean;
  productId?: string;
  adminUrl?: string;
  error?: string;
}

// Export settings
export interface ExportSettings {
  includeImages: boolean;
  downloadImages: boolean;
  generateHandle: boolean;
  defaultVendor?: string;
  defaultStatus: 'active' | 'draft';
}

// Storage data
export interface StorageData {
  recentProducts: ScrapedProduct[];
  settings: ExportSettings;
  shopifyStore?: ShopifyStoreConfig;
}
